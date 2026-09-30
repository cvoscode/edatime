# crates/edatime-service/src/handlers/routes/shared.rs
> Shared route helpers used across multiple route modules. Centralizes execution-identity headers, validation prelude, and stride downsampling.

## Structs
- `pub struct ResponseMeta { is_downsampled: bool, returned_rows: usize, target_points: Option<usize> }` — Metadata for `x-edatime-*` response headers.
- `pub struct ExecutionIdentity { source_version_id: String, source_revision: u64, schema_fingerprint: String, plan_hash: Option<String> }` — Immutable provenance for a dataset-derived response. Resolved from the live `DatasetVersionRecord`; `plan_hash = None` means the request used the source unchanged and is rendered as the explicit `"none"` sentinel.

## `ExecutionIdentity` methods
- `pub fn from_version(version: DatasetVersionRecord, plan_hash: Option<String>) -> Self`
- `pub fn headers(&self) -> Vec<(String, String)>` — Returns `[("x-edatime-source-version", ...), ("x-edatime-source-revision", ...), ("x-edatime-schema-fingerprint", ...), ("x-edatime-plan-hash", plan_hash.unwrap_or("none"))]`.

## Functions
- `pub fn current_execution_identity(state: &AppState) -> Result<ExecutionIdentity, AppError>` — Wraps `state.current_dataset_version()` with `plan_hash = None`.
- `pub fn add_execution_identity_headers<B>(response: Response<B>, identity: &ExecutionIdentity) -> Response<B>` — Inserts the four `x-edatime-*` headers on the response (skips individual headers whose `HeaderValue::from_str` fails).
- `pub fn add_edatime_headers<B>(response: Response<B>, meta: &ResponseMeta) -> Response<B>` — Inserts `x-edatime-downsampled` (`"1"` / `"0"`), `x-edatime-returned-rows`, and `x-edatime-target-points` (when `Some`).
- `pub async fn filter_preamble(state: &AppState, start: DateTime<Utc>, end: DateTime<Utc>, columns: Option<&str>) -> Result<(Vec<String>, DataFrame), AppError>` — Validates the time window, snapshots the dataset, parses `columns`, validates numeric columns, resolves the time-context via `state.ts_context(&lf)`, and applies `pipeline::filter_time_range` with native-unit bounds (`start.timestamp_millis() * ctx.multiplier`).
- `pub async fn filter_preamble_with_plan(state: &AppState, start, end, columns, cleaning_plan: &PlanRequestEnvelope) -> Result<(Vec<String>, DataFrame, ExecutionIdentity), AppError>` — Plan-aware variant. Calls `compile_request_frame` to validate the envelope and compile the plan into a `LazyFrame`, resolves the time context via `edatime_core::temporal::ts_context(&lf, &time_column)`, and returns the identity (including `plan_hash`).
- `pub fn downsample_by_stride(df: DataFrame, max_pts: usize, label: &str) -> Result<DataFrame, AppError>` — Stride-sampled `take` over `IdxCa` when the row count exceeds `max_pts`. No-op when `df.height() <= max_pts`.

## Cross-references
- `PlanRequestEnvelope`, `compile_request_frame`: see [`./cleaning.md`](./cleaning.md).
- `validate_time_window`, `validate_numeric_columns_lazy`: see [`../../edatime-query/src/validation.md`](../../edatime-query/src/validation.md).
- `pipeline::filter_time_range`: see [`../../edatime-query/src/pipeline.md`](../../edatime-query/src/pipeline.md).
- `DatasetVersionRecord`, `AppState`: see [`../../edatime-store/src/versions.md`](../../edatime-store/src/versions.md) and [`../../edatime-store/src/state.md`](../../edatime-store/src/state.md).
