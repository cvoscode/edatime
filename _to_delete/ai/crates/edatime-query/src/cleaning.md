# crates/edatime-query/src/cleaning.rs
> Typed v1 cleaning-plan IR: portable `serde` DTO, validation, and LazyFrame compilation. Consumed by `routes/cleaning` (`POST /api/v1/cleaning/*`).

## DTOs (all `deny_unknown_fields`, camelCase)
- `pub struct CleaningPlanDto { schema_version: u16, id, plan_revision, source_version_id, dataset_revision, dataset_fingerprint?, schema_fingerprint, time_column, source_name?, stages: Vec<CleaningStageDto>, created_at, updated_at }`
- `pub struct CleaningStageBaseDto { id, enabled, execution_class, scope, source_page, label, note?, created_at, updated_at }`
- `pub enum CleaningStageDto` (tagged on `kind`, all field names camelCase):
  - `TimeRange { base, start_ms, end_ms, mode: TimeRangeMode }`
  - `ColumnRange { base, column, from, to, mode: RangeMode, retain_nulls: bool }`
  - `AdaptiveLine { base, column, x1_ms, y1, x2_ms, y2, keep_above, apply_within_segment_only }`
  - `MissingValue { base, column, drop_nulls, drop_non_finite }`
  - `Deduplicate { base, columns, keep: DuplicateKeep }`
  - `ColumnSelect { base, columns, mode: ColumnSelectMode }`
  - `Sort { base, columns, descending, nulls_last }`
  - `FillNull { base, columns, strategy: FillNullDirection, limit: Option<u32> }`
  - `Resample { base, every: String, aggregations: Vec<ResampleAggregationDto> }`
  - `ChronologicalSplit { base, train_end_ms, validation_end_ms, embargo_ms, output_column }`
  - `DerivedColumn { base, expression, output_column }`
  - `Annotation { base, severity? }`
- Methods on `CleaningStageDto`:
  - `pub fn id(&self) -> &str`
  - `pub fn enabled(&self) -> bool`
- `pub struct ResampleAggregationDto { column, method: ResampleAggregationMethod }`

## Enums
- `pub enum TimeRangeMode { KeepInside, DropInside }`
- `pub enum RangeMode { KeepInside, DropInside }`
- `pub enum DuplicateKeep { First, Last }`
- `pub enum ColumnSelectMode { Keep, Drop }`
- `pub enum FillNullDirection { Forward, Backward }`
- `pub enum ResampleAggregationMethod { Mean, Sum, Min, Max, Last }`

## Functions
- `pub fn validate_cleaning_plan(plan: &CleaningPlanDto) -> Result<(), AppError>`
  - Requires `schema_version == 1`.
  - Requires non-empty `source_version_id`, `schema_fingerprint`, `time_column`.
  - Requires unique non-empty stage IDs.
  - Enforces per-stage contracts (finite numbers, non-zero line segments, deduplicate/sort/column-select uniqueness, ordered-null-fill must have an earlier enabled stable sort on `time_column`, resample must have an earlier enabled ascending sort with `time_column` first, chronological split must have `train_end_ms < validation_end_ms`, embargo non-negative, derived-column must use a non-time `output_column`).
  - `Resample.every` must parse as a fixed Polars duration with unit in `ns | us | ms | s | m | h`.
- `pub fn compile_cleaning_plan(mut lf: LazyFrame, plan: &CleaningPlanDto) -> Result<LazyFrame, AppError>`
  - Validates the plan, then applies each enabled stage in order, returning the lazy frame.
  - Stage mappings include `TimeRange` → `apply_time_range_stage`, `ColumnRange` → `apply_range_stage`, `AdaptiveLine` → `apply_line_stage`, `FillNull` → `polars.fill_null_with_strategy(...)`, `Resample` → `group_by_dynamic` (left-labeled, left-closed, `period == every`, `offset = 0ns`), `ChronologicalSplit` → `with_columns` adding categorical labels `unassigned | train | embargo | validation | test` based on native-unit thresholds, `DerivedColumn` → `with_column(expression.to_polars_expr().alias(...))`.
- `pub fn semantic_hash(plan: &CleaningPlanDto) -> Result<String, AppError>`
  - Returns FNV-1a 64-bit hex of canonical JSON (`schemaVersion`, `sourceVersionId`, `datasetRevision`, `datasetFingerprint`, `schemaFingerprint`, `timeColumn`, enabled stages). Audit fields (`id`, `planRevision`, stage `id`/`label`/`note`/`createdAt`/`updatedAt`) are intentionally excluded.
  - `Annotation` stages are excluded; disabled stages are excluded.

## Module-private helpers
- `fn parse_fixed_duration(stage_id, every) -> Result<polars::Duration, AppError>` — Strict parse of fixed-duration strings (rejects calendar units).
- `fn ensure_finite(stage_id, field, value) -> Result<(), AppError>`
- `fn fnv1a(value: &str) -> String`
- `fn canonical_number(value: f64) -> f64` — Maps `-0.0` and `0.0` to `0.0`.
- `fn semantic_stage_value(stage) -> Option<serde_json::Value>` — Per-stage canonicalization used by `semantic_hash`.

## Notes
- All DTOs use `serde(rename_all = "camelCase", deny_unknown_fields)` to reject frontend typos.
- `semantic_hash` is the server-owned optimistic/cache identity used by `PlanRequestEnvelope.expected_plan_hash`. It deliberately excludes audit metadata so renaming a stage does not invalidate plan reuse.
- `ChronologicalSplit` boundaries compare native physical `Int64` values — they are unit-agnostic and match both `Datetime(_, _)` and `Date` columns.
- `Resample` uses `every = period`, `offset = 0ns`, `Label::Left`, `ClosedWindow::Left`, `StartBy::WindowBound`; empty buckets are not synthesized.
- See related modules: `filters` (range/line filter builders), `derived` (expression grammar), `pipeline` (low-level filter helpers).
