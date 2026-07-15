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

## Implementation Review Status (2026-07-15)

The repository contains a working first vertical slice, but it does **not** yet
implement the full feature described below. Treat the remaining sections as the
target contract and phased backlog, not as a claim that every stage and page is
complete.

| Area | Current status | Evidence / remaining gap |
| --- | --- | --- |
| Portable plan core | Implemented for `timeRange`, `columnRange`, `adaptiveLine`, and `annotation` | Shared TypeScript store/compiler and Rust DTO/compiler exist; advanced row, column, transform, drift, and frequency stages remain |
| Reversible baseline | Implemented in memory | Immutable root/child snapshots, explicit materialize/apply, version listing, and version selection exist; persistence and spill/out-of-core version storage remain |
| Validation and preview | Implemented for the portable v1 stages | Backend validates source identity and compiles from the retained source snapshot |
| Dataset and plan export | Partial | Full plan-aware Parquet and canonical JSON export exist; CSV, ZIP reproducibility bundle, checksums, source inclusion, and plan import remain |
| Code generation | Partial | Frontend Python/Rust generators cover portable filters; Rust adaptive-line generation and backend-canonical bundle generation remain |
| Plan consumption | Broad first slice | Timeseries, scatter points/matrix/export/correlations, FFT, spectrogram, causal, rolling, anomalies, spectral filtering, and drift accept the active plan |
| Plan authoring | Timeseries only | Timeseries range/adaptive gestures author stages; scatter, correlation, FFT, spectrogram, causal, and drift authoring actions remain |
| Shared plan UI | Implemented first slice | The plan panel supports accumulated stages and version actions; richer per-stage editors, capability reporting, and large-plan ergonomics remain |
| Large-data execution | Not complete | Current snapshots and most results are memory-resident; bounded streaming ingest, spill-to-disk execution, durable artifacts, and resource budgets remain separate scale work |

### Corrections Made During This Review

- `/api/v1/data` now has a plan-aware POST contract. The backend executes the
  plan before viewport filtering and LTTB reduction, so the browser no longer
  filters an already-downsampled result.
- Rolling bands, anomaly detection, and spectral filtering now receive and
  execute the active plan.
- Scatter correlations and correlation matrices now execute the active plan.
  Plan-specific matrices bypass the active-dataset correlation cache so a
  filtered result cannot be served later as an unfiltered result.
- Backend semantic hashing now uses executable canonical stage content and
  ignores labels, notes, timestamps, plan revision, and annotations. Range
  endpoints and signed zero are normalized before hashing.
- Selecting an immutable dataset version no longer rewrites that version's
  revision. Metadata exposes `source_version_revision` separately from the
  active session revision so a plan remains anchored to its true baseline.
- Plan-aware timeseries results include source-version, dataset-revision, and
  backend plan-hash headers, and their cache key includes all three identities.

### Highest-Priority Remaining Query-Plan Work

1. Add plan authoring and compiler support one stage family at a time, starting
   with column keep/drop and scatter polygon/category stages. Migrate every
   consumer for a family before enabling its authoring UI.
2. Replace plan-bearing GET query strings with typed POST envelopes. A useful
   accumulated plan can exceed browser, proxy, or server URL limits.
3. Standardize result identity on every plan-aware response and client cache:
   source version, immutable source revision, backend plan hash, and output
   schema/projection identity.
4. Strengthen exported artifact identity and reproducibility: content-derived
   dataset fingerprints, checksums, import validation, canonical backend code
   generation, and a ZIP bundle.
5. Move immutable versions and large exports to bounded, spillable storage.
   The current in-memory registry is correct for reversibility but is not a
   solution for datasets near or above available RAM.

The `Current Code Grounding` section records the original implementation seams;
where it says "currently," use the review table above and live code as the
authoritative present state.

## Review Decisions: Baseline, Accumulation, and Export

This section resolves the central product contract before implementation. It is
normative for the rest of this document.

### Immutable Baseline and Derived Working Dataset

When a file is uploaded or a database table is loaded, EdaTime creates an
immutable **source dataset version**. The active plan is always evaluated from
that version (or from an explicitly selected materialized child version), never
from whatever rows a chart most recently fetched. This gives the user a stable
reference/original dataset while they experiment.

The UI must make the three identities visible:

| Identity | Meaning | May change as stages are edited? |
| --- | --- | --- |
| Source dataset version | Immutable baseline, its schema, fingerprint, and full rows | No |
| Active plan | Ordered, reversible transformations authored from any page | Yes |
| Working dataset | `execute(source dataset version, active plan)` used by every plot/export | Yes, by recomputation only |

"Original" means the initial uploaded/loaded source version, not the last
materialized result. `Apply plan` creates a new child dataset version with
provenance pointing at its parent; it never overwrites the original. The user
can switch back to the root source or choose a child as a new baseline. This is
an explicit version-selection action, not a side effect of navigation or
export.

### Accumulation Invariant

Every explicit `Add … to plan` action appends one enabled stage to the end of
the active plan. It does not replace stages made from another plot, reset the
plan to a page-local filter snapshot, or mutate the source dataset. Therefore,
for source `S` and enabled stages `[s1, s2, …, sn]`, every consumer sees:

```text
workingDataset = sn(...s2(s1(S))...)
```

Edits change only the chosen stage; disable/remove/reorder recomputes from `S`.
The only permitted replacement behavior is an explicit "edit selected stage"
or "replace this stage" command that names its target stage ID. Adding the
same-looking range twice creates two audit-visible stages rather than silently
merging them. The compiler may optimize equivalent lazy predicates internally,
but the saved stage order and exported plan must remain unchanged.

### Export Contract

Offer three unambiguous exports, all generated from the backend-canonicalized
plan and the selected baseline:

1. **Transformed dataset** — CSV or Parquet containing the full working dataset,
   not merely the selected chart columns or viewport.
2. **Query plan** — canonical JSON plus a manifest with source version ID,
   source fingerprint, schema fingerprint, plan hash, stage capabilities, and
   export timestamp. This is the complete accumulated query.
3. **Reproducibility bundle** — a ZIP containing (1), (2), generated Python
   and Rust code when all enabled stages are exportable, and checksums. An
   opt-in `include source data` option adds a Parquet copy of the immutable
   baseline when it is within export limits. It is off by default because the
   source may be large or sensitive.

The data export and manifest must carry the same `sourceVersionId`,
`datasetRevision`, and backend `planHash`. The server rejects an export if any
of those identities no longer resolves to the requested immutable baseline;
it must never export an accidental mixture of a new upload and an old plan.

## Current Code Grounding

Use these existing seams as the implementation base:

- Frontend filter state currently lives in `frontend/src/store/uiState.ts` as `columnRanges` and `adaptiveLineFilters`.
- Backward-compatible app state access is in `frontend/src/store/index.ts` and `frontend/src/store/appStateCompat.ts`.
- Timeseries filter helpers live in `frontend/src/services/timeseries/filtering.ts`.
- Timeseries clear/reset action wiring lives in `frontend/src/features/timeseries/actions.ts`.
- Scatter query context is currently built in `frontend/src/features/scatter/state.ts` via `buildScatterQueryContext`.
- Scatter still has plot/matrix filter snapshots in `frontend/src/store/scatterState.ts`; those should stop being the authoritative filter model.
- Scatter points/matrix/export serialize `filters` and `line_filters` in `frontend/src/services/api/scatter.ts` and `frontend/src/features/scatter/export.ts`.
- Timeseries filtered export already sends `filters` and `line_filters` to `GET /api/v1/export/parquet` from `frontend/src/features/export/feature.ts`.
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
  - `/api/v1/transform`
  - `/api/v1/analytics/remove_outliers`
  They should remain compatible, but the new plan workflow should be reversible by default.
- `edatime_store::AppState` currently owns one replaceable `DataRepository`
  snapshot and a revision-only correlation cache. It does **not** retain a root
  dataset after `replace_dataset`; a source/version registry is therefore a
  prerequisite for the original-dataset guarantee, not an implementation
  detail that can be deferred to the Apply button.

## Product Semantics

### Reversible by Default

Every plot-authored cleaning action creates or updates a plan stage. It must not rewrite the active dataset unless the user chooses an explicit `Apply plan to dataset` action.

### One Active Plan

There is one active plan for the selected baseline dataset version. All plots
read from its derived working dataset. Page-local display zoom, chart pan,
hover state, sort order, and selected render mode are not plan state unless the
user explicitly clicks an action such as `Add visible range to plan`.

### Source Dataset Remains Addressable

The app must distinguish:

- source dataset version: original uploaded/loaded data, retained immutably,
- active plan: reversible preprocessing stages anchored to one source version,
- working dataset: on-demand execution of that source plus plan,
- materialized dataset version: an optional immutable child created only by
  explicit Apply, with parent/source/plan provenance.

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
  /** Immutable baseline selected for this plan; never infer it from a filename. */
  sourceVersionId: string;
  /** Backend revision of the selected source version. */
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
the schema version, `sourceVersionId`, source dataset fingerprint/revision,
time-column identity, and normalized enabled-stage parameters. Canonicalization
must normalize numeric `-0` to `0`, sort only order-insensitive lists such as
category values, normalize reversed bounds, and preserve stage order and polygon
vertex order. Do not use a plain `JSON.stringify` result as a cache key.

`sourceVersionId` is executable identity. `datasetRevision` is a stale-client
guard, not a substitute for that ID. Apply produces a child source version that
can become the baseline of a new empty plan; the completed plan remains
immutable provenance for that child and still identifies its original baseline.

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

Compilation always starts with a newly acquired snapshot of the plan's
`sourceVersionId`; it never starts with a cached chart response, a previous
preview frame, or a materialized child unless that child was explicitly selected
as the new baseline. This makes a Scatter stage accumulate with an earlier
Timeseries stage while preserving reversibility.

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

Current `/api/v1/analytics/spectral-filter` returns a preview series. For this
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

Add a source/version selector to the workspace contract rather than treating
`WorkspaceSnapshot.dataset.revision` as the only identity:

```ts
dataset: {
  metadata: DatasetMetadata | null;
  revision: number;
  activeSourceVersionId: string | null;
  rootSourceVersionId: string | null;
  sourceFingerprint: string | null;
  parentSourceVersionId: string | null;
}
```

On upload/load, the server creates a new root source version, selects it, and
creates an empty plan anchored to it. On `Apply plan`, it creates a child source
version atomically and selects it only after the new data and provenance record
are durable. It does not call the existing destructive `replace_dataset` path
in a way that discards the root. The UI then starts a new empty plan for the
child and keeps the completed parent plan read-only in its lineage record.

On any source-version selection or revision change:

- archive the in-progress plan under its exact source version and fingerprint;
- restore only a plan whose `sourceVersionId`, schema fingerprint, and referenced
  columns/dtypes all validate; otherwise mark it stale and require explicit
  user choice to discard, export, or rebase it;
- clear compatibility `columnRanges`, `adaptiveLineFilters`, and scatter view
  snapshots, then derive them again from the selected plan only where legacy
  consumers still require them;
- abort in-flight page/preview/export requests and dispatch
  `edatime:cleaning-plan-change` with source version and hash metadata.

`Reset to original dataset` selects the root source version and an empty plan;
it is not a destructive reset. `Choose this derived dataset as baseline` selects
that child and likewise starts a new plan. Imported plans are eligible only when
their explicit source identity (or an explicit user-approved rebase) and schema
validate. A matching filename is never sufficient.

This should hook in `frontend/src/features/timeseries/datasetBootstrap.ts`, the
workspace store, and all existing state-reset paths. Persist active drafts in
`sessionStorage` under `sourceVersionId + sourceFingerprint`, not a filename or
revision alone. Local persistent history can be considered later; it is not
required for v1.

## Page Integration Details

### Timeseries

Current relevant files:

- `frontend/src/features/timeseries/module.ts`
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

- `frontend/src/features/scatter/state.ts`
- `frontend/src/features/scatter/page.ts`
- `frontend/src/features/scatter/rendering.ts`
- `frontend/src/features/scatter/matrix.ts`
- `frontend/src/features/scatter/controls.ts`
- `frontend/src/features/scatter/export.ts`
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

- `frontend/src/features/heatmap/page.ts`
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

- Extend `/api/v1/scatter/correlations` and `/api/v1/scatter/correlations/matrix` to accept plan context.
- Cache key must include dataset revision plus plan hash plus selected mode.

### FFT

Current relevant files:

- `frontend/src/features/fft/page.ts`
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

- Existing `/api/v1/analytics/fft` should accept active plan context.
- Add compiler support for frequency transform stages.
- If full lazy Polars expression is not practical for the filter operation, generated code may include helper functions operating on collected arrays, but the surrounding plan must remain reproducible.
- FFT settings such as axis scale, averaging, window display, and selected
  frequency cursor are analysis/view state. Only an explicit create/replace
  signal action creates a plan stage.

### Spectrogram

Current relevant files:

- `frontend/src/features/spectrogram/runtime.ts`
- `frontend/src/features/spectrogram/page.ts`
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

- `/api/v1/analytics/spectrogram` accepts active plan context.
- `spectrogramArtifact` row-window drop compiles to normal time filters.
- Time-frequency transform/masking should compile through helper code and be represented explicitly in exported code.
- A spectrogram rectangle is not automatically a row filter: it spans time and
  frequency while source rows have no frequency dimension. v1 may author only
  whole-time-window row drops and annotations. Frequency-band masking requires
  the helper-transform capability and must specify its reconstruction method;
  otherwise keep it out of the active data plan.

### Causal

Current relevant files:

- `frontend/src/features/causal/page.ts`
- `frontend/src/features/causal/workflow.ts`
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

- `/api/v1/analytics/causal` accepts active plan context before `CausalDataFrame::from_polars`.
- Work-unit estimation should use post-plan row count if available, or max-points fallback if not.

### Drift

Current relevant files:

- `frontend/src/features/drift/page.ts`
- `frontend/src/features/drift/controls.ts`
- `frontend/src/features/drift/viewModels.ts`
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

- `/api/v1/drift/stats` and `/api/v1/drift/investigate` accept active plan context.
- Apply plan before Drift splits into reference/comparison windows.

## Backend Architecture

### Source-Version Registry and Snapshot Resolution

The current `AppState` exposes only `dataset_snapshot()` and
`replace_dataset()`. Replace that single mutable-dataset assumption for this
feature with a small source-version registry owned by `edatime-store`:

```rust
pub struct DatasetVersionRecord {
    pub id: DatasetVersionId,
    pub root_id: DatasetVersionId,
    pub parent_id: Option<DatasetVersionId>,
    pub revision: u64,
    pub fingerprint: String,
    pub schema_fingerprint: String,
    pub source_name: Option<String>,
    pub materialized_from_plan_hash: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub trait DatasetVersionStore {
    fn snapshot(&self, id: &DatasetVersionId) -> Result<LazyFrame, AppError>;
    fn metadata(&self, id: &DatasetVersionId) -> Result<DatasetVersionRecord, AppError>;
    fn create_root(&self, df: DataFrame, source_name: Option<String>) -> Result<DatasetVersionRecord, AppError>;
    fn create_child(&self, parent: &DatasetVersionId, df: DataFrame, plan: PlanProvenance)
        -> Result<DatasetVersionRecord, AppError>;
}
```

`AppState::dataset_snapshot()` remains a compatibility facade for the selected
version while old routes are migrated. New plan-aware code must resolve the
envelope's `sourceVersionId` through this registry, then compare its revision,
fingerprint, schema fingerprint, and time column before compilation. Store root
and child frames in a server-side version store with an explicit retention
policy, not only in browser state. For v1, retain every admitted version for the
active server session and reject a new materialization before it would exceed
the configured version/byte limit; do not evict an original silently. If a
server restart cannot retain a source artifact, plan import/export must report
it as unavailable rather than claim reproducibility.

Creating a child is a transaction: execute the full validated plan from the
requested parent snapshot, validate the output, write its frame and provenance,
select it, then invalidate caches. Any failure leaves parent, selected version,
and active plan unchanged. Cache keys include `sourceVersionId`, revision, and
plan hash; a child baseline with an empty plan must never share a cache entry
with its parent plus a non-empty plan.

### Routes

Add a new cleaning route module and mount it in `api_router`.

New routes:

```text
POST /api/v1/cleaning/validate
POST /api/v1/cleaning/preview
POST /api/v1/cleaning/export/data
POST /api/v1/cleaning/export/plan
POST /api/v1/cleaning/export/bundle
POST /api/v1/cleaning/export/code
POST /api/v1/cleaning/apply
GET  /api/v1/datasets/versions
POST /api/v1/datasets/versions/select
```

`/validate` performs schema/revision/dependency/capability checks without
collecting data and returns the backend canonical plan plus server hash.
`/preview` is the only route that computes counts. `/export/plan` may be a
client-side download after `/validate`, but retaining it as a server route is
useful when the server needs to return a canonicalized artifact.

All plan-aware operations take the same envelope. Do not create one-off `plan` fields with
different stale-plan behavior in each analysis request:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanRequestEnvelope {
    pub plan: CleaningPlanDto,
    pub expected_plan_hash: Option<String>,
    pub expected_source_version_id: DatasetVersionId,
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
    pub source_version_id: DatasetVersionId,
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

- Resolve `plan.sourceVersionId` first; require it to equal
  `expectedSourceVersionId`, then validate that version's revision, dataset
  fingerprint, schema fingerprint, and time-column identity before stage
  validation.
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
- A plan-aware endpoint either executes every enabled stage or fails with a
  capability/validation error. It must not render a partly transformed result
  because a page does not yet understand one stage kind.

Preview defaults to a single overall before/after count plus output schema. Per
stage row impacts are optional and explicitly requested because calculating
them requires checkpoint execution and can multiply work. The response should
mark approximations or skipped per-stage counts rather than inventing them.

### Integration with Existing Endpoints

Every endpoint that currently takes time/filter parameters should be upgraded in one of two ways:

1. Preferred: accept `PlanRequestEnvelope` in a POST body.
2. Compatibility: accept `filters`, `line_filters`, `start`, `end`, and compile those into a temporary plan.

Upgrade these:

- `/api/v1/data`
- `/api/v1/export/parquet`
- `/api/v1/scatter/points`
- `/api/v1/scatter/matrix`
- `/api/v1/scatter/export/parquet`
- `/api/v1/scatter/correlations`
- `/api/v1/scatter/correlations/matrix`
- `/api/v1/analytics/fft`
- `/api/v1/analytics/spectrogram`
- `/api/v1/analytics/spectral-filter`
- `/api/v1/analytics/causal`
- `/api/v1/drift/stats`
- `/api/v1/drift/investigate`

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

### Dataset and Bundle Export

`POST /api/v1/cleaning/export/data` takes the same plan envelope and an
explicit `DataExportOptions` body. Its default is intentionally different from
the existing chart-export controls:

```ts
interface DataExportOptions {
  format: 'parquet' | 'csv';
  /** Omit to export every output column from the complete working dataset. */
  outputColumns?: string[];
  /** A projection is allowed only when the user explicitly chose it. */
  projectionLabel?: string;
}

interface BundleExportOptions extends DataExportOptions {
  includeSourceData: boolean;
  includePython: boolean;
  includeRust: boolean;
}
```

The server executes the *complete* validated plan before applying an optional
output projection. It must preserve the requested output row order and never
implicitly add the visible chart range, selected series, Scatter axes, or a
downsampling limit. Response headers and the embedded Parquet/CSV metadata must
include `sourceVersionId`, `datasetRevision`, `sourceFingerprint`,
`schemaFingerprint`, and `planHash`.

`POST /api/v1/cleaning/export/bundle` streams a ZIP with this stable layout:

```text
edatime-export/
  manifest.json                 # hashes, identities, format, checksums
  plan.canonical.json           # exact backend-canonical accumulated plan
  transformed-data.parquet      # or transformed-data.csv
  apply_plan.py                 # only if requested and exportable
  apply_plan.rs                 # only if requested and exportable
  source-data.parquet           # only with explicit includeSourceData
```

`manifest.json` records whether code or source data was omitted and why. It
also records an output-data checksum calculated while streaming so an imported
bundle can verify that its payload matches the plan export. If source inclusion
exceeds configured row/byte limits, reject the request with a specific limit
error; do not silently produce a bundle that appears self-contained. A bundle
without `source-data.parquet` is still a query/data export, but is not called a
standalone replay bundle in the UI.

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
- source-version identity, retention, parent/child provenance, and selection
  contract; include the decision that root source frames are retained before
  any Apply/materialization capability is exposed,
- bundle manifest/checksum schema and the distinction between transformed-data
  export, query-plan export, and opt-in self-contained replay bundle,
- a compact shared fixture dataset covering datetime units, nulls, NaN,
  categories, duplicate timestamps, and known row IDs.

Do not begin page UI migration until the frontend and backend can consume the
same fixture plan and produce the same canonical hash.

### Phase 1: Portable Plan Core and Compatibility Bridge

Deliver:

- frontend `CleaningPlan` types/store,
- plan hash,
- source-version fields in the workspace snapshot plus a read-only lineage
  selector/root-reset affordance,
- session-scoped persistence keyed by source version and fingerprint,
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
  stale, not silently reused, after a source-version or revision change,
- adding stages from different authoring surfaces is append-only and a plan
  edit/reorder always rebuilds compatibility state from the anchored baseline.

### Phase 2: Backend Validation, Preview, and Pure-Polars Export

Deliver:

- Rust DTO/parser/canonicalizer/hash implementation,
- server-side source-version registry, root source retention, and snapshot
  lookup tests before plan execution is enabled,
- `/api/v1/cleaning/validate` and `/api/v1/cleaning/preview`,
- lazy compiler for the portable subset only,
- `/api/v1/cleaning/export/data`, canonical plan export, and a manifest-only
  bundle path; full source-including ZIP can follow once streaming limits are
  verified,
- frontend preview controller with request cancellation and snapshot matching,
- 400 validation error presentation and 409 stale-plan recovery.

Acceptance:

- preview and exported data agree on schema and row count,
- an export contains all working rows/columns unless an explicit projection was
  requested, and its manifest hash/identity exactly match the canonical plan,
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

- `/api/v1/cleaning/apply`,
- confirmation UI populated by a fresh preview for the exact server hash,
- atomic child-version creation/selection only after successful execution and
  output validation; the root and parent snapshots remain retrievable,
- completed plan persisted as parent-to-child provenance and a new empty active
  child plan.

Acceptance:

- failure leaves source/parent datasets, selected version, and active plan intact,
- applying plan updates metadata and all pages only after atomic child creation,
- the user can switch back to the original root version after applying,
- stale plans are detected after version change and cannot be re-applied.

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
- accumulation: stages authored by Timeseries, Scatter, and Drift execute in
  append order against one baseline; edit/remove/reorder recomputes from that
  baseline rather than from an already filtered response,
- source-version selection/reset, session restore keyed by source version, and
  correct handling of an unavailable retained source,
- data-export options: default full working-frame export, explicit projection,
  manifest identity/checksum display, and source-data opt-in warning,
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
- `frontend/src/features/scatter/state.test.ts`
- `frontend/src/features/scatter/page.test.ts`
- `frontend/src/features/scatter/matrix.test.ts`
- `frontend/src/features/fft/page.test.ts`
- `frontend/src/features/spectrogram/page.test.ts`
- `frontend/src/features/causal/page.test.ts`
- `frontend/src/features/drift/driftPayload.test.ts`
- `frontend/src/features/export/feature.test.ts`

### Backend Unit and Route Tests

Add tests for:

- DTO parsing and validation,
- root/child source-version creation, retrieval, selection, retention failure,
  and parent-plan provenance,
- plan envelope revision/fingerprint rejection (`409 stale_plan`), canonical
  hash equality, request limits, and typed-category validation,
- each stage compiler,
- null/NaN and inclusive-bound semantics for keep and drop modes,
- stage order/schema dependency failures and no-partial-execution guarantee,
- preview row counts,
- export data route,
- data/plan/bundle manifest identity and checksum agreement, source-data
  inclusion limits, and full-frame-versus-explicit-projection behavior,
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
npm test -- frontend/src/features/timeseries/actions.filters.test.ts frontend/src/features/scatter/state.test.ts frontend/src/features/scatter/matrix.test.ts
npm test -- frontend/src/features/fft/page.test.ts frontend/src/features/spectrogram/page.test.ts frontend/src/features/drift/driftPayload.test.ts
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
6. Dataset export defaults to the complete working dataset; a projection or
   source-data inclusion is always explicit and described in its manifest.
7. Exported JSON/Python/Rust artifacts represent the same accumulated plan and
   source-version identity as the data artifact.
8. Applying the plan creates an immutable child dataset version only after
   explicit confirmation, while the original root remains selectable.
9. Focused frontend/backend tests and the standard frontend gates pass.
