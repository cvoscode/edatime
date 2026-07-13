# Frontend Reimplementation Plan and Target Architecture

## Outcome

Replace `frontend_review.md` with this plan. Reimplement the application as a vanilla TypeScript frontend with explicit feature controllers, a scoped workspace store, and one versioned `/api/v1` contract. Preserve product behavior and route-level lazy loading; remove all internal compatibility code.

The implementation is deliberately sequential: each milestone starts by writing behavior tests against the current application, then replaces that seam, then proves the new implementation passes both the pre-existing characterization tests and new architecture/contract tests.

## Implementation Progress

### Completed: explicit state ownership and facade retirement

- Split all production imports away from the mutable `store/index.ts` barrel into focused chart, dataset, runtime, analytics, scatter, UI, and event modules.
- Added an architecture rule that rejects future production imports of the retired barrel.
- Migrated the characterization tests to the same direct state modules and deleted `frontend/src/store/index.ts`.
- Removed the unused upload feature entrypoint; the real upload panel/workflow remains the owner.
- Added packaged frontend asset-graph validation so the emitted HTML must reference the current Vite manifest assets.
- Fixed the upload-to-timeseries regression: default series are now seeded into the workspace before sanitation, so a fresh upload renders selected data.

Verified after each milestone with the full frontend test suite, TypeScript, architecture, bundle-budget, and packaged asset-graph gates. The last facade-retirement verification passed 1,018 frontend tests.

### Completed: timeseries feature ownership

- Moved the timeseries controller, lifecycle, composition module, page help, and their characterization tests under `features/timeseries/`.
- Updated `app.ts` and the deferred shell loader to consume feature-owned surfaces directly.
- Removed the retired `pages/timeseriesPage.ts`, `pages/timeseriesModule.ts`, `pages/timeseriesRuntime.ts`, and `pages/timeseriesHelp.ts` owners.

The next feature-directory migration should apply the same controller/runtime/help ownership model to a self-contained analysis feature, starting with FFT or spectrogram.

### Completed: spectrogram feature ownership

- Moved the spectrogram page controller, chart runtime, help binding, and their characterization tests under `features/spectrogram/`.
- Updated the page registry to lazy-load the feature-owned page surface directly and removed the retired `pages/spectrogramPage.ts` owner.
- Kept the existing public initialization contract intact while eliminating the last page-to-feature trampoline for spectrogram.

### Completed: FFT feature ownership

- Moved the FFT page controller, page help, and their characterization tests under `features/fft/`.
- Updated the lazy page registry to load the feature-owned page directly and removed the retired `pages/fftPage.ts` and `pages/fftHelp.ts` owners.
- Preserved the FFT initialization contract, WebGPU-to-ECharts fallback, shared spectral-filter preview, and persisted trace-selection behavior while moving ownership.

### Completed: heatmap feature ownership

- Moved the correlation heatmap page controller, page help, and their characterization tests under `features/heatmap/`.
- Updated the lazy page registry to load the feature-owned page directly and removed the retired `pages/heatmapPage.ts` and `pages/heatmapHelp.ts` owners.
- Preserved correlation-matrix loading, clustering, metric selection, fit preferences, scatter hand-off, and all export behavior while moving ownership.

### Completed: drift feature ownership

- Moved the complete Drift feature module set—controller, lifecycle runtime, controls, selection state, chart views, view models, page help, and tests—under `features/drift/`.
- Updated the lazy page registry to import the feature-owned page directly and removed the retired top-level `drift/` and `pages/driftHelp.ts` owners.
- Preserved the Drift request, visibility, selection, chart-rendering, export, and payload characterization coverage while moving the feature as a cohesive unit.

### Completed: causal feature ownership

- Moved the complete Causal Discovery feature module set—controller, runtime, workflow, graph/edit/chip/status views, selection state, comparison/export helpers, page help, and tests—under `features/causal/`.
- Updated the lazy page registry and the guided-workflow causal graph consumer to use the feature-owned surfaces directly, removing the retired top-level `causal/` and `pages/causalHelp.ts` owners.
- Preserved causal graph request, editing, comparison, status, layout, and chip-panel characterization coverage while moving the feature as a cohesive unit.

### Completed: scatter feature ownership

- Moved the complete Scatter feature module set—page controller, runtime, controls, rendering, density/matrix/correlation views, state, export helpers, toolbar behavior, page help, and tests—under `features/scatter/`.
- Updated the lazy page registry, dataset-bootstrap test wiring, ECharts scatter adapter, and Heatmap toolbar-overflow dependency to use the feature-owned surfaces directly; removed the retired top-level `scatter/` and `pages/scatterHelp.ts` owners.
- Preserved scatter, density, matrix, linked-filter, GPU fallback, responsive layout, export, and correlation characterization coverage while moving the feature as a cohesive unit.

### Completed: shared analysis platform ownership

- Moved the shared page runtime, analysis runtime, abortable request-task helper, and their characterization tests from `pages/shared/` to `platform/`.
- Updated every feature consumer—timeseries, FFT, spectrogram, heatmap, scatter, causal, and drift—to depend on the feature-neutral platform surface.
- Preserved lifecycle registration, empty/loading state behavior, deferred export binding, and stale-request cancellation characterization coverage while removing the retired page-oriented shared owner.

### Completed: application lifecycle platform ownership

- Moved the page-change lifecycle primitive and its characterization tests from `app/` to `platform/`.
- Updated the platform runtime and the page-level test doubles to use the platform-owned lifecycle surface.
- Kept listener disposal, one-time initialization, visibility callbacks, and every-page callback semantics covered while removing the lifecycle dependency from application composition.

### Completed: Home and Upload help ownership

- Moved the Home and Upload page-help modules and their characterization tests into `features/home/` and `features/upload/`.
- Updated the deferred shell loader to load feature-owned help modules directly, removing the corresponding `pages/` owners.
- Preserved the current page-help content, idempotent event binding, and lazy subsystem behavior while moving these feature-local seams.

### Completed: shared utility ownership review

- Added direct characterization tests for numeric-column filtering, stable analytics colors, and target-aware Timeseries defaults before moving the utility.
- Moved the shared analytics-column utility and its tests from `pages/` to `platform/`, then updated the application, FFT, Timeseries, and bootstrap-test consumers.
- Preserved target-aware default selection and cross-feature color consistency while removing the retired page-oriented owner.

### Next: timeseries toolbar-overflow ownership

Move complete: the Timeseries toolbar-overflow controller now lives in `features/timeseries/`, and its lazy entrypoint import and layout characterization coverage remain intact.

### Next: remaining page-layout test ownership

Complete: FFT and Timeseries layout/lifecycle tests now live with their features, while the intentionally cross-feature spectral-toolbar layout contract lives with shared UI. The retired `pages/` directory has no remaining source or test owner.

### Next: platform and feature-boundary consolidation

### Completed: Causal public feature surface

- Added `features/causal/index.ts` as the explicit Causal composition surface.
- Updated the page registry and guided workflow to consume Causal through that public surface instead of reaching into its page controller or comparison internals.

### Next: platform and feature-boundary consolidation

### Completed: Scatter public feature surface

- Added `features/scatter/index.ts` for page initialization and the two supported shared Scatter capabilities: grid metrics and toolbar overflow setup.
- Updated page composition, the dataset bootstrap test seam, the ECharts adapter, and Heatmap to consume Scatter through that public surface rather than internal modules.

### Next: platform and feature-boundary consolidation

### Completed: analysis feature registry surfaces

- Added public index surfaces for FFT, Heatmap, Spectrogram, and Drift.
- Updated the lazy page registry to import every analysis feature through its public index, matching the Causal and Scatter composition contract.

### Next: platform and feature-boundary consolidation

### Completed: Timeseries public feature surface

- Added `features/timeseries/index.ts` as the only Timeseries surface needed by application composition: module creation and selected-column sanitation.
- Updated the application shell and its bootstrap characterization test to use the public surface instead of deep Timeseries imports.

### Next: platform and feature-boundary consolidation

### Completed: public composition guard

- Added a source-level regression test that requires every analysis page descriptor to load a feature `index.ts` surface and keeps application composition on the Timeseries public surface.
- This guard makes future reintroduction of the retired page-controller deep imports a test failure.

### Next: platform and feature-boundary consolidation

### Completed: Home and Upload public feature surfaces

- Added public indexes for Home and Upload.
- Updated deferred shell loading and shared upload UI wiring to consume those public surfaces instead of internal feature modules.

### Next: platform and feature-boundary consolidation

### Completed: UI feature-boundary guard

- Added public surfaces for Data Mutation and Export, and expanded the Timeseries surface for its supported filter-modal capability.
- Updated shared UI consumers to use feature indexes only.
- Added an architecture rule rejecting production `ui/*` imports of feature internals, preventing this dependency direction from returning.

### Next: platform and feature-boundary consolidation

Continue replacing cross-feature deep imports with small public surfaces, then extend the architecture checker once the remaining direct seams have been migrated.

### In progress: DataChart decomposition

- Began extracting the DataChart legend subsystem with a standalone interaction-policy module for clamping and Shift-only drag semantics.
- Added direct unit coverage for this policy while retaining the existing DataChart legend characterization tests.
- Extracted legend entry grouping so DataChart no longer owns segment-to-trace visibility policy.
- Extracted legend window-listener registration and disposal into a scoped lifecycle helper with direct cleanup coverage.
- Extracted robust Y-range normalization, bounds calculation, and spike-detection suggestion policy with direct tests; rendering ownership remains in DataChart.
- Extracted viewport-to-percent zoom conversion with direct boundary tests; chart rendering continues to own application of the computed range.
- Extracted display Y-range padding and non-negative floor policy with direct tests; DataChart now only applies the resulting axis option.
- Extracted the legend DOM lifecycle into `LegendOverlayController`: element creation/removal, listener disposal, Shift hint state, drag positioning, and hover suppression are now owned outside `DataChart`.
- Kept series visibility and export-entry decisions in `DataChart`; controller callbacks make that boundary explicit. Direct controller tests cover rendering, delegation, Shift-only dragging, clamping, hover suppression, and removal cleanup.
- Extracted user drawing ownership into `DrawingController`: draw mode/state, pointer lifecycle, animation-frame coalescing, listener cleanup, and screen/export shape rendering no longer live in `DataChart`.
- `DataChart` retains only composition of chart-specific overlay layers with the drawing surface. Direct controller tests characterize gesture coordinates, enabled/disabled input, committed drawings, and redraw requests.
- Extracted title and axis-label DOM ownership into `TextOverlayController`; it now creates, synchronizes, hides, and disposes text overlays independently of chart rendering state.
- Direct controller tests cover normalized content, empty-label visibility, and cleanup. `DataChart` retains only the chart text values and forwards them to this controller.
- Removed the unreachable duplicate rolling-band, anomaly, adaptive-filter, and annotation renderers from `DataChart`. `ChartOverlays` is now the sole owner of those live overlay behaviors.
- Extracted the pure Timeseries tooltip formatter and color-scale legend DOM rendering from `updateDataMulti`, giving the data-update path explicit presentation seams with direct tests.
- Extracted finite-point filtering, visibility preservation, colorized-series expansion, marker annotations, and data-domain calculation into `timeSeriesDataModel`; `DataChart` now consumes an explicit model when applying ChartGPU options.
- Extracted deterministic ChartGPU option assembly into `timeSeriesChartOptions`, including the x-domain/tick contract, tooltip hook, legend policy, and series/annotation hand-off.
- Extracted export viewport sizing and padded export-domain policy into `chartExportLayout`, with direct boundary coverage; `DataChart` now delegates this non-rendering export setup.
- Extracted export line-series painting into `chartExportSeriesRenderer`, including visibility, finite-point filtering, coordinate projection, and stroke policy.
- Extracted export axes, grid lines, ticks, and numeric/time labels into `chartExportAxesRenderer`, keeping `DataChart` export composition focused on orchestration.
- Extracted export title/axis-label and legend composition into `chartExportDecorationsRenderer`, including visible-entry filtering and layout policy.
- Consolidated export canvas orchestration into `chartExportCanvasRenderer`; `DataChart` now supplies current state and the optional drawing callback rather than owning painting control flow.
- Added explicit disposal handles for shared box-zoom and Ctrl-pan bindings, and made `DataChart` dispose those listeners and pending interaction work on re-init or teardown.
- Applied the same box-zoom cleanup contract to FFT and the canvas fallback chart so no chart adapter retains stale interaction listeners after lifecycle changes.
- Made repeated `DataChart.init()` release the prior ChartGPU instance, resize observers, drawing bindings, canvases, overlays, legend/text DOM, and theme subscription before rebuilding; direct initialization coverage now guards the re-init path.
- Extracted CSS-pixel to active chart-domain conversion into `chartCoordinateMapper`, with direct plot-boundary and active-Y-range coverage; `DataChart` now supplies its current geometry and state rather than owning mapping arithmetic.
- Extracted ChartGPU palette/theme construction and theme-refresh option composition into `chartThemeOptions`, keeping theme adaptation deterministic and independently characterized.
- Extracted ChartGPU series visibility grouping into `seriesVisibility`, so expanded-series visibility state is read through a direct policy rather than inline chart-option traversal.
- Extracted legend visibility mutation into `legendVisibilityPolicy`, preserving grouped trace toggles while leaving `DataChart` responsible only for applying the resulting option and refreshing overlays.

### Next: DataChart renderer seams

Continue this behavior-preserving split with the remaining renderer-owned seams: text overlays, drawings/annotations, ChartGPU option construction, and export composition. For each seam, first preserve its existing `DataChart` characterization coverage, add direct module coverage for its extracted behavior, run the full gates, then commit before moving to the next seam.

### In progress: Spectrogram runtime decomposition

- Extracted pure dominant-frequency-band detection and timestamp formatting into `spectrogramAnalysis`, with direct coverage for dominant-band and empty-axis behavior.
- Extracted visible-point range filtering and reusable filtered-buffer behavior into `spectrogramPointFilter`, preserving the colorbar-drag performance contract.
- Extracted the cached raw/log grid buffers, point arrays, display ranges, and per-range buffer reuse into `spectrogramGridModel`; runtime rendering now consumes that model.
- Spectrogram visual-map and colorbar palettes now consume the global continuous color-scale setting instead of hard-coded Viridis stops.
- Added an owned abort scope and selection-overlay teardown for Spectrogram chart gestures, preventing pointer listeners and overlay nodes from surviving chart re-initialization or test/runtime disposal.
- Bound Spectrogram page controls and dynamically attached colorbar-drag listeners to the page runtime's teardown scope; the runtime now releases them on unmount, with regression coverage for detached controls.
- Extracted window/hop-size normalization and preset resolution into `spectrogramControls`, so custom-value bounds and fractional-hop semantics are directly tested independently of DOM wiring.
- Extracted the pure ECharts heatmap option/view-model builder into `spectrogramChartOptions`; it owns palette application, axes, zoom defaults, progressive rendering, and compact tooltip formatting, while the runtime retains data/cache and page-state orchestration.
- Extracted colorbar presentation and pointer-range interaction into `spectrogramColorbar`; it owns global-palette display, selected-range handles, RAF-coalesced drag updates, reset, and disposal while the runtime supplies filtered data and redraws.
- Extracted `spectrogramRequest` as the authoritative frontend-side analytics request builder, covering finite viewport validation, resolved window/hop values, the `131072` point budget, normalize mode, and clip semantics before the API call.
- Extracted `spectrogramSummary` for structured result metrics and its accessible result description, leaving the runtime to provide current result, resolved controls, scale state, and peak formatting.
- Extracted `spectrogramChartController` for ECharts initialization, readiness waits, resize observation, selection-box zoom, reset, and disposal. The runtime now treats it as a chart adapter instead of owning ECharts DOM lifecycle details.
- Consolidated clip-toggle enablement, field visibility, explanatory hints, and method-label policy into `spectrogramClipControls`, removing duplicate init and visibility behavior.
- Next, review the smaller remaining page-control orchestration seam against the target architecture before deciding whether another extraction improves ownership.

### Completed: global continuous color-scale ownership

- Added `utils/colorScales.ts` as the canonical owner of the shared Viridis, Plasma, Magma, Coolwarm, and Inferno palettes and interpolation policy.
- Migrated Settings, Timeseries color-by rendering, and Scatter continuous palettes to consume that source. Scatter-only `blues` and `oranges` remain explicit feature extensions rather than competing copies of the shared scales.

### In progress: Drift page decomposition

- Extracted evaluation-mode normalization, latest-window validation, and response-map filtering into `evaluationPolicy` with direct behavior coverage.
- `page.ts` now owns DOM reads and rendering orchestration only; the selectable evaluation policy is independently testable and reusable by exports or future views.
- Extracted investigation overview, segment, quality, and relationship panel projection into `investigationPanels`, with direct empty-state and detailed presentation coverage.
- The page now assigns the four precomputed panel fragments rather than mixing response formatting with chart/request lifecycle behavior.
- Removed the legacy `/api/v1/drift/stats` fallback and its response-shaping implementation. Drift now uses the versioned investigation contract exclusively, and a page regression proves a failed investigation does not make compatibility requests.
- Extracted canonical investigation-request construction and threshold normalization into `requestPayload`. The page supplies current control values while the module owns defaults, ISO conversion, optional segmentation, and analysis flags under direct tests.
- Consolidated Drift compute-toast aggregation onto the existing `viewModels.statusSummary` owner. Failed-column and data-quality warning formatting now has direct regression coverage instead of a duplicate page-local calculation.
- Extracted timeline global and per-column summary HTML into `summaryPanels`, with direct empty-state and severity/metric rendering coverage; `page.ts` now performs only DOM assignment and lifecycle composition.
- Next, split the remaining request-payload and timeline-summary presentation seams only where the resulting boundary reduces page-controller ownership.

## Target Architecture

```text
index.html
  └─ app/bootstrap
      ├─ AppRuntime: routing, page mount/dispose, dataset lifecycle
      ├─ WorkspaceStore: dataset revision, shared selection, filters, viewport intent
      ├─ ApiClient: JSON, Arrow, uploads, downloads, typed errors, cancellation
      └─ FeatureRegistry
          ├─ dataset
          ├─ timeseries
          ├─ scatter + correlations
          ├─ fft / spectrogram
          ├─ causal / drift
          └─ shell/settings

Rust API routers  ←── contracts/api/v1 schemas + fixtures ──→  TypeScript ApiClient
```

Use this source layout:

```text
frontend/src/
  app/              boot, router, runtime, feature registry only
  contracts/        generated API DTOs and schema fixtures; never hand-edit generated types
  platform/         API client, Arrow codecs, DOM/lifecycle helpers, storage, logging
  workspace/        immutable shared state, selectors, dataset-session cancellation
  charts/           renderer adapters, interactions, overlays, export primitives
  ui/               reusable DOM primitives/composites with no feature or API imports
  features/<name>/  controller, state, view, local view-models, tests
```

Each feature exports one public controller factory:

```ts
createFeature(context).mount(root) -> {
  dispose(): void;
  onDatasetChanged(snapshot): Promise<void>;
}
```

Rules:

- `app/` composes features but never accesses page DOM, charts, or endpoints.
- `workspace/` holds only cross-feature intent, never DOM nodes, timers, chart instances, caches, or loading state.
- Feature state is private and disposable. Features interact only through `AppContext`, workspace selectors/actions, and declared feature events.
- Views query only inside their supplied root; all listeners, observers, requests, and chart instances are registered through a lifecycle scope and disposed on navigation/dataset replacement.
- Delete `appStateComposite`, `appStateCompat`, `dataClient.ts`, the monolithic `types.ts`, `legacy/`, `window.__edatime` runtime bridges, and thin `features/*/entrypoint.ts` wrappers.
- Move page implementations out of `pages/`, `scatter/`, `causal/`, and `drift/` into their owning `features/<name>/` folders.
- Split the current chart class into adapter, series/options builder, viewport interaction, legend, overlays, drawings/annotations, and export modules. Do the same controller/view-model separation for scatter and analysis pages.

## API and Contract Target

Introduce `/api/v1` only; remove the old route family after cutover.

- `GET /dataset/metadata`
- `POST /dataset/series/query` → Arrow response
- `POST /dataset/scatter/query`, `/dataset/scatter/matrix`, `/dataset/correlations/query`
- `POST /analysis/{rolling,anomalies,fft,spectrogram,causal,drift}`
- `POST /dataset/import`, `/dataset/database/*`, and explicit dataset mutation commands
- `POST /export/{csv,json,parquet}`

All JSON responses use:

```ts
{ data, dataset: { id, revision }, requestId }
```

All errors use:

```ts
{ code, message, details, requestId }
```

Arrow responses use the same dataset/request metadata through standardized `x-edatime-*` headers. The API client owns decoding, error conversion, request cancellation, deduplication, and revision checks; endpoint modules only provide typed request/response definitions.

Place the canonical OpenAPI/JSON-schema contract and representative request/response fixtures under `contracts/api/v1/`. Generate TypeScript DTOs from it and validate Rust handler payloads and responses against the same fixtures in integration tests.

## Test-First Implementation Sequence

1. **Characterize the current application**

   - Build deterministic dataset fixtures covering numeric, categorical, empty, filtered, large/downsampled, and timezone-sensitive data.
   - Add behavior tests before refactoring: metadata, series Arrow decoding, shared filters, exports, scatter/matrix queries, and every analysis request.
   - Add browser flows for upload, navigation, timeseries zoom/filter, scatter selection, exports, and each analysis page.
   - Add lifecycle tests for route change, rapid dataset replacement, request cancellation, and chart disposal.
   - Capture production bundle sizes and lazy-chunk loading as the performance baseline.

2. **Create the new contract and platform layer**

   - Write contract tests for the target `/api/v1` schema before implementing handlers.
   - Implement Rust routers/DTOs and the TypeScript `ApiClient`; test JSON, Arrow, blob, validation, structured errors, and revision races.
   - Verify existing behavior tests against the new client semantics, intentionally replacing only tests that assert retired transport shapes.

3. **Replace app runtime and shared state**

   - Write tests for route-to-feature mounting, disposal, dataset-session invalidation, and workspace selector updates.
   - Implement `AppRuntime`, `FeatureRegistry`, lifecycle scopes, and `WorkspaceStore`.
   - Remove global bridge/state use from shell boot and verify all initial/lazy navigation tests.

4. **Rebuild dataset and timeseries**

   - Characterize upload/profile/metadata refresh, series selection, range filtering, zoom, annotations, chart exports, and empty states.
   - Implement the dataset feature and split the chart implementation into focused modules.
   - Delete the old timeseries module, compatibility store calls, and obsolete chart paths once the feature tests pass.

5. **Rebuild scatter and correlations**

   - Write tests for query construction, shared filters, box zoom, density mode, matrix loading/cache invalidation, correlation suggestions, and export.
   - Implement one scatter feature with separate query, renderer, matrix, density, and view controller modules.
   - Remove duplicated scatter filter snapshots and the old scatter state/runtime implementation.

6. **Rebuild analysis features**

   - Apply the same test-first process independently to FFT, spectrogram, causal, and drift.
   - Keep shared chart/export primitives in `charts/` or `ui/`; keep domain computation requests and page-specific state within their feature.
   - Verify numerical result fixtures against Rust integration tests and browser rendering flows.

7. **Rebuild shell, UI, CSS, and remove retired code**

   - Test settings, keyboard actions, modal focus/cleanup, responsive navigation, and page CSS loading.
   - Keep tokens, base layout, and reusable controls global; move feature CSS beside its feature and lazy-load it with that feature.
   - Split the oversized shared toolbar CSS by actual ownership.
   - Remove all old source trees, compatibility allowlists, stale tests, old API routes, and dead build aliases.

## Verification Gates

After every milestone, run the affected characterization tests first, then the full gates:

- TypeScript, architecture, and bundle-budget checks.
- Rust contract and route integration tests.
- Frontend unit/controller tests plus Playwright browser flows.
- Production frontend build and packaged-dist validation.
- Import-boundary checks: no global state, no production window bridge, no direct fetch outside `ApiClient`, no DOM in state/contracts, no cross-feature deep imports, and no eager heavy page imports.
- Initial application JS/CSS must not exceed the current baseline (151 KB JS, 123 KB CSS); Arrow, ChartGPU, and ECharts remain lazy-loaded.

A test may change only when a deliberate product behavior change is approved. Internal route, store, module, and lifecycle rewrites must keep the characterization suite green.
