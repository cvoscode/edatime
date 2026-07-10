# Plot-Driven Query Plan / Preprocessing Pipeline Feature

## Goal

Build an interactive preprocessing workflow where the user investigates the dataset through the existing visual pages and turns observations into a reversible, exportable query plan.

The user should be able to:

1. Use any plot to find questionable rows, columns, intervals, segments, frequencies, relationships, or derived signals.
2. Add a cleaning stage from that plot into a shared preprocessing plan.
3. Preview the effect of the plan immediately across every plot.
4. Edit, disable, reorder, annotate, and remove stages without mutating the source dataset.
5. Export:
   - the cleaned dataset,
   - a canonical JSON query plan,
   - generated Python Polars code,
   - generated Rust Polars code.
6. Optionally apply/materialize the cleaned dataset inside EdaTime as a deliberate action.

This is not a page-local filter feature. It is a shared, visual query-plan builder.

## Current Code Grounding

Use these existing seams as the implementation base:

- Frontend filter state currently lives in `frontend/src/store/uiState.ts` as `columnRanges` and `adaptiveLineFilters`.
- Backward-compatible app state access is in `frontend/src/store/index.ts` and `frontend/src/store/appStateCompat.ts`.
- Timeseries filter helpers live in `frontend/src/services/timeseries/filtering.ts`.
- Timeseries clear/reset action wiring lives in `frontend/src/features/timeseries/actions.ts`.
- Scatter query context is currently built in `frontend/src/scatter/state.ts` via `buildScatterQueryContext`.
- Scatter still has plot/matrix filter snapshots in `frontend/src/store/scatterState.ts`; those should stop being the authoritative filter model.
- Scatter points/matrix/export serialize `filters` and `line_filters` in `frontend/src/services/api/scatter.ts` and `frontend/src/scatter/export.ts`.
- Timeseries filtered export already sends `filters` and `line_filters` to `GET /api/export/parquet` from `frontend/src/features/export/entrypoint.ts`.
- Backend reusable row filtering is in `crates/edatime-query/src/filters.rs`:
  - `RangeFilter`
  - `LineFilter`
  - `parse_range_filters`
  - `parse_line_filters`
  - `apply_filters`
- Backend filtered Parquet export already uses `apply_filters` in `crates/edatime-service/src/handlers/routes/export.rs`.
- Backend chart/analysis endpoints are registered in `crates/edatime-service/src/handlers/routes/mod.rs`.
- Existing analytics routes in `crates/edatime-service/src/handlers/routes/analytics.rs` mostly use `filter_preamble`, which currently applies only time range and projection.
- Drift routes in `crates/edatime-service/src/handlers/routes/drift.rs` currently use their own time-window filtering.
- Existing core `Pipeline` in `crates/edatime-core/src/pipeline.rs` is too small for this feature. Do not force the full cleaning plan into that trait object model. Introduce a serializable cleaning-plan DTO and compiler, and reuse existing pipeline/filter helpers internally.
- Existing transform and outlier mutation endpoints mutate the active dataset:
  - `/api/transform`
  - `/api/analytics/remove_outliers`
  They should remain compatible, but the new plan workflow should be reversible by default.

## Product Semantics

### Reversible by Default

Every plot-authored cleaning action creates or updates a plan stage. It must not rewrite the active dataset unless the user chooses an explicit `Apply plan to dataset` action.

### One Active Plan

There is one active plan for the current dataset revision. All plots read from it. Page-local display zoom, chart pan, hover state, sort order, and selected render mode are not plan state unless the user explicitly clicks an action such as `Add visible range to plan`.

### Source Dataset Remains Addressable

The app must distinguish:

- source dataset: original uploaded/loaded data for the current revision,
- active plan: reversible preprocessing stages,
- materialized dataset: optional result after the user explicitly applies the plan.

### All Plots Can Author Stages

Every plot should provide at least one useful plan-authoring action:

- Timeseries: time window, value range, adaptive line, selected interval.
- Scatter: rectangular selection, lasso/polygon selection, density region, category/color subset.
- Correlation matrix: column keep/drop, redundant-column drop, pair review provenance.
- FFT: frequency-domain transform stage.
- Spectrogram: time-frequency artifact stage.
- Causal: feature keep/drop and graph-provenance stage.
- Drift: flagged-window exclude/keep, stable-window keep, segment filter, drift annotation.

### Every Plot Consumes the Plan

After a stage is enabled, every plot must recompute from the same plan:

- timeseries displays plan-filtered rows and transformed series,
- scatter/matrix/correlations use plan-filtered rows,
- FFT/spectrogram run on plan-filtered/transformed series,
- causal runs on plan-filtered/transformed columns,
- Drift keeps its own reference/comparison date controls but applies the active plan as a cleaned-row mask.

### Page Capability Matrix

| Page | Executable stage actions | Must remain page/analysis state | Primary current owner seam |
| --- | --- | --- | --- |
| Timeseries | time interval, single-series value range, adaptive line | zoom, pan, visible buffered range, hover | `features/timeseries/actions.ts`, `services/timeseries/filtering.ts` |
| Scatter | box, lasso/polygon, typed category keep/drop | axes, zoom, density/bin/render settings | `scatter/state.ts`, `scatter/scatterPage.ts` |
| Correlation | column keep/drop, annotation | metric/mode, cell size, ordering | `pages/heatmapPage.ts`, scatter correlation handlers |
| FFT | explicit signal transform | cursor, scale, FFT display/window settings | `pages/fftPage.ts`, `routes/analytics.rs` |
| Spectrogram | whole-time-window drop, annotation, later explicit reconstruction transform | color scale, clipping, colormap | `pages/spectrogramPage.ts`, `routes/analytics.rs` |
| Causal | column keep/drop, annotation | method, lag, alpha, graph layout | `causal/workflow.ts`, `routes/analytics.rs` |
| Drift | absolute keep/drop windows, typed segment category filter, annotation | reference/comparison controls, latest-N evaluation | `drift/controls.ts`, `routes/drift.rs` |

The first column is the only source of executable plan stages. The second
column is deliberately excluded from plan hashing and export, even when it
changes the picture the user is viewing.

## Core Data Model

Create one canonical JSON schema and implement deliberately equivalent TypeScript
and Rust DTOs. Do not claim that a TypeScript type and a Rust struct are shared
merely because their field names happen to match. The schema, JSON fixtures, and
semantic-hash algorithm are the contract.

The backend is authoritative for DTO validation, plan canonicalization, and the
semantic hash. The frontend validates early for UX only. Every plan-aware response
must return the backend-computed `datasetRevision` and `planHash`; the frontend
must discard a response when either no longer matches its active snapshot.

Recommended frontend location:

- `frontend/src/cleaning/types.ts`
- `frontend/src/cleaning/store.ts`
- `frontend/src/cleaning/compiler.ts`
- `frontend/src/cleaning/export.ts`
- `frontend/src/cleaning/stageLabels.ts`
- `frontend/src/cleaning/planHash.ts`

Recommended backend location:

- `crates/edatime-service/src/handlers/routes/cleaning.rs`
- `crates/edatime-query/src/cleaning/mod.rs`
- `crates/edatime-query/src/cleaning/dto.rs`
- `crates/edatime-query/src/cleaning/canonical.rs`
- `crates/edatime-query/src/cleaning/compiler.rs`
- `crates/edatime-query/src/cleaning/codegen_python.rs`
- `crates/edatime-query/src/cleaning/codegen_rust.rs`

Put the serializable plan model, validation, canonicalization, compilation, and
code generation beside `edatime-query::filters`, because they are query-domain
behavior shared by data/scatter/analytics/export routes. Keep only HTTP DTO
adapters, dataset snapshot/revision checks, route registration, and apply/swap
orchestration in `edatime-service`. Do not let each service route own a copy of
the plan compiler.

### TypeScript Shape

```ts
export interface CleaningPlan {
  schemaVersion: 1;
  id: string;
  /** Increments on every user-visible mutation; never used as the semantic hash. */
  planRevision: number;
  /** Current backend revision; must be a safe non-negative integer. */
  datasetRevision: number | null;
  datasetFingerprint?: string | null;
  /** Stable fingerprint of column names, dtypes, and the selected time column. */
  schemaFingerprint: string;
  timeColumn: string;
  sourceName?: string | null;
  stages: CleaningStage[];
  createdAt: string;
  updatedAt: string;
}

export type CleaningStage =
  | TimeRangeStage
  | ColumnRangeStage
  | AdaptiveLineStage
  | ScatterSelectionStage
  | CategoryFilterStage
  | FrequencyTransformStage
  | SpectrogramArtifactStage
  | DriftWindowStage
  | ColumnKeepDropStage
  | DerivedColumnStage
  | OutlierRuleStage
  | AnnotationStage;

export interface CleaningStageBase {
  id: string;
  kind: CleaningStageKind;
  executionClass: StageExecutionClass;
  scope: StageScope;
  enabled: boolean;
  sourcePage:
    | 'timeseries'
    | 'scatter'
    | 'correlation'
    | 'fft'
    | 'spectrogram'
    | 'causal'
    | 'drift'
    | 'manual'
    | 'import';
  label: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  provenance?: CleaningProvenance;
}

export interface CleaningProvenance {
  pageRoute?: string;
  chartType?: string;
  columns?: string[];
  activeTimeRange?: { startMs: number; endMs: number } | null;
  visibleDomain?: Record<string, number | string | boolean | null>;
  params?: Record<string, unknown>;
}
```

`id`, `planRevision`, labels, notes, timestamps, source-page provenance, and
disabled stages are audit metadata. They are not semantic input to computation
and must be excluded from the semantic hash. The hash must include, in order,
the schema version, source dataset fingerprint/revision, time-column identity,
and normalized enabled-stage parameters. Canonicalization must normalize numeric
`-0` to `0`, sort only order-insensitive lists such as category values, normalize
reversed bounds, and preserve stage order and polygon vertex order. Do not use a
plain `JSON.stringify` result as a cache key.

### Stage Capability and Scope

Every stage must carry a capability classification in addition to its `kind`.
This prevents an analysis display setting from being exported as a misleading
data-cleaning operation.

```ts
export type StageExecutionClass =
  | 'polarsExpression' // fully lazy and portable in generated Polars code
  | 'helperTransform'  // reproducible, but requires NumPy/rustfft/helper code
  | 'backendOnly'      // allowed for preview/apply, not exportable in v1
  | 'annotation';      // provenance only; never changes data

export type StageScope =
  | 'row'              // retains/removes original rows
  | 'column'           // keeps, drops, masks, or derives columns
  | 'signal'           // ordered per-series transformation
  | 'annotation';
```

`sourcePage` explains where the action came from; it must never affect execution.
`executionClass` is assigned by the stage factory and revalidated by the backend,
not chosen freely by UI input. The plan panel must show it as `portable`,
`requires helper`, or `annotation` and must block an export target that cannot
represent an enabled stage. A plan may still be previewed with a `backendOnly`
stage, but it cannot claim Python/Rust parity.

For the first shippable release, support these execution classes:

- `polarsExpression`: time/range/adaptive-line/box/category filters, column
  keep/drop, simple typed derived expressions, and annotation.
- `helperTransform`: polygon selection and frequency/spectrogram transforms,
  only once their shared helper implementation and parity fixtures exist.
- defer `outlierRule` masking, arbitrary expression strings, and arbitrary
  time-frequency masks until they have a typed parameter model and deterministic
  cross-language implementation. They should not be accepted as generic escape
  hatches in v1.

### Stage Kinds

Use explicit stage names. Avoid overloading one generic filter stage.

```ts
export type CleaningStageKind =
  | 'timeRange'
  | 'columnRange'
  | 'adaptiveLine'
  | 'scatterBox'
  | 'scatterPolygon'
  | 'categoryFilter'
  | 'frequencyTransform'
  | 'spectrogramArtifact'
  | 'driftWindow'
  | 'columnKeepDrop'
  | 'derivedColumn'
  | 'outlierRule'
  | 'annotation';
```

### Row Filter Stages

Row filter stages reduce rows. These compile to Polars `.filter(...)`.

```ts
export interface TimeRangeStage extends CleaningStageBase {
  kind: 'timeRange';
  startMs: number;
  endMs: number;
  mode: 'keepInside' | 'dropInside';
}

export interface ColumnRangeStage extends CleaningStageBase {
  kind: 'columnRange';
  column: string;
  from: number;
  to: number;
  mode: 'keepInside' | 'dropInside';
}

export interface AdaptiveLineStage extends CleaningStageBase {
  kind: 'adaptiveLine';
  column: string;
  x1Ms: number;
  y1: number;
  x2Ms: number;
  y2: number;
  keepAbove: boolean;
  applyWithinSegmentOnly: boolean;
}

export interface ScatterSelectionStage extends CleaningStageBase {
  kind: 'scatterBox' | 'scatterPolygon';
  xColumn: string;
  yColumn: string;
  mode: 'keepInside' | 'dropInside';
  box?: { xMin: number; xMax: number; yMin: number; yMax: number };
  polygon?: Array<{ x: number; y: number }>;
}

export interface CategoryFilterStage extends CleaningStageBase {
  kind: 'categoryFilter';
  column: string;
  values: TypedScalar[];
  mode: 'keepValues' | 'dropValues';
}

/** Do not use untyped JavaScript numbers for categorical identity. */
export type TypedScalar =
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'int'; value: string }
  | { type: 'float'; value: number }
  | { type: 'null' };

export interface DriftWindowStage extends CleaningStageBase {
  kind: 'driftWindow';
  columns: string[];
  windows: Array<{ startMs: number; endMs: number; label?: string }>;
  mode: 'dropWindows' | 'keepWindows';
  reason: 'flagged' | 'stable' | 'manual';
}
```

### Column and Transform Stages

Column stages affect projection or derived series. These compile to `.select(...)`, `.drop(...)`, or `.with_columns(...)`.

```ts
export interface ColumnKeepDropStage extends CleaningStageBase {
  kind: 'columnKeepDrop';
  columns: string[];
  mode: 'keep' | 'drop';
  reason: 'correlation' | 'causal' | 'manual';
}

export interface DerivedColumnStage extends CleaningStageBase {
  kind: 'derivedColumn';
  expression: DerivedExpression;
  outputColumn: string;
  replaceColumn?: string | null;
}

/**
 * A typed expression AST. Never accept a raw Polars/Python/Rust expression
 * string: it is unsafe, cannot be validated consistently, and cannot be
 * translated reliably between export targets.
 */
export type DerivedExpression =
  | { op: 'column'; column: string }
  | { op: 'literal'; value: number | boolean | string | null }
  | { op: 'binary'; operator: 'add' | 'sub' | 'mul' | 'div'; left: DerivedExpression; right: DerivedExpression }
  | { op: 'unary'; operator: 'abs' | 'neg' | 'log' | 'sqrt'; input: DerivedExpression }
  | { op: 'fillNull'; input: DerivedExpression; value: number | boolean | string };

export interface FrequencyTransformStage extends CleaningStageBase {
  kind: 'frequencyTransform';
  column: string;
  outputColumn: string;
  filterType: 'lowpass' | 'highpass' | 'bandpass' | 'bandstop';
  lowHz?: number | null;
  highHz?: number | null;
  maxPoints?: number;
  replaceSource: boolean;
}

export interface SpectrogramArtifactStage extends CleaningStageBase {
  kind: 'spectrogramArtifact';
  column: string;
  mode: 'dropTimeWindows' | 'maskValues' | 'annotateOnly';
  timeWindows: Array<{ startMs: number; endMs: number }>;
  frequencyBand?: { lowHz: number; highHz: number } | null;
  outputColumn?: string | null;
}

export interface OutlierRuleStage extends CleaningStageBase {
  kind: 'outlierRule';
  columns: string[];
  method: 'zscore' | 'iqr';
  threshold: number;
  window?: number | null;
  action: 'dropRows' | 'maskValues' | 'annotateOnly';
}

export interface AnnotationStage extends CleaningStageBase {
  kind: 'annotation';
  severity?: 'info' | 'warning' | 'critical';
}
```

## Plan Compilation Semantics

### Execution Order

The order of enabled stages in `CleaningPlan.stages` is meaningful.

Add a stage at the end of the plan by default. The user must explicitly reorder
it; the UI must never silently move existing stages into a convenient category.
This matters when a filter targets a derived/transformed column, or when a
signal transform should see rows before versus after a filter.

The compiler executes enabled stages strictly in array order. A stage can refer
only to columns that exist at that point in the plan. Validation must reject a
later reference to a dropped/renamed column and reject a duplicate output name
unless the stage explicitly replaces that column. The plan panel should expose
this dependency error next to the offending stage and prevent preview/export.

Row predicates on unchanged source columns are often mathematically
commutative, but that is an optimization the backend may apply only after it has
proved equivalence. It is not a reason to alter the saved plan order.

### Combining Row Filters

Enabled row filter stages combine with AND semantics in stage order.

For `dropInside` or `dropValues` stages, compile to the inverse predicate and still AND with the rest.

Examples:

- Keep rows where `OT` is in `[10, 35]`: `col("OT").is_between(10, 35, closed="both")`
- Drop a dirty time interval: `~col(ts).is_between(start, end, closed="both")`
- Drop scatter polygon: `~point_in_polygon(col(x), col(y), polygon)`

Define null and non-finite behavior once and use it in Rust, Python, the
frontend preview text, and tests:

- A `keepInside`, `keepValues`, `keepAbove`, or `keepWindows` predicate keeps
  only rows for which the predicate is explicitly `true`; null and NaN values
  do not pass.
- A `dropInside`, `dropValues`, `dropWindows`, or `keepBelow` inverse action
  retains rows for which the positive predicate is `false` **or null**. This
  requires explicit null handling; a bare boolean `.not()` can leave nulls that
  Polars subsequently drops.
- Bounds must be finite numbers; reject NaN and infinity at DTO validation.
- Inclusive bounds are used everywhere. A zero-width range is valid and keeps
  only exact matches (subject to dtype precision).

### Time Semantics

Frontend stores all time bounds as epoch milliseconds.

Backend compiler must convert to the dataset time column's native Polars dtype using the same temporal conversion behavior as `edatime_query::filters::apply_filters`.

Do not use browser-local datetime semantics for plan stages.

The plan operates on the source time column at the moment the stage runs and
uses inclusive UTC bounds. A plan requires a valid temporal time column for
`timeRange`, adaptive-line, Drift window, and signal stages. For a dataset
without one, the UI must disable those authoring actions and the backend must
return a stage-specific validation error rather than guessing a row index.

### Adaptive Line Semantics

Adaptive line stages are row filters over `(time, column)`.

Current backend `LineFilter` applies the comparison inside the drawn X segment and allows rows outside the segment. Preserve that default for backward compatibility:

- if `applyWithinSegmentOnly = true`, rows outside `[x1Ms, x2Ms]` pass,
- inside the segment, compare column value to line value,
- `keepAbove` keeps values greater than or equal to the line.

### Scatter Polygon Semantics

Rectangular scatter filters compile directly to numeric comparisons.

Polygon/lasso filters need a backend expression strategy:

- Initial helper-stage path: compile polygon to a Rust-side boolean mask after collecting the necessary columns, then filter the dataframe.
- Better path: add a Polars expression helper if practical.
- Codegen must include a helper function for polygon containment in both Python and Rust.

### Frequency Transform Semantics

Frequency filters are transforms, not ordinary row filters.

The stage should produce a new column by default:

- input: `column`
- output: `column__lowpass_...` or user-specified `outputColumn`
- `replaceSource = false` by default

If `replaceSource = true`, generated code should either overwrite the source column or create output then project/rename. Prefer output-then-rename internally to keep provenance clear.

Current `/api/analytics/spectral-filter` returns a preview series. For this
feature, add plan compilation support for the same transform so export and
apply use the backend compiler, not only the preview endpoint.

FFT is not a Polars expression. Generated Python must therefore use Polars for
I/O and table operations plus an explicitly versioned NumPy/SciPy helper; Rust
must use Polars plus the selected FFT crate/helper. The generated artifact must
state its required packages. Do not market this output as "pure Polars code".

Before allowing a signal stage, preflight the input series: selected column
exists and is numeric, timestamps are ordered and unique (or an explicit
deduplication/resampling stage exists), sampling is sufficiently regular for
the requested filter, and null handling is specified. v1 should reject an
irregular/duplicate time axis with an actionable error rather than silently
sorting, interpolating, or changing sample rate.

### Drift Semantics

Drift has separate reference and comparison controls. Keep them separate.

Drift can add stages from investigation results:

- `dropWindows`: remove flagged drift windows.
- `keepWindows`: keep stable windows.
- `categoryFilter`: keep/drop segment values when segment analysis identifies bad groups.
- `annotation`: record suspected drift without changing rows.

When Drift itself computes, it consumes the active plan as a cleaned-row mask, then applies its reference/comparison windows.

### Correlation and Causal Semantics

Correlation and causal pages primarily author column-level stages:

- drop redundant highly correlated columns,
- keep selected feature subset,
- drop suspected leakage/proxy columns,
- annotate pair/edge rationale.

They may open scatter for row-level filtering, but if they create a direct stage themselves it should usually be `columnKeepDrop` or `annotation`.

## Frontend Architecture

### New Cleaning Feature Module

Create:

- `frontend/src/cleaning/types.ts`
- `frontend/src/cleaning/store.ts`
- `frontend/src/cleaning/compiler.ts`
- `frontend/src/cleaning/api.ts`
- `frontend/src/cleaning/planHash.ts`
- `frontend/src/cleaning/stageLabels.ts`
- `frontend/src/cleaning/planPanel.ts`
- `frontend/src/cleaning/plotActions.ts`
- `frontend/src/cleaning/index.ts`

Responsibilities:

- own the active plan,
- expose plan mutation actions,
- compile plan to legacy request filters where needed,
- compute stable hash,
- render a plan panel,
- provide page-specific helper factories for adding stages.

### Store API

Provide small explicit actions:

```ts
export function getCleaningPlan(): CleaningPlan;
export function setCleaningPlan(plan: CleaningPlan): void;
export function resetCleaningPlanForDataset(metadata: DatasetMetadata): void;
export function addCleaningStage(stage: CleaningStage, options?: { position?: 'auto' | number }): void;
export function updateCleaningStage(id: string, patch: Partial<CleaningStage>): void;
export function removeCleaningStage(id: string): void;
export function setCleaningStageEnabled(id: string, enabled: boolean): void;
export function reorderCleaningStage(id: string, targetIndex: number): void;
export function clearCleaningPlan(): void;
```

Emit DOM/store events:

- `edatime:cleaning-plan-change`
- `edatime:cleaning-plan-stage-added`
- `edatime:cleaning-plan-preview-updated`

The existing `edatime:column-filters-change` and `edatime:adaptive-filters-change` can remain as compatibility events initially, but new code should listen to `edatime:cleaning-plan-change`.

### Compiler API

```ts
export interface CompiledCleaningContext {
  planHash: string;
  start?: number;
  end?: number;
  filters: Array<{ column: string; from: number; to: number }>;
  lineFilters: Array<{
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
  }>;
  plan: CleaningPlan;
  unsupportedForLegacyFilters: CleaningStage[];
}

export interface PlanRequestSnapshot {
  /** Entire validated-looking plan; backend remains the authority. */
  plan: CleaningPlan;
  /** Optimistic local hash, used only to coalesce client work. */
  expectedPlanHash: string;
  expectedDatasetRevision: number | null;
}

export function compileCleaningPlanForRequest(plan: CleaningPlan): CompiledCleaningContext;
export function appendCleaningContextToSearchParams(params: URLSearchParams, context: CompiledCleaningContext): void;
export function appendCleaningContextToJsonPayload(payload: Record<string, unknown>, context: CompiledCleaningContext): void;
export function buildPlanRequestSnapshot(plan: CleaningPlan): PlanRequestSnapshot;
```

Important:

- `filters` and `lineFilters` are compatibility outputs for existing routes.
- Full plan-aware routes receive `{ plan, expectedPlanHash, expectedDatasetRevision }`
  in a JSON body. They must not trust a client-supplied hash for cache lookup;
  the backend canonicalizes and hashes the plan, verifies the revision/fingerprint,
  then returns its own hash.
- The legacy compiler is intentionally lossy. It may only be used when every
  enabled stage is representable by the old `start/end/filters/line_filters`
  contract. If `unsupportedForLegacyFilters` is non-empty, the caller must use
  a plan-aware POST endpoint or display a clear unsupported-state error. It
  must never send a partial filter set and imply the whole plan was applied.
- Do not leak UI-only adaptive filter `id` into `line_filters`.

### Plan Panel UI

Add a persistent plan panel/drawer. It should be accessible from all analysis pages.

Minimum UI:

- stage list with enabled toggle,
- stage label,
- source page icon/text,
- affected columns,
- row count impact if preview is available,
- edit button,
- duplicate button,
- remove button,
- drag/reorder control,
- export dropdown,
- apply button.

Preview summary:

- source rows,
- rows after plan,
- rows removed,
- columns after plan,
- warnings.

Avoid treating this as a decorative card-heavy panel. This is operational UI. It should be dense, scannable, and predictable.

### Dataset Lifecycle

On dataset revision change:

- if plan dataset revision differs, mark the plan stale,
- if the change is a normal upload/load/transform, archive the prior plan in
  session storage under its old fingerprint and start a fresh plan;
- if the change is `Apply plan`, retain the completed plan as immutable
  provenance linked to both parent and child revision, then start a fresh empty
  active plan for the materialized child;
- imported plans are eligible only when their schema fingerprint and referenced
  columns/dtypes validate against the new source. A matching filename is never
  sufficient,
- clear compatibility `columnRanges` and `adaptiveLineFilters`,
- clear scatter snapshots,
- dispatch `edatime:cleaning-plan-change`.

This should hook near current dataset mutation/refresh behavior in `frontend/src/app/bootstrap/datasetBootstrap.ts` and existing state reset paths.

Persist the active plan in `sessionStorage` keyed by dataset fingerprint so
normal navigation and a browser refresh preserve an in-progress investigation.
Do not silently restore it across a different fingerprint. Local persistent
history can be considered later; it is not required for v1.

## Page Integration Details

### Timeseries

Current relevant files:

- `frontend/src/pages/timeseriesPage.ts`
- `frontend/src/features/timeseries/actions.ts`
- `frontend/src/features/timeseries/rangeControls.ts`
- `frontend/src/features/timeseries/filterModalController.ts`
- `frontend/src/ui/yRangeControls.ts`
- `frontend/src/services/timeseries/filtering.ts`

Required behavior:

- X zoom remains display state until user clicks `Add visible time range to plan`.
- Y range filter action creates a `columnRange` stage for the explicitly chosen
  series only. It must never infer an AND filter across all visible series.
- `Add visible time range to plan` captures the shared linked-brush UTC window,
  not the chart's pixel viewport or a buffered lookaround fetch range.
- Adaptive line drawing creates an `adaptiveLine` stage.
- Manual interval selection creates `timeRange` with `dropInside` or `keepInside`.
- Existing range chips should render from plan stages rather than directly from `columnRanges`.
- Clear filters should clear/disable plan row-filter stages, not just reset `columnRanges`.

Compatibility bridge:

- During migration, derive `uiState.columnRanges` and `uiState.adaptiveLineFilters` from enabled plan stages so existing rendering continues to work.
- Long term, `applyColumnRanges` should be renamed/generalized to `applyCleaningPlanToFetchedData` or replaced by plan compiler output.

### Scatter

Current relevant files:

- `frontend/src/scatter/state.ts`
- `frontend/src/scatter/scatterPage.ts`
- `frontend/src/scatter/rendering.ts`
- `frontend/src/scatter/matrix.ts`
- `frontend/src/scatter/controls.ts`
- `frontend/src/scatter/export.ts`
- `frontend/src/store/scatterState.ts`
- `frontend/src/services/api/scatter.ts`

Required behavior:

- Replace `buildScatterQueryContext` with shared cleaning-plan request context.
- Remove plot/matrix independent filter snapshots as authoritative cleaning state.
- Scatter view switch must not restore hidden filters into global state.
- Box zoom remains visual zoom.
- Add a separate `Add box filter to plan` action for selected rectangular regions.
- Add lasso/polygon selection mode and `Add lasso filter to plan`.
- Add inverse action: `Drop selected points` vs `Keep selected points`.
- Add category/color filter action when color column is categorical.
- Persist scatter geometry in source-data coordinates, never screen pixels,
  axis display units, or a bin/density-cell index. A filter created from sampled
  points means "apply this geometric predicate to all source rows", not "drop
  the rendered sample indices". The confirmation/preview must state that it
  will be evaluated against the full plan input and can affect more rows than
  the visible sample.
- Do not add an exact point-ID selection stage unless the dataset has a stable
  user-visible row identifier that is included in the plan contract. Generated
  row indices and downsample indices are not stable across filtering and cannot
  be exported safely.
- Category selections must use `TypedScalar` values derived from backend dtype
  metadata, not display labels that may merge distinct values such as `1` and
  `"1"`.
- Scatter matrix cells must use the same plan context as the main scatter plot.
- Backend scatter matrix must stop scoping filters to only the pair columns when compiling a plan. A stage on a different column must still mask rows for every cell.

### Correlation Matrix

Current relevant files:

- `frontend/src/pages/heatmapPage.ts`
- `frontend/src/services/api/scatter-matrix.ts`
- `crates/edatime-service/src/handlers/scatter/correlations.rs`

Required behavior:

- Correlation matrix requests include active plan hash/context.
- Filtered correlations must not reuse the revision-only unfiltered warm cache.
- Add actions:
  - `Drop column from plan`
  - `Keep only selected cluster`
  - `Drop one of highly correlated pair`
  - `Annotate pair`
  - `Open pair in scatter`
- Matrix cell click still navigates to scatter, but must preserve active plan.
- "Drop one of highly correlated pair" is an explicit user choice. The matrix
  may recommend a candidate using missingness/variance metadata, but must never
  silently add a column-drop stage based only on correlation.

Backend:

- Extend `/api/scatter/correlations` and `/api/scatter/correlations/matrix` to accept plan context.
- Cache key must include dataset revision plus plan hash plus selected mode.

### FFT

Current relevant files:

- `frontend/src/pages/fftPage.ts`
- `frontend/src/chart/FftChart.ts`
- `frontend/src/services/api/analytics.ts`
- `crates/edatime-service/src/handlers/routes/analytics.rs`

Required behavior:

- FFT fetches use active plan-filtered rows.
- Frequency filter preview can become a `frequencyTransform` stage.
- Actions:
  - `Add lowpass transform`
  - `Add highpass transform`
  - `Add bandpass transform`
  - `Add bandstop transform`
  - `Create filtered column`
  - `Replace source column` only after explicit confirmation.
- The stage must be exportable to Python/Rust code.

Backend:

- Existing `/api/analytics/fft` should accept active plan context.
- Add compiler support for frequency transform stages.
- If full lazy Polars expression is not practical for the filter operation, generated code may include helper functions operating on collected arrays, but the surrounding plan must remain reproducible.
- FFT settings such as axis scale, averaging, window display, and selected
  frequency cursor are analysis/view state. Only an explicit create/replace
  signal action creates a plan stage.

### Spectrogram

Current relevant files:

- `frontend/src/pages/spectrogramChartRuntime.ts`
- `frontend/src/pages/spectrogramPage.ts`
- `frontend/src/services/api/analytics.ts`

Required behavior:

- Spectrogram computes on active plan-filtered rows.
- Colorbar clipping and display normalization are not cleaning stages by default.
- User-authored stages:
  - drop artifact time windows,
  - annotate time-frequency artifact,
  - create masked/filtered output column if transform is selected.
- Actions must clearly distinguish visual scaling from data preprocessing.

Backend:

- `/api/analytics/spectrogram` accepts active plan context.
- `spectrogramArtifact` row-window drop compiles to normal time filters.
- Time-frequency transform/masking should compile through helper code and be represented explicitly in exported code.
- A spectrogram rectangle is not automatically a row filter: it spans time and
  frequency while source rows have no frequency dimension. v1 may author only
  whole-time-window row drops and annotations. Frequency-band masking requires
  the helper-transform capability and must specify its reconstruction method;
  otherwise keep it out of the active data plan.

### Causal

Current relevant files:

- `frontend/src/causal/causalPage.ts`
- `frontend/src/causal/workflow.ts`
- `frontend/src/services/api/analytics.ts`
- `crates/edatime-service/src/handlers/routes/analytics.rs`

Required behavior:

- Causal computation consumes active plan-filtered/transformed data.
- Actions:
  - `Keep selected nodes`
  - `Drop selected node`
  - `Drop suspected proxy/leakage column`
  - `Annotate selected edge/subgraph`
- Causal graph layout edits are not preprocessing.
- Manual edge edits are provenance/annotation unless the user explicitly creates a feature-selection stage.
- Causal method, lag, alpha, and graph-layout controls remain analysis request
  parameters. They must not appear in the preprocessing plan or alter its hash.

Backend:

- `/api/analytics/causal` accepts active plan context before `CausalDataFrame::from_polars`.
- Work-unit estimation should use post-plan row count if available, or max-points fallback if not.

### Drift

Current relevant files:

- `frontend/src/drift/driftPage.ts`
- `frontend/src/drift/controls.ts`
- `frontend/src/drift/viewModels.ts`
- `crates/edatime-service/src/handlers/routes/drift.rs`

Required behavior:

- Drift compute consumes active plan as cleaned-row mask.
- Drift reference/comparison windows stay Drift controls.
- Actions:
  - `Drop flagged windows`
  - `Keep stable windows`
  - `Drop segment group`
  - `Keep segment group`
  - `Annotate drift`
- Latest-N evaluation mode is display/evaluation state, not a cleaning stage unless user explicitly adds it.
- A Drift window stage must save absolute UTC bounds and the selected
  keep/drop mode. It must not save a relative "latest N" instruction whose
  meaning changes as the source dataset grows.

Backend:

- `/api/drift/stats` and `/api/drift/investigate` accept active plan context.
- Apply plan before Drift splits into reference/comparison windows.

## Backend Architecture

### Routes

Add a new cleaning route module and mount it in `api_router`.

New routes:

```text
POST /api/cleaning/validate
POST /api/cleaning/preview
POST /api/cleaning/export/data
POST /api/cleaning/export/plan
POST /api/cleaning/export/code
POST /api/cleaning/apply
```

`/validate` performs schema/revision/dependency/capability checks without
collecting data and returns the backend canonical plan plus server hash.
`/preview` is the only route that computes counts. `/export/plan` may be a
client-side download after `/validate`, but retaining it as a server route is
useful when the server needs to return a canonicalized artifact.

All six routes take the same envelope. Do not create one-off `plan` fields with
different stale-plan behavior in each analysis request:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanRequestEnvelope {
    pub plan: CleaningPlanDto,
    pub expected_plan_hash: Option<String>,
    pub expected_dataset_revision: u64,
}
```

The server must reject a dataset revision/fingerprint mismatch with HTTP `409`
and machine-readable code `stale_plan`; malformed or incompatible stages are
HTTP `400` with `stageId`, `field`, `code`, and a user-safe message. The API
must never apply an incoming plan to whatever dataset happens to be current.

Request/response sketches:

```rust
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleaningPlanRequest {
    #[serde(flatten)]
    pub context: PlanRequestEnvelope,
    pub output_columns: Option<Vec<String>>,
    pub format: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningPreviewResponse {
    pub dataset_revision: u64,
    pub plan_hash: String,
    pub rows_before: usize,
    pub rows_after: usize,
    pub rows_removed: usize,
    pub columns_before: usize,
    pub columns_after: usize,
    pub stage_summaries: Vec<CleaningStageSummary>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleaningCodeExportQuery {
    pub target: CleaningCodeTarget, // python | rust
}
```

For implementation consistency, make code-export target and data-export format
JSON body fields on a flattened envelope too, or define a single
`CleaningOperationRequest` with an operation-specific `options` object. Do not
use a query-string target for one route while every other cleaning route accepts
the envelope in JSON.

### Compiler

Add a backend validator, compiler, and executor. Keep them separate: validation
is deterministic and data-free; compilation builds an execution description;
execution is the only layer allowed to collect data.

```rust
pub struct CompiledCleaningPlan {
    pub plan_hash: String,
    pub canonical_plan: CleaningPlanDto,
    pub execution: Vec<ExecutionStep>,
    pub selected_columns: Option<Vec<String>>,
    pub warnings: Vec<String>,
}

pub enum ExecutionStep {
    Lazy(polars::prelude::LazyFrame),
    // Explicit materialization barriers. They carry typed data only, never
    // user-supplied source code.
    PolygonMask(PolygonMaskStep),
    SignalTransform(SignalTransformStep),
}

pub fn compile_cleaning_plan(
    lf: LazyFrame,
    ctx: DatasetTimeContext,
    plan: &CleaningPlanDto,
    options: CompileOptions,
) -> Result<CompiledCleaningPlan, AppError>;
```

Compiler rules:

- Validate dataset revision, dataset fingerprint, schema fingerprint, and time
  column identity before stage validation.
- Validate all referenced columns against the schema that exists at that exact
  point in stage order, including derived output columns and prior drops.
- Validate all numeric filters target numeric or temporal columns.
- Validate typed category values against their source dtype and reject lossy
  values instead of coercing identities through JSON numbers.
- Validate all transform output names.
- Reject unknown stage kinds.
- Ignore disabled stages.
- Preserve stage order.
- Reject raw expression text and arbitrary code snippets. Compile only the
  documented derived-expression AST.
- Establish explicit resource limits: maximum enabled stages, polygon vertices,
  category values, derived-expression depth, requested output columns, and
  export rows/bytes. Validate them before any expensive query.
- `polarsExpression` stages remain lazy. `helperTransform` stages create a
  visible `ExecutionStep` barrier; do not silently call `.collect()` from the
  compiler. The executor runs barriers via `QueryExecutor`/`spawn_blocking`,
  converts their result back to `LazyFrame` only when a later stage requires it,
  and reports that loss of laziness in preview warnings.
- Apply the complete plan before an endpoint's page-specific projection. The
  compiler must retain every column referenced by a later stage even when a
  scatter cell or FFT endpoint ultimately needs only two columns.

Preview defaults to a single overall before/after count plus output schema. Per
stage row impacts are optional and explicitly requested because calculating
them requires checkpoint execution and can multiply work. The response should
mark approximations or skipped per-stage counts rather than inventing them.

### Integration with Existing Endpoints

Every endpoint that currently takes time/filter parameters should be upgraded in one of two ways:

1. Preferred: accept `PlanRequestEnvelope` in a POST body.
2. Compatibility: accept `filters`, `line_filters`, `start`, `end`, and compile those into a temporary plan.

Upgrade these:

- `/api/data`
- `/api/export/parquet`
- `/api/scatter/points`
- `/api/scatter/matrix`
- `/api/scatter/export/parquet`
- `/api/scatter/correlations`
- `/api/scatter/correlations/matrix`
- `/api/analytics/fft`
- `/api/analytics/spectrogram`
- `/api/analytics/spectral-filter`
- `/api/analytics/causal`
- `/api/drift/stats`
- `/api/drift/investigate`

For GET endpoints, do not put large JSON plans in query strings long term. Add
POST equivalents or switch existing frontend calls to POST where plan payloads
are needed. Preserve current GET routes as legacy compatibility paths during
migration; they must either compile only legacy-compatible filters or emit a
capability error. Do not change a GET request's meaning based on hidden global
state.

Implement the route migration with one shared helper, conceptually
`compile_request_frame(state, plan_envelope, legacy_filters, required_columns)`,
so analytics, scatter, export, and Drift cannot each invent filter precedence.
When both a plan envelope and old filters are present, reject the request rather
than merging them ambiguously.

### Cache Keys

Any cache that currently keys only by dataset revision must include plan hash.

At minimum:

- scatter matrix cache,
- correlation matrix cache,
- scatter points cache if present,
- FFT/spectrogram derived caches if added.

Key shape:

```text
<feature>:v<datasetRevision>:plan=<serverPlanHash>:<featureParamsHash>
```

Revision-only warmup remains valid only for empty/default plans.

The server owns cache-key construction. It must use the canonical backend hash,
not `expectedPlanHash`, and include output schema/projection whenever that can
change the result. Cache entries must retain revision/hash metadata and be
validated before serving. A stale in-flight response must not populate a cache
under a new dataset revision.

## Code Generation

### Canonical JSON

The JSON plan is the source of truth. Generated Python/Rust code must be derived from it.

Exported plan should include:

- schema version,
- dataset metadata/fingerprint,
- time column,
- stages,
- generation timestamp,
- app version if available.

Put generation timestamp and app version in an export-artifact envelope, not in
the canonical executable plan bytes used for the semantic hash. Re-exporting an
unchanged plan must produce the same plan hash.

Export the **backend-canonicalized** plan, its semantic hash, execution-class
summary, and a `requirements` section. Preserve provenance metadata for audit,
but make it explicit that it has no execution effect. On import, migrate only
from known older `schemaVersion`s; reject a newer unknown version instead of
dropping stages. JSON import must run the same validation/preflight path as a
new plan and must not directly mutate the active plan until it passes.

Code export is all-or-nothing by default: it fails when any enabled stage is
`backendOnly`. The UI may offer an explicit `export portable subset` action,
but that artifact must list omitted stage IDs and carry a different hash; it
must never be presented as an export of the active plan.

### Python Polars Code

Generate readable code, not minified code.

Default shape:

```python
import polars as pl


def apply_edatime_plan(lf: pl.LazyFrame) -> pl.LazyFrame:
    # stage: Keep visible training interval
    lf = lf.filter(
        pl.col("date").cast(pl.Datetime).is_between(
            pl.datetime(2016, 7, 1, 0, 0, 0),
            pl.datetime(2016, 12, 1, 0, 0, 0),
            closed="both",
        )
    )

    # stage: Keep OT in cleaned range
    lf = lf.filter(pl.col("OT").is_between(10.0, 35.0, closed="both"))

    return lf


if __name__ == "__main__":
    lf = pl.scan_parquet("input.parquet")
    cleaned = apply_edatime_plan(lf)
    cleaned.sink_parquet("cleaned.parquet")
```

For CSV inputs, generate a comment showing how to use `pl.scan_csv`.

For helper-required stages:

- include `point_in_polygon`,
- include adaptive-line helper expression or formula,
- include spectral helper function if needed.

Generated Python includes a reproducible package requirement block and a
fixture invocation. For signal stages, pin the helper algorithm parameters
(windowing, padding, boundary policy, and NaN policy) rather than relying on
library defaults that can change results.

### Rust Polars Code

Generate a function that accepts `LazyFrame` and returns `PolarsResult<LazyFrame>` or project-local `Result<LazyFrame, AppError>`.

Default shape:

```rust
use polars::prelude::*;

pub fn apply_edatime_plan(lf: LazyFrame) -> PolarsResult<LazyFrame> {
    let lf = lf
        .filter(col("OT").cast(DataType::Float64).gt_eq(lit(10.0)))
        .filter(col("OT").cast(DataType::Float64).lt_eq(lit(35.0)));

    Ok(lf)
}
```

For helpers that are not pure expressions, generate separate functions below `apply_edatime_plan`.

Rust output must include the exact crate features/versions required by helper
stages. If a helper cannot be emitted as self-contained Rust with the selected
dependencies, mark the stage non-exportable rather than emitting pseudocode.

### Golden Tests

For a fixture plan:

- run backend compiler and collect result,
- run generated Python against same fixture if Python test infra is available,
- compile generated Rust helper if practical,
- compare schema, row order, null locations, row count, and selected values.

Use fixtures that specifically cover time units/timezones, nulls, NaN, repeated
boundaries, reversed bounds, typed category identity, polygons on boundaries,
derived-column dependencies, and a rejected irregular signal axis. Row count
alone is not sufficient parity evidence.

If Python execution is not part of normal CI, still snapshot-test generated code text and backend result.

## UX Requirements

### Common Filter Authoring Pattern

Every page action should follow the same pattern:

1. User makes a visual selection.
2. Page shows an action button near the selection or in the toolbar.
3. User chooses keep/drop/create/annotate where relevant.
4. Stage is added to the plan.
5. Plan panel highlights the new stage.
6. All pages invalidate their data and recompute on next visible render.

### Stage Editing

Stage editor should support:

- label,
- note,
- enabled toggle,
- mode keep/drop,
- numeric bounds,
- affected columns,
- output column name for transforms,
- source replacement toggle for transforms.

### Preview

After stage changes:

- debounce preview requests,
- show row counts,
- show warnings,
- do not block local UI edits while preview is in flight,
- cancel stale preview requests using request id or abort controller.

### Safety

Actions that can remove many rows or replace columns need confirmation:

- applying plan to active dataset,
- replacing source column with transformed output,
- dropping all but a small fraction of rows,
- dropping columns.

Confirmation should show expected row/column impact from preview.

## Migration Strategy

### Phase 0: Contract Freeze and Baseline

Before editing:

- inspect dirty worktree,
- keep unrelated `.claude`, `.repowise`, and generated dist changes out of this feature unless explicitly touched,
- run focused existing tests around current filters if needed.

Deliver before product code:

- versioned JSON schema and equivalent Rust/TypeScript DTO fixtures,
- semantic-hash specification plus fixed hash vectors,
- stage capability table (`polarsExpression`, `helperTransform`, `backendOnly`,
  `annotation`) and v1 supported-stage list,
- canonical null/NaN, time-bound, typed-category, and ordering semantics,
- request envelope/error schema and a decision to add POST equivalents rather
  than overload existing GET query strings,
- a compact shared fixture dataset covering datetime units, nulls, NaN,
  categories, duplicate timestamps, and known row IDs.

Do not begin page UI migration until the frontend and backend can consume the
same fixture plan and produce the same canonical hash.

### Phase 1: Portable Plan Core and Compatibility Bridge

Deliver:

- frontend `CleaningPlan` types/store,
- plan hash,
- session-scoped persistence keyed by dataset fingerprint,
- plan panel with add/remove/enable/reorder/duplicate and stale-plan state,
- frontend stage factories only for portable time/range/adaptive-line stages,
- compile the portable subset to current `start`, `end`, `filters`, and
  `line_filters`,
- migrate timeseries Y-range/adaptive-line actions so they write stages first,
  then derive `columnRanges`/`adaptiveLineFilters` as compatibility output.

Acceptance:

- a timeseries action changes the plan, range chips, existing filtered export,
  and legacy scatter request context consistently,
- no consumer writes `columnRanges` or adaptive filters as its primary action,
- unsupported enabled stages cannot enter a legacy request silently,
- the plan survives navigation/refresh for the same fingerprint and becomes
  stale, not silently reused, after a revision change.

### Phase 2: Backend Validation, Preview, and Pure-Polars Export

Deliver:

- Rust DTO/parser/canonicalizer/hash implementation,
- `/api/cleaning/validate` and `/api/cleaning/preview`,
- lazy compiler for the portable subset only,
- `/api/cleaning/export/data` and canonical plan export,
- frontend preview controller with request cancellation and snapshot matching,
- 400 validation error presentation and 409 stale-plan recovery.

Acceptance:

- preview and exported data agree on schema and row count,
- backend hash matches fixed fixtures and is returned by every new route,
- disabled/annotation stages have no data effect,
- an invalid stage reports its `stageId` and does not partially execute the
  earlier plan prefix.

### Phase 3: Core Consumer Migration

Deliver:

- POST plan-aware variants for timeseries data, scatter points/matrix/export,
  and correlation requests,
- one shared backend request-frame helper used by those routes,
- frontend request adapters that prefer plan-aware routes when the plan is
  non-empty and retain legacy paths only for empty/portable compatibility,
- cache keys and stale-response guards based on backend plan hash,
- removal of scatter plot/matrix snapshots as authoritative cleaning state.

Acceptance:

- timeseries, scatter plot, scatter matrix, correlation matrix, and Parquet
  export show the same cleaned rows for a fixture plan,
- a filter on a third column changes a scatter pair/matrix cell even when that
  column is not displayed,
- zoom/view state does not change the plan or cache identity,
- no filtered request can receive an unfiltered revision-only correlation cache.

### Phase 4: Authoring From Every Plot Without Helper Barriers

Deliver:

- scatter rectangular and typed-category stages (full-data geometric semantics),
- correlation and causal column keep/drop plus annotations,
- Drift absolute keep/drop windows and segment category filters,
- plan-aware causal and Drift POST requests using the same compiler before
  their page-specific time/analysis parameters,
- clear distinction in every page UI between an analysis parameter, visual
  zoom, annotation, and an executable stage.

Acceptance:

- Timeseries, Scatter, Correlation, Causal, and Drift each have at least one
  supported stage authoring action; FFT and Spectrogram receive executable
  signal-stage actions in Phase 5,
- causal/Drift/correlation consume the identical plan hash returned by preview,
- correlation/causal graph layout and analysis controls do not modify the plan.

### Phase 5: Explicit Helper Transforms

Deliver in this order, each behind an execution-capability flag until parity
fixtures pass:

1. Polygon/lasso mask barrier and its Python/Rust helper exports.
2. Spectral-filter transform barrier, including sampling preflight and exact
   helper package/version requirements.
3. Spectrogram artifact reconstruction only after its algorithm, boundary
   policy, and parity fixtures are specified.
4. Typed outlier rules only after their statistic/window/null behavior is
   specified; do not use the existing destructive endpoint as a hidden backend
   implementation of a reversible stage.

Acceptance:

- each barrier is visible in preview and the plan panel,
- each helper stage either exports working Python/Rust code or is explicitly
  marked non-exportable,
- irregular/unsupported signal data fails preflight without altering the plan.

### Phase 6: Code Generation and Import

Deliver:

- Python Polars codegen,
- Rust Polars codegen,
- generated helper dependencies where required,
- canonical JSON import/export with migration checks,
- golden/parity fixtures,
- export UI.

Acceptance:

- JSON/Python/Rust exports represent the same canonical enabled-stage set,
- backend result and generated code semantics match for every exportable stage,
- subset exports are visibly different artifacts with omitted stages listed,
- importing an exported plan reproduces the canonical hash on the same source.

### Phase 7: Apply/Materialize and Provenance

Deliver:

- `/api/cleaning/apply`,
- confirmation UI populated by a fresh preview for the exact server hash,
- atomic dataset revision bump/swap only after successful execution and output
  validation,
- completed plan persisted as parent-to-child provenance and a new empty active
  child plan.

Acceptance:

- failure leaves the source dataset, current revision, and active plan intact,
- applying plan updates metadata and all pages only after the atomic swap,
- stale plans are detected after revision change and cannot be re-applied.

## Testing Matrix

### Frontend Unit Tests

Add tests for:

- `cleaning/store.ts`
- `cleaning/compiler.ts`
- `cleaning/planHash.ts`
- schema-version migration, canonicalization, and fixed cross-language hash vectors,
- stage dependency validation (derive/drop/reorder), stale-plan handling, and
  session-storage restore only for matching fingerprints,
- response race handling: an old plan/revision response cannot render after a
  newer mutation,
- `cleaning/stageLabels.ts`
- plan panel rendering/editing
- timeseries stage authoring
- scatter box/lasso stage authoring
- FFT/spectrogram transform stage creation
- Drift window stage creation
- all API services appending plan context correctly.

Existing tests to update:

- `frontend/src/features/timeseries/actions.filters.test.ts`
- `frontend/src/ui/yRangeControls.test.ts`
- `frontend/src/scatter/state.test.ts`
- `frontend/src/scatter/scatterPage.test.ts`
- `frontend/src/scatter/matrix.test.ts`
- `frontend/src/pages/fftPage.test.ts`
- `frontend/src/pages/spectrogramPage.test.ts`
- `frontend/src/causal/causalPage.test.ts`
- `frontend/src/drift/driftPayload.test.ts`
- `frontend/src/features/export/entrypoint.test.ts`

### Backend Unit and Route Tests

Add tests for:

- DTO parsing and validation,
- plan envelope revision/fingerprint rejection (`409 stale_plan`), canonical
  hash equality, request limits, and typed-category validation,
- each stage compiler,
- null/NaN and inclusive-bound semantics for keep and drop modes,
- stage order/schema dependency failures and no-partial-execution guarantee,
- preview row counts,
- export data route,
- Python codegen snapshots,
- Rust codegen snapshots,
- analysis routes with plan context,
- cache key separation by plan hash.

Add integration fixtures that send the same plan to data, scatter points,
scatter matrix, correlations, FFT, spectrogram, causal, Drift, and export.
For portable stages, compare their cleaned input frame before each endpoint's
page-specific projection. This catches the common failure where an endpoint
parses a plan but applies only its time range or only visible columns.

For helper stages, use differential tests against generated Python/Rust code.
For geometry, test edge vertices and sampled-view versus full-frame behavior.
For signal stages, test preflight rejection for irregular/duplicate timestamps
and a small deterministic regular fixture with fixed algorithm parameters.

Existing test areas to update:

- `crates/edatime-query/src/filters.rs`
- `crates/edatime-service/src/handlers/routes/export.rs`
- `crates/edatime-service/src/handlers/routes/analytics.rs`
- `crates/edatime-service/src/handlers/routes/drift.rs`
- `crates/edatime-service/src/handlers/scatter/points.rs`
- `crates/edatime-service/src/handlers/scatter/matrix.rs`
- `crates/edatime-service/src/handlers/scatter/correlations.rs`

### Verification Commands

Use focused tests first:

```bash
npm test -- frontend/src/cleaning
npm test -- frontend/src/features/timeseries/actions.filters.test.ts frontend/src/scatter/state.test.ts frontend/src/scatter/matrix.test.ts
npm test -- frontend/src/pages/fftPage.test.ts frontend/src/pages/spectrogramPage.test.ts frontend/src/drift/driftPayload.test.ts
cargo test -q -p edatime-query filters
cargo test -q -p edatime-service cleaning
cargo test -q -p edatime-service handlers::routes::analytics
cargo test -q -p edatime-service handlers::routes::drift
cargo test -q -p edatime-service handlers::scatter
```

Then run gates:

```bash
npm run check:frontend
npm run check:frontend:arch
npm run check:frontend:budgets
node scripts/build-frontend.mjs
git diff --check
```

If route contracts changed broadly, also run relevant Cargo package tests.

## Non-Goals for First Implementation

- Do not build a full visual node graph editor.
- Do not make every display-only chart setting into a preprocessing stage.
- Do not mutate the source dataset on every stage addition.
- Do not make codegen perfect for every advanced transform before row filters and column filters work.
- Do not replace all existing endpoints in one pass if compatibility wrappers can keep the rollout safer.

## Implementation Warnings

- Do not trust scatter plot/matrix filter snapshots as canonical state. They currently exist to preserve view-local filters, but this feature needs one shared plan.
- Do not put large plan JSON into GET query strings long term.
- Do not let frontend UI-only fields leak into backend `line_filters`.
- Do not let filtered correlation requests reuse unfiltered revision-only cache.
- Do not treat visual normalization/clipping as data cleaning unless the user explicitly creates a transform stage.
- Do not hide irreversible actions behind page-local controls. Applying the plan must be explicit and confirmed.

## Definition of Done

The feature is done when:

1. A user can add at least one cleaning stage from every plot.
2. The plan panel shows all stages and lets the user edit/disable/reorder/remove them.
3. Every plot recomputes from the active plan.
4. Preview row counts and warnings update after plan edits.
5. Exported Parquet/CSV data is generated from the backend compiler.
6. Exported JSON/Python/Rust artifacts represent the same plan.
7. Applying the plan materializes a new active dataset revision only after explicit confirmation.
8. Focused frontend/backend tests and the standard frontend gates pass.
