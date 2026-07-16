# EdaTime Application Review and Improvement Plan

**Status:** implementation roadmap; Milestone A is complete and Milestones B/C/D/E have active, committed slices

**Reviewed:** 2026-07-15

**Scope:** frontend, Rust backend, ingestion, query execution, preprocessing, analytics, export, and the data-scientist workflow

## Implementation Progress

- **Milestone A complete:** an editable Pipeline Workbench now derives a safe
  graph from the canonical cleaning plan, exposes all v1 stage editors and
  reordering, and exports backend-plan JSON, graph JSON/SVG, and starter
  Python/Rust code. (`ba9a639`, `65e1f67`)
- **Milestone F started:** a lazy, hash-routable **Prepare** destination now
  presents the canonical source → stages → result graph and live source
  identity. It provides page-native ordered-stage enable/disable, reordering,
  removal, undo/redo, missing-value/duplicate-resolution/column-selection,
  stable-sort, bounded ordered-null-fill, and explicit fixed-duration
  resampling authoring, then hands off to
  the shared Pipeline Workbench for detailed field editing, previewing, exporting, and
  materialization while the quality workflow remains in progress.
- **Milestone B in progress:** data, scatter points/matrix, correlations, and
  correlation matrix, Drift, and export artifacts now carry immutable source
  version/revision, schema fingerprint, backend plan hash, and versioned
  sampling metadata where applicable. Analytics GET routes now carry the same
  identity; chart/scatter/correlation clients retain it with decoded results.
  Causal now carries the same identity; materialization and broader client
  parity remain. (`e543078`,
  `0aaab7f`, `2431453`, `f437017`, `3ad00ff`, `2541478`, `961caa4`,
  `65a8feb`, `e81b529`, `c770b26`, `bd1d131`, `7e51990`, `073c5bb`)
- **Milestone C started:** retained versions use an Arrow-content-derived
  fingerprint, with a same-shape/different-content regression and a documented
  content-identity contract. Streaming hashing and retained-version
  cache-isolation tests remain open. (`72e187e`, `75f4633`)
- **Milestone D started:** the store has an atomically published artifact
  catalog with persistence regression coverage, and the version registry can
  resolve retained Parquet descriptors as fresh lazy scans. With the opt-in
  `data.artifact_dir`/`EDATIME_ARTIFACT_DIR` setting, dataset replacements and
  explicit plan materializations publish those descriptors as managed Parquet
  artifacts. Catalog entries now carry the immutable root/parent/revision/
  schema/plan provenance required to restore an ordered Parquet version graph,
  and the registry validates that graph on recovery. Application startup
  attaches the newest valid restored version to the active repository as a
  lazy scan with persisted metadata, without collecting its rows. Configured
  plan materializations now execute the canonical `LazyFrame` through Polars'
  streaming Parquet sink, promote a complete temporary artifact atomically,
  and attach a fresh scan without collecting the result dataset. Failed sinks,
  quota rejection, and interrupted startup files are cleaned without touching
  another live sink. The artifact fingerprint uses a bounded 64 KiB file pass;
  hashing during the original stream remains open. Canonical plan, legacy
  filtered-timeseries, and scatter Parquet exports now use the same bounded
  file response: the lazy plan sinks before headers are returned, response
  chunks do not scale with total output size, and the temporary file is removed
  after EOF or response drop. With managed storage, CSV/Parquet uploads now
  keep their validated lazy plan through a streaming Parquet sink, activate a
  fresh scan-backed root, and skip the unbounded eager correlation warmup.
  Managed retention is now configurable with a lineage-safe version cap: it
  retains the active ancestry and newer independent chains that fit, never
  corrupting restart recovery. To avoid an unmeasured large-sort promise,
  managed ingestion now verifies non-decreasing timestamps with a scalar
  streaming check by default; an operator must explicitly opt into Polars'
  streaming sort. Streaming source hashing, a measured large-sort memory gate,
  and cancellable/progress-reporting jobs remain open. The Pipeline
  Workbench Export tab now reports retained artifact count and managed disk
  usage/quota on demand. An operator may set a managed-artifact aggregate disk cap;
  a candidate Parquet file is rejected and cleaned up before publication when
  it would exceed that cap. (`f2ed211`,
  `9887e4f`, `6ab6f44`, `7413758`, `7847b46`, `5bfdc39`, `d2dca71`,
  `7c31697`, `84fd48f`, `5d6e19f`, `f5b9e66`, `349c56f`, `19836bf`,
  `8f5ba28`, `06babb4`, `748dce3`, `7e73748`, `f965d93`)
- **Milestone E started:** executor-owned interactive LazyFrame collection
  and sink-backed materialization/export now use separately configurable,
  bounded admission lanes. Their queue wait and lifecycle are observable under
  the `query` and `materialization` CPU stages, and a permit remains owned by
  the blocking task when a request future is dropped. This prevents a long
  durable sink from consuming viewport-query slots, but it is intentionally an
  executor foundation only: scatter/correlation/analytics handlers, resource
  estimates/deadlines, cancellation of Polars itself, and the observable job
  API remain open. `AppState` now also owns an in-process session job registry
  with queued/running/cancelling/cancelled/completed/failed/expired states,
  progress/messages, and cooperative cancellation handles. It is intentionally
  not presented as a durable queue or public API until real workloads attach
  to it. Managed plan materialization is now its first real workload: the
  synchronous apply response returns `jobId`, materialization updates the
  record at its owned publish boundary, failures are retained, and read-only
  session inspection is available at `GET /api/v1/jobs` and
  `GET /api/v1/jobs/{id}`. `DELETE /api/v1/jobs/{id}` now signals a live
  materialization job; Polars collection itself remains non-preemptive, but
  cancellation is checked at every owned publish boundary and removes an
  unpublished temporary artifact. The Pipeline Workbench Export tab now
  shows the returned materialization job ID and can refresh the five most
  recent materialization states without adding a second workflow surface.
  (`a338f28`, `1a3f266`, `b4b6fe3`, `3c4d506`, `6412a2d`, `8ef652c`)

## 1. Goal

EdaTime should let a data scientist move safely from raw time-series data to an analysis- and modeling-ready dataset:

1. Load or connect to data without first copying the entire dataset into browser memory.
2. Understand schema, quality, temporal coverage, missingness, gaps, duplicates, irregular sampling, distributions, relationships, seasonality, anomalies, and drift.
3. Turn findings from any analysis page into one reversible preprocessing plan.
4. See every page execute against exactly the same dataset version and plan.
5. Export a reproducible dataset, plan, code, provenance, and train/validation/test definition.
6. Remain responsive on datasets larger than RAM when the underlying operation can be scanned or streamed.

“As much data as possible” must not be expressed as an unlimited row-count promise. The enforceable contract should be:

- storage may exceed RAM;
- interactive responses are bounded by viewport, sample, or aggregate budgets;
- exact full-data work runs as a cancellable job with progress and an explicit resource estimate;
- memory, CPU concurrency, temporary disk, and response size all have configurable limits;
- results identify the exact source version and preprocessing plan that produced them.

## 2. Executive Assessment

EdaTime already has a strong EDA foundation:

- a modular TypeScript frontend with lazy feature loading and explicit lifecycle ownership;
- Arrow IPC transport and GPU-accelerated time-series rendering with a fallback renderer;
- time-series, scatter/matrix, correlation, FFT, spectrogram, causal, and drift workflows;
- CSV/Parquet preview, partial ingest, and PostgreSQL/TimescaleDB snapshot loading;
- server-side filtering, downsampling, caching, analytics, and workload telemetry;
- the first working slice of an immutable, reversible cleaning-plan system;
- reproducible frontend, Rust, browser, and benchmark gates.

The main limitation is architectural rather than cosmetic: database access still copies a bounded snapshot into memory, and large sorting needs a measured Polars 0.53 spill/memory gate before it can be offered by default. With a managed artifact directory, uploads require verified time order (or an explicit sort opt-in), retain a validated lazy CSV/Parquet plan through a streaming Parquet sink, roots and explicit plan materializations activate as fresh scans, and retained versions survive lineage-safe pruning. Parquet export sinks lazy plans to temporary files and streams completed files in bounded HTTP chunks. This removes the full-result collection and response-byte-vector boundaries from managed ingest/materialization/export, but exact full-data jobs are not yet cancellable or progress-reporting.

The second limitation is product correctness: the cleaning plan is not yet the execution context for every page. The existing v1 plan supports only time ranges, numeric ranges, adaptive lines, and annotations. Timeseries applies range/line stages after server downsampling in the browser, while correlations, rolling bands, anomalies, and spectral filtering still read the active compatibility dataset without the plan. Other pages mostly consume a plan but do not yet author executable stages.

The recommended order is therefore:

1. Close dataset/plan identity and cross-page execution gaps.
2. Introduce disk-backed dataset descriptors and bounded query admission.
3. Add progressive profiling and a dedicated Prepare workflow.
4. Expand the plan into the transformations required for modeling.
5. Add grouped/panel time-series support and scalable exact analytics.

Do not start with allocator, SIMD, PGO, compression, framework replacement, or a distributed engine. Those may help later, but none removes the current full-materialization boundary.

## 3. Evidence From the Current Checkout

### 3.1 Frontend

- `frontend/src/app.ts` is a real composition root. It owns `AppRuntime`, `FeatureRegistry`, `WorkspaceStore`, the Timeseries module, and cleaning-plan compatibility.
- `frontend/src/app/featureRegistry.ts` already lazy-loads feature modules and disposes them across dataset sessions.
- `frontend/src/contracts/api/v1/` owns frontend route/DTO mirrors; this should remain the only frontend wire-contract surface.
- `frontend/src/cleaning/` provides a plan store, request envelope, preview/apply/export calls, a shared Pipeline Workbench overlay, local code generation, and compatibility lowering.
- `frontend/src/cleaning/types.ts` exposes portable `timeRange`, `columnRange`,
  `adaptiveLine`, column-scoped `missingValue`, stable `deduplicate`, explicit
  keep/drop `columnSelect`, stable `sort`, bounded forward/backward `fillNull`,
  global fixed-duration `resample`, and `annotation` stages. More schema, temporal,
  robust-cleaning, and modeling
  stage families remain open.
- `frontend/src/cleaning/panel.ts` is now a Pipeline Workbench: it visualizes
  the canonical plan, edits all v1 stage parameters, enables/disables,
  reorders, removes, previews/applies, and exports backend-plan JSON, graph
  JSON/SVG, and starter code. It is available from the shared header on every
  page and includes local undo/redo, same-baseline plan import, explicit
  per-stage row-impact previews, and canonical unmaterialized-change state.
  Dirty drafts now autosave by exact source/version/revision/content/schema/time
  identity and restore only for that same baseline; cross-baseline imports are
  explicitly rejected rather than silently rebound. Most preparation operation
  families remain open.
- Executable stage authoring is currently concentrated in Timeseries (`filterModalController.ts`, `adaptiveGesture.ts`, and the plan panel). Scatter, Correlations, FFT, Spectrogram, Causal, and Drift do not yet fulfill the “author from every plot” goal.
- `frontend/src/services/api/timeseries.ts` sends the canonical plan envelope
  with plan-aware requests; the backend applies it before projection and
  reduction. The result keeps immutable execution provenance in `_meta`.
- `frontend/src/features/home/guidedWorkflow.ts` now guides Upload → Timeseries
  → Correlations → Scatter → Causal → Prepare. The final Prepare handoff names
  the source → stages → result graph and directs users to the Pipeline Workbench
  for detailed editing, preview, materialization, and export. Dedicated
  validation/experiment status remains open.
- Upload validation now checks format only; server-side configurable admission
  owns file-size policy so the UI does not preempt scan-backed/streaming work.
- Arrow decoding is bounded for normal chart routes, but it copies Arrow columns into JavaScript typed arrays. Response budgets must therefore remain strict even after the backend becomes out-of-core.

### 3.2 Backend

- `crates/edatime-ingest/src/ingest.rs` builds one validated lazy CSV/Parquet
  normalization plan. The in-memory compatibility path still collects it, but
  managed uploads sink that plan directly to Parquet and activate a fresh scan.
  Managed mode verifies non-decreasing timestamps with a scalar streaming
  check and preserves source order; it only enables the canonical Polars sort
  after an operator explicitly opts in. The exact memory/spill behavior for a
  large unsorted source remains a required benchmark gate rather than a
  blanket guarantee.
- `crates/edatime-store/src/repository.rs` stores one replaceable in-memory `LazyFrame` backed by a `DataFrame`.
- `crates/edatime-store/src/artifacts.rs` provides an atomic local descriptor
  catalog; `crates/edatime-store/src/versions.rs` can open a retained Parquet
  descriptor as a fresh `LazyFrame` scan. Configuring
  `data.artifact_dir`/`EDATIME_ARTIFACT_DIR` writes replacement roots and
  materialized children to that catalog. Managed roots and plan materializations
  use temporary streaming Parquet sinks and reopen complete outputs as lazy
  scans. The registry reconstructs catalogued version provenance and startup
  transitions the active compatibility repository to the latest restored lazy
  scan. `max_artifact_versions`/`EDATIME_MAX_ARTIFACT_VERSIONS` prunes only
  complete non-active lineages, preserving active recovery and user-visible
  usage/quota accounting.
- Dataset fingerprints are currently derived from canonical Arrow content
  (schema, row order, nulls, and values); they are still resident-frame hashes
  rather than streaming ingest hashes.
- `crates/edatime-query/src/cleaning.rs` validates and compiles the ten v1
  portable stage kinds. Its semantic hash uses executable canonical content;
  labels, IDs, notes, and timestamps do not affect server execution identity.
- `crates/edatime-service/src/handlers/routes/cleaning.rs` correctly validates source/version/schema identity. Preview still collects its bounded result; apply streams to a scan-backed Parquet child when managed artifact storage is configured and retains the resident compatibility path otherwise; plan data export streams through a temporary Parquet file without a complete output `DataFrame` or response `Vec<u8>`. The legacy filtered-timeseries and scatter Parquet routes use the same response primitive.
- The `expectedPlanHash` field is intentionally not trusted by the backend. That is acceptable only if it remains explicitly an optimistic client hint; cache and result identity must always use the backend hash.
- Plan-aware execution exists for scatter points/matrix/export, FFT, Spectrogram, Causal, and Drift.
- `/data`, scatter, and correlation routes are plan-aware and return the
  common immutable source/version/schema/plan identity headers. Rolling bands,
  anomalies, and spectral filtering now carry the common identity headers.
  Materialization and complete client parity remain open; Causal, Drift, and
  plan/scatter exports also carry the common identity headers.
- `crates/edatime-service/src/handlers/routes/data.rs` projects requested columns and time-filters lazily, but then collects every matching row before LTTB. Very wide time windows can therefore allocate in proportion to source rows rather than response rows.
- Scatter similarly collects the filtered candidate frame before sampling. The response is bounded, but pre-sampling memory is not.
- `QueryExecutor` uses a shared Rayon pool capped at eight workers and dispatches through `spawn_blocking`, but there is no per-workload semaphore, memory admission, deadline, or cooperative cancellation. Aborting a browser request does not stop an already-running Polars/analytics job.
- The response cache is already bounded by entry count and bytes. It should be retained and measured before considering a replacement.
- The correlation cache eagerly represents all six raw/differenced × Pearson/Spearman/Kendall matrices. Correlation cost is quadratic in column count, and the GET correlation endpoints currently ignore the active cleaning plan.
- Database routes push selection/range/limit into the initial SQL snapshot, but ultimately load at most a default one million rows into the same in-memory repository. They are not live query-pushdown sources.

### 3.3 Measured Baseline

`benchmarks/20260714T150000Z.bench.md` is the current accepted small-workload baseline:

- aggregate HTTP p95: 195.80 ms;
- peak RSS: 178.2 MiB;
- scatter points p95: 206.56 ms;
- rolling p95: 915.60 ms for the benchmark route mix;
- 16-column × 5,000-row correlation matrix kernel: 152.42 ms;
- 500,000-row scatter sampling kernel: 23.98 ms;
- all CPU admission counters drained to zero pending work.

This baseline is useful for regression protection but not proof of large-data scalability. Its HTTP metrics snapshot uses a 5,000-row active dataset, and the largest isolated scatter kernel is 500,000 rows. Phase 0 must add datasets that expose storage, scan, materialization, and cancellation behavior.

## 4. Product and Architecture Contracts

These contracts are non-negotiable because later performance work depends on them.

### 4.1 One Execution Context

Every dataset-derived request must resolve the same context:

```text
DatasetContext = source version + source fingerprint + dataset revision + cleaning plan + backend plan hash
```

- The frontend may hold a mirrored plan type, but Rust owns validation, canonicalization, compilation, and semantic hashing.
- Page-local zoom, color scale, graph layout, thresholds, and display sampling are analysis/view state, not cleaning stages.
- Every response must return its resolved source version, dataset revision, and backend plan hash.
- The frontend must discard a response when its result identity no longer matches the active context.
- Legacy requests without a plan may continue during migration, but mixing legacy filters and a plan in one request must be rejected rather than partially applied.

### 4.2 Immutable Sources, Descriptor-Backed Versions

A dataset version should describe storage rather than contain a resident frame:

```rust
DatasetVersion {
    id,
    root_id,
    parent_id,
    revision,
    content_fingerprint,
    schema_fingerprint,
    storage: Memory | ParquetArtifact | DatabaseSnapshot,
    row_count,
    byte_size,
    time_column,
    series_keys,
    sort_order,
    created_at,
    materialized_from_plan_hash,
}
```

- Small datasets may use the memory tier.
- Large file datasets must be scanned from managed Parquet artifacts.
- Materializing a child writes a new artifact to a temporary path, finalizes metadata/checksum, and atomically publishes it.
- The registry persists metadata and has configurable version retention/eviction.
- Source fingerprints must be content-derived. Compute them while receiving/copying the source or while writing the managed artifact; never re-read a multi-gigabyte source solely to hash it.
- The active compatibility repository may remain temporarily, but new routes resolve a `DatasetSource`/`DatasetScan` from the version registry.

### 4.3 Bounded Interactive Work

Interactive endpoints must have a bounded-work contract before execution:

- maximum projected columns;
- maximum returned points/cells/bins;
- estimated scanned rows/bytes when available;
- CPU class and concurrency permit;
- memory estimate and spill eligibility;
- timeout/deadline;
- cancellation token;
- exact vs approximate mode.

Requests outside interactive limits should return a structured decision, not hang or silently clamp:

```json
{
  "code": "job_required",
  "message": "This exact correlation exceeds the interactive budget.",
  "estimate": { "rows": 120000000, "columns": 140, "workUnits": 233000000000 },
  "suggestedAction": "run_background_job"
}
```

### 4.4 Approximate Overview, Exact Export

- Overview charts may use documented sampling or aggregation.
- Statistics displayed as exact must be computed from the full filtered source or labeled as estimates with sample size/method.
- Full exports and materialized child versions execute the exact plan.
- Sampling happens after the cleaning predicates that affect membership, never before.
- Cache keys include source version/revision, backend plan hash, operation, projection, viewport, analysis parameters, approximation method, and algorithm version.

## 5. Target User Workflow

The application should expose six understandable phases while keeping expert shortcuts:

| Phase | User question | EdaTime surface | Output |
| --- | --- | --- | --- |
| Load | What data am I using? | file/database source wizard | immutable source version |
| Profile | Is the time axis and schema usable? | progressive profile + quality report | schema/time configuration |
| Explore | What patterns and problems exist? | existing visual pages | selections and evidence |
| Prepare | What transformations should be applied? | dedicated plan workbench | ordered reversible plan |
| Validate | Did preparation improve data without damage? | before/after quality and plot comparison | accepted plan revision |
| Handoff | Can modeling reproduce this dataset? | export/bundle/split panel | Parquet + plan + code + manifest |

The existing page navigation can remain. Add a first-class **Prepare** destination rather than hiding the central workflow in a small modal.

## 6. Prioritized Findings

### P0.1 — Make Plan Execution Correct Everywhere

**Problem:** Timeseries filters sampled browser data; correlations, rolling, anomalies, and spectral-filter ignore the plan. This violates the current plan document’s central promise.

**Implementation:**

- Add a plan-aware POST timeseries query route. Keep `GET /api/v1/data` as a compatibility adapter until all call sites migrate.
- Send `PlanRequestEnvelope` from `services/api/timeseries.ts` and include backend result identity in Arrow headers.
- Apply plan → viewport/time predicate → projection → bounded reduction on the server.
- Remove cleaning-plan-derived filters from browser-side membership filtering. Browser filters may remain only for temporary view previews that are explicitly labeled and not exported.
- Add plan context to correlations, rolling, anomalies, and spectral-filter.
- Return a shared result identity from scatter, FFT, Spectrogram, Causal, Drift, and exports.
- Add cross-page golden fixtures proving the same plan yields the same row membership and columns on every route.

**Primary files:**

- `frontend/src/services/api/timeseries.ts`
- `frontend/src/features/timeseries/controller.ts`
- `frontend/src/cleaning/compatibility.ts`
- `frontend/src/contracts/api/v1/`
- `crates/edatime-service/src/handlers/routes/data.rs`
- `crates/edatime-service/src/handlers/routes/analytics.rs`
- `crates/edatime-service/src/handlers/scatter/correlations.rs`
- `crates/edatime-service/src/handlers/routes/shared.rs`

**Acceptance:** No page or export shows rows excluded by the active plan; response identity is testable and stale responses never render.

### P0.2 — Fix Canonical Identity and Version Semantics

**Problem:** dataset fingerprints are shape-only; backend plan hashing includes unstable audit fields through debug formatting; version revisions mutate when versions are selected; plan-aware scatter cache keys use the active repository revision even when executing a retained source version.

**Implementation:**

- Define one canonical JSON serializer in Rust for executable plan semantics.
- Use a stable versioned hash algorithm and golden fixtures. The frontend optimistic hash may differ only if it is clearly named `clientCoalescingKey`; it must never be presented as the plan hash.
- Exclude labels, notes, stage IDs, creation timestamps, and UI metadata from the semantic hash while preserving executable stage order.
- Replace row-count/schema fingerprints with content-derived source/artifact fingerprints.
- Separate immutable version revision from active-session generation. Selecting a version increments session generation; it must not rewrite the version’s identity.
- Key caches from the resolved version record, never from the unrelated active compatibility repository.
- Add collisions/stale-selection/cache-isolation tests.

**Primary files:** `edatime-query/src/cleaning.rs`, `edatime-store/src/versions.rs`, `edatime-store/src/state.rs`, `handlers/routes/cleaning.rs`, and all plan-aware cache key builders.

### P0.3 — Establish Real Scale Baselines and Resource Budgets

**Problem:** current benchmarks protect small interactive behavior but do not exercise files larger than RAM, wide schemas, many retained versions, exact export, or cancellation.

**Add deterministic fixtures:**

- `long_numeric`: 1M, 10M, and 100M rows with null/non-finite seeds;
- `wide_numeric`: 32, 128, and 512 numeric columns;
- `panel_series`: group key × timestamp with duplicates, gaps, and unequal lengths;
- `messy_temporal`: mixed time units, unsorted rows, duplicate timestamps, irregular cadence, and time zones;
- compressed CSV and Parquet artifacts at approximately 256 MiB, 1 GiB, and larger-than-configured-memory-budget sizes.

**Measure:** ingest time, time to schema, time to first profile, time to first chart, p50/p95/p99, rows/bytes scanned, response bytes, peak RSS, temporary disk, queue wait, cancellation latency, cache hit rate, and export throughput.

**Gates:**

- preserve the current small-workload p95/RSS within the existing 5% regression budget unless a documented correctness change justifies rebasing;
- select large-data SLOs from the first reproducible baseline rather than inventing percentage improvements;
- fail any phase that grows memory with total source size for an operation documented as bounded/streaming.

### P1.1 — Introduce Scan-Backed Dataset Storage

**Problem:** all ingestion paths end in a resident `DataFrame`; every materialized version adds another resident frame.

**Implementation:**

1. Add `DatasetArtifactStore` and a persisted catalog under an operator-configured data directory.
2. Stream uploads to managed storage while hashing and enforcing a disk quota.
3. Preserve Parquet sources when compatible; otherwise normalize into managed Parquet with deliberate row-group sizing.
4. Convert CSV once, because repeatedly scanning/inferencing large CSV files is expensive and weakens schema stability.
5. Store `DatasetVersion` descriptors and open a fresh lazy scan per query.
6. Keep an optional resident tier for small sources, selected by estimated decoded size and configured budget—not upload bytes alone.
7. Write plan materializations and exports through streaming sinks/files. Do not build the complete output `DataFrame` or response `Vec<u8>`.
8. Add cleanup for failed uploads/jobs, restart recovery, retention, and user-visible disk usage.

**Important decision:** sorting a large unsorted source can itself require unbounded memory. Before relying on Polars streaming sort, benchmark the exact Polars 0.53 plan. If it cannot spill within budget, either implement a chunked external sort or require/verify sorted input for scan-backed interactive mode and offer sorting as a background materialization job.

**Primary files:**

- `crates/edatime-store/src/repository.rs`
- `crates/edatime-store/src/versions.rs`
- new `crates/edatime-store/src/artifacts.rs`
- `crates/edatime-ingest/src/ingest.rs`
- `crates/edatime-service/src/handlers/routes/upload.rs`
- `crates/edatime-service/src/handlers/routes/cleaning.rs`
- `crates/edatime-service/src/handlers/routes/export.rs`

**Acceptance:** a Parquet dataset larger than the configured memory budget can be registered, profiled progressively, viewed, filtered, and exported without a full resident copy.

### P1.2 — Add Query Admission, Jobs, Progress, and Cancellation

**Problem:** the shared Rayon pool limits worker threads but not the number or memory cost of queued tasks. Client abort does not cancel server work.

**Implementation:**

- Introduce a `QueryScheduler` owned by `AppState` with workload classes: interactive scan, scatter, correlation, spectral, causal, materialization/export, and ingest/profile.
- Give each class a semaphore, deadline, work estimate, and memory/disk reservation.
- Propagate a cancellation token from Axum request lifetime into query/job stages. Where Polars collection cannot be interrupted safely, split work at controllable boundaries and prevent abandoned follow-up work/output.
- Add a persistent-enough session job registry with states: queued, running, cancelling, completed, failed, expired.
- Add `POST /api/v1/jobs`, `GET /api/v1/jobs/{id}`, `DELETE /api/v1/jobs/{id}`, and progress events via SSE. Polling may be the initial implementation if SSE adds too much scope.
- Move ingest normalization, full profiling, exact wide correlations, plan materialization, and large export to jobs.
- Return structured overload/resource errors with retry guidance.

**Acceptance:** a cancelled large operation releases its permit and temporary files; interactive viewport queries remain responsive while one export/profile job runs.

### P1.3 — Bound Collection Before Chart Sampling

**Problem:** Timeseries and Scatter bound response size but may collect all filtered candidates first.

**Timeseries approach:**

- Use time predicate and projection pushdown first.
- For small candidate counts, keep exact LTTB.
- For large windows, build a bounded candidate envelope per pixel/time bucket (first, last, min, max per selected series), then run LTTB on that candidate set if needed.
- Preserve a documented sampling algorithm version in cache/result metadata.
- Return filtered candidate count separately from returned point count.

**Scatter approach:**

- Push plan, range, line, time, null/non-finite, and projection predicates before sampling.
- Add bounded reservoir/hash sampling for scatter mode and bounded bin aggregation for density mode.
- Avoid materializing unused color/size columns.
- Maintain deterministic samples from source version + plan hash + axes + seed so navigation and export previews do not jump.

**Acceptance:** peak memory is proportional to the configured candidate/response budget, not all matching rows, for overview modes.

### P1.4 — Progressive Profiling and a Data Quality Report

**Problem:** upload preview calculates a broad aggregate scan before the user can work, while the product lacks the time-series-specific quality report required for preparation.

**Implementation:**

- Split profiling into:
  - immediate schema and source facts;
  - fast bounded sample profile;
  - exact background profile with progress;
  - cached profile keyed by source version + profile algorithm version.
- Report per column: dtype, null/non-finite count, distinct estimate/exact status, quantiles, robust spread, zeros/constants, min/max, and distribution sketch.
- Report time-axis quality: monotonicity, duplicate timestamps, gap distribution, inferred cadence/confidence, irregularity, timezone, coverage, and rows per interval.
- For panel data, report group count, group-size distribution, per-group coverage/cadence, and incomplete groups.
- Label sampled values as estimates and show sample size.
- Make profile cards virtualized/searchable for hundreds of columns.

**Acceptance:** the user can see schema quickly on a large Parquet source and continue exploring while exact profile work runs separately.

### P2.1 — Build a First-Class Prepare Workbench

The Prepare page should replace the plan modal as the main editing surface while retaining the modal as a quick summary.

**Layout:**

- source/version identity and storage/size summary;
- quality findings with “add fix to plan” actions;
- ordered stage list with drag/keyboard reorder;
- stage editor with validation and column/type-aware controls;
- before/after row, column, null, gap, cadence, and distribution impact;
- preview sampling status and exact-preview action;
- undo/redo and dirty/saved state;
- validation warnings and modeling leakage warnings;
- export/materialize controls.

**Required plan operations, ordered by delivery priority:**

1. Row/schema correctness: keep/drop time windows, numeric/category filters, null/non-finite policy, column keep/drop/rename/cast, sort, duplicate resolution.
2. Temporal regularization: resample/grouped resample, aggregation, gap marking, fill forward/backward, constant fill, linear/time interpolation with maximum-gap limits.
3. Robust cleaning: clipping/winsorization, explicit outlier flag/drop/replace rules, impossible-value rules.
4. Modeling transforms: expression-derived columns, difference/percent change, log/power transforms, lag features, rolling features, standard/robust scaling.
5. Signal transforms: explicit low/high/band-pass materialization only after sampling-rate and irregularity preflight.

Every stage needs explicit null semantics, group scope, ordering requirements, schema effect, portability class, preview cost, and export/codegen support. Do not add an operation to the UI until Rust execution, JSON fixtures, preview, export, and generated-code parity exist.

#### Completed temporal slice: fixed-duration resampling contract

The first resampling stage must remain deliberately narrow until panel-series
identity exists: it operates globally, requires an earlier enabled ascending
stable sort on the canonical time column, and emits one row per non-empty fixed
duration bucket. The plan records `every`, explicit value-column aggregation
(`mean`, `sum`, `min`, `max`, or `last`), and uses the bucket start as the
canonical time value. It must reject grouping keys, empty-bucket synthesis,
interpolation, implicit aggregate selection, timezone conversion, and any
operation that would guess a cadence. This gives preview/apply/export/codegen
one portable meaning; grouped resampling and gap materialization follow only
after `seriesKeys` and profile-derived cadence are available.

Implemented in `5834b6b` and `9e8f17f`. Both Prepare surfaces author and edit
the same canonical stage, imports and local mutations preserve its ordering
precondition, Rust executes native lazy dynamic grouping, semantic hashes track
the interval and ordered aggregations, and Python/Rust code exports reproduce
the left-labeled non-empty bucket contract.

### P2.2 — Make Every Plot Author Useful Stages

| Page | First executable authoring actions | State that must remain analysis-only |
| --- | --- | --- |
| Timeseries | keep/drop interval, value rule, adaptive line, anomaly interval | zoom, pan, y range, overlays |
| Scatter | box/lasso keep/drop, category subset, outlier selection | axes, density mode, point size |
| Correlations | keep/drop columns, redundant-feature proposal | metric, threshold, clustering/order |
| FFT | add differencing or explicit frequency filter after preflight | display scale, cursor, PSD mode |
| Spectrogram | keep/drop artifact interval; later signal filter | colormap, clip/display normalization |
| Causal | keep/drop candidate features, add lag proposal with provenance | graph layout, alpha, method |
| Drift | keep/drop windows or groups, annotate regime boundary | reference/comparison UI state |

Selection-to-stage actions must always open a confirmation/editor that shows exact semantics. A chart gesture by itself must never mutate the plan.

### P2.3 — Replace Destructive Mutation Endpoints

`/transform` and `/analytics/remove_outliers` currently mutate the active dataset. Migrate the UI to plan-stage creation and make materialization explicit. Keep the routes temporarily as compatibility adapters that internally create/apply a plan and return provenance, then deprecate them.

**Acceptance:** no normal analysis control overwrites the active source; every dataset-changing result has parent version and plan provenance.

### P2.4 — Reproducible Modeling Handoff

Add an export manifest containing:

- source and root version IDs plus content checksums;
- schema and time/group-key configuration;
- backend canonical plan and hash;
- exact row/column counts and time coverage;
- quality summary before/after;
- approximation methods used during exploration (not silently applied to export);
- application, schema, and algorithm versions;
- generated Python Polars code and dependency constraints;
- checksums for every bundle artifact.

Add a split definition that is metadata/plan-aware rather than a chart selection:

- chronological train/validation/test boundaries;
- optional gap/embargo between splits;
- per-group split policy for panel data;
- warnings when interpolation, scaling, or imputation was fitted across future boundaries;
- export either one dataset with a `split` column or separate Parquet artifacts.

Code generation should move to the backend canonical plan. Frontend-only generation is useful for previews but cannot guarantee parity once stage types grow.

### P3.1 — Support Grouped/Panel Time Series

The current schema assumes one time column and numeric series columns. Add optional `seriesKeys`/entity keys so users can analyze many devices, customers, experiments, or sensors without pivoting everything into a very wide frame.

**Cross-cutting changes:**

- dataset identity includes ordered group keys and sort contract;
- every temporal stage declares global vs per-group behavior;
- resampling, lag, rolling, interpolation, anomaly, drift, and split operations run per group;
- Timeseries can filter/search groups and overlay a bounded number;
- Scatter/Correlation can operate globally, per group, or on grouped aggregates;
- query cache keys include group selection;
- profile and quality reports expose group imbalance.

Implement only after single-series plan semantics and scan-backed storage are stable; otherwise every current ambiguity gets multiplied across groups.

### P3.2 — Scale Correlation and Expensive Analytics Deliberately

- Stop unconditional all-mode correlation warmup. Cache by source version + plan hash + column set + mode + algorithm version.
- Add single-flight execution so concurrent cold requests share one computation.
- Require selected columns or a bounded feature-screening step for very wide data.
- Offer approximate screening followed by exact computation on a chosen subset; label both.
- Move exact wide correlation and expensive causal requests to jobs.
- Keep the causal work-unit rejection and extend the same estimator pattern to correlation, drift, spectral, and plan preview.
- Ensure rolling/anomaly work is server-side over the canonical plan; avoid recomputing rolling bands from a chart sample when presented as analysis output.

### P3.3 — Database Pushdown as a Separate Source Type

After file-backed scans are stable, allow PostgreSQL/TimescaleDB sources to remain remote instead of always becoming in-memory snapshots.

- Store a source descriptor and safe, quoted table/column metadata.
- Push time, group, category/range, projection, aggregation, and limit predicates into SQL when exact semantics are supported.
- Materialize locally when a stage cannot be pushed down.
- Show whether a plan is remote-pushdown, hybrid, or local-materialization.
- Keep credentials outside exported plans and logs.

Do not couple this phase to P1 storage work; remote pushdown requires its own parity/security tests.

### P4 — UX, Accessibility, and Maintainability Follow-Through

- Keep vanilla TypeScript and the existing feature-entrypoint/lifecycle design; a frontend framework rewrite does not advance the product goal.
- Add a query/job status center with queued/running/cancelled states and resource estimates.
- Make large-data mode visible: scanned rows/bytes, returned points, exact/estimated badge, active sample method, and plan hash/version details.
- Extend the guided workflow through Prepare → Validate → Export.
- Autosave plan drafts by content/source identity and provide explicit import/rebind behavior when schemas differ.
- Add keyboard-accessible stage reorder/edit actions, not drag-only controls.
- Keep page modules lazy and enforce bundle budgets as new Prepare components are added.
- Continue virtualizing long column/profile/stage lists.
- Update `README.md`, `docs/user-manual.md`, API docs, and architecture docs from the implemented behavior; older design documents must not be treated as live architecture.

## 7. Phased Delivery Plan

### Phase 0 — Correctness and Scale Baseline

**Deliverables:**

- canonical dataset/version/plan identity decision record;
- backend canonical JSON/hash implementation and golden TypeScript/Rust fixtures;
- plan-aware route capability matrix with live tests;
- new large/wide/messy/panel benchmark fixtures and resource metrics;
- documented resource budgets and interactive-vs-job decision rules.

**Exit gate:** cross-page plan parity is green; content fingerprints distinguish same-shape sources; current small-workload benchmark remains within its gate; large-data baseline artifacts are checked in.

### Phase 1 — Unified Plan-Aware Queries

**Deliverables:**

- plan-aware Timeseries POST route and frontend migration;
- Correlation, Rolling, Anomaly, and Spectral Filter plan support;
- shared result identity on every dataset-derived response;
- cache keys resolved from source version + backend plan hash;
- removal of browser-side canonical membership filtering.

**Exit gate:** one fixture/plan produces identical membership across Timeseries, Scatter, export, and analytics; stale async results are rejected in frontend integration tests.

### Phase 2 — Disk-Backed Storage and Streaming Output

**Deliverables:**

- artifact catalog and scan-backed repository;
- upload-to-managed-artifact flow;
- persistent descriptor-backed versions with retention;
- streaming materialization/export and failure cleanup;
- configurable memory/disk/upload budgets exposed to the frontend.

**Exit gate:** complete a larger-than-memory-budget Parquet workflow without a full resident copy; restart recovers the catalog; interrupted jobs leave no published partial version.

### Phase 3 — Scheduler, Jobs, and Bounded Sampling

**Deliverables:**

- workload admission and resource estimates;
- progress/cancel job API and UI;
- bounded Timeseries candidate reduction;
- bounded deterministic Scatter sampling/density aggregation;
- overload/job-required error contract.

**Exit gate:** cancellation and concurrent-interaction tests pass; peak memory follows configured budgets; overview results disclose approximation metadata.

### Phase 4 — Progressive Quality and Prepare Workbench

**Deliverables:**

- progressive profile service/cache;
- temporal and per-column quality report;
- Prepare page with full stage editing/reorder/undo/preview;
- plot-to-stage actions for Timeseries and Scatter first;
- plan autosave/import/rebind UX.

**Exit gate:** a user can diagnose and fix nulls, duplicates, time order, gaps, ranges, and outliers without destructive mutation.

### Phase 5 — Modeling Transform Catalog and Handoff

**Deliverables:**

- resample/fill/interpolate/schema/outlier/derived/time-series stage families;
- backend code generation and parity fixtures;
- chronological split definition and leakage warnings;
- reproducibility bundle and checksums;
- authoring actions from Correlation, FFT, Spectrogram, Causal, and Drift.

**Exit gate:** exported Python Polars reproduces the materialized Parquet schema, row count, sampled values/checksum policy, and split boundaries for every portable golden plan.

### Phase 6 — Panel Series, Wide Analytics, and Remote Pushdown

**Deliverables:** grouped time-series semantics, bounded wide-correlation workflow, exact analytics jobs, and optional database pushdown/hybrid execution.

**Exit gate:** group-aware correctness fixtures pass across plan execution, profiling, visualization, split/export, and generated code.

## 8. Verification Matrix

| Area | Required verification |
| --- | --- |
| Plan DTO/hash | Rust + TypeScript golden JSON, unknown-field rejection, stable semantic hash, audit-field invariance |
| Version identity | same-shape/different-content sources, select-away/select-back, retained-source query, cache isolation |
| Route parity | Timeseries/Scatter/Correlation/FFT/Spectrogram/Causal/Drift/export membership and result identity |
| Ingest | CSV/Parquet, temporal units, unsorted input, partial selection, interrupted upload, disk quota |
| Storage | restart recovery, retention/eviction, orphan cleanup, atomic publish, larger-than-memory scan |
| Preparation | stage order, enable/disable/reorder, null/NaN semantics, group semantics, schema effects |
| Sampling | deterministic result, extrema preservation, filters-before-sample, exact/estimated labels |
| Scheduler | admission, fairness, timeout, disconnect/cancel, permit release, temp cleanup |
| Analytics | exact vs sample, wide-column rejection/job conversion, plan-aware cache keys |
| Export | streamed Parquet, manifest/checksums, source/plan match, generated-code parity, split leakage checks |
| Frontend | stale-response rejection, lazy feature lifecycle, keyboard plan editing, virtualized wide schema |
| Performance | existing small baseline plus long/wide/panel/storage fixtures, p95/RSS/temp-disk/queue/cancel metrics |

Keep the existing gates and extend them rather than replacing them:

```bash
npm test
npm run check:frontend:all
cargo test --workspace --tests --release
npm run test:e2e -- --workers=1 --reporter=line
node scripts/build-frontend.mjs --prod
git diff --check
```

Performance phases additionally run Criterion benches and the HTTP/job benchmark procedure with captured toolchain, commit, runtime configuration, fixture identity, and clean queue rundown.

## 9. Ownership Map

| Concern | Canonical owner |
| --- | --- |
| Dataset artifacts/catalog/version records | `edatime-store` |
| File normalization and source inspection | `edatime-ingest` |
| Plan DTO, validation, canonicalization, compilation, codegen | `edatime-query` |
| Scheduling/resource admission | shared backend service owned by `AppState`, implementation in store/service boundary after ADR |
| HTTP envelopes, result identity, jobs, streamed responses | `edatime-service` |
| Wire mirrors/routes | `frontend/src/contracts/api/v1` |
| Active workspace and dataset session | `frontend/src/workspace` |
| Plan authoring/editing | `frontend/src/cleaning` and new Prepare feature entrypoint |
| Page-local analysis/view state | each `frontend/src/features/<page>` module |
| Benchmarks and reproducible procedures | `crates/*/benches`, `scripts/`, `benchmarks/` |

## 10. Explicitly Deferred or Rejected First Moves

- No distributed engine until a single-node scan-backed design is measured and demonstrably insufficient.
- No allocator replacement, unsafe SIMD, `target-cpu=native`, PGO, or cache-library replacement without hotspot evidence from the new large-data baselines.
- No frontend framework rewrite.
- No silent sampling for exported data or statistics labeled exact.
- No unlimited “all points” browser mode.
- No plan stage whose Rust execution, null/group semantics, preview, export, and code generation are unspecified.
- No permanent support for two authoritative filter models; compatibility state must be retired after route migration.
- No database query pushdown mixed into the first artifact-store milestone.

## 11. Definition of Done

The goal is achieved when all of the following are true:

1. A dataset larger than the configured RAM budget can be loaded as a managed scan-backed source and explored without full materialization.
2. Every page and export executes the same immutable source version and canonical plan and exposes matching result identity.
3. The data scientist can diagnose time-axis/schema/quality issues and build a reversible preparation plan covering the core modeling transformations.
4. Large exact work is estimated, admitted, observable, cancellable, and isolated from interactive requests.
5. Overview sampling is bounded, deterministic, disclosed, and applied only after membership-changing filters.
6. Dataset versions survive restart as descriptors/artifacts, have content-derived identity, and follow retention/quota policy.
7. Grouped/panel time series have explicit per-group semantics across preparation and export.
8. The exported Parquet, canonical JSON plan, generated Python Polars, split definition, and manifest can reproduce the modeling input with verified parity.
9. Small-workload UX/performance does not regress beyond the accepted gate, and large-data benchmarks demonstrate bounded memory rather than merely faster full collection.

## 12. Detailed Implementation Programme

This section is the execution order for the roadmap. Each milestone is small
enough to test and commit independently. Do not start a later milestone before
its stated contract and verification are in place.

### Status Reconciliation Before New Work

The P0.1 and P0.2 findings above were written against the initial review
snapshot. The current checkout already includes the following corrections:

- plan-aware `POST /api/v1/data`, with plan execution before viewport
  filtering and reduction;
- plan propagation to rolling, anomalies, spectral filtering, scatter
  correlations, and correlation matrices;
- backend semantic plan hashing that excludes audit-only fields;
- immutable source-version revisions, separate active-session revisions, and
  `source_version_revision` metadata;
- plan-aware timeseries cache identity and regression coverage.

They remain part of the verification matrix, but are not reimplemented by the
pipeline-workbench milestones below. Content-derived source fingerprints,
uniform result identity headers, and the remaining POST migrations are still
open.

### Milestone A — Pipeline Overview and Editable Workbench

**Purpose:** make the current executable context visible without inventing a
second pipeline model. The graph is a projection of the canonical
`CleaningPlan`; editing the graph changes that plan through the existing store.

1. **Graph model and export contract**
   - Add a pure `frontend/src/cleaning/pipelineGraph.ts` module.
   - Derive a directed graph from `source version → enabled/disabled stages in
     saved order → working dataset`; annotations are represented as attached
     metadata nodes rather than membership-changing edges.
   - Include stable node IDs, edge IDs, labels, execution status, stage kind,
     source/version identity, and a semantic graph version.
   - Export the graph as deterministic JSON and as an SVG snapshot. JSON is
     intended for audit/review; SVG is intended for reports and tickets.
   - Test empty plans, disabled stages, annotations, reordered stages, and
     escaping of user labels in the SVG.

2. **Accessible workbench overlay**
   - Replace the compact plan-modal body with a tabbed overlay: **Pipeline**,
     **Stages**, and **Export**. Keep the shared-header Plan trigger available
     on every page and preserve Escape/backdrop/focus-return behavior.
   - Render the graph as semantic SVG: source node, ordered stage nodes,
     working-dataset node, status and stage-count legend. Nodes must also be
     represented in the Stages tab, so graph interaction is never the only
     way to edit the plan.
   - Selecting a graph node selects the corresponding stage row and opens a
     type-aware editor. The first release edits label, note, enabled state,
     range bounds/mode, and adaptive-line parameters; it supports keyboard
     move up/down, remove, and enable/disable. Reordering uses the existing
     `CleaningPlanStore.reorderStage` API.
   - Preview remains server authoritative. Changes are local until the normal
     plan preview/apply/export actions are chosen.

3. **Integration and lifecycle**
   - Mount one pipeline workbench from `app.ts`; it subscribes to the existing
     singleton plan store and is disposed through `AppRuntime`.
   - The overview reflects plan changes made from Timeseries immediately and
     asks the existing Timeseries owner to refresh only after an executable
     plan change.
   - Keep the workbench global rather than adding a dedicated page or eagerly
     loading chart libraries for this milestone.
   - Export uses the backend canonical plan JSON already available, plus local
     graph JSON/SVG. Generated Python/Rust remain explicitly marked as client
     previews until backend canonical code generation exists.

4. **Milestone A acceptance**
   - A user can inspect source → stages → result, edit/reorder/disable/remove
     stages in the overlay, preview the canonical plan, and export graph JSON
     or SVG without mutating the source dataset.
   - Unit tests cover graph derivation/export and overlay editing. Browser
     coverage proves the overlay opens, responds to plan changes, and has no
     console errors. Frontend architecture and bundle gates remain green.

### Milestone B — Complete Execution Identity

1. Define and publish one result-identity DTO/header helper for every
   dataset-derived response: immutable source version, immutable source
   revision, backend plan hash, projection/schema identity, and algorithm
   version when sampling is used.
2. **Completed for active-plan analytics/correlation clients:** migrate
   plan-bearing requests to typed POST envelopes so plan size cannot exceed URL
   limits, retaining GET only as a backwards-compatible no-plan/legacy path.
3. Make client request coalescing identity explicit and separate from the
   backend plan hash; discard mismatched responses before rendering.
4. Add route-parity fixtures covering Timeseries, Scatter, correlation,
   analytics, Drift, export, and materialization.

**Commit/verification:** Rust route tests, frontend contract tests, full
workspace/frontend suites, and one browser flow proving a stage edit refreshes
all visible consumers.

### Milestone C — Content Identity and Baselines

1. Introduce content-derived source fingerprints while upload/normalization
   writes the managed source; retain shape/schema fingerprints only for cheap
   diagnostics.
2. Add collision fixtures for same-shape/different-content sources and cache
   isolation for selected retained versions.
3. Record the canonical hashing/fingerprint contract in an ADR and golden
   fixtures shared by TypeScript and Rust.

**Gate:** stale plan, select-away/select-back, cache isolation, and artifact
identity tests pass before storage redesign begins.

### Milestone D — Scan-Backed Versions and Streaming Artifacts

1. Add `DatasetArtifactStore` and a persisted descriptor catalog with atomic
   publish, configurable quota, retention, startup recovery, and cleanup.
2. Stream incoming files into managed storage while hashing; normalize CSV
   once to Parquet and register Parquet files as scan-backed sources.
3. Resolve new plan-aware queries from fresh lazy scans; keep the resident
   tier only when estimated decoded size fits its configured budget.
4. Materialize child versions and exports through temp files/streaming sinks,
   never a complete response byte vector.

**Gate:** a configured-over-budget Parquet source can be profiled, graphed,
filtered, and exported without a second full resident copy; restart and
interruption tests prove catalog recovery and atomicity.

### Milestone E — Admission, Jobs, and Bounded Overview Queries

1. **Completed executor foundation:** `AppState` configures separate bounded
   permits for interactive `QueryExecutor::execute_async` collections and
   sink-backed materialization/export. Permit wait is reported in existing
   low-cardinality CPU-admission telemetry, and permits move into the blocking
   task so client-future drop cannot admit a replacement before Polars exits.
   This intentionally does not yet govern direct scatter/correlation/analytics
   task spawns. (`a338f28`)
2. **Completed registry foundation:** `AppState` owns an in-process,
   session-scoped job registry with observable state transitions, progress,
   messages, and cooperative cancellation handles. It is not yet durable or
   public because no workload has been moved into it. Managed plan
   materialization now records its first real session job and exposes read-only
   status endpoints; materialization cancellation is cooperative at safe
   pre-publication boundaries rather than pretending to interrupt a Polars
   sink. The existing Pipeline Workbench Export
   tab displays recent materialization records and apply confirmations carry
   their job ID, lists live records, and exposes cancellation only for live
   materialization work. (`1a3f266`, `b4b6fe3`, `3c4d506`, `6412a2d`, `8ef652c`)
3. Extend those foundations into a scheduler with workload permits, work/memory
   estimates, deadlines, and structured `job_required` decisions.
4. Move ingest normalization, exact profile, full export/materialization, and
   exact wide analytics into observable/cancellable jobs.
5. Replace collect-then-reduce Timeseries and Scatter overview paths with
   bounded candidate envelopes/reservoir sampling after plan predicates.
6. Surface queue/progress/cancellation and sampled/exact metadata in the UI.

**Gate:** cancellation releases permits and temp files; one background job
cannot block viewport interactions; peak memory follows configured candidate
budgets on long/wide fixtures.

#### Bounded overview implementation contract

The current Timeseries endpoint still performs its canonical plan, time
predicate, and projection lazily, but then collects every matching row before
running LTTB. The next implementation slice must replace that single large
collection with the following exact pipeline:

1. Resolve the immutable source/plan identity, validate selected numeric and
   optional colour columns, then push time predicate and projection into the
   lazy scan exactly as today.
2. Run a scalar streaming `len()` plan to report the filtered candidate count;
   this is the only full-range result allowed before deciding whether to use an
   exact small response or the bounded overview path.
3. When the count is at or below `width * 2 * 4`, collect the existing exact
   candidate frame and retain current LTTB output semantics.
4. Above that cap, derive a fixed-duration bucket width from the requested
   time range and the candidate budget. A lazy dynamic group must emit,
   per selected numeric series, the first, last, finite minimum, and finite
   maximum values with their source timestamps. Optional colour/size channels
   must remain row-aligned with the emitted source rows; never attach a value
   from an unrelated extremum.
5. Collect only that envelope, sort by source timestamp deterministically, and
   run the existing LTTB reducer only if the envelope remains above the final
   response target. Return `filtered_rows`, `candidate_rows`, `returned_rows`,
   a versioned sampling algorithm label, and an explicit approximate flag.
6. Add long, sparse, non-finite, duplicate-timestamp, multi-series, and
   colour/size-alignment regressions. The acceptance assertion is that peak
   candidate memory follows the configurable envelope budget while first/last
   and finite bucket extrema survive.

Scatter follows separately: after all membership-changing predicates, use a
deterministic source-version/plan/axes-seeded reservoir for point mode and a
bounded bin aggregate for density mode. Do not reuse a time-series envelope for
arbitrary X/Y scatter geometry.

**Implemented first slice:** a large single-series Timeseries request without
a colour channel now runs a scalar lazy count and, above the `width * 2 * 4`
candidate budget, collects a dynamic-group first/min/max/last envelope before
the existing LTTB pass. The response exposes filtered/candidate/returned row
counts, `envelope-lttb-v1`, and `x-edatime-approximate: 1`. Multi-series and
colour-aligned envelopes remain deliberately on the exact path until their
source-row pairing contract is implemented. The Timeseries Arrow client retains
the algorithm, approximation flag, and all three row counts in result metadata,
so downstream presentation and exports can distinguish an overview from an
exact response. (`05651bd`, `5b1fd87`)

**Implemented scatter point slice:** the scatter-points route and every scatter
matrix cell now feed the post-predicate lazy projection into Polars' streaming
callback sink. A deterministic reservoir keeps the lowest stable priorities
from a seed derived from immutable source, plan, filters, and axes identity;
therefore it is bounded by one stream batch plus the configured point capacity,
is reproducible across requests, and makes a smaller point limit a subset of a
larger one. The response labels this `reservoir-stream-v1`. Density/bin
aggregation remains a distinct future rendering mode rather than being
misrepresented as sampled points. (`23f8de1`)

### Milestone F — Profile, Prepare, and Modeling Handoff

1. Add progressive schema/time-quality/column-quality profiling with cached
   sampled versus exact status.
2. Promote the overlay into a lazy Prepare feature page after the workbench
   interactions are proven: stage editing, impact comparison, undo/redo,
   import/rebind, and quality-finding actions.
3. Add stage families one at a time, each with Rust compiler, null semantics,
   preview, export, codegen parity, and plot authoring only after its consumer
   migration. Delivery order: schema/null/duplicate → temporal regularization
   → robust cleaning → modeling transforms → explicit signal transforms.
4. Add backend canonical code generation, chronological split definitions,
   leakage warnings, checksummed manifests, and reproducibility bundles.

### Milestone G — Panel Series, Wide Analytics, and Remote Sources

1. Add explicit `seriesKeys` and per-group semantics across plan stages,
   profiling, cache identity, sampling, display, split, and export.
2. Add selected-column/approximate-screening workflows, single-flight cache
   entries, and job conversion for wide correlations and causal analysis.
3. Introduce remote database descriptors and safe pushdown only after local
   scan-backed parity is established.

### Commit Discipline

- One owner seam per implementation commit; do not mix generated assets,
  formatting churn, or unrelated workspace edits into that commit.
- Before each commit run the narrow regression tests for the seam, then
  `npm test`, `npm run check:frontend:all`, `cargo test -q`, the production
  build, and the relevant browser flow.
- Rebuild packaged frontend assets only after source gates pass, and include
  them in the same commit when this repository’s release layout requires it.
