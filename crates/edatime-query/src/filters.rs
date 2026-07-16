//! Shared Polars filter-expression builders.
//!
//! Both the main data pipeline and the scatter/export routes need to apply
//! time-range, numeric-range, and adaptive-line filters. This module provides
//! composable helpers so the logic is defined once.

use polars::prelude::*;
use serde::Deserialize;

use edatime_core::error::AppError;
use edatime_core::temporal;

// ── Filter specification types ─────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct RangeFilter {
    pub column: String,
    pub from: f64,
    pub to: f64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct LineFilter {
    #[allow(dead_code)]
    #[serde(default)]
    pub id: Option<String>,
    pub column: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    #[serde(default, alias = "keepAbove")]
    pub keep_above: bool,
}

// ── Parsing helpers ────────────────────────────────────────────────────────

pub fn parse_range_filters(raw: Option<&str>) -> Result<Vec<RangeFilter>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(Vec::new());
    };
    serde_json::from_str::<Vec<RangeFilter>>(raw)
        .map_err(|e| AppError::bad_request(format!("Invalid range filters payload: {}", e)))
}

pub fn parse_line_filters(raw: Option<&str>) -> Result<Vec<LineFilter>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(Vec::new());
    };
    serde_json::from_str::<Vec<LineFilter>>(raw)
        .map_err(|e| AppError::bad_request(format!("Invalid line filters payload: {}", e)))
}

// ── Expression builders ────────────────────────────────────────────────────

fn numeric_range_expr(column: &str, from: f64, to: f64) -> Expr {
    col(column)
        .cast(DataType::Float64)
        .gt_eq(lit(from))
        .and(col(column).cast(DataType::Float64).lt_eq(lit(to)))
}

fn temporal_range_expr(
    column: &str,
    dtype: &DataType,
    from: f64,
    to: f64,
) -> Result<Expr, AppError> {
    let start = temporal::epoch_ms_to_native(from, dtype, false)?;
    let end = temporal::epoch_ms_to_native(to, dtype, true)?;
    Ok(col(column)
        .cast(DataType::Int64)
        .gt_eq(lit(start))
        .and(col(column).cast(DataType::Int64).lt_eq(lit(end))))
}

fn temporal_ms_expr(column: &str, dtype: &DataType) -> Expr {
    match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => {
            col(column).cast(DataType::Float64) / lit(1_000_000.0)
        }
        DataType::Datetime(TimeUnit::Microseconds, _) => {
            col(column).cast(DataType::Float64) / lit(1_000.0)
        }
        DataType::Datetime(TimeUnit::Milliseconds, _) => col(column).cast(DataType::Float64),
        DataType::Date => col(column).cast(DataType::Float64) * lit(86_400_000.0),
        _ => col(column).cast(DataType::Float64),
    }
}

/// Convert a predicate into explicit cleaning-plan row semantics.
/// `keepInside` retains only known-true rows. `dropInside` retains known-false
/// rows and nulls, because a null value cannot be classified as inside.
fn keep_or_drop_predicate(predicate: Expr, keep_inside: bool) -> Expr {
    if keep_inside {
        predicate.clone().is_not_null().and(predicate)
    } else {
        predicate.clone().is_null().or(predicate.not())
    }
}

/// Apply a portable time range stage with explicit keep/drop null semantics.
pub fn apply_time_range_stage<I: Into<LazyFrame>>(
    df: I,
    time_column: &str,
    start_ms: f64,
    end_ms: f64,
    keep_inside: bool,
) -> Result<LazyFrame, AppError> {
    let lf: LazyFrame = df.into();
    let column = time_column.trim();
    if column.is_empty() {
        return Err(AppError::bad_request("Missing time column for time filter"));
    }
    let schema = lf.clone().collect_schema().map_err(|error| {
        AppError::bad_request(format!("Failed to get schema for time filter: {error}"))
    })?;
    let dtype = schema.get(column).ok_or_else(|| {
        AppError::bad_request(format!("Missing time column '{column}' for time filter"))
    })?;
    let predicate = temporal_range_expr(column, dtype, start_ms.min(end_ms), start_ms.max(end_ms))?;
    Ok(lf.filter(keep_or_drop_predicate(predicate, keep_inside)))
}

/// Apply a portable numeric or temporal column range with keep/drop semantics.
pub fn apply_range_stage<I: Into<LazyFrame>>(
    df: I,
    filter: &RangeFilter,
    keep_inside: bool,
    retain_nulls: bool,
) -> Result<LazyFrame, AppError> {
    let lf: LazyFrame = df.into();
    let column = filter.column.trim();
    if column.is_empty() {
        return Err(AppError::bad_request("Cleaning range stage requires a column"));
    }
    let schema = lf.clone().collect_schema().map_err(|error| {
        AppError::bad_request(format!("Failed to get schema for filter column '{column}': {error}"))
    })?;
    let dtype = schema.get(column).ok_or_else(|| AppError::bad_request(format!("Unknown filter column '{column}'")))?;
    let predicate = match dtype {
        dtype if dtype.is_numeric() => numeric_range_expr(column, filter.from.min(filter.to), filter.from.max(filter.to)),
        DataType::Datetime(_, _) | DataType::Date => temporal_range_expr(column, dtype, filter.from.min(filter.to), filter.from.max(filter.to))?,
        _ => return Err(AppError::bad_request(format!("Filter column '{column}' is not numeric or temporal"))),
    };
    let policy = keep_or_drop_predicate(predicate, keep_inside);
    // A range normally keeps only known-true values. Explicitly retaining
    // nulls is needed for robust-cleaning proposals: legacy outlier removal
    // never classified a null as an outlier, while it still removed NaN/Inf.
    let policy = if retain_nulls && keep_inside {
        col(column).is_null().or(policy)
    } else {
        policy
    };
    Ok(lf.filter(policy))
}

/// Apply one portable adaptive-line stage. Segment-only stages pass rows
/// outside the segment; full-line stages compare every timestamp.
pub fn apply_line_stage<I: Into<LazyFrame>>(
    df: I,
    time_column: &str,
    filter: &LineFilter,
    apply_within_segment_only: bool,
) -> Result<LazyFrame, AppError> {
    let lf: LazyFrame = df.into();
    let time_column = time_column.trim();
    let column = filter.column.trim();
    if time_column.is_empty() || column.is_empty() || filter.x1 == filter.x2 {
        return Err(AppError::bad_request("Adaptive filter requires a time column, numeric column, and non-zero line segment"));
    }
    let schema = lf.clone().collect_schema().map_err(|error| {
        AppError::bad_request(format!("Failed to get schema for line filter: {error}"))
    })?;
    let ts_dtype = schema.get(time_column).ok_or_else(|| {
        AppError::bad_request(format!("Missing time column '{time_column}' for adaptive filter"))
    })?;
    if !schema.get(column).is_some_and(|dtype| dtype.is_numeric()) {
        return Err(AppError::bad_request(format!("Adaptive filter column '{column}' must be numeric")));
    }
    let ts_expr = temporal_ms_expr(time_column, ts_dtype);
    let slope = (filter.y2 - filter.y1) / (filter.x2 - filter.x1);
    let line_expr = lit(filter.y1) + ((ts_expr.clone() - lit(filter.x1)) * lit(slope));
    let comparison = if filter.keep_above {
        col(column).cast(DataType::Float64).gt_eq(line_expr)
    } else {
        col(column).cast(DataType::Float64).lt_eq(line_expr)
    };
    let predicate = if apply_within_segment_only {
        let min_x = filter.x1.min(filter.x2);
        let max_x = filter.x1.max(filter.x2);
        ts_expr.clone().gt_eq(lit(min_x)).and(ts_expr.lt_eq(lit(max_x))).not().or(comparison)
    } else {
        comparison
    };
    Ok(lf.filter(keep_or_drop_predicate(predicate, true)))
}

// ── Composite filter application ───────────────────────────────────────────

pub fn apply_filters<I: Into<LazyFrame>>(
    df: I,
    time_column: Option<&str>,
    start_ms: Option<f64>,
    end_ms: Option<f64>,
    range_filters: &[RangeFilter],
    line_filters: &[LineFilter],
) -> Result<LazyFrame, AppError> {
    let mut lf: LazyFrame = df.into();

    if let (Some(start), Some(end)) = (start_ms, end_ms) {
        let time_column = time_column
            .map(str::trim)
            .filter(|column| !column.is_empty())
            .ok_or_else(|| {
                AppError::bad_request("Missing time column for time filter".to_string())
            })?;
        let schema = lf.clone().collect_schema().map_err(|e| {
            AppError::bad_request(format!("Failed to get schema for time filter: {}", e))
        })?;
        let ts_dtype = schema.get(time_column).ok_or_else(|| {
            AppError::bad_request(format!(
                "Missing time column '{}' for time filter",
                time_column
            ))
        })?;
        let start_native = temporal::epoch_ms_to_native(start.min(end), ts_dtype, false)?;
        let end_native = temporal::epoch_ms_to_native(start.max(end), ts_dtype, true)?;
        lf = lf
            .filter(
                col(time_column)
                    .cast(DataType::Int64)
                    .gt_eq(lit(start_native)),
            )
            .filter(
                col(time_column)
                    .cast(DataType::Int64)
                    .lt_eq(lit(end_native)),
            );
    }

    for filter in range_filters {
        let column = filter.column.trim();
        if column.is_empty() {
            continue;
        }
        let schema = lf.clone().collect_schema().map_err(|e| {
            AppError::bad_request(format!(
                "Failed to get schema for filter column '{}': {}",
                column, e
            ))
        })?;
        let dtype = schema
            .get(column)
            .ok_or_else(|| AppError::bad_request(format!("Unknown filter column '{}'", column)))?;
        let from = filter.from.min(filter.to);
        let to = filter.from.max(filter.to);
        let expr = match dtype {
            dt if dt.is_numeric() => numeric_range_expr(column, from, to),
            DataType::Datetime(_, _) | DataType::Date => {
                temporal_range_expr(column, dtype, from, to)?
            }
            _ => {
                return Err(AppError::bad_request(format!(
                    "Filter column '{}' is not numeric or temporal",
                    column
                )));
            }
        };
        lf = lf.filter(expr);
    }

    if !line_filters.is_empty() {
        let time_column = time_column
            .map(str::trim)
            .filter(|column| !column.is_empty())
            .ok_or_else(|| {
                AppError::bad_request("Missing time column for adaptive filter".to_string())
            })?;
        let schema = lf.clone().collect_schema().map_err(|e| {
            AppError::bad_request(format!("Failed to get schema for line filter: {}", e))
        })?;
        let ts_dtype = schema.get(time_column).ok_or_else(|| {
            AppError::bad_request(format!(
                "Missing time column '{}' for adaptive filter",
                time_column
            ))
        })?;
        let ts_expr = temporal_ms_expr(time_column, ts_dtype);

        for filter in line_filters {
            let column = filter.column.trim();
            if column.is_empty() || filter.x1 == filter.x2 {
                continue;
            }
            let schema = lf.clone().collect_schema().map_err(|e| {
                AppError::bad_request(format!(
                    "Unknown adaptive filter column '{}': {}",
                    column, e
                ))
            })?;
            if !schema.get(column).is_some_and(|d| d.is_numeric()) {
                return Err(AppError::bad_request(format!(
                    "Adaptive filter column '{}' must be numeric",
                    column
                )));
            }

            let min_x = filter.x1.min(filter.x2);
            let max_x = filter.x1.max(filter.x2);
            let slope = (filter.y2 - filter.y1) / (filter.x2 - filter.x1);
            let line_expr = lit(filter.y1) + ((ts_expr.clone() - lit(filter.x1)) * lit(slope));
            let cmp_expr = if filter.keep_above {
                col(column).cast(DataType::Float64).gt_eq(line_expr)
            } else {
                col(column).cast(DataType::Float64).lt_eq(line_expr)
            };
            let within_expr = ts_expr
                .clone()
                .gt_eq(lit(min_x))
                .and(ts_expr.clone().lt_eq(lit(max_x)));
            lf = lf.filter(within_expr.not().or(cmp_expr));
        }
    }

    Ok(lf)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::parse_line_filters;

    #[test]
    fn parse_line_filters_accepts_canonical_payload() {
        let filters = parse_line_filters(Some(
            r#"[{"column":"HUFL","x1":1.0,"y1":2.0,"x2":3.0,"y2":4.0,"keepAbove":true}]"#,
        ))
        .expect("canonical line filters should parse");

        assert_eq!(filters.len(), 1);
        assert_eq!(filters[0].column, "HUFL");
        assert!(filters[0].keep_above);
    }

    #[test]
    fn parse_line_filters_accepts_compatibility_id_field() {
        let filters = parse_line_filters(Some(
            r#"[{"id":"adaptive-1","column":"HUFL","x1":1.0,"y1":2.0,"x2":3.0,"y2":4.0,"keepAbove":false}]"#,
        ))
        .expect("compatibility line filters should parse");

        assert_eq!(filters.len(), 1);
        assert_eq!(filters[0].column, "HUFL");
        assert!(!filters[0].keep_above);
    }

    #[test]
    fn parse_line_filters_rejects_other_unknown_fields() {
        let error = parse_line_filters(Some(
            r#"[{"column":"HUFL","x1":1.0,"y1":2.0,"x2":3.0,"y2":4.0,"keepAbove":true,"extra":"nope"}]"#,
        ))
        .expect_err("unexpected fields should still fail");

        assert!(error.to_string().contains("Invalid line filters payload"));
    }
}
