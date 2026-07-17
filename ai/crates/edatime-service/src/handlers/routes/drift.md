# ai/crates/edatime-service/src/handlers/routes/drift.md
> HTTP handlers for `POST /api/v1/drift/stats` and `POST /api/v1/drift/investigate`.

## Structs
- `pub struct DriftQuery { column, window, reference_start, reference_end, ks_pvalue_threshold?, es_pvalue_threshold?, psi_minor_threshold?, psi_major_threshold?, wasserstein_std_multiplier? }` — Request body for single-column drift stats. All serde `rename_all = "camelCase"`.
- `pub struct DriftInvestigateQuery { columns, window, reference_start, reference_end, comparison_start?, comparison_end?, segment_by?, segment_limit?, ks_pvalue_threshold?, es_pvalue_threshold?, psi_minor_threshold?, psi_major_threshold?, wasserstein_std_multiplier?, include_quality?, include_change_points?, include_correlations? }` — Request body for multi-column drift investigation. `deny_unknown_fields`.

## Functions
- `pub async fn post_drift_stats(State(state): State<AppState>, Json(query): Json<DriftQuery>) -> Result<Response, AppError>` [deps: [compute_temporal_drift][1], [validate_time_window][2]]
  - Single-column temporal drift stats. Parses datetime, validates window, filters data, calls `compute_temporal_drift`, returns JSON response.

- `pub async fn post_drift_investigate(State(state): State<AppState>, Json(query): Json<DriftInvestigateQuery>) -> Result<Json<crate::analytics::DriftInvestigationResponse>, AppError>` [deps: [compute_drift_investigation][1], [validate_numeric_columns_lazy][2]]
  - Multi-column drift investigation with optional segment/quality/correlation sections. Validates time windows, numeric columns, and segment column constraints (cannot be the time column).

### Private Helpers
- `fn window_ms(window: &str) -> i64` — Converts window string ("hourly"/"weekly"/default "daily") to milliseconds.
- `fn parse_datetime(s: &str) -> Result<DateTime<Utc>, AppError>` — Parses RFC3339 or `%Y-%m-%dT%H:%M` format.
- `async fn max_timestamp_native(state, lf, ts_col, fallback) -> Result<i64, AppError>` — Queries the max timestamp from a LazyFrame via the query executor.
- `fn normalized_thresholds(ks_pvalue_threshold?, es_pvalue_threshold?, psi_minor_threshold?, psi_major_threshold?, wasserstein_std_multiplier?) -> DriftThresholds` — Applies default values and normalizes thresholds (wasserstein uses negative absolute multiplier).
- `async fn filtered_drift_df(state, query_columns, segment_by, reference_start, comparison_end) -> Result<(DataFrame, i64, f64), AppError>` — Filters dataset by time range including the segment column if provided.

[deps: [DriftThresholds][3], [compute_temporal_drift][1], [compute_drift_investigation][1]]

---
[1]: ../../analytics/drift.md#compute_temporal_drift
[2]: ../../../edatime-query/src/validation.md#validate_time_window
[3]: ../../analytics/drift.md#DriftThresholds