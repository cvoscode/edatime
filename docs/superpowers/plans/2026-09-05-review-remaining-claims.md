# Review Claim Audit and Remaining Implementation Plan

Reviewed on 2026-09-05 against commit `450cd602`. This is a current-state
audit of `review.md` and an implementation plan only. No application behavior
is changed by this document.

The review's overall direction is useful, but both its original roadmap and
its additive correction section are now stale in places. Work should be based
on the current repository state summarized here, not by applying every
unchecked item in section 6 or 7 of `review.md`.

## Verification baseline

The checks run for this audit produced the following results:

- `npm test -- --reporter=dot`: **1 failed, 1,424 passed** across 253 files.
  The failing leak-guard test expects `DataChart.destroy()` to dispose the
  ChartGPU instance, but the method currently clears the handle without calling
  `dispose()`.
- `npm run check:frontend:all`: **failed** during TypeScript checking with four
  errors in `frontend/src/chart/chartGpuDisposal.test.ts`.
- `npm run check:frontend:reachability`: **failed** because
  `frontend/src/chart/accessibilityTable.ts` has no production consumer.
- The frontend architecture, bundle-budget, and packaged-asset checks pass.
  Current `app.js` is 208,074 bytes against the 224,000-byte budget.
- `npm run check:api-contract`: **passed** for 51 operations.
- `cargo test --workspace`: **369 passed** across 14 reported suites.
- `npm run check:backend-hygiene`: **passed**.
- `npm run generate:openapi`: **failed** because
  `scripts/generate_openapi_spec.mjs` does not exist even though `package.json`
  advertises it.

Consequently, the executive-summary claim of 1,421 passing frontend tests,
251 passing suites, zero TypeScript errors, and 252 Rust tests is false for the
current tree. The contract count remains correct.

## Claim disposition

| Review claim or recommendation | Current verdict | Evidence and action |
| --- | --- | --- |
| Feature-owned frontend modules and deferred registration | Valid | Preserve this architecture. The app bundle remains within budget. |
| Legacy stores and `WorkspaceStore` overlap | Valid and unresolved | 34 production TypeScript files still import `chartState`, `datasetState`, or `uiState`; 29 production files import `WorkspaceStore`. Complete the ownership migration. |
| `WorkspaceStore` compares filters with `JSON.stringify` | Resolved | `workspaceStore.ts` now uses field-wise `sameFilters`; no further equality rewrite is needed. |
| Raw `GPUBuffer.destroy()` and a buffer pool are needed | Invalid as stated | ChartGPU exposes instance disposal, not raw buffers. Pooling has no profiling evidence. Do not implement either recommendation. |
| Every ChartGPU instance must be disposed | Valid, but the attempted fix is incomplete | `DataChart.deepDispose()` calls `dispose()`, while the commonly exposed `destroy()` does not. The new leak-guard test currently fails and does not correctly construct the ID-based chart adapters. Repair and broaden lifecycle coverage. |
| Browser-main-thread LTTB/MinMax should move to a worker | Invalid as stated | `/api/v1/data` performs envelope reduction and LTTB in Rust before Arrow/JSON serialization. No production frontend worker or Arrow-ingestion LTTB path was found. Reconsider only if a browser profile finds a different hot path. |
| `toolbar.css` is an oversized monolith | Valid and partially started | The active file is 64,117 bytes. Three tracked split files exist under `frontend/css/modules/toolbar/`, but `style.css` still imports only the monolith and the split files are unused. Finish or revert the partial split; do not retain duplicate authorities. |
| Scatter/Causality mobile ergonomics require bottom sheets | Unproven and partly addressed | Responsive rules and 44 px targets exist, while `causal.css` has only a desktop-specific rule and no feature bottom sheet. Run viewport and touch-flow evidence capture before selecting a new interaction model. Use “Causality page,” not “Causal Graph Editor.” |
| Canvas/WebGPU charts need assistive summaries | Valid and partially started | An `accessibilityTable.ts` helper and unit test exist, but production never imports it and reachability fails. Spectrogram and several status surfaces already have `aria-live` summaries. Integrate summaries into the remaining chart adapters instead of adding a second unused abstraction. |
| The custom contract has 51 operations and three-way validation | Valid | The generated frontend route contract and backend/frontend route validation pass for all 51 operations. |
| The contract has usable request/response schemas and bounds | Invalid as a description; valid as a gap | `api-v1.json` contains operation/type names only; it has no field schemas to which `minItems`, ranges, or string constraints can be added. Establish a real schema owner first. |
| Generate OpenAPI 3.1 | Valid and unresolved | The npm command exists, but its target script is missing. Implement generation from real schemas and check the output in CI. |
| Frontend validates the unified error payload | Partially valid and unresolved | `readApiError()` parses message, error, code, and request identity, but treats every field as optional, omits `kind`, and does not diagnose a non-conforming JSON envelope. |
| Parquet and Arrow both stream without full materialization | Half false | Parquet uses a temp-file `ReaderStream`. Arrow uses `dataframe_to_arrow_ipc()`, which writes the complete result into `Vec<u8>`; `/data`, `/scatter/points`, and `/scatter/matrix` therefore materialize Arrow responses. |
| `cleaning.rs` and `metadata.rs` should be split | Valid and unresolved | They remain 1,953 lines/74,712 bytes and 1,550 lines/55,501 bytes, with no route-family submodules. |
| Causal computation is Python Tigramite | False | The production engine is the pure-Rust implementation under `edatime-service/src/causal`. The dormant Python package and worker have been moved to ignored `tmp/`. |
| Long compute lacks request cancellation | Valid with narrower scope | Durable jobs check cancellation between stages, and frontend requests use `AbortSignal`. Interactive `spawn_blocking`/Rayon work has no cooperative token, so causal and spectrogram kernels can continue after their awaiting request is dropped. |
| No ingestion/memory limits exist | Overstated | The service has configurable upload-body, JSON-body, resident-version, database, and analytical-work budgets. It does not have a demonstrated transient peak-memory admission model for decode, DataFrame materialization, and Arrow serialization. Measure before adding another quota. |
| Metrics live in `rates.rs` | False | `rates.rs` is the rate limiter. Metrics live in `edatime-core/src/metrics.rs`, middleware, and `handlers/routes/metrics.rs`. |
| Compute and serialization metrics are absent | Partially stale | Route handler/body latency histograms exist, and scatter points records collect/sample/serialize totals. `/data` lacks equivalent stage telemetry, and scatter stage values are totals rather than histograms. |
| Solid.js remains installed | Resolved | Solid packages, the Vite plugin, and TSX test glob are gone. |
| Triage contains 18 rather than 19 original files | Now false | All 19 artifacts originally listed in section 2 are present in ignored `tmp/`; the two Tigramite additions bring the top-level total to 21 entries. |

## Implementation plan

### P0 — Restore a trustworthy frontend baseline

#### P0.1 Unify chart teardown and repair the leak guard

Files:

- `frontend/src/chart/DataChart.ts`
- `frontend/src/chart/FftChart.ts`
- `frontend/src/features/scatter/chartLifecycle.ts`
- `frontend/src/chart/chartGpuDisposal.test.ts`
- relevant page mount/dispose tests

Steps:

1. Replace the competing `destroy()`/`deepDispose()` behavior in `DataChart`
   with one idempotent teardown path. Dispose the ChartGPU instance before
   clearing its handle, then release observers, listeners, overlays, canvases,
   and subscriptions exactly once.
2. Correct the leak-guard fixtures to use container IDs, matching the chart
   constructors, and assert observable ownership state rather than a nonexistent
   `DataChart.disposed` property.
3. Cover reinitialization and page unmount for DataChart, FftChart, WebGPU
   scatter/density, and ECharts fallbacks. Assert that the underlying renderer
   is disposed once even when teardown is called repeatedly.
4. Ensure failed or timed-out asynchronous initialization cannot publish a
   renderer after its page/controller has already been disposed.

Acceptance:

- `npm test -- --reporter=dot` passes with no lifecycle failure.
- `npm run check:frontend:all` passes, including TypeScript and reachability.
- Mount/dispose/remount tests leave no live renderer, observer, or global
  listener owned by the prior mount.

#### P0.2 Complete the accessibility-summary integration

Files:

- `frontend/src/chart/accessibilityTable.ts`
- DataChart, FFT, scatter, and other canvas/WebGPU adapter owners
- corresponding adapter and page tests

Steps:

1. Define one small summary model: chart title, series name, point count,
   minimum, maximum, mean, and active domain/filter context where available.
2. Mount the existing screen-reader-only table adjacent to each applicable
   canvas, update it after successful data/render changes, and remove it during
   teardown. Reuse the existing Spectrogram/status summaries where they already
   satisfy the requirement.
3. Avoid announcing every pointer or zoom frame. Use stable table content and
   a concise polite status update only after meaningful data changes.
4. Add tests for safe text rendering, update replacement, empty data, and
   disposal; keep `accessibilityTable.ts` production-reachable.

Acceptance:

- The reachability check has no exception for the helper.
- Each canvas/WebGPU chart exposes a useful name and nonvisual data summary.
- Keyboard and screen-reader output remains stable during rapid zoom/pan.

### P1 — Make the API contract real and enforce it

#### P1.1 Establish field-level schemas and generate OpenAPI 3.1

This extends the broader contract work already described in
`2026-08-03-application-structure-performance-plan.md` P1.2.

Files/components:

- a transport-only Rust contract crate or equivalent schema-owning module
- `contracts/api-v1.json`
- `scripts/generate_api_contract_types.mjs`
- new `scripts/generate_openapi_spec.mjs`
- generated frontend contract types and API documentation

Steps:

1. Move or mirror request/response DTOs into a transport-only owner with Serde
   and JSON Schema metadata. Keep Axum, Polars, DOM, and renderer types out of
   that boundary.
2. Describe every JSON request and response, the six-field error envelope,
   Arrow/file alternatives, nullability, unknown-field behavior, array bounds,
   numeric ranges, enum values, and nonempty identifiers.
3. Generate deterministic OpenAPI 3.1 and TypeScript artifacts. Preserve the
   existing 51-operation route check as a separate routing invariant.
4. Add a `--check` mode and CI dirty-diff gate. Make the already-advertised
   `npm run generate:openapi` command functional.
5. Add schema conformance tests using real successful and failed backend
   responses, especially causal and drift requests.

Acceptance:

- Every JSON operation resolves to concrete request/response schemas.
- `npm run generate:openapi` and its check mode pass from a clean clone.
- Backend fixtures validate against the generated document and generated
  TypeScript types compile without handwritten duplicate DTOs.

#### P1.2 Validate structured API errors at the frontend boundary

Files:

- `frontend/src/services/api/http.ts`
- `frontend/src/services/api/http.test.ts`
- generated error-envelope type/decoder from P1.1

Steps:

1. Require `error`, `message`, `kind`, `code`, `correlation_id`, and
   `request_id` for JSON error responses that declare the v1 contract.
2. Preserve useful server text, status, and request identity when validation
   fails, but add an explicit developer diagnostic identifying missing or
   mistyped fields.
3. Test conforming payloads, missing fields, wrong types, invalid JSON,
   non-JSON failures, and duplicate correlation/request identities.

Acceptance:

- A malformed backend JSON error cannot silently masquerade as a conforming
  v1 error.
- User-facing errors remain actionable and include request identity when one is
  available.

### P2 — Finish frontend ownership consolidation

Files/components:

- `frontend/src/workspace/workspaceStore.ts`
- `frontend/src/store/{chartState,datasetState,uiState,events}.ts`
- `frontend/src/app.ts`
- Timeseries, upload, scatter, FFT, Spectrogram, session, and shared UI
  consumers identified by the legacy-import scan

Steps:

1. Record the single owner of each dataset identity, selection, filter,
   viewport, persisted preference, renderer handle, and feature-local field.
2. Add temporary test invariants at the existing dual-write boundaries so a
   workspace/legacy divergence fails close to its source.
3. Migrate in narrow slices: dataset identity/metadata, selection/filter
   intent, viewport/zoom intent, and persisted presentation preferences.
4. Keep renderer handles and transient feature state in controller instances;
   do not move every ephemeral field into `WorkspaceStore`.
5. Delete each legacy setter/event and then its module immediately after its
   final production consumer is removed. Expand the architecture check to
   reject new imports during migration.

Acceptance:

- No production file imports `chartState`, `datasetState`, or `uiState`.
- Every cross-feature field has one writer and no compatibility mirror.
- Two independent feature mounts and mount/dispose/remount tests show no state
  bleed or stale request publication.
- Keep the existing structural `sameFilters` implementation; no further
  equality work is part of this milestone without benchmark evidence.

### P3 — Add cooperative cancellation to CPU-heavy request work

Files/components:

- `crates/edatime-query/src/executor.rs`
- `crates/edatime-service/src/handlers/routes/analytics.rs`
- `crates/edatime-service/src/causal/`
- Spectrogram and other demonstrably long-running kernels
- request middleware/guards and metrics

Steps:

1. Add a cancellable interactive-execution API that passes a request-owned
   cancellation probe into the worker closure. Cancellation must fire when the
   awaiting handler/request is dropped, not only when a durable job is deleted.
2. Check cancellation at bounded intervals in the pure-Rust causal search and
   Spectrogram loops. Return a distinct cancellation outcome and avoid
   publishing/cache-inserting partial results.
3. Preserve the existing admission permits and record queued, started,
   completed, and cancelled outcomes accurately.
4. Do not claim cancellation for opaque Polars operations that cannot poll.
   Bound those with admission/work budgets and document the remaining limit.
5. Add deterministic pre-cancel, mid-compute cancel, and normal-completion
   tests. Verify permits are released and later work is admitted.

Acceptance:

- Cancelling a causal or Spectrogram request stops its cooperative kernel
  within a documented polling bound.
- Cancelled work does not populate caches or return a success payload.
- Existing durable-job cancellation continues to work.

### P4 — Complete behavior-preserving modularization

#### P4.1 Finish the toolbar CSS split

Files:

- `frontend/css/modules/toolbar.css`
- `frontend/css/modules/toolbar/*.css`
- `frontend/css/style.css`
- page-owned styles and CSS contract tests

Steps:

1. Inventory selectors in the active monolith and the three unused split files;
   remove duplication and assign each selector one owner.
2. Keep shared primitives in a small toolbar base/actions layer. Move
   page-specific scatter, FFT, causal, Spectrogram, and responsive rules to
   their feature styles where they can follow the existing lazy page-style
   path.
3. Turn `toolbar.css` into a small manifest or remove it after direct imports
   are established. Update tests to read the owning stylesheet instead of
   coupling every feature to the monolith.
4. Capture desktop, tablet, and phone screenshots for all analysis toolbars and
   verify focus, overflow, and 44 px touch targets.

Acceptance:

- No duplicate selector authority exists between the monolith and split files.
- Toolbar CSS is production-reachable and loaded on the pages that use it.
- Initial CSS stays within budget and toolbar visual/interaction tests pass.

#### P4.2 Split the cleaning and metadata route families

Files:

- `crates/edatime-service/src/handlers/routes/cleaning.rs`
- `crates/edatime-service/src/handlers/routes/metadata.rs`
- new route-family submodules

Steps:

1. Freeze public handler paths, DTO serialization, status codes, headers, and
   error codes with route-level tests.
2. Extract pure helpers and DTOs first, then split cleaning into validate,
   preview/propose, apply, export, and shared-plan modules.
3. Split metadata into DTOs, aggregate/profile construction, cache/job
   orchestration, and GET/POST handlers.
4. Keep route registration and public handler re-exports stable so the contract
   checker sees no operation change.

Acceptance:

- No extracted module creates a dependency cycle or new cross-route global.
- Contract, backend hygiene, Clippy, and `cargo test --workspace` pass after
  each extraction slice.
- Compile-time measurements are recorded before and after; improved navigation
  and ownership are the primary goal, not an unproven compile-time promise.

### P5 — Measure before deeper performance work

#### P5.1 Add comparable `/data` and scatter stage histograms

1. Add low-cardinality collect/reduce-or-sample/serialize histograms for
   `/api/v1/data` and `/api/v1/scatter/points`, retaining existing totals if
   compatibility requires them.
2. Export count, sum, and fixed buckets through JSON and Prometheus from the
   real metrics owner; do not add metrics to `rates.rs`.
3. Separate handler completion from response-body completion, and keep cache
   hit/coalesced paths distinct so cached requests do not distort compute data.

Acceptance: tests prove bucket monotonicity, one observation per executed
stage, no compute observation on a cache hit, and stable low-cardinality labels.

#### P5.2 Characterize transient memory before adding a new quota

1. Benchmark CSV/Parquet upload, database load, `/data` Arrow serialization,
   and scatter Arrow serialization near current configured limits.
2. Record compressed input bytes, estimated DataFrame bytes, result rows,
   serialized bytes, peak RSS, resident-version evictions, and concurrent-work
   class.
3. If peak amplification exceeds a documented safe factor, add admission based
   on estimated live bytes and reserve/release that budget around decode,
   materialization, and serialization. Return a structured overload/too-large
   error rather than risking process OOM.

Acceptance: any new limit is derived from measured amplification, composes with
the existing upload/resident/work budgets, and has concurrency tests.

#### P5.3 Prototype bounded-memory Arrow delivery

1. Benchmark the current in-memory `Vec<u8>` path first, including the benefit
   and memory cost of response caching.
2. Prototype a streaming IPC writer backed by a bounded channel or temporary
   file on a blocking worker. Ensure writer failures propagate to the response
   body and temporary resources are deleted on completion or abandonment.
3. Decide explicitly whether streamed responses bypass the byte-body cache or
   use a file-backed cache. Do not claim zero-copy behavior across the complete
   Rust-to-browser path.
4. Roll out first to the endpoint with the highest measured peak, then reuse
   the abstraction for `/data`, `/scatter/points`, and `/scatter/matrix`.

Acceptance: peak memory remains bounded as result size grows, cancellation and
body abandonment release resources, and Arrow clients decode the stream.

#### P5.4 Validate mobile needs with evidence

Run the Scatter Matrix and Causality flows at 320, 375, 768, and 1024 px with
touch-sized input. Record clipped controls, horizontal scrolling, focus order,
chart viewport loss, and task completion. Only then choose between the existing
responsive disclosure, an inline collapsible region, or a modal/bottom sheet.
A bottom sheet is not an implementation requirement until this audit shows it
improves those flows.

## Explicitly excluded work

- Do not add a frontend LTTB Web Worker based on `review.md`; the described
  frontend computation path does not exist.
- Do not fork ChartGPU to expose raw `GPUBuffer` handles or add a buffer pool
  without a GPU capture demonstrating buffer churn.
- Do not redo `sameFilters`; the allocation-heavy comparison is already gone.
- Do not restore Solid.js or active Python Tigramite code.
- Do not treat old exact test counts or `tmp/` counts as acceptance criteria.

## Recommended execution order

1. P0.1 chart teardown and the broken frontend gates.
2. P0.2 accessibility integration and reachability.
3. P1 field-level contract/OpenAPI, then strict error decoding.
4. P2 store ownership in small feature slices.
5. P3 cooperative cancellation.
6. P4.1 toolbar split and P4.2 Rust handler splits; these can proceed
   independently once the baseline is green.
7. P5 telemetry, memory profiling, Arrow streaming prototype, and mobile UX
   evidence. Implement deeper changes only when those measurements justify
   them.

After every slice, run the narrow owner tests followed by:

```text
npm test -- --reporter=dot
npm run check:frontend:all
npm run check:api-contract
npm run check:backend-hygiene
cargo test --workspace
```

Contract slices must additionally run the OpenAPI/TypeScript generation check;
backend slices should also run the repository's Clippy/check-all target.
