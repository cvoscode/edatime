# Frontend Canonicalization And Deduplication Refactor Plan

> This plan is based on the live code in `frontend/src/` as of 2026-05-30. It intentionally uses the `ai/frontend/refactor/` folder instead of `docs/superpowers/plans/` per user request. Some earlier refactor notes are forward-looking; this document reflects the current tree, not the intended end state.

**Goal:** Converge the frontend onto one shared UI surface, one API contract layer, and one owner for repeated analysis-page and chip-list orchestration without changing routes, DOM ids, export filenames, or backend payload semantics.

**Architecture:** Keep page and feature behavior local, but move repeated shell and rendering glue into small shared modules that already exist (`pages/shared/analysisPageRuntime.ts`, `ui/seriesChipList.ts`, `services/api/*`, `store/*`). Preserve the backend contract by treating `services/api/*` and `types.ts` as the only frontend/backend boundary, then refactor internals behind that boundary in small waves.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest, custom store, ECharts, ChartGPU, Axum backend, Arrow IPC + JSON API mix.

---

## Current Assessment

### Concrete hotspots

- `frontend/src/services/api/index.ts` is 684 lines and contains the live implementation for all route families, while sibling files such as `analytics.ts`, `metadata.ts`, `timeseries.ts`, `scatter.ts`, `upload.ts`, and `export.ts` are thin re-export facades. This creates two API organization schemes at once.
- `frontend/src/app.ts` is 751 lines and still acts as both app bootstrap and cross-feature orchestration hub.
- `frontend/src/features/timeseries/columnsController.ts` is 681 lines and mixes meta-bar rendering, chip orchestration, adaptive-filter interaction wiring, color-by wiring, and range-control concerns.
- `frontend/src/causal/causalPage.ts` is 1670 lines and contains column-chip UI, graph rendering, edit-panel flows, progress/status handling, and layout logic in one file.
- `frontend/src/scatter/rendering.ts` is 571 lines and combines series building, tooltip factories, colorbar rendering, and plot view management.
- `frontend/src/pages/spectrogramPage.ts`, `frontend/src/pages/heatmapPage.ts`, and `frontend/src/pages/fftPage.ts` already share `createAnalysisPageRuntime(...)`, but they still duplicate shell-level glue around empty-state updates, export wiring assumptions, and local DOM lifecycle work.
- `frontend/src/pages/fftPage.ts`, `frontend/src/features/timeseries/columnsController.ts`, and `frontend/src/causal/causalPage.ts` all render chip lists, but each layer still carries local repair logic or full rerender patterns around the shared chip helper.
- Deprecated compatibility surfaces still exist in the live tree:
  - `frontend/src/state.ts`
  - `frontend/src/ui/columns.ts`
  - `frontend/src/bootstrap/appShell.ts`
  - `frontend/src/bootstrap/pageLoaders.ts`
  - `frontend/src/bootstrap/timeseriesBootstrap.ts`
  - `frontend/src/legacy/*`

### What is already in good shape

- `frontend/src/store/*` is the correct long-term state ownership surface.
- `frontend/src/pages/shared/analysisPageRuntime.ts` is the right place to centralize analysis-page shell behavior.
- `frontend/src/ui/seriesChipList.ts` already exists and is the correct place to own shared chip-list rendering mechanics.
- `frontend/src/services/api/index.ts` is currently the real frontend/backend contract owner, which means contract-preserving refactors can stay inside the API layer.
- `tsconfig.json` already excludes `frontend/src/legacy/**`.
- `scripts/check-frontend-architecture.mjs` already enforces important architectural rules and should remain the guardrail.

## Frontend/Backend Contract Analysis

This refactor must preserve the current contract exactly. That means the following boundary stays stable while internal frontend ownership changes.

### Contract rules to preserve

- Backend routes remain mounted under both `/api/*` and `/api/v1/*`.
- Only `frontend/src/services/api/*` should call `fetch(...)`, build URLs, or interpret HTTP headers.
- Page modules, feature modules, and UI modules should consume typed service functions only.
- Runtime behavior must preserve existing route names, request parameters, empty-state behavior, export filenames, and visible page ids.

### Core live contract surfaces

#### Metadata

- Function: `fetchMetadata()`
- Route: `GET /api/metadata`
- Response type: `DatasetMetadata`
- Used by: `frontend/src/app.ts` and metadata-dependent feature initialization

#### Timeseries data

- Function: `fetchData(start, end, width, columns, colorColumn, signal)`
- Route: `GET /api/data`
- Transport: Arrow IPC
- Headers used by frontend:
  - `x-edatime-downsampled`
  - `x-edatime-returned-rows`
  - `x-edatime-target-points`
  - `x-edatime-time-column`
- Frontend return shape: `DataObject`
- Critical rule: Arrow parsing and timestamp-column resolution stay inside the API layer only

#### Scatter and correlation

- Function: `fetchScatterPoints(...)`
- Route: `GET` or `POST /api/scatter/points`
- Response type: `ScatterPointsResponse`
- Function: `fetchCorrelationMatrix()`
- Route: `GET /api/scatter/correlations/matrix`
- Response type: `{ columns, pearson, spearman }`

#### Analytics

- Function: `fetchFft(...)`
- Route: `GET /api/analytics/fft`
- Response type: `FftResponse`
- Function: `fetchSpectrogram(...)`
- Route: `GET /api/analytics/spectrogram`
- Response type: `SpectrogramResponse`
- Function: `fetchCausalGraph(...)`
- Route: `POST /api/analytics/causal`
- Response type: `CausalGraphResponse`
- Function: `fetchSpectralFilter(...)`
- Route: `GET /api/analytics/spectral-filter`
- Response type: `SpectralFilterResponse`

### Refactor implication

The safest boundary is:

- Backend owns transport shape, route names, and payload semantics.
- `services/api/*` owns request construction, response validation, Arrow decoding, and typed return values.
- Everything above that boundary is free to be refactored as long as it keeps calling the same typed functions.

That makes the API layer the first place to normalize before doing broader UI cleanup.

## Target Ownership Model

### Canonical live surfaces

- `frontend/src/app/*`
  - app runtime, shell, page registry, page lifecycle, boot sequencing
- `frontend/src/features/*`
  - feature-owned orchestration and page-specific control flows
- `frontend/src/pages/*`
  - page behavior and render/update logic
- `frontend/src/pages/shared/*`
  - shared page scaffolding only
- `frontend/src/store/*`
  - state ownership and setters
- `frontend/src/services/api/*`
  - the only frontend/backend contract boundary
- `frontend/src/services/*`
  - pure business logic and non-DOM transforms
- `frontend/src/ui/primitives/*`
  - low-level reusable UI elements
- `frontend/src/ui/composites/*`
  - composed UI elements
- `frontend/src/ui/seriesChipList.ts`
  - the canonical shared chip-list orchestration owner

### Compatibility surfaces to drain or archive

- `frontend/src/state.ts`
- `frontend/src/ui/columns.ts`
- `frontend/src/bootstrap/appShell.ts`
- `frontend/src/bootstrap/pageLoaders.ts`
- `frontend/src/bootstrap/timeseriesBootstrap.ts`
- thin API re-export files that do not own implementation

## Wave 1: Normalize The API Boundary First

**Why this improves maintainability:** The contract layer is already centralized logically but not physically. Splitting the implementation by route family reduces one 684-line hotspot, removes the current “real module plus façade modules” duplication, and gives later page refactors a stable boundary.

**Files to modify**

- `frontend/src/services/api/index.ts`
- `frontend/src/services/api/http.ts`
- `frontend/src/services/api/metadata.ts`
- `frontend/src/services/api/timeseries.ts`
- `frontend/src/services/api/scatter.ts`
- `frontend/src/services/api/analytics.ts`
- `frontend/src/services/api/export.ts`
- `frontend/src/services/api/upload.ts`
- `frontend/src/types/api.ts`
- `frontend/src/dataClient.test.ts`

**Actions**

- Move `getJson`, `postJson`, inflight dedupe, Arrow parser loading, and response guards into `frontend/src/services/api/http.ts` or small API-internal helpers.
- Move each route-family implementation out of `index.ts` and into the matching route-family file:
  - metadata/sample dataset
  - timeseries Arrow fetch
  - scatter/correlation
  - analytics
  - export
  - upload/database
- Turn `frontend/src/services/api/index.ts` into a barrel that re-exports the route-family modules.
- Keep all existing exported function names stable so no consumer API changes are required.
- Keep Arrow decoding code only in the timeseries API module.
- Keep runtime response assertions near the functions that use them so contract expectations stay explicit.

**Exit criteria**

- `services/api/index.ts` becomes a barrel, not a monolith.
- Route-family files own implementation instead of re-exporting from `index.ts`.
- No feature/page/UI module contains direct `fetch(...)`.
- Existing tests for metadata, Arrow parsing, and scatter requests still pass unchanged or with only import-path updates.

## Wave 2: Finish The Live/Legacy Boundary

**Why this improves maintainability:** Several deprecated files still exist in the live tree, which weakens navigation and invites drift. The goal is not a rewrite; it is to make the canonical ownership obvious.

**Files to modify**

- `frontend/src/state.ts`
- `frontend/src/ui/columns.ts`
- `frontend/src/bootstrap/appShell.ts`
- `frontend/src/bootstrap/pageLoaders.ts`
- `frontend/src/bootstrap/timeseriesBootstrap.ts`
- `frontend/src/app.ts`
- `frontend/src/store/index.ts`
- `scripts/check-frontend-architecture.mjs`
- `ai/README.md`
- `docs/developer/frontend.md`

**Actions**

- Verify which of the deprecated files are still needed only for tests versus live runtime.
- If a file is only a compatibility re-export, either:
  - archive it under `frontend/src/legacy/`, or
  - leave it temporarily but mark it as non-canonical and remove all remaining imports.
- Remove stale top-of-file architecture comments in `frontend/src/app.ts` that still describe `state.ts` and `ui/columns.ts` as primary owners.
- Keep `store/appStateCompat.ts` as the minimal bridge while old test code is migrated.
- Decide one explicit policy for `state.ts`:
  - either keep it as a deliberate compatibility shim used by tests only, or
  - migrate tests and archive it fully
- Update the architecture check only if needed to enforce the final policy more clearly; do not weaken it.

**Exit criteria**

- Canonical ownership is obvious from the live tree.
- Deprecated surfaces are either archived or explicitly documented as temporary shims.
- `app.ts` comments and docs match the actual runtime architecture.
- No new code paths depend on `state.ts`, `ui/columns.ts`, or old bootstrap entrypoints.

## Wave 3: Make Analysis Page Runtime The Full Shell Owner

**Why this improves maintainability:** FFT, heatmap, and spectrogram already share a runtime helper, but the helper stops short of owning the shell responsibilities that are still duplicated. Expanding that helper slightly reduces page glue without creating a generic framework.

**Files to modify**

- `frontend/src/pages/shared/analysisPageRuntime.ts`
- `frontend/src/pages/shared/analysisPageRuntime.test.ts`
- `frontend/src/pages/fftPage.ts`
- `frontend/src/pages/heatmapPage.ts`
- `frontend/src/pages/spectrogramPage.ts`
- `frontend/src/pages/fftPage.test.ts`
- `frontend/src/pages/heatmapPage.test.ts`
- `frontend/src/pages/spectrogramPage.test.ts`

**Actions**

- Extend `createAnalysisPageRuntime(...)` so it owns:
  - one-time export-button binding
  - lazy empty-state controller creation
  - optional shell-level visibility hooks
  - optional default empty-state/fallback behavior
- Keep page-specific computation, chart config, and fetch semantics inside each page module.
- Remove repeated export-shell assumptions from FFT, heatmap, and spectrogram page modules.
- Remove any duplicate export binding path in spectrogram.
- Keep page ids, export button ids, export filenames, and empty-state DOM ids unchanged.

**Exit criteria**

- Each analysis page declares shell behavior; it does not rebuild shell wiring itself.
- There is exactly one export-binding path per analysis page.
- `analysisPageRuntime.ts` remains small and focused on shell composition only.

## Wave 4: Promote `seriesChipList.ts` From Renderer To Orchestration Primitive

**Why this improves maintainability:** Shared chip rendering exists, but callers still repair or rebuild DOM around it. The shared helper should own the stable mechanics, while page and feature modules keep domain behavior.

**Files to modify**

- `frontend/src/ui/seriesChipList.ts`
- `frontend/src/ui/seriesChipList.test.ts`
- `frontend/src/pages/fftPage.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/causal/causalPage.ts`
- `frontend/src/features/timeseries/columnsController.test.ts`
- `frontend/src/causal/causalPage.test.ts`

**Actions**

- Extend the shared chip-list helper to support keyed incremental updates as the default live-update path.
- Add explicit support for preserving transient shared state that is currently repaired manually in callers, especially:
  - loading classes
  - `aria-disabled`
  - chip accent updates
- Keep domain-specific behaviors outside the helper, including:
  - FFT fetch logic
  - adaptive-filter semantics
  - causal select-all behavior
  - filter-modal actions
- Migrate `fftPage.ts` first because it currently re-renders and then restores loading state manually.
- Migrate `columnsController.ts` second so it stops clearing and rebuilding the entire chip container for routine updates.
- Migrate `causalPage.ts` third where the abstraction fits cleanly; keep the separate “Select all / Clear all” action external if that remains clearer than generalizing it.

**Exit criteria**

- `SeriesChip` is not imported directly in page/feature modules unless a module is doing something genuinely outside the shared chip-list model.
- FFT no longer captures/restores chip DOM state manually.
- Timeseries and causal chip updates stop doing full-container rebuilds for normal state changes.

## Wave 5: Decompose The Largest Files Without Changing Public Entry Points

**Why this improves maintainability:** Once the shared seams are clean, the remaining risk is concentrated in a handful of large files. Breaking those files by responsibility makes future changes cheaper and safer without changing runtime behavior.

**Files to modify**

- `frontend/src/app.ts`
- `frontend/src/features/timeseries/columnsController.ts`
- `frontend/src/causal/causalPage.ts`
- `frontend/src/scatter/rendering.ts`
- optionally new sibling modules under:
  - `frontend/src/app/`
  - `frontend/src/features/timeseries/`
  - `frontend/src/causal/`
  - `frontend/src/scatter/`

**Recommended decomposition**

- `frontend/src/app.ts`
  - split page registration, chart bootstrap, metadata bootstrap, and runtime event wiring into focused `app/*` modules
- `frontend/src/features/timeseries/columnsController.ts`
  - split meta-bar rendering, chip orchestration, and adaptive-filter interaction wiring
- `frontend/src/causal/causalPage.ts`
  - split column panel, graph runtime, node/edge edit panel, and chart lifecycle helpers
- `frontend/src/scatter/rendering.ts`
  - split series builders, tooltip factories, colorbar helpers, and view-state rendering

**Exit criteria**

- The public entrypoint file for each feature/page stays stable.
- New sibling files each have one primary responsibility.
- Large-file decomposition happens only after Waves 1-4 reduce shared duplication first.

## Recommended Execution Order

1. Wave 1: API boundary normalization
2. Wave 2: live/legacy boundary cleanup
3. Wave 3: analysis-page shell consolidation
4. Wave 4: chip-list orchestration consolidation
5. Wave 5: large-file decomposition

This order minimizes risk because it stabilizes the contract layer first, then removes dead surfaces, then consolidates shared UI behavior, and only then breaks up the biggest modules.

## Validation Plan

### Always run after each wave

- `npm run check:frontend`
- `node scripts/check-frontend-architecture.mjs`

### Full validation before closing the refactor

- `npm run validate`
- `npm test -- frontend/src/pages/shared/analysisPageRuntime.test.ts`
- `npm test -- frontend/src/ui/seriesChipList.test.ts`
- `npm test -- frontend/src/pages/fftPage.test.ts`
- `npm test -- frontend/src/pages/heatmapPage.test.ts`
- `npm test -- frontend/src/pages/spectrogramPage.test.ts`
- `npm test -- frontend/src/features/timeseries/columnsController.test.ts`
- `npm test -- frontend/src/causal/causalPage.test.ts`
- `npm test -- frontend/src/dataClient.test.ts`

### Manual smoke checks

- Upload a dataset and confirm metadata still hydrates before lazy pages initialize.
- Timeseries:
  - select and deselect chips
  - color a series
  - set adaptive target with Ctrl+click
  - open the range modal
- FFT:
  - add and remove traces
  - confirm loading state survives rerenders
  - export PNG, SVG, HTML, and CSV
- Heatmap:
  - load matrix
  - change metric and cell size
  - click a matrix cell to open Scatter
- Spectrogram:
  - compute
  - drag zoom
  - reset zoom
  - export PNG, SVG, and HTML
- Causal:
  - toggle columns
  - select all / clear all
  - recolor nodes
  - run graph generation

## Risks And Guardrails

- Do not change backend payloads or route names as part of this refactor.
- Do not move Arrow decoding or header parsing out of the API layer.
- Do not fold page-specific chart logic into the shared runtime helper.
- Do not generalize chip-list helpers to the point that feature semantics become opaque.
- Do not archive `state.ts` until test imports are accounted for.
- Keep each wave releasable on its own.

## Recommended First Implementation Slice

If this plan is executed incrementally, the safest first slice is:

1. Split `services/api/index.ts` into real route-family modules.
2. Keep `index.ts` as a barrel with the same exports.
3. Add or update targeted `dataClient.test.ts` coverage if imports move.
4. Run `npm run validate`.

That delivers immediate structural value with minimal product risk and no user-visible behavior change.
