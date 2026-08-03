//! Scatter analytics module.

mod collect;
mod correlations;
mod export;
mod matrix;
mod points;
mod sample;

use polars::prelude::*;
use serde::{Deserialize, Serialize};

// Re-export data helpers from collect.rs.
pub use collect::{
    ColorCardinality, cap_categorical_cardinality, collect_filtered_scatter_columns_frame,
    collect_filtered_scatter_frame, collect_xy_pairs,
};

// Re-export route handlers for the router.
pub use correlations::{
    CorrelationMode, post_correlation_matrix, post_scatter_correlations,
    spawn_correlation_matrix_warmup,
};
// Phase 0.2: re-export the inner matrix computation under a
// `_bench_target` suffix so the Criterion bench under
// `crates/edatime-service/benches/correlations.rs` can pin its
// wall-clock cost against the live production code path. Marked
// `#[doc(hidden)]` because end users should call the public handlers
// above; the function is stable for benchmarking only. The
// `CorrelationMatrixData` return type is re-exported alongside it so
// the same `#[doc(hidden)]` audit reasoning applies.
#[doc(hidden)]
pub use correlations::CorrelationMatrixData as CorrelationMatrixDataBenchTarget;
#[doc(hidden)]
pub use correlations::compute_correlation_matrix as compute_correlation_matrix_bench_target;
#[doc(hidden)]
pub use correlations::compute_correlation_matrix_for_mode as compute_correlation_mode_bench_target;
pub use export::post_scatter_export_parquet;
pub use matrix::post_scatter_matrix;
pub use points::post_scatter_points;

// Re-export sampling helpers for tests and downstream consumers.
#[doc(hidden)]
pub use sample::collect_sampled_matrix_rows_streaming as collect_sampled_matrix_rows_bench_target;
pub use sample::{ScatterColorKind, TimeColorMode, collect_sampled_xyc_rows};

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
    /// Canonical, version-guarded cleaning plan, executed before this route's
    /// viewport filtering and sampling.
    pub cleaning_plan: crate::handlers::routes::cleaning::PlanRequestEnvelope,
    #[serde(default = "default_scatter_limit")]
    pub limit: usize,
    /// Optional output format.  Clients may also set
    /// `Accept: application/vnd.apache.arrow.stream` to get Arrow automatically.
    /// Accepted values: "arrow", "json" (defaults to "json" when omitted).
    pub format: Option<String>,
    /// How to render a temporal color column.
    /// `"bucket"` (default) — emit hour-of-day bucket label as categorical.
    /// `"raw"` — emit epoch-millisecond value as continuous numeric (legacy).
    pub time_color_mode: Option<String>,
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
    /// Audit issue 2.2: cardinality summary for the categorical color
    /// pipeline. `None` when no color column was requested. `used` is
    /// the number of distinct categories actually rendered;
    /// `bucketed` is how many were collapsed into the "Other" bucket.
    pub color_cardinality: Option<ColorCardinalityInfo>,
}

/// Public-facing shape of `ColorCardinality` so the frontend receives a
/// stable field set even if the internal helper grows new fields.
#[derive(Debug, Serialize, Clone, Copy)]
pub struct ColorCardinalityInfo {
    pub requested: usize,
    pub used: usize,
    pub bucketed: usize,
}

impl From<ColorCardinality> for ColorCardinalityInfo {
    fn from(value: ColorCardinality) -> Self {
        Self {
            requested: value.requested,
            used: value.used,
            bucketed: value.bucketed,
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterMatrixPair {
    pub x: String,
    pub y: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ScatterMatrixQuery {
    pub pairs: Vec<ScatterMatrixPair>,
    pub color: Option<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    /// How to render a temporal color column.
    /// `"bucket"` (default) — emit hour-of-day bucket label as categorical.
    /// `"raw"` — emit epoch-millisecond value as continuous numeric (legacy).
    pub time_color_mode: Option<String>,
    pub cleaning_plan: crate::handlers::routes::cleaning::PlanRequestEnvelope,
    #[serde(default = "default_scatter_limit")]
    pub limit: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct CorrelationItem {
    pub column: String,
    pub count: usize,
    pub value: Option<f64>,
}

/// Suggestion item with explicit x/y column names and correlation value.
/// This is the format the frontend expects for rendering suggestion chips.
#[derive(Debug, Serialize, Clone)]
pub struct SuggestionItem {
    pub x: String,
    pub y: String,
    pub correlation: f64,
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/// Sentinel used by `#[serde(default = ...)]` when the request struct is
/// parsed without a `ValidationSettings` in scope. The route handlers
/// recognize `0` as "use the configured default" and substitute
/// `resolved_scatter_limit(validation)`. This keeps serde defaults safe
/// (no accidental 1M-row payloads) while still letting operators tune the
/// default through `config.toml` (audit issue 2.6).
fn default_scatter_limit() -> usize {
    0
}

/// Resolved scatter point limit when the client omits `?limit=`.
///
/// Reads `ValidationSettings.default_scatter_limit` so operators can tune
/// it via `config.toml` (audit issue 2.6). Returns 1 if the configured
/// value is zero (defensive — a zero default would prevent any scatter
/// plot from rendering).
pub(crate) fn resolved_scatter_limit(
    validation: &edatime_core::config::ValidationSettings,
) -> usize {
    validation.default_scatter_limit.max(1)
}

/// Clamp a caller-supplied scatter limit into the inclusive range
/// `[1, validation.max_scatter_limit]`. When the caller did not supply a
/// limit, the caller should substitute
/// `resolved_scatter_limit(validation)` first so the configured default
/// takes effect; the upper bound here protects only against explicit
/// oversized `?limit=` requests.
fn clamp_limit(limit: usize, validation: &edatime_core::config::ValidationSettings) -> usize {
    let upper = validation.max_scatter_limit.max(1);
    limit.clamp(1, upper)
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
                DataType::Datetime(_, _) | DataType::Date if name == "ts" => Some(name.to_string()),
                _ => None,
            }
        })
        .collect()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use edatime_core::config::ValidationSettings;
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

    /// Audit issue 2.6: the scatter default limit must come from
    /// `ValidationSettings.default_scatter_limit` so operators can tune it
    /// via `config.toml`. The 0 sentinel used by `serde(default = ...)`
    /// is the signal that the client omitted the field and the route
    /// handler should resolve through `resolved_scatter_limit`.
    #[test]
    fn resolved_scatter_limit_uses_configured_default() {
        let mut validation = ValidationSettings {
            default_scatter_limit: 42_000,
            ..ValidationSettings::default()
        };
        assert_eq!(resolved_scatter_limit(&validation), 42_000);

        // Zero / missing default falls back to 1 so the handler can never
        // produce an empty scatter response by accident.
        validation.default_scatter_limit = 0;
        assert_eq!(resolved_scatter_limit(&validation), 1);
    }
}
