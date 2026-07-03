//! Scatter sampling — downsample data points and build scatter rows.
//!
//! `collect_sampled_xyc_rows` is the core function that takes an executed
//! DataFrame, applies LTTB downsampling to the xy pairs, and produces
//! `SampledScatterRow` structs with color/size metadata.

use polars::prelude::*;

use crate::error::AppError;
use edatime_query::downsample::downsample_indices;

use super::collect::{
    series_to_label_values, series_to_scatter_values, series_to_time_bucket_labels,
};

// ── Color kind ───────────────────────────────────────────────────────────────

enum ScatterColorColumn {
    Continuous(Vec<Option<f64>>),
    Categorical(Vec<Option<String>>),
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ScatterColorKind {
    Continuous,
    Categorical,
}

/// How a temporal color column should be rendered in the scatter pipeline.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub enum TimeColorMode {
    /// Bucket by hour-of-day and emit a categorical label. Default.
    #[default]
    Bucket,
    /// Emit the raw epoch-millisecond value as continuous numeric. Legacy.
    Raw,
}

impl TimeColorMode {
    pub fn from_query(value: Option<&str>) -> Self {
        match value.map(|v| v.to_ascii_lowercase()).as_deref() {
            Some("raw") => Self::Raw,
            _ => Self::Bucket,
        }
    }
}

// ── Row type ─────────────────────────────────────────────────────────────────

pub struct SampledScatterRow {
    pub x: f64,
    pub y: f64,
    pub color_value: Option<f64>,
    pub color_label: Option<String>,
    pub size_value: Option<f64>,
}

// ── Core sampling ───────────────────────────────────────────────────────────

/// Sample scatter points from an executed DataFrame, applying LTTB downsampling
/// to xy pairs and building `SampledScatterRow` structs with color/size metadata.
///
/// Returns `(total_points, sampled_rows, color_kind)`.
///
/// `time_color_mode` controls how a temporal color column is rendered:
/// - `"bucket"` (default): bucket by hour-of-day and emit a categorical label.
///   Useful for DS workflows that want to spot diurnal patterns.
/// - `"raw"`: emit the raw epoch-ms value as a continuous numeric. This is
///   the legacy behavior; it produces a colorbar that is technically valid
///   but semantically poor for typical EDA.
pub fn collect_sampled_xyc_rows(
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    _limit: usize,
    effective_limit: usize,
    time_color_mode: TimeColorMode,
) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let c_vals = if let Some(c) = color {
        let series = df
            .column(c)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", c, e)))?;
        if series.dtype().is_numeric() {
            Some(ScatterColorColumn::Continuous(series_to_scatter_values(
                df, c,
            )?))
        } else if matches!(series.dtype(), DataType::Datetime(_, _) | DataType::Date) {
            match time_color_mode {
                TimeColorMode::Bucket => Some(ScatterColorColumn::Categorical(
                    series_to_time_bucket_labels(df, c)?,
                )),
                TimeColorMode::Raw => Some(ScatterColorColumn::Continuous(
                    series_to_scatter_values(df, c)?,
                )),
            }
        } else {
            Some(ScatterColorColumn::Categorical(series_to_label_values(
                df, c,
            )?))
        }
    } else {
        None
    };
    let color_kind = c_vals.as_ref().map(|column| match column {
        ScatterColorColumn::Continuous(_) => ScatterColorKind::Continuous,
        ScatterColorColumn::Categorical(_) => ScatterColorKind::Categorical,
    });

    let s_vals = if let Some(s) = size {
        let _ = df
            .column(s)
            .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", s, e)))?;
        Some(series_to_scatter_values(df, s)?)
    } else {
        None
    };

    // Scan every row in the filtered frame, count valid points, and collect
    // per-row color / size metadata. The scan is bounded by a deterministic
    // candidate stride once we exceed `effective_limit` so the sampling
    // helper sees a stable upper-bound view of the full filtered frame
    // instead of an arbitrary head slice.
    let mut all_x: Vec<f64> = Vec::new();
    let mut all_y: Vec<f64> = Vec::new();
    let mut all_color_value: Vec<Option<f64>> = Vec::new();
    let mut all_color_label: Vec<Option<String>> = Vec::new();
    let mut all_size_value: Vec<Option<f64>> = Vec::new();

    let mut first_pass: Vec<usize> = Vec::new();
    for idx in 0..df.height() {
        let ox = x_vals.get(idx).copied().flatten();
        let oy = y_vals.get(idx).copied().flatten();
        let (Some(xv), Some(yv)) = (ox, oy) else {
            continue;
        };
        if !(xv.is_finite() && yv.is_finite()) {
            continue;
        }
        first_pass.push(idx);
    }
    let total_points = first_pass.len();

    let candidate_rows: Vec<usize> = if total_points > effective_limit {
        // Build a bounded deterministic candidate set by striding through
        // the full set of valid rows. This lets the downsampler see the
        // entire filtered frame instead of an arbitrary head slice while
        // still keeping work bounded by `effective_limit`.
        //
        // Use floor-division so the stride keeps the candidate count
        // close to `effective_limit`. With ceil-division, the final
        // `step_by` falls one short because the input length is not
        // always a perfect multiple of the stride.
        let stride = (total_points / effective_limit).max(1);
        first_pass
            .iter()
            .step_by(stride)
            .copied()
            .take(effective_limit)
            .collect()
    } else {
        first_pass.clone()
    };

    for idx in &candidate_rows {
        let xv = x_vals.get(*idx).copied().flatten().unwrap_or(0.0);
        let yv = y_vals.get(*idx).copied().flatten().unwrap_or(0.0);
        let (color_value, color_label) = match c_vals.as_ref() {
            Some(ScatterColorColumn::Continuous(values)) => (
                values
                    .get(*idx)
                    .copied()
                    .flatten()
                    .filter(|value| value.is_finite()),
                None,
            ),
            Some(ScatterColorColumn::Categorical(values)) => {
                (None, values.get(*idx).cloned().flatten())
            }
            None => (None, None),
        };

        let size_value = s_vals
            .as_ref()
            .and_then(|vals| vals.get(*idx).copied().flatten().filter(|v| v.is_finite()));

        all_x.push(xv);
        all_y.push(yv);
        all_color_value.push(color_value);
        all_color_label.push(color_label);
        all_size_value.push(size_value);
    }

    let candidate_len = all_x.len();
    let mut candidate_indices: Vec<usize> = downsample_indices(&all_x, &all_y, effective_limit);
    // Top up to `effective_limit` if LTTB returned fewer (audit issue 3.3).
    // LTTB is a triangle-area selection and can return slightly fewer
    // points than `target_points`; deterministic stride from the unused
    // candidate slots restores the contract without changing LTTB's picks.
    if candidate_indices.len() < effective_limit {
        candidate_indices = edatime_query::downsample::pad_to_limit(
            candidate_indices,
            candidate_len,
            effective_limit,
        );
    }

    let mut sampled = Vec::with_capacity(candidate_indices.len());
    for sampled_pos in candidate_indices {
        if sampled_pos >= candidate_len {
            continue;
        }
        let xv = all_x[sampled_pos];
        let yv = all_y[sampled_pos];
        let color_value = all_color_value[sampled_pos];
        let color_label = all_color_label[sampled_pos].clone();
        let size_value = all_size_value[sampled_pos];

        sampled.push(SampledScatterRow {
            x: xv,
            y: yv,
            color_value,
            color_label,
            size_value,
        });
    }

    Ok((total_points, sampled, color_kind))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::{ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows};
    use polars::prelude::{DataFrame, NamedFrom, Series};

    fn build_xy_df(n: usize) -> DataFrame {
        let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let ys: Vec<f64> = (0..n).map(|i| (i as f64).sin()).collect();
        DataFrame::new(
            n,
            vec![
                Series::new("x".into(), xs).into(),
                Series::new("y".into(), ys).into(),
            ],
        )
        .expect("test xy dataframe should build")
    }

    #[test]
    fn total_points_counts_full_frame_beyond_effective_limit() {
        let df = build_xy_df(1_000);
        let (total, sampled, _) = collect_sampled_xyc_rows(
            &df,
            "x",
            "y",
            None,
            None,
            100,
            100,
            TimeColorMode::default(),
        )
        .expect("sample");
        assert_eq!(
            total, 1_000,
            "total must count every valid row, not the head slice"
        );
        assert!(
            sampled.len() <= 100,
            "sampled set must respect effective_limit"
        );
    }

    #[test]
    fn categorical_color_labels_stay_aligned_with_xy() {
        let n = 40;
        let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let ys: Vec<f64> = (0..n).map(|i| i as f64 * 0.5).collect();
        let labels: Vec<&str> = (0..n)
            .map(|i| if i % 2 == 0 { "even" } else { "odd" })
            .collect();
        let df = DataFrame::new(
            n,
            vec![
                Series::new("x".into(), xs).into(),
                Series::new("y".into(), ys).into(),
                Series::new("group".into(), labels).into(),
            ],
        )
        .expect("test dataframe should build");

        let (total, sampled, kind) = collect_sampled_xyc_rows(
            &df,
            "x",
            "y",
            Some("group"),
            None,
            1_000,
            1_000,
            TimeColorMode::default(),
        )
        .expect("sample categorical");
        assert_eq!(total, n);
        assert_eq!(kind, Some(ScatterColorKind::Categorical));
        for row in &sampled {
            assert!(row.color_value.is_none());
            assert!(
                row.color_label.is_some(),
                "categorical label must be present"
            );
        }
        let x_values: Vec<f64> = sampled.iter().map(|r| r.x).collect();
        let mut sorted_x = x_values.clone();
        sorted_x.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert_eq!(
            x_values, sorted_x,
            "x values must remain finite and aligned with labels"
        );
    }

    #[test]
    fn continuous_color_handles_missing_values_without_breaking_alignment() {
        let n = 50;
        let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let ys: Vec<f64> = (0..n).map(|i| i as f64 * 2.0).collect();
        let colors: Vec<Option<f64>> = (0..n)
            .map(|i| if i % 5 == 0 { None } else { Some(i as f64) })
            .collect();
        let df = DataFrame::new(
            n,
            vec![
                Series::new("x".into(), xs).into(),
                Series::new("y".into(), ys).into(),
                Series::new("c".into(), colors).into(),
            ],
        )
        .expect("test dataframe should build");

        let (total, sampled, kind) = collect_sampled_xyc_rows(
            &df,
            "x",
            "y",
            Some("c"),
            None,
            1_000,
            1_000,
            TimeColorMode::default(),
        )
        .expect("sample continuous");
        assert_eq!(total, n);
        assert_eq!(kind, Some(ScatterColorKind::Continuous));
        assert!(!sampled.is_empty());
        for row in &sampled {
            // color_value may be None when source was None; size and xy must be finite.
            assert!(row.x.is_finite() && row.y.is_finite());
        }
    }

    #[test]
    fn size_column_stays_aligned_with_xy() {
        let n = 30;
        let xs: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let ys: Vec<f64> = (0..n).map(|i| i as f64 * 1.5).collect();
        let sizes: Vec<Option<f64>> = (0..n).map(|i| Some(10.0 + i as f64)).collect();
        let df = DataFrame::new(
            n,
            vec![
                Series::new("x".into(), xs).into(),
                Series::new("y".into(), ys).into(),
                Series::new("s".into(), sizes).into(),
            ],
        )
        .expect("test dataframe should build");

        let (total, sampled, _) = collect_sampled_xyc_rows(
            &df,
            "x",
            "y",
            None,
            Some("s"),
            1_000,
            1_000,
            TimeColorMode::default(),
        )
        .expect("sample with size");
        assert_eq!(total, n);
        assert_eq!(sampled.len(), n);
        for (idx, row) in sampled.iter().enumerate() {
            assert!(row.size_value.is_some());
            assert!((row.size_value.unwrap() - (10.0 + idx as f64)).abs() < 1e-9);
        }
    }

    #[test]
    fn full_frame_total_counted_beyond_effective_limit() {
        let df = build_xy_df(500);
        let (total, sampled, _) =
            collect_sampled_xyc_rows(&df, "x", "y", None, None, 50, 50, TimeColorMode::default())
                .expect("sample");
        assert_eq!(
            total, 500,
            "total must reflect every valid row, not the head"
        );
        assert!(
            sampled.len() <= 50,
            "sampled set must respect effective_limit"
        );
        // When rows exceed effective_limit, total must be greater than the sampled set.
        assert!(total > sampled.len());
    }

    #[test]
    fn datetime_color_column_buckets_by_hour_of_day() {
        // Regression test for audit issue 3.1: a datetime color column
        // must NOT be emitted as raw epoch-ms — that produces a useless
        // continuous colorbar. Default mode buckets to hour-of-day.
        use polars::prelude::{DataType, TimeUnit};
        // Six samples: 00:30, 06:00, 12:30, 18:00, 22:30, 23:45 (UTC).
        let timestamps_ms: Vec<i64> = vec![
            30 * 60 * 1000,                  // 00:30
            6 * 3_600 * 1000,                // 06:00
            12 * 3_600 * 1000 + 30 * 60_000, // 12:30
            18 * 3_600 * 1000,               // 18:00
            22 * 3_600 * 1000 + 30 * 60_000, // 22:30
            23 * 3_600 * 1000 + 45 * 60_000, // 23:45
        ];
        let xs: Vec<f64> = (0..6).map(|i| i as f64).collect();
        let ys: Vec<f64> = (0..6).map(|i| (i as f64) * 2.0).collect();
        let ts_series = Series::new("ts".into(), timestamps_ms)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("ts cast should succeed in test");
        let df = DataFrame::new(
            6,
            vec![
                ts_series.into(),
                Series::new("x".into(), xs).into(),
                Series::new("y".into(), ys).into(),
            ],
        )
        .expect("test dataframe should build");

        let (_, sampled, kind) = collect_sampled_xyc_rows(
            &df,
            "x",
            "y",
            Some("ts"),
            None,
            1_000,
            1_000,
            TimeColorMode::Bucket,
        )
        .expect("sample bucketed datetime color");

        assert_eq!(kind, Some(ScatterColorKind::Categorical));
        let expected: Vec<&str> = vec![
            "00\u{2013}01",
            "06\u{2013}07",
            "12\u{2013}13",
            "18\u{2013}19",
            "22\u{2013}23",
            "23\u{2013}00",
        ];
        for (row, label) in sampled.iter().zip(expected.iter()) {
            assert!(
                row.color_value.is_none(),
                "bucketed color must not carry a numeric value"
            );
            assert_eq!(
                row.color_label.as_deref(),
                Some(*label),
                "wrong bucket label"
            );
        }
    }

    #[test]
    fn datetime_color_column_raw_mode_emits_epoch_ms_when_requested() {
        // The legacy `time_color_mode=raw` mode still emits continuous
        // epoch-ms so existing clients and tests can opt in.
        use polars::prelude::{DataType, TimeUnit};
        let timestamps_ms: Vec<i64> = vec![30 * 60 * 1000, 6 * 3_600 * 1000];
        let xs: Vec<f64> = (0..2).map(|i| i as f64).collect();
        let ys: Vec<f64> = (0..2).map(|i| (i as f64) * 2.0).collect();
        let ts_series = Series::new("ts".into(), timestamps_ms)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("ts cast should succeed in test");
        let df = DataFrame::new(
            2,
            vec![
                ts_series.into(),
                Series::new("x".into(), xs).into(),
                Series::new("y".into(), ys).into(),
            ],
        )
        .expect("test dataframe should build");

        let (_, sampled, kind) = collect_sampled_xyc_rows(
            &df,
            "x",
            "y",
            Some("ts"),
            None,
            1_000,
            1_000,
            TimeColorMode::Raw,
        )
        .expect("sample raw datetime color");

        assert_eq!(kind, Some(ScatterColorKind::Continuous));
        let value: f64 = sampled[0]
            .color_value
            .expect("raw color must carry a numeric value");
        assert!((value - 30.0 * 60.0 * 1000.0).abs() < 1e-6);
        let value2: f64 = sampled[1]
            .color_value
            .expect("raw color must carry a numeric value");
        assert!((value2 - 6.0 * 3_600.0 * 1000.0).abs() < 1e-6);
    }
}
