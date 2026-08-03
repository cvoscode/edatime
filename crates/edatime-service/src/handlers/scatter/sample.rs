//! Scatter sampling — bounded, deterministic point samples from filtered data.
//!
//! The streaming path consumes Polars batches through a callback sink and keeps
//! only a seeded reservoir. This is deliberately not a time-series reducer:
//! arbitrary X/Y scatter geometry needs an unbiased point sample rather than
//! an order-sensitive LTTB envelope.

use polars::prelude::*;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};

use crate::error::AppError;

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

const SCATTER_BATCH_ROWS: usize = 16_384;

struct ReservoirEntry {
    priority: u64,
    ordinal: u64,
    row: SampledScatterRow,
}

impl PartialEq for ReservoirEntry {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.ordinal == other.ordinal
    }
}

impl Eq for ReservoirEntry {}

impl PartialOrd for ReservoirEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ReservoirEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| self.ordinal.cmp(&other.ordinal))
    }
}

/// A stable, inexpensive mix for a source-scope seed and source row ordinal.
/// Keeping the lowest priorities gives a deterministic reservoir without an
/// RNG state or assumptions about upstream streaming partition sizes.
fn reservoir_priority(seed: u64, ordinal: u64) -> u64 {
    let mut value = seed ^ ordinal.wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

/// FNV-1a is enough here: it only derives a reproducible seed from immutable
/// request identity, not a security boundary.
pub fn scatter_reservoir_seed(scope: &str) -> u64 {
    scope.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

struct ScatterReservoir {
    capacity: usize,
    seed: u64,
    total_points: usize,
    entries: BinaryHeap<ReservoirEntry>,
}

impl ScatterReservoir {
    fn new(capacity: usize, seed: u64) -> Self {
        Self {
            capacity,
            seed,
            total_points: 0,
            entries: BinaryHeap::with_capacity(capacity),
        }
    }

    fn consider(&mut self, row: SampledScatterRow) {
        let ordinal = self.total_points as u64;
        self.total_points += 1;
        if self.capacity == 0 {
            return;
        }

        let entry = ReservoirEntry {
            priority: reservoir_priority(self.seed, ordinal),
            ordinal,
            row,
        };
        if self.entries.len() < self.capacity {
            self.entries.push(entry);
        } else if self.entries.peek().is_some_and(|worst| entry < *worst) {
            let _ = self.entries.pop();
            self.entries.push(entry);
        }
    }

    fn finish(self) -> (usize, Vec<SampledScatterRow>) {
        let mut entries = self.entries.into_vec();
        entries.sort_by_key(|entry| entry.ordinal);
        (
            self.total_points,
            entries.into_iter().map(|entry| entry.row).collect(),
        )
    }
}

fn sample_frame_into_reservoir(
    reservoir: &mut ScatterReservoir,
    df: &DataFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    time_color_mode: TimeColorMode,
) -> Result<Option<ScatterColorKind>, AppError> {
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

    for idx in 0..df.height() {
        let ox = x_vals.get(idx).copied().flatten();
        let oy = y_vals.get(idx).copied().flatten();
        let (Some(xv), Some(yv)) = (ox, oy) else {
            continue;
        };
        if !(xv.is_finite() && yv.is_finite()) {
            continue;
        }
        let (color_value, color_label) = match c_vals.as_ref() {
            Some(ScatterColorColumn::Continuous(values)) => (
                values
                    .get(idx)
                    .copied()
                    .flatten()
                    .filter(|value| value.is_finite()),
                None,
            ),
            Some(ScatterColorColumn::Categorical(values)) => {
                (None, values.get(idx).cloned().flatten())
            }
            None => (None, None),
        };

        let size_value = s_vals
            .as_ref()
            .and_then(|vals| vals.get(idx).copied().flatten().filter(|v| v.is_finite()));

        reservoir.consider(SampledScatterRow {
            x: xv,
            y: yv,
            color_value,
            color_label,
            size_value,
        });
    }
    Ok(color_kind)
}

/// Sample a materialized frame. This is kept for small callers and focused
/// unit tests; request handlers should use the streaming helper below.
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
    let mut reservoir = ScatterReservoir::new(effective_limit, scatter_reservoir_seed("frame"));
    let color_kind =
        sample_frame_into_reservoir(&mut reservoir, df, x, y, color, size, time_color_mode)?;
    let (total_points, sampled_rows) = reservoir.finish();
    Ok((total_points, sampled_rows, color_kind))
}

/// Sample a filtered lazy frame through Polars' streaming callback sink.
/// Memory is bounded by the stream batch plus `effective_limit` retained rows.
#[allow(clippy::too_many_arguments)]
pub fn collect_sampled_xyc_rows_streaming(
    lazy_frame: LazyFrame,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    effective_limit: usize,
    time_color_mode: TimeColorMode,
    seed_scope: &str,
) -> Result<(usize, Vec<SampledScatterRow>, Option<ScatterColorKind>), AppError> {
    let schema = lazy_frame
        .clone()
        .collect_schema()
        .map_err(|error| AppError::bad_request(format!("scatter schema: {error}")))?;
    let color_kind = color
        .map(|color_name| {
            let dtype = schema
                .get(color_name)
                .ok_or_else(|| AppError::bad_request(format!("Unknown column '{color_name}'")))?;
            Ok::<ScatterColorKind, AppError>(
                if dtype.is_numeric()
                    || (matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
                        && matches!(time_color_mode, TimeColorMode::Raw))
                {
                    ScatterColorKind::Continuous
                } else {
                    ScatterColorKind::Categorical
                },
            )
        })
        .transpose()?;

    let reservoir = Arc::new(Mutex::new(ScatterReservoir::new(
        effective_limit,
        scatter_reservoir_seed(seed_scope),
    )));
    let callback_reservoir = Arc::clone(&reservoir);
    let x = x.to_owned();
    let y = y.to_owned();
    let color = color.map(str::to_owned);
    let size = size.map(str::to_owned);
    let callback = PlanCallback::new(move |batch: DataFrame| {
        let mut reservoir = callback_reservoir
            .lock()
            .map_err(|_| PolarsError::ComputeError("scatter reservoir lock poisoned".into()))?;
        sample_frame_into_reservoir(
            &mut reservoir,
            &batch,
            &x,
            &y,
            color.as_deref(),
            size.as_deref(),
            time_color_mode,
        )
        .map_err(|error| PolarsError::ComputeError(error.to_string().into()))?;
        Ok(false)
    });
    lazy_frame
        .with_new_streaming(true)
        .sink_batches(callback, true, NonZeroUsize::new(SCATTER_BATCH_ROWS))
        .map_err(|error| AppError::io(format!("build scatter stream: {error}")))?
        .collect()
        .map_err(|error| AppError::io(format!("stream scatter rows: {error}")))?;
    let reservoir = Arc::try_unwrap(reservoir)
        .map_err(|_| AppError::internal("scatter stream retained its reservoir"))?
        .into_inner()
        .map_err(|_| AppError::internal("scatter reservoir lock poisoned"))?;
    let (total_points, sampled_rows) = reservoir.finish();
    Ok((total_points, sampled_rows, color_kind))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::{
        ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows,
        collect_sampled_xyc_rows_streaming,
    };
    use polars::prelude::{DataFrame, IntoLazy, NamedFrom, Series};

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
    fn streaming_reservoir_is_seeded_bounded_and_repeatable() {
        let df = build_xy_df(10_000);
        let (_, first, _) = collect_sampled_xyc_rows_streaming(
            df.clone().lazy(),
            "x",
            "y",
            None,
            None,
            127,
            TimeColorMode::default(),
            "source-0|revision-1|x|y",
        )
        .expect("first streaming sample");
        let (total, second, _) = collect_sampled_xyc_rows_streaming(
            df.lazy(),
            "x",
            "y",
            None,
            None,
            127,
            TimeColorMode::default(),
            "source-0|revision-1|x|y",
        )
        .expect("second streaming sample");

        assert_eq!(total, 10_000);
        assert_eq!(first.len(), 127);
        assert_eq!(
            first.iter().map(|row| row.x).collect::<Vec<_>>(),
            second.iter().map(|row| row.x).collect::<Vec<_>>(),
            "the immutable request seed must select the same reservoir"
        );
        assert!(
            first.iter().any(|row| row.x > 9_000.0),
            "the reservoir must not be a head slice"
        );

        let (_, wider, _) = collect_sampled_xyc_rows_streaming(
            build_xy_df(10_000).lazy(),
            "x",
            "y",
            None,
            None,
            511,
            TimeColorMode::default(),
            "source-0|revision-1|x|y",
        )
        .expect("wider streaming sample");
        let wider_points = wider
            .iter()
            .map(|row| row.x as u64)
            .collect::<std::collections::HashSet<_>>();
        assert!(
            first
                .iter()
                .all(|row| wider_points.contains(&(row.x as u64))),
            "reducing capacity must retain a subset of the same seeded reservoir"
        );
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
