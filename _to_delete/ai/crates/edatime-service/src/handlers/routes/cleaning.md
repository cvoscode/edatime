# crates/edatime-service/src/handlers/routes/cleaning.rs
> Plan-aware cleaning-plan lifecycle handlers mounted under `/api/v1/cleaning/*` plus dataset-version selection/storage routes (`/api/v1/datasets/*`).

## Request / response types (camelCase JSON)
- `pub struct PlanRequestEnvelope { plan: CleaningPlanDto, expected_plan_hash?: Option<String>, expected_source_version_id: String, expected_dataset_revision: u64 }` — `deny_unknown_fields`. Carries the cleaning plan plus the immutable baseline identity the client expects.
- `pub struct OutlierProposalRequest { context: PlanRequestEnvelope, columns: Vec<String>, method: String, threshold: f64 }`
- `pub struct OutlierProposalResponse { source_version, dataset_revision, plan_hash, method, threshold, ranges: Vec<OutlierRangeProposal> }`
- `pub struct OutlierRangeProposal { column, from, to, retain_nulls }`
- `pub struct CleaningDataExportRequest { context: PlanRequestEnvelope, format: String (default "parquet"), output_columns?: Option<Vec<String>> }`
- `pub struct CleaningCodeExportRequest { context: PlanRequestEnvelope, language: CleaningCodeLanguage }`
- `pub enum CleaningCodeLanguage { Python, Rust }`
- `pub struct CleaningValidationResponse { source_version, dataset_revision, plan_hash, canonical_plan }`
- `pub struct CleaningPreviewResponse { source_version, dataset_revision, plan_hash, rows_before, rows_after, rows_removed, columns_before, columns_after, stage_impacts: Vec<CleaningStageImpact>, warnings: Vec<String> }`
- `pub struct CleaningStageImpact { stage_id, executed, rows_before, rows_after, rows_removed }`
- `pub struct CleaningApplyResponse { job_id, source_version, dataset_revision, plan_hash }`
- `pub struct CleaningPlanExportArtifact { schema_version, exported_at, source_version, dataset_revision, dataset_fingerprint, schema_fingerprint, plan_hash, plan: CleaningPlanDto }`
- `pub struct DatasetVersionSelectRequest { version_id }`
- `pub struct CleaningHandoffManifest { schema_version, exported_at, execution_provenance: ManifestExecutionProvenance, source_version, root_source_version, plan_hash, canonical_plan, before: ManifestDatasetSummary, after: ManifestDatasetSummary, artifact_checksums: ManifestArtifactChecksums }`
- `pub struct ManifestExecutionProvenance { application: "edatime-service", application_version: &str (CARGO_PKG_VERSION), plan_schema_version, semantic_hash_algorithm: "fnv1a-v1", execution_mode: "exact-plan-v1" }` — Backend-owned; never accepted from clients.
- `pub struct ManifestDatasetSummary { rows, columns, time_range: Option<TimeRange>, null_count, non_finite_count }`
- `pub struct ManifestArtifactChecksums { source_dataset, source_schema, canonical_plan }`

## Handlers
- `pub async fn validate(State<AppState>, Json<PlanRequestEnvelope>) -> Result<Json<CleaningValidationResponse>, AppError>` → `POST /api/v1/cleaning/validate`
- `pub async fn preview(State<AppState>, Json<PlanRequestEnvelope>) -> Result<Json<CleaningPreviewResponse>, AppError>` → `POST /api/v1/cleaning/preview` — Compiles each stage individually to expose real marginal row impact; warns when `Resample` / `FillNull` precedes a `ChronologicalSplit` (potential leakage).
- `pub async fn propose_outliers(State<AppState>, Json<OutlierProposalRequest>) -> Result<Json<OutlierProposalResponse>, AppError>` → `POST /api/v1/cleaning/propose/outliers` — Method must be `zscore` or `iqr`; `threshold` must be finite and positive; columns must be unique, non-empty, numeric. Returns ranges with `retain_nulls: true`.
- `pub async fn export_data(State<AppState>, Json<CleaningDataExportRequest>) -> Result<Response, AppError>` → `POST /api/v1/cleaning/export/data` — Currently supports `format = "parquet"` only; optional `output_columns` projection; delegates to `streaming_export::lazy_parquet_response` and attaches `x-edatime-*` provenance headers.
- `pub async fn export_plan(State<AppState>, Json<PlanRequestEnvelope>) -> Result<Response, AppError>` → `POST /api/v1/cleaning/export/plan` — Compiles the plan once before serializing it as `CleaningPlanExportArtifact`; `application/json; charset=utf-8` attachment `edatime_cleaning_plan.json`.
- `pub async fn export_code(State<AppState>, Json<CleaningCodeExportRequest>) -> Result<Response, AppError>` → `POST /api/v1/cleaning/export/code` — Generates `apply_edatime_plan.py` (`text/x-python; charset=utf-8`) or `apply_edatime_plan.rs` (`text/rust; charset=utf-8`). `AdaptiveLine` stages are rejected (use the canonical plan JSON instead).
- `pub async fn export_manifest(State<AppState>, Json<PlanRequestEnvelope>) -> Result<Response, AppError>` → `POST /api/v1/cleaning/export/manifest` — Collects both `before` and `after` lazily, builds dataset summaries from `metadata::build_dataset_metadata`, attaches SHA-256 of source dataset / schema / plan as `artifactChecksums`. `application/json` attachment `edatime_handoff_manifest.json`.
- `pub async fn export_bundle(State<AppState>, Json<PlanRequestEnvelope>) -> Result<Response, AppError>` → `POST /api/v1/cleaning/export/bundle` — Same constraints as `export_code` plus manifest, plus `canonical-plan.json`. Returns an `application/zip` archive named `edatime_handoff_bundle.zip` with `checksums.json` recording the SHA-256 of every other archive member.
- `pub async fn apply(State<AppState>, Json<PlanRequestEnvelope>) -> Result<Response, AppError>` → `POST /api/v1/cleaning/apply` — Creates a `JobKind::Materialization`, honors cancellation between stages, materializes a child version (lazy artifact-sink path when `artifact_store` is configured, otherwise in-memory child). Adds `x-edatime-source-version`, `x-edatime-source-revision`, `x-edatime-schema-fingerprint`, `x-edatime-plan-hash` headers.
- `pub async fn list_versions(State<AppState>) -> Result<Json<Vec<DatasetVersionRecord>>, AppError>` → `GET /api/v1/datasets/versions`
- `pub async fn get_storage_usage(State<AppState>) -> Result<Json<ArtifactStorageUsage>, AppError>` → `GET /api/v1/datasets/storage`
- `pub async fn select_version(State<AppState>, Json<DatasetVersionSelectRequest>) -> Result<Json<DatasetVersionRecord>, AppError>` → `POST /api/v1/datasets/versions/select`

## Helpers (file-private)
- `fn validate_envelope(state, envelope) -> Result<(DatasetVersionRecord, String), AppError>` — Rejects if `envelope.expected_source_version_id` is unknown (`AppError::stale_plan`), if `plan.source_version_id` / `expected_source_version_id` / `plan.dataset_revision` / `expected_dataset_revision` do not all match the live record, or if `dataset_fingerprint` / `schema_fingerprint` diverge. Computes the authoritative `semantic_hash`; the client-supplied `expected_plan_hash` is ignored (optimistic hint only).
- `fn preview_warnings(plan) -> Vec<String>` — Reports `Resample` / `FillNull` stages that precede a `ChronologicalSplit` as potential leakage.
- `pub(crate) fn compile_request_frame(state, envelope) -> Result<(DatasetVersionRecord, String, polars::prelude::LazyFrame), AppError>` — Validates the envelope, snapshots the source, and compiles the plan via `edatime_query::cleaning::compile_cleaning_plan`.
- `fn split_native_boundaries(train_end_ms, validation_end_ms, embargo_ms, time_dtype) -> Result<[i64; 4], AppError>` — Resolves epoch-ms split boundaries into the source column's native physical unit using `edatime_core::temporal::epoch_ms_to_native`.
- `fn validate_codegen_support(plan) -> Result<(), AppError>` — Refuses to emit code for plans that include `AdaptiveLine`.
- `fn generate_python_polars(plan, version, hash, time_dtype) -> Result<String, AppError>` — Emits runnable Python/Polars code (`apply_edatime_plan(lf) -> lf`).
- `fn generate_rust_polars(plan, version, hash, time_dtype) -> Result<String, AppError>` — Same coverage in Rust/Polars syntax.
- `fn manifest_summary(data) -> Result<ManifestDatasetSummary, AppError>` — Wraps `metadata::build_dataset_metadata(data, false, None)` to extract row counts, column counts, time range, and aggregated null/non-finite counts.
- `async fn build_handoff_manifest(state, envelope) -> Result<(DatasetVersionRecord, String, CleaningHandoffManifest), AppError>` — Collects `before` and `after` lazily in parallel via `tokio::try_join!`.
- `fn sha256_hex(bytes) -> String` — Returns `sha256:{hex}`.
- `fn build_handoff_bundle(artifacts: Vec<(String, Vec<u8>)>) -> Result<Vec<u8>, AppError>` — Builds a `zip` archive containing the supplied artifacts plus a final `checksums.json`.

## Cross-references
- `CleaningPlanDto` / `CleaningStageDto` / enums: see [`../../edatime-query/src/cleaning.md`](../../edatime-query/src/cleaning.md).
- Plan semantics (filter/line stages, derived expression grammar): see [`../../edatime-query/src/filters.md`](../../edatime-query/src/filters.md), [`../../edatime-query/src/derived.md`](../../edatime-query/src/derived.md).
- Version registry + provenance: see [`../../edatime-store/src/versions.md`](../../edatime-store/src/versions.md), [`../../edatime-store/src/artifacts.md`](../../edatime-store/src/artifacts.md).
- Job kind used by `apply`: see [`../../edatime-store/src/jobs.md`](../../edatime-store/src/jobs.md).
- Execution-identity headers (`x-edatime-source-version`, etc.): see [`./shared.md`](./shared.md).
- Streaming Parquet body: see [`../streaming_export.md`](../streaming_export.md).
