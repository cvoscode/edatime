//! Shared query parameter types and parsing utilities.
//!
//! All route handlers that accept time-range or column queries should use these
//! types so that adding new chart-type endpoints doesn't duplicate parsing logic.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Query parameter structs ────────────────────────────────────────────────

/// Common time-range + viewport query used by the data endpoint.
#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct DataQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub width: usize,
    pub columns: Option<String>,
    pub color_column: Option<String>,
    /// `"arrow"` (default) or `"json"`.
    pub format: Option<String>,
}

/// Query for bucket-aggregation endpoints (bar charts, histograms, etc.).
#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct AggregateQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Number of time buckets to split the range into.
    #[serde(default = "default_buckets")]
    pub buckets: usize,
    /// Windowing mode for aggregation.
    #[serde(default = "default_aggregate_window_mode")]
    pub window_mode: AggregateWindowMode,
    /// Window size in milliseconds for tumbling/sliding windows.
    pub window_ms: Option<i64>,
    /// Step size in milliseconds for sliding windows.
    pub step_ms: Option<i64>,
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

fn default_aggregate_window_mode() -> AggregateWindowMode {
    AggregateWindowMode::Buckets
}

/// Supported aggregation functions.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AggFn {
    Mean,
    Sum,
    Min,
    Max,
    Count,
}

/// Supported aggregate windowing modes.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AggregateWindowMode {
    Buckets,
    Tumbling,
    Sliding,
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Parse the `columns` query param into a list of column name strings.
/// Falls back to `["value"]` when absent or empty.
pub fn parse_columns(raw: Option<&str>) -> Vec<String> {
    let trimmed = raw.map(|s| s.trim()).filter(|s| !s.is_empty());
    match trimmed {
        Some(s) => s
            .split(',')
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
            .collect(),
        None => vec!["value".to_string()],
    }
}

// Re-export temporal helpers so existing callers keep compiling.
pub use crate::temporal::{ts_dtype, ts_dtype_lazy, unit_multiplier_for_ts, unit_multiplier_for_ts_lazy};

/// Determine the requested output format (defaults to `"arrow"`).
pub fn output_format(raw: Option<&str>) -> OutputFormat {
    match raw.unwrap_or("arrow") {
        s if s.eq_ignore_ascii_case("json") => OutputFormat::Json,
        _ => OutputFormat::Arrow,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Arrow,
    Json,
}

// ── Query log ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub enum ReductionSpec {
    Lttb { target_points: usize },
    BucketAgg { buckets: usize, agg: String },
    WindowAgg { window_ms: i64, step_ms: i64, agg: String },
    None,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueryEntry {
    pub id: u64,
    pub timestamp: DateTime<Utc>,
    pub route: String,
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    pub width: Option<usize>,
    pub columns: Vec<String>,
    pub color_column: Option<String>,
    pub format: String,
    pub reduction: Option<ReductionSpec>,
    pub ts_dtype: String,
}
