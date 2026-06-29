# crates/edatime-service/src/handlers/routes/drift.rs
> Drift route handlers — single-column drift stats and multi-column drift investigation.

## Structs (Request)

### `DriftQuery` [serde(rename_all = "camelCase")]
- `column: String` — target column name
- `window: String` — window size keyword: `"hourly"`, `"daily"` (default), `"weekly"`
- `reference_start: String` — reference period start (RFC3339 or `YYYY-MM-DDTHH:MM`)
- `reference_end: String` — reference period end (RFC3339 or `YYYY-MM-DDTHH:MM`)
- `ks_pvalue_threshold: Option<f64>` — KS p-value threshold override [deps: [DriftThresholds][1]]
- `es_pvalue_threshold: Option<f64>` — Epps-Singleton p-value threshold override [deps: [DriftThresholds][1]]
- `psi_minor_threshold: Option<f64>` — PSI minor threshold override [deps: [DriftThresholds][1]]
- `psi_major_threshold: Option<f64>` — PSI major threshold override [deps: [DriftThresholds][1]]
- `wasserstein_std_multiplier: Option<f64>` — Wasserstein threshold computed as `-abs(multiplier)` [deps: [DriftThresholds][1]]

### `DriftInvestigateQuery` [serde(rename_all = "camelCase", deny_unknown_fields)]
- `columns: Vec<String>` — numeric columns to investigate
- `window: String` — window size keyword (same as DriftQuery)
- `reference_start: String`, `reference_end: String` — reference period bounds
- `comparison_start: Option<String>`, `comparison_end: Option<String>` — optional custom comparison window; defaults to data end after reference
- `segment_by: Option<String>` — column name for segmentation analysis [deps: []]
- `segment_limit: Option<usize>` — max segments (default 8) [deps: []]
- Threshold overrides: `ks_pvalue_threshold`, `es_pvalue_threshold`, `psi_minor_threshold`, `psi_major_threshold`, `wasserstein_std_multiplier` [deps: [DriftThresholds][1]]
- `include_quality: Option<bool>` — include quality issue rankings (default true) [deps: []]
- `include_change_points: Option<bool>` — include change-point rankings (default true) [deps: []]
- `include_correlations: Option<bool>` — include distributional relationship rankings (default true) [deps: []]

## Private Helpers

- `fn window_ms(window: &str) -> i64` — Converts `"hourly"`/`"daily"`/`"weekly"` to millisecond duration.
- `fn parse_datetime(s: &str) -> Result<DateTime<Utc>, AppError>` — Parses RFC3339 or `YYYY-MM-DDTHH:MM`.
- `async fn max_timestamp_native(state, lf, ts_col, fallback) -> Result<i64, AppError>` — Gets maximum timestamp from dataset snapshot.
- `fn normalized_thresholds(ks_pvalue, es_pvalue, psi_minor, psi_major, wasserstein_std_multiplier) -> DriftThresholds` [deps: [DriftThresholds][1]] — Applies defaults to threshold overrides.
- `async fn filtered_drift_df(state, query_columns, segment_by, reference_start, comparison_end) -> Result<(DataFrame, i64, f64), AppError>` — Filters dataset for drift computation including optional segment column.

## Handlers

- `pub async fn post_drift_stats(State(state): State<AppState>, Json(query): Json<DriftQuery>) -> Result<Response, AppError>` [deps: [compute_temporal_drift][2], [normalized_thresholds][above]]
  - Single-column drift stats. Filters data from reference to max timestamp; computes per-window drift; returns JSON response.

- `pub async fn post_drift_investigate(State(state): State<AppState>, Json(query): Json<DriftInvestigateQuery>) -> Result<Json<crate::analytics::DriftInvestigationResponse>, AppError>` [deps: [compute_drift_investigation][3], [normalized_thresholds][above]]
  - Multi-column drift investigation with feature ranking, optional segmentation, quality issue detection, change-point analysis, and distributional relationship changes.

---
[1]: ../../analytics/drift.md#DriftThresholds
[2]: ../../analytics/drift.md#compute_temporal_drift
[3]: ../../analytics/drift.md#compute_drift_investigation
