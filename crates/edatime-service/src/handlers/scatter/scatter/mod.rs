//! Scatter analytics routes — points, correlations, and export.

mod collect;
mod correlations;
mod export;
mod points;
mod sample;

use polars::prelude::*;
use serde::{Deserialize, Serialize};

// Re-export filter types used by consumers.
pub use crate::filters::{
    LineFilter as ScatterLineFilterSpec, RangeFilter as ScatterFilterSpec,
    apply_filters as apply_scatter_filters, parse_line_filters as parse_scatter_line_filters,
    parse_range_filters as parse_scatter_filters,
};

// Re-export data helpers from collect.rs.
pub use collect::{collect_filtered_scatter_frame, collect_xy_pairs};

// Re-export route handlers for the router.
pub use correlations::{get_correlation_matrix, get_scatter_correlations};
pub use export::post_scatter_export_parquet;
pub use points::{get_scatter_points, post_scatter_points};

// ── Shared types ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterPointsQuery {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub size: Option<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<String>,
    pub line_filters: Option<String>,
    #[serde(default = "default_scatter_limit")]
    pub limit: usize,
    /// Optional output format.  Clients may also set
    /// `Accept: application/vnd.apache.arrow.stream` to get Arrow automatically.
    /// Accepted values: "arrow", "json" (defaults to "json" when omitted).
    pub format: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ScatterPointsResponse {
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub total_points: usize,
    pub returned_points: usize,
    pub points: Vec<[f64; 2]>,
    pub color_values: Option<Vec<f64>>,
    pub color_labels: Option<Vec<Option<String>>>,
    pub color_min: Option<f64>,
    pub color_max: Option<f64>,
    pub size_values: Option<Vec<f64>>,
    pub size_min: Option<f64>,
    pub size_max: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CorrelationItem {
    pub column: String,
    pub count: usize,
    pub pearson: Option<f64>,
    pub spearman: Option<f64>,
}

// ── Shared helpers ───────────────────────────────────────────────────────────

fn default_scatter_limit() -> usize {
    1_000_000
}

fn clamp_limit(limit: usize, validation: &crate::config::ValidationSettings) -> usize {
    limit.clamp(1, validation.max_scatter_limit)
}

/// Returns numeric column names from a LazyFrame for correlation suggestions.
/// ts column is included for correlation purposes.
pub fn numeric_columns<I: Into<LazyFrame>>(df: I) -> Vec<String> {
    let lf: LazyFrame = df.into();
    let schema = match lf.clone().collect_schema() {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    schema
        .iter_fields()
        .filter_map(|field| {
            let name = field.name();
            match field.dtype() {
                dt if dt.is_numeric() => Some(name.to_string()),
                DataType::Datetime(_, _) | DataType::Date if name == "ts" => {
                    Some(name.to_string())
                }
                _ => None,
            }
        })
        .collect()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::config::ValidationSettings;
    use polars::prelude::{DataFrame, DataType, Series, TimeUnit};

    #[test]
    fn numeric_columns_includes_ts_for_correlations() {
        let ts = Series::new("ts".into(), [1_i64, 2])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("cast ts to datetime should succeed in test");
        let value = Series::new("value".into(), [1.0_f64, 2.0]);
        let other = Series::new("other".into(), [3.0_f64, 4.0]);
        let df = DataFrame::new(2, vec![ts.into(), value.into(), other.into()])
            .expect("test dataframe creation should succeed");

        let cols = numeric_columns(df.lazy());
        // ts is included for correlation purposes (as timestamp), non-timestamp temporal cols are not
        // Order follows DataFrame column order (ts, value, other)
        assert_eq!(
            cols,
            vec!["ts".to_string(), "value".to_string(), "other".to_string()]
        );
    }

    #[test]
    fn clamp_limit_respects_runtime_validation_setting() {
        let validation = ValidationSettings {
            max_scatter_limit: 123,
            ..ValidationSettings::default()
        };

        assert_eq!(clamp_limit(0, &validation), 1);
        assert_eq!(clamp_limit(120, &validation), 120);
        assert_eq!(clamp_limit(1000, &validation), 123);
    }
}
