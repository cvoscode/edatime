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

// ── Composite filter application ───────────────────────────────────────────

pub fn apply_filters<I: Into<LazyFrame>>(
    df: I,
    start_ms: Option<f64>,
    end_ms: Option<f64>,
    range_filters: &[RangeFilter],
    line_filters: &[LineFilter],
) -> Result<LazyFrame, AppError> {
    let mut lf: LazyFrame = df.into();

    if let (Some(start), Some(end)) = (start_ms, end_ms) {
        let schema = lf.clone().collect_schema().map_err(|e| {
            AppError::bad_request(format!("Failed to get schema for time filter: {}", e))
        })?;
        let ts_dtype = schema.get("ts").ok_or_else(|| {
            AppError::bad_request("Missing ts column for time filter".to_string())
        })?;
        let start_native = temporal::epoch_ms_to_native(start.min(end), ts_dtype, false)?;
        let end_native = temporal::epoch_ms_to_native(start.max(end), ts_dtype, true)?;
        lf = lf
            .filter(col("ts").cast(DataType::Int64).gt_eq(lit(start_native)))
            .filter(col("ts").cast(DataType::Int64).lt_eq(lit(end_native)));
    }

    for filter in range_filters {
        let column = filter.column.trim();
        if column.is_empty() {
            continue;
        }
        let schema = lf.clone().collect_schema().map_err(|e| {
            AppError::bad_request(format!("Failed to get schema for filter column '{}': {}", column, e))
        })?;
        let dtype = schema.get(column).ok_or_else(|| {
            AppError::bad_request(format!("Unknown filter column '{}'", column))
        })?;
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
        let schema = lf.clone().collect_schema().map_err(|e| {
            AppError::bad_request(format!("Failed to get schema for line filter: {}", e))
        })?;
        let ts_dtype = schema.get("ts").ok_or_else(|| {
            AppError::bad_request("Missing ts column for adaptive filter".to_string())
        })?;
        let ts_expr = temporal_ms_expr("ts", ts_dtype);

        for filter in line_filters {
            let column = filter.column.trim();
            if column.is_empty() || filter.x1 == filter.x2 {
                continue;
            }
            let schema = lf.clone().collect_schema().map_err(|e| {
                AppError::bad_request(format!("Unknown adaptive filter column '{}': {}", column, e))
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