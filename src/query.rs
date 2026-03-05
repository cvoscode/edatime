//! Shared query parameter types and parsing utilities.
//!
//! All route handlers that accept time-range or column queries should use these
//! types so that adding new chart-type endpoints doesn't duplicate parsing logic.

use chrono::{DateTime, Utc};
use polars::prelude::*;
use serde::Deserialize;

// ── Query parameter structs ────────────────────────────────────────────────

/// Common time-range + viewport query used by the data endpoint.
#[derive(Deserialize, Debug, Clone)]
pub struct DataQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub width: usize,
    pub columns: Option<String>,
    /// `"arrow"` (default) or `"json"`.
    pub format: Option<String>,
}

/// Query for bucket-aggregation endpoints (bar charts, histograms, etc.).
#[derive(Deserialize, Debug, Clone)]
pub struct AggregateQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Number of time buckets to split the range into.
    #[serde(default = "default_buckets")]
    pub buckets: usize,
    /// Aggregation function: `"mean"`, `"sum"`, `"min"`, `"max"`, `"count"`.
    #[serde(default = "default_agg_fn")]
    pub agg: AggFn,
    pub format: Option<String>,
}

fn default_buckets() -> usize {
    50
}

fn default_agg_fn() -> AggFn {
    AggFn::Mean
}

/// Supported aggregation functions.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AggFn {
    Mean,
    Sum,
    Min,
    Max,
    Count,
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Parse the `columns` query param into a list of column name strings.
/// Falls back to `["value"]` when absent.
pub fn parse_columns(raw: &Option<String>) -> Vec<String> {
    raw.as_deref()
        .map(|s| s.split(',').map(|c| c.trim().to_string()).filter(|c| !c.is_empty()).collect())
        .unwrap_or_else(|| vec!["value".to_string()])
}

/// Detect the time-unit multiplier so we can convert epoch-ms timestamps from
/// the query into the internal representation used by the DataFrame's `ts`
/// column.
pub fn unit_multiplier_for_ts(df: &DataFrame) -> Result<i64, crate::error::AppError> {
    let ts_dtype = df
        .column("ts")
        .map_err(|e| crate::error::AppError::BadRequest(format!("Missing ts column: {}", e)))?
        .as_materialized_series()
        .dtype()
        .clone();

    Ok(match ts_dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
        DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
        DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
        _ => 1_000,
    })
}

/// Return the `DataType` of the `ts` column.
pub fn ts_dtype(df: &DataFrame) -> Result<DataType, crate::error::AppError> {
    Ok(df
        .column("ts")
        .map_err(|e| crate::error::AppError::BadRequest(format!("Missing ts column: {}", e)))?
        .as_materialized_series()
        .dtype()
        .clone())
}

/// Determine the requested output format (defaults to `"arrow"`).
pub fn output_format(raw: &Option<String>) -> OutputFormat {
    match raw.as_deref().unwrap_or("arrow") {
        s if s.eq_ignore_ascii_case("json") => OutputFormat::Json,
        _ => OutputFormat::Arrow,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Arrow,
    Json,
}
