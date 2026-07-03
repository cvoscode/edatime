//! Scatter data collection — filter + project a LazyFrame for scatter rendering.
//!
//! This module contains `collect_filtered_scatter_frame`, the core function that
//! takes a dataset snapshot and returns a column-filtered, time-filtered `LazyFrame`
//! ready for execution and downstream sampling.

use polars::prelude::*;

use crate::error::AppError;

use super::{ScatterFilterSpec, ScatterLineFilterSpec, apply_scatter_filters};

// ── Value helpers ─────────────────────────────────────────────────────────────

/// Convert a DataFrame column to `Vec<Option<f64>>` for scatter rendering.
/// Numeric columns are returned as-is; temporal columns (Datetime/Date) are
/// converted to milliseconds since epoch as f64.
pub fn series_to_scatter_values(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    match series.dtype() {
        dt if dt.is_numeric() => Ok(edatime_core::stats::series_to_finite_f64(series, name)?
            .into_iter()
            .map(Some)
            .collect()),
        DataType::Datetime(_, _) | DataType::Date => {
            let casted = series.cast(&DataType::Int64).map_err(|e| {
                AppError::internal(format!(
                    "Failed to cast temporal '{}' to Int64: {}",
                    name, e
                ))
            })?;
            let vals = casted.i64().map_err(|e| {
                AppError::internal(format!("Failed to read '{}' as Int64: {}", name, e))
            })?;

            let dtype = series.dtype();
            let divisor = edatime_core::temporal::unit_multiplier(dtype);

            Ok(vals
                .into_iter()
                .map(|v| {
                    v.map(|raw| {
                        if matches!(dtype, DataType::Date) {
                            (raw * 86_400_000) as f64
                        } else {
                            (raw / divisor) as f64
                        }
                    })
                })
                .collect())
        }
        _ => Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            name
        ))),
    }
}

/// Convert a DataFrame temporal column (Datetime / Date) into hour-of-day
/// bucket labels, e.g. "00–01", "01–02", ..., "23–00".
///
/// Used by the scatter color pipeline to render a temporal color column as a
/// useful discrete dimension instead of raw epoch milliseconds. NaN / null
/// entries stay `None`. Days of week are intentionally NOT bucketed here —
/// keep the temporal axis semantic to its dominant cycle (hour-of-day) which
/// is what DS workflows care about most (e.g. diurnal load patterns).
pub fn series_to_time_bucket_labels(
    df: &DataFrame,
    name: &str,
) -> Result<Vec<Option<String>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    match series.dtype() {
        DataType::Datetime(_, _) | DataType::Date => {
            // Cast to Int64 to access raw count, then to f64 to bucket.
            let casted = series.cast(&DataType::Int64).map_err(|e| {
                AppError::internal(format!(
                    "Failed to cast temporal '{}' to Int64: {}",
                    name, e
                ))
            })?;
            let vals = casted.i64().map_err(|e| {
                AppError::internal(format!("Failed to read '{}' as Int64: {}", name, e))
            })?;

            let dtype = series.dtype();
            let divisor = edatime_core::temporal::unit_multiplier(dtype);

            let to_ms = |raw: i64| -> i64 {
                if matches!(dtype, DataType::Date) {
                    raw * 86_400_000
                } else {
                    raw / divisor
                }
            };

            Ok(vals
                .into_iter()
                .map(|opt_raw| {
                    opt_raw.map(|raw| {
                        let ms = to_ms(raw);
                        // Day-boundary guard: anchor epoch so modulo math is
                        // stable for Date columns whose raw value is days
                        // since epoch (not ms).
                        let secs_of_day = ((ms.rem_euclid(86_400_000)) / 1000) as i64;
                        let hour = (secs_of_day / 3600).clamp(0, 23);
                        let next_hour = (hour + 1) % 24;
                        format!("{:02}\u{2013}{:02}", hour, next_hour)
                    })
                })
                .collect())
        }
        _ => Err(AppError::bad_request(format!(
            "Column '{}' is not temporal; time bucketing requires Datetime or Date",
            name
        ))),
    }
}

/// Convert a DataFrame column to `Vec<Option<String>>` for categorical scatter coloring.
pub fn series_to_label_values(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    let casted = series
        .cast(&DataType::String)
        .map_err(|e| AppError::internal(format!("Failed to cast '{}' to String: {}", name, e)))?;
    let values = casted
        .str()
        .map_err(|e| AppError::internal(format!("Failed to read '{}' as String: {}", name, e)))?;

    Ok(values
        .into_iter()
        .map(|value| value.map(|text| text.to_string()))
        .collect())
}

/// Audit issue 2.2: collapse the long tail of a categorical color
/// column into a single `"Other (N)"` bucket so the legend stays
/// readable when the user picks a high-cardinality column (e.g. a
/// unique-id column on a 1M-row dataset).
///
/// The policy preserves the top `max_cardinality` labels by frequency
/// (ties broken by first-seen order to keep the legend stable across
/// requests) and replaces every other label with
/// `"Other (<dropped_count>)"`. `None` entries — nulls / NaNs — are
/// preserved untouched.
///
/// Returns the rewritten label vector and a `ColorCardinality`
/// describing the projection so the route handler can forward it to
/// the frontend (and surface a small hint in the legend).
pub fn cap_categorical_cardinality(
    labels: Vec<Option<String>>,
    max_cardinality: usize,
) -> (Vec<Option<String>>, ColorCardinality) {
    use std::collections::HashMap;

    if max_cardinality == 0 {
        // Defensive: a zero cap would discard every label. Treat as
        // "no cap" so the caller never produces an empty legend by
        // accident.
        let total = labels.iter().filter(|label| label.is_some()).count();
        return (
            labels,
            ColorCardinality {
                requested: total,
                used: total,
                bucketed: 0,
            },
        );
    }

    // First pass: build a frequency table keyed by *owned* `String`
    // so we don't keep any borrow into `labels` alive for the
    // second pass (which needs to consume `labels` by value to build
    // the rewritten output). Track first-seen order through the
    // `first_seen_index` map.
    let mut frequencies: HashMap<String, usize> = HashMap::new();
    let mut first_seen_index: HashMap<String, usize> = HashMap::new();
    let mut insertion_counter: usize = 0;
    for label in &labels {
        if let Some(text) = label.as_ref() {
            let entry = frequencies.entry(text.clone()).or_insert(0);
            *entry += 1;
            first_seen_index.entry(text.clone()).or_insert(insertion_counter);
            insertion_counter += 1;
        }
    }

    let total = frequencies.len();
    if total <= max_cardinality {
        return (
            labels,
            ColorCardinality {
                requested: total,
                used: total,
                bucketed: 0,
            },
        );
    }

    // Pick the top `max_cardinality` labels by frequency, ties broken
    // by first-seen index.
    let mut ranked: Vec<(String, usize)> = frequencies.into_iter().collect();
    ranked.sort_by(|(label_a, count_a), (label_b, count_b)| {
        count_b.cmp(count_a).then_with(|| {
            // Stable tie-break: first-seen index.
            let pos_a = first_seen_index
                .get(label_a)
                .copied()
                .unwrap_or(usize::MAX);
            let pos_b = first_seen_index
                .get(label_b)
                .copied()
                .unwrap_or(usize::MAX);
            pos_a.cmp(&pos_b)
        })
    });
    let kept: std::collections::HashSet<String> = ranked
        .into_iter()
        .take(max_cardinality)
        .map(|(label, _)| label)
        .collect();
    let dropped = total.saturating_sub(max_cardinality);
    let other_label = format!("Other ({})", dropped);

    // Second pass: take `labels` by value and rewrite non-kept
    // entries. `None` (null / NaN) rows are preserved as-is.
    let rewritten: Vec<Option<String>> = labels
        .into_iter()
        .map(|label| {
            label.map(|text| {
                if kept.contains(&text) {
                    text
                } else {
                    other_label.clone()
                }
            })
        })
        .collect();

    (
        rewritten,
        ColorCardinality {
            requested: total,
            used: max_cardinality,
            bucketed: dropped,
        },
    )
}

/// Cardinality summary returned by `cap_categorical_cardinality` and
/// serialized into the scatter points response so the frontend can
/// render a "X other categories collapsed" hint.
#[derive(Debug, Clone, Copy)]
pub struct ColorCardinality {
    pub requested: usize,
    pub used: usize,
    pub bucketed: usize,
}

/// Collect x/y pairs from a DataFrame as `Vec<[f64; 2]>`, filtering out non-finite values.
pub fn collect_xy_pairs(df: &DataFrame, x: &str, y: &str) -> Result<Vec<[f64; 2]>, AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let out: Vec<[f64; 2]> = x_vals
        .iter()
        .zip(y_vals.iter())
        .filter_map(|(ox, oy)| {
            if let (Some(xv), Some(yv)) = (ox, oy)
                && xv.is_finite()
                && yv.is_finite()
            {
                Some([*xv, *yv])
            } else {
                None
            }
        })
        .collect();

    Ok(out)
}

// ── Core collection ───────────────────────────────────────────────────────────

/// Filter a dataset snapshot to the requested columns and time/filters,
/// returning a `LazyFrame` that callers execute via `QueryExecutor`.
#[allow(clippy::too_many_arguments)]
pub fn collect_filtered_scatter_frame<I: Into<LazyFrame>>(
    df: I,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    time_column: Option<&str>,
    start: Option<f64>,
    end: Option<f64>,
    filters: &[ScatterFilterSpec],
    line_filters: &[ScatterLineFilterSpec],
) -> Result<LazyFrame, AppError> {
    let lf: LazyFrame = df.into();
    let schema = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::bad_request(format!("schema: {}", e)))?;

    let x_dtype = schema
        .get(x)
        .ok_or_else(|| AppError::bad_request(format!("Unknown column '{}'", x)))?;
    if !(x_dtype.is_numeric() || matches!(x_dtype, DataType::Datetime(_, _) | DataType::Date)) {
        return Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            x
        )));
    }
    let y_dtype = schema
        .get(y)
        .ok_or_else(|| AppError::bad_request(format!("Unknown column '{}'", y)))?;
    if !(y_dtype.is_numeric() || matches!(y_dtype, DataType::Datetime(_, _) | DataType::Date)) {
        return Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            y
        )));
    }
    if let Some(c) = color
        && !schema.contains(c)
    {
        return Err(AppError::bad_request(format!("Unknown column '{}'", c)));
    }
    if let Some(s) = size
        && !schema.contains(s)
    {
        return Err(AppError::bad_request(format!("Unknown column '{}'", s)));
    }

    let lf = apply_scatter_filters(lf, time_column, start, end, filters, line_filters)?;

    let mut selected_columns = Vec::with_capacity(4);
    for name in [Some(x), Some(y), color, size].into_iter().flatten() {
        if !selected_columns.contains(&name) {
            selected_columns.push(name);
        }
    }

    let select_exprs = selected_columns.into_iter().map(col).collect::<Vec<_>>();

    Ok(lf.select(select_exprs))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::{cap_categorical_cardinality, collect_filtered_scatter_frame};
    use crate::error::AppError;
    use polars::prelude::{DataFrame, DataType, IntoColumn, IntoLazy, NamedFrom, Series, TimeUnit};

    fn build_scatter_df() -> Result<DataFrame, AppError> {
        let timestamp = Series::new("timestamp".into(), [1_000_i64, 2_000, 3_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("timestamp cast should succeed in test");
        let x = Series::new("x".into(), [10.0_f64, 20.0, 30.0]);
        let y = Series::new("y".into(), [100.0_f64, 200.0, 300.0]);
        DataFrame::new(
            3,
            vec![timestamp.into_column(), x.into_column(), y.into_column()],
        )
        .map_err(|e| AppError::internal(format!("test dataframe build failed: {}", e)))
    }

    #[test]
    fn scatter_filters_support_custom_time_column_names() {
        let df = build_scatter_df().expect("test dataframe should build");

        let filtered = collect_filtered_scatter_frame(
            df.lazy(),
            "x",
            "y",
            None,
            None,
            Some("timestamp"),
            Some(1_500.0),
            Some(2_500.0),
            &[],
            &[],
        )
        .expect("scatter filtering should accept non-ts time columns")
        .collect()
        .expect("collect should succeed");

        assert_eq!(filtered.height(), 1);
        let x_values = filtered
            .column("x")
            .expect("x column should exist")
            .f64()
            .expect("x column should be f64");
        assert_eq!(x_values.get(0), Some(20.0));
    }

    /// Audit issue 2.2: when distinct label count is below the cap,
    /// the labels must come through unchanged and `bucketed` must be
    /// zero.
    #[test]
    fn cap_categorical_cardinality_below_cap_is_noop() {
        let labels: Vec<Option<String>> = (0..5)
            .map(|i| Some(format!("cat-{i}")))
            .collect();
        let (rewritten, info) = cap_categorical_cardinality(labels.clone(), 64);
        assert_eq!(rewritten, labels, "below-cap labels must be unchanged");
        assert_eq!(info.requested, 5);
        assert_eq!(info.used, 5);
        assert_eq!(info.bucketed, 0);
    }

    /// Above the cap, the long tail collapses into a single
    /// `"Other (N)"` bucket and the info struct reports the
    /// breakdown.
    #[test]
    fn cap_categorical_cardinality_above_cap_buckets_tail() {
        let mut labels: Vec<Option<String>> = Vec::new();
        // 100 distinct labels, 5 of them dominate by frequency.
        for i in 0..100 {
            let freq = if i < 5 { 10 } else { 1 };
            for _ in 0..freq {
                labels.push(Some(format!("cat-{i}")));
            }
        }
        let (rewritten, info) = cap_categorical_cardinality(labels, 5);
        assert_eq!(info.requested, 100, "all 100 distinct labels were seen");
        assert_eq!(info.used, 5, "cap is 5");
        assert_eq!(info.bucketed, 95, "95 categories collapsed into Other");
        // Every rewritten label is either one of the kept top-5 or
        // the "Other (95)" bucket.
        for label in rewritten.iter().flatten() {
            assert!(
                label == "Other (95)"
                    || (0..5).map(|i| format!("cat-{i}")).any(|kept| kept == *label),
                "unexpected label after cap: {label}"
            );
        }
    }

    /// `None` entries (null / NaN color rows) must be preserved
    /// untouched by the cap so the row alignment with the xy pairs
    /// stays intact.
    #[test]
    fn cap_categorical_cardinality_preserves_nulls() {
        let labels: Vec<Option<String>> = vec![
            Some("a".to_string()),
            None,
            Some("b".to_string()),
            None,
            Some("a".to_string()),
        ];
        let (rewritten, _info) = cap_categorical_cardinality(labels, 1);
        assert_eq!(rewritten[1], None, "None must be preserved");
        assert_eq!(rewritten[3], None, "None must be preserved");
    }

    /// A zero cap is treated as "no cap" so the caller never produces
    /// an empty legend by accident.
    #[test]
    fn cap_categorical_cardinality_zero_cap_is_noop() {
        let labels: Vec<Option<String>> = vec![Some("a".to_string()), Some("b".to_string())];
        let (rewritten, info) = cap_categorical_cardinality(labels.clone(), 0);
        assert_eq!(rewritten, labels);
        assert_eq!(info.bucketed, 0);
    }
}
