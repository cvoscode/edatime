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

- Replaced its module-global segment registry, observer, and scheduled-frame state with a disposable controller created per Timeseries controls instance. Feature disposal now disconnects the observer, cancels pending layout work, and restores moved fields; direct tests prove disposal and multi-shelf isolation.
- Promoted the common Scatter/Heatmap overflow behavior to `ui/toolbarOverflow`. Scatter now owns its controller and passes layout refresh explicitly from page/controls to rendering; Heatmap owns and disposes the same primitive with its page runtime. This removes the cross-feature Scatter dependency and both shared consumers now have explicit lifecycle ownership.
- Consolidated the former Timeseries-specific overflow implementation into the same shared primitive. Its field-container selector and hidden-item badge are now declarative options, so all toolbar overflow listeners, observer disposal, field restoration, and resize scheduling have one owner.
- Removed Scatter correlation pills' retained page callback. Rendering and correlation refresh now receive the apply action explicitly from the page controller, so freshly rendered suggestions preserve behavior without module-scoped orchestration state.
- Removed the Scatter render-scheduler registry. The page supplies a density re-bin callback through chart lifecycle into box-zoom/view policy, preserving the current zoom for exactly that re-fetch without a retained renderer-to-page bridge.
- Replaced Matrix's module-global abort controller with a page-owned render session. Matrix batch and FFT work share the session signal; every new render aborts the prior one, and Scatter reinitialization disposes the old session before creating the next.
- Moved Matrix-grid drag state from module scope onto the concrete grid interaction state. Reused row/column headers now derive their source, target, current order, and callback at interaction time; direct coverage prevents stale-order reordering after a grid refresh.

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

### Completed: external feature public-surface guard

- Added `initTimeseriesHelp` to the supported Timeseries public index and updated deferred shell composition to initialize all Timeseries controls from that one surface.
- Added deferred-shell characterization coverage for the public Timeseries composition contract: analysis controls, the filter gesture, and page help all initialize once when the Timeseries shell is requested.
- Extended the architecture check so every production consumer outside `features/*` must import a feature through `features/<name>/index.js`. The audit now finds no remaining production deep imports into feature internals.

### Completed: RangeControls compatibility retirement

- Removed the unused top-level `RangeControls.onActivate` compatibility API and its item-kind routing protocol. The reusable component now has one explicit contract: each item is static unless it supplies its own key-based `onActivate` callback.
- Simplified Timeseries range-chip composition to that contract and retained direct keyboard/static/clickable characterization coverage without test-only compatibility behavior or `as any` casts.

### Completed: retired Y-range control lifecycle removal

- Removed the obsolete `ui/yRangeControls` controller, its no-op tests, and its calls from toolbar and both primary/fallback Timeseries bootstrap paths. The matching toolbar DOM has already been absent, so the calls could never bind a user-facing control.
- Retained the focused chart-bootstrap and layout characterization tests to prove chart initialization and the intentionally removed toolbar segment remain correct without carrying a dormant UI owner.

### Completed: Timeseries adaptive-gesture ownership

- Moved the Ctrl+click adaptive-line filter gesture and its characterization tests from `app/` into `features/timeseries/`. It owns Timeseries selection/filter state, chart overlays, range controls, and its trace-picker DOM, so application composition was the wrong owner.
- Exposed the supported initializer through the Timeseries public index and updated chart bootstrap to consume that surface, preserving the existing explicit dependency contract without an application-owned feature controller.

### Completed: Timeseries chart-readiness ownership

- Moved the Timeseries chart bootstrap and its primary/fallback initialization characterization tests from `app/bootstrap` into `features/timeseries/ensureReady`. The controller is created only by the Timeseries module and owns that feature's chart lifecycle, interactions, session restoration, and first render.
- Moved the WebGPU adapter guard out of application composition into `chart/webgpuGuard`, so feature readiness depends on chart infrastructure instead of `app/*`. The next Timeseries boundary audit is its still app-owned dataset bootstrap.

### Completed: Timeseries dataset-bootstrap ownership

- Moved dataset metadata bootstrap, revision/session coordination, default Timeseries selection, mutation refresh, and its direct regression suite from `app/bootstrap` into `features/timeseries/datasetBootstrap`. It has one production consumer and is intrinsically coupled to Timeseries filters, columns, chart refresh, and feature initialization.
- Kept the shared page-routing predicate in `utils/pageBootstrap`; it remains a legitimate cross-page navigation policy rather than feature bootstrap ownership.

### Completed: shared runtime-module platform ownership

- Moved the lazy API-transport and chart-module loader from `app/bootstrap` to `platform/runtimeModules`. The loader is a neutral dependency cache and chart-type registry, not application composition or Timeseries behavior.
- `app.ts` now imports the platform surface instead of a bootstrap helper, keeping transport and chart implementation imports out of the application layer while preserving lazy loading and the existing integration characterization.

### Completed: Home sample-dataset ownership

- Moved Home sample-card DOM wiring, sample generation/upload workflow, and its regression suite from `app/shell` into `features/home/sampleDatasets`.
- Exposed the supported card initializer through the Home public index and updated deferred shell composition to consume that surface. Direct deferred-shell coverage now verifies Home help and sample cards initialize together and retain their dataset-refresh callback contract.

### Completed: API helper alias retirement

- Removed the unused `getJsonForApi`/`getBlobForApi`/`postJsonForApi`/`postBlobForApi` compatibility aliases from `services/api/http`. The API public barrel now re-exports the canonical helper names directly, with existing HTTP and route-contract coverage retained.

### Completed: analytics/export request-options contract

- Removed the mixed bare-`AbortSignal`/options overload from shared HTTP helpers and the Analytics/Export route families. Those calls now use one explicit `ApiRequestOptions` object, preserving cancellation and dataset-scope semantics without runtime argument normalization.
- Updated the active FFT, Causal, analytics-overlay, runtime-loader, and Drift-wrapper seams to pass `{ signal }` at the correct boundary. Direct API regression coverage keeps request routes, cancellation, dedupe, and structured errors verified.

### Completed: Timeseries Arrow request-options contract

- Converted `/api/v1/data` from its positional bare-`AbortSignal` argument to `ApiRequestOptions`, then carried that explicit contract through the Timeseries controller, module, lazy runtime loader, and application composition.
- Updated the direct controller characterization to pin the final argument as `{ signal }`, retaining the request ordering, lookaround, selection, and cancellation behavior under focused coverage.

### Completed: Scatter request-options contract

- Converted Scatter points and matrix requests from bare positional signals to explicit `ApiRequestOptions`, preserving Arrow decoding, request-scope validation, cache behavior, and query-context payload construction.
- Updated the Scatter page and matrix render controllers plus their direct regressions to pin `{ signal }` as the final request argument, including active matrix-controller abort/reset behavior.

### Completed: Upload and Drift request-options contract

- Converted cancellable Upload preview and Drift investigation/stats requests to `ApiRequestOptions`, removing the final bare-signal route-family signatures while retaining unscoped database connection operations as explicit non-dataset requests.
- Updated Upload preview and Drift-page callers to pass `{ signal }`; their focused feature/API characterization tests and the full application gate preserve cancellation and response behavior.

### Completed: unified API cancellation contract

- Converted Metadata to the same explicit request-options shape and removed stale bare-signal cache typings in the application/runtime loader. Every cancellable route family now exposes `ApiRequestOptions`; the sole remaining `AbortSignal` type in `services/api` is the intentional field of that options object.

### Completed: Home navigation-card ownership

- Moved Home `[data-home-nav]` card wiring from `app/shell` into `features/home/navigation` and exposed it through the Home public index.
- Shell core now consumes that public Home surface; the shell characterization test was consolidated around the complete Home mock surface, preventing duplicate mocks from masking supported feature exports.

### Completed: guided-workflow storage compatibility retirement

- Removed the legacy unscoped `visitedPages` storage migration. Workflow progress is now recorded and read only under the active dataset fingerprint, eliminating cross-dataset progress leakage and an obsolete persistence shape.
- Added direct coverage for both the dataset-scoped compact workflow and ignored retired unscoped state, so future storage changes cannot silently restore the compatibility path.

### Completed: Scatter toolbar compatibility alias retirement

- Removed the redundant `initScatterToolbarOverflow` alias. Scatter composition and its direct tests use the feature-neutral `initToolbarOverflow` API, matching the existing public Scatter surface.

### Completed: shared selection consumers use WorkspaceStore

- Moved anomaly-request column selection, outlier-removal payloads, and provenance rendering from mutable `uiState` copies to the canonical `WorkspaceStore` snapshot.
- Added direct disagreement regressions that intentionally give `uiState` different selection/filter values; each migrated consumer must use the workspace intent instead.
- This is the first slice of the remaining canonical-selection migration. Timeseries rendering, session restoration, chart overlays, and the retired `uiState.selectedCols` writer remain sequenced as the next focused steps.

### Completed: Timeseries interaction and overlay selection ownership

- Moved adaptive-filter gesture targeting and trace-picker membership to the Timeseries workspace selection, with a disagreement regression against the retired UI-state copy.
- `DataChart` now gives its overlay renderer the exact current series list during data updates. Rolling bands, anomaly colors, adaptive-filter visibility, and pending-line visibility no longer read application-level selected-series state from chart infrastructure.

### Completed: Timeseries bootstrap selection ownership

- Removed the application-level selected-column getter/setter injection from Timeseries composition. Dataset bootstrap and post-mutation recovery now read and update `WorkspaceStore` directly.
- Updated the bootstrap characterization fixtures to model a complete workspace snapshot, proving default-series seeding, sanitation, adaptive-target selection, and upload refresh use one canonical owner.

### Completed: Timeseries filter-modal workspace contract

- Made the column-filter modal require its `WorkspaceStore` dependency and use it for both selectable series and active filter ranges.
- Updated the direct modal harness to provide a canonical workspace while retaining a deliberately conflicting UI-state selection, preventing reintroduction of the fallback path.

### Completed: selected-series consumer migration

- Moved Timeseries request/render intent, adaptive selection writes, session capture/restore, and FFT filter fallback to `WorkspaceStore`.
- Removed the retired `uiState.selectedCols` field, setter, and event. `WorkspaceStore` is now the sole owner of selected series across production code and characterization fixtures.

### Completed: feature entrypoint-wrapper retirement

- Renamed the remaining feature-owned `entrypoint.ts` implementations to role-based modules: Data Mutation and Export use `feature.ts`, while Timeseries uses `controls.ts`.
- Updated public feature surfaces, local composition, and characterization tests. The `features/*/entrypoint.ts` wrapper convention is now fully retired.

### Completed: domain type-module migration

- Replaced the 525-line `frontend/src/types.ts` hub with canonical `types/api`, `types/chart`, `types/scatter`, `types/store`, and `types/analytics` modules.
- Moved every consumer to its owning type domain, retained the optional WebGPU navigator augmentation with chart contracts, and removed stale duplicate overlay contracts from state owners.
- Extended the architecture check to reject any reintroduction of the retired monolithic type import.

### Completed: color-column selection ownership

- Moved Timeseries color-by state from the duplicate `uiState` mirror to `WorkspaceStore.selection.colorColumn`, including session restoration, metadata recovery, chart rendering, and the visible Color-by control.
- The chart adapter now receives color intent explicitly with each data update, keeping it independent of application state. The Color-by control is rebuilt with the Timeseries column rail and publishes its selection directly to the workspace.
- Removed the retired UI-state field, setter, and store event; Scatter keeps its independent local color control because it is a separate query intent.

### Completed: canonical filter-intent ownership

- Moved numeric column ranges and adaptive line filters out of `uiState` into `WorkspaceStore.filters`; they now have one immutable shared-query owner across Timeseries rendering, filtering, session persistence, and Scatter requests.
- Kept only Timeseries-local gesture presentation in `uiState`: the currently targeted trace and the pending pointer line. `DataChart` receives the committed adaptive filters explicitly with each data update, so chart overlays no longer read application query state.
- Scatter Plot and Matrix retain independent saved filter snapshots, but page switches now serialize and restore the canonical workspace filters rather than synchronizing a second global mirror. The cold-start control path preserves its configured workspace.
- Removed the retired UI filter fields, mutation helpers, and store events; updated characterization fixtures to assert workspace and view-snapshot contracts directly. Full validation passed with 1,134 frontend tests plus TypeScript, architecture, bundle, packaged-asset, Rust, and diff checks.

### Completed: DataChart decomposition

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
- Extracted deterministic Y-axis and grid presentation into `timeSeriesAxisPresentation`; it applies the existing display-range policy, numeric tick formatting, and responsive grid measurement under direct tests, while `DataChart` only applies the computed option.

`DataChart` now remains as the ChartGPU adapter and orchestration layer; rendering-heavy behavior is owned by deterministic policies and dedicated lifecycle/rendering controllers.

### Completed: FFT chart decomposition

- Extracted FFT trace normalization, finite-point filtering, log/scaled display values, palette choice, display bounds, full-domain calculation, and first-trace spectral metadata into `fftDataModel`, with direct behavior coverage.
- `FftChart` retains ChartGPU option composition while consuming that deterministic model; `fftOverlayResources` owns annotation-canvas/resize-observer mounting and teardown, and `fftInteractionResources` owns the disposable box-zoom binding.
- Extracted scaled/pre-scale/raw FFT tooltip presentation into `fftTooltipPresentation`, preserving frequency-unit and scaling context under direct behavior coverage.
- Made repeated `FftChart.init()` release the prior chart instance, overlay observer/node, and box-zoom binding before rebuilding. Direct regression coverage prevents duplicate canvases or retained WebGPU charts on reinitialization, and independently characterizes both extracted resource owners' replacement/disposal contract.
- Extracted annotation and dominant-peak painting into `fftOverlayPresentation`. It consumes the data model's displayed points and bounds, so peak markers share the scaled chart coordinate system instead of recomputing unscaled values in the chart adapter.
- Extracted ChartGPU axis, tooltip, scale-bound, and series-option composition into `fftChartOptions`, with direct low-frequency/scaled-axis coverage. `FftChart` now owns lifecycle and current view state only.

### Completed: FFT page-controller decomposition

- Extracted FFT scale-control normalization and filter cutoff enablement/visibility policy into `fftControls`, with direct behavior coverage. The page now applies its deterministic control state while retaining DOM event wiring and API actions.
- Extracted sample-rate, Nyquist, peak formatting, period conversion, and peak-row view modeling into `fftSpectralInfo`. The page now renders the structured live-region model rather than mixing spectral interpretation with DOM construction.
- Added an owned abort scope for FFT page controls. Reinitialization now retires old mode, scale, clip, zoom, filter, and cutoff listeners; a page regression verifies one zoom click after two initializations resets exactly once.
- Extracted spectral-filter query construction into `fftFilterRequest`, directly covering finite viewport validation, ISO bounds, column/type serialization, and optional cutoff inclusion before the page starts the API action.
- Extracted trace-load viewport resolution and API-result-to-chart-trace projection into `fftTraceModel`, directly covering workspace-view precedence and malformed-result rejection before the page mutates its active trace list.
- The remaining page controller is the intended interaction composition layer: it owns trace/chip state, async loading feedback, user-triggered filter actions, and calls to dedicated chart, request, control, and presentation owners.

### Completed: Timeseries controller review

- Next, review `features/timeseries/controller` against the now-decomposed `DataChart` boundary and extract the largest deterministic request or state policy that is still embedded in page orchestration.
- Extracted Timeseries API request construction into `timeseriesRequest`, directly covering valid range/selection gating, ISO bounds, chart width, color-column serialization, and the minimum lookaround contract before the controller issues the request.
- Extracted raw buffered-response reuse eligibility into `bufferedFetchPolicy`. Normal fetch reuse and zoom-out restoration now share the same selection-key, raw-data, and fetched-window coverage contract under direct tests.
- Extracted fetched-window resolution into `fetchedWindow` and made the request builder the single owner of the lookaround calculation. Buffered reuse now receives a validated response window for ordered data and a deterministic padded fallback for empty or malformed timestamp responses.
- Extracted `timeseriesRenderModel` for viewport clipping, selected-series filtering, empty-state decisions, and spectral-preview projection. It returns immutable chart input and recognizes the case where filters remove every selected-series point, leaving the controller to apply the tested model to the chart and overlays.
- Made the Timeseries feature entrypoint own idempotent initialization and its cleanup registry. Dataset bootstrap and page activation can now converge on the same initializer without duplicate global actions; page-runtime disposal releases those actions and the empty-state upload navigation binding before reinitialization.
- Made the Timeseries column-filter modal binding disposable. Its UI/document listeners are now abort-scoped, the feature cleanup registry releases the global modal opener, and a later page activation can attach fresh callbacks instead of retaining an obsolete feature instance.
- Made reusable empty-state actions disposable and chained Timeseries controller disposal through its module mount handle. Unmounting now aborts a pending data request and removes reset-range listeners; page runtime also releases any empty-state controller it lazily created.
- Extracted bounded zoom-restore history and consecutive zoom-out reset decisions into `zoomHistoryPolicy`, preserving snapshot isolation and raw-buffer restoration while making the controller responsible only for applying its selected chart/workspace transition.
- Fixed the shared page-runtime unmount/remount contract: cleanup now releases the mounted state and is idempotent, so feature lifecycles can safely register again after a real unmount.
- Extracted WorkspaceStore-to-fetch projection into `requestIntent`, including immutable selection capture and null/non-finite viewport fallback. The controller now composes this tested policy with request execution instead of reading request state inline.
- Scoped dataset-bootstrap request deduplication and revision tracking to each Timeseries feature instance. A direct regression proves one mounted runtime cannot suppress metadata initialization for a later instance.
- Scoped chip double-right-click tracking to its bound column rail, so a gesture in one Timeseries mount cannot complete an interaction in another rail; direct tests cover both opening and cross-rail isolation.
- Replaced the mutable Timeseries filter-modal opener singleton with a feature-local DOM event contract. Chips, range controls, and the page gesture request an open only when a mounted modal is available; the modal controller owns the abort-scoped listener and disposal. No production module now stores a modal callback globally.

### Completed: feature-specific workflow ownership

- The next boundary audit identified `ui/guidedWorkflow.ts` as a feature-specific, causal-aware workflow controller incorrectly located in the reusable UI layer. Move it under Home or shell feature ownership, update deferred-shell and command imports to use that public surface, and add an architecture rule ensuring reusable UI does not import feature controllers.
- Moved the guided-workflow controller and its characterization tests into `features/home/`, exposed its supported actions through the Home public index, and updated deferred shell plus command-palette loading to consume that surface. The reusable UI layer no longer imports the Causal feature to compute workflow progress.
- Moved the virtualized column-profile grid and its tests into `features/upload/`, exposed its supported hydration/rendering surface through the Upload index, and updated Upload, Timeseries, and deferred shell composition to use that feature-owned surface.
- Moved the Upload panel controller and its characterization tests into `features/upload/`, removed its former UI-layer re-export indirection, and updated deferred shell composition to load the supported Upload public surface.
- Moved transform and outlier modal orchestration plus its tests into `features/dataMutation/`, exposed those modal initializers through the Data Mutation public index, and updated deferred-shell loading to remove the UI-to-feature dependency.
- Moved export feature configuration and filtered CSV/JSON/Parquet actions into `features/export/runtime`, leaving `ui/exportControls` responsible only for generic toolbar modal behavior and keeping app composition on the Export public index.
- Moved the Timeseries-only double-context-menu filter gesture into `features/timeseries/filterGesture`, exposed it through the Timeseries public index, and kept deferred shell composition as the sole caller. Direct characterization coverage now proves that plot menus remain native, only a genuine double action opens the filter modal, and repeated initialization does not duplicate the listener.
- Tightened the architecture check so production `ui/*` modules cannot import any feature surface. The reusable UI layer now has no feature imports; feature behavior is owned by its feature or invoked by application composition.
- Replaced the module-global Upload preview request controller with a controller created for each mounted Upload panel. The deferred shell now registers the panel's disposer with the app lifecycle; disposal aborts preview work, and stale/aborted responses cannot mutate the active dataset or upload presentation.
- Bound every Upload panel DOM listener to the panel's abort scope and passed that scope into dynamically rebound time-column controls. A disposed panel now stops all file, partial-load, upload, source-tab, and database-control handling; late metadata hydration is ignored. Regression coverage proves replacement initialization does not double-bind the panel toggle.
- Removed the global Export feature runtime. App composition now creates one export controller from its workspace and current data accessor, then injects its stable actions into the Timeseries module, shell, and shortcuts. No frontend module can reconfigure another application root's export behavior.
- Corrected Upload profile-grid memoization to include the actual profile-array owner, not just its length and UI filter state. A same-sized replacement dataset now always renders its own profiles; direct coverage guards the stale-cache regression.

### Completed: Spectrogram runtime decomposition

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
- Moved custom window/hop-input visibility and enabled-state policy into `spectrogramControls`; runtime control wiring now only applies the tested state to its owned DOM inputs.
- Extracted the cached grid-to-visible-points-to-ECharts projection into `spectrogramRenderModel`. It preserves reusable grid buffers while returning chart option, bounds, log-mode, axis formatter, and dominant-band presentation as one deterministic redraw result.
- The remaining runtime is now the intended page-composition layer: it reads owned controls, binds disposable listeners, coordinates loading/error state, and delegates request, redraw, chart, colorbar, and summary work to their dedicated owners.

### Completed: lazy page activation contract

- Replaced the cleanup-function lifecycle contract with explicit `activate()` and `dispose()` ownership. A local activation initializes only its target page and does not synthesize a global router event; real router events retain their existing visible-page and every-page semantics.
- Forwarded explicit activation through the page and analysis runtime layers, then invoked it from the Spectrogram entrypoint immediately after mounting. The lazy feature can therefore initialize when its chunk arrives after navigation has already made the page visible.
- The Spectrogram entrypoint now disposes its previous runtime before reinitializing. Direct coverage verifies first-visit control wiring, repeated page initialization with one compute listener, local activation semantics, and lifecycle cleanup.

### Completed: dataset-session feature disposal

- `PageRegistry` now records the disposer returned by each lazy descriptor and calls every active disposer before a dataset reset makes descriptors loadable again. Its dataset-session token prevents a pending initialization from publishing after a reset and immediately retires any stale initializer that finishes late.
- FFT, Heatmap, Spectrogram, Causal, Drift, and Scatter now return their feature-level cleanup handle through the descriptor contract. Causal re-establishes its runtime on a later mount, while Scatter retires controls, chart, matrix work, requests, runtime, and workspace references before reinitialization.
- Direct registry tests cover mounted-resource disposal and the pending-initialization race; descriptor coverage proves feature cleanup reaches the registry, and Scatter coverage proves a disposed page becomes ready for the next dataset session.

### Completed: retired compatibility markup removal

- Removed the hidden duplicate FFT export controls; the visible export action group is now the sole markup and binding target for every FFT format.
- Removed the unowned Analytics compatibility modal and all of its duplicate rolling/anomaly form controls. Static ownership tests prove neither retired markup surface can return.

### Completed: session settings ownership

- Removed the obsolete `theme` field from session snapshots. Theme remains exclusively owned by application settings, so saved analysis state cannot carry a duplicate setting that restore intentionally ignores.

### Completed: Causal edit-panel decomposition

- Extracted pair-edge draft validation and normalized connection mutation into `editPolicy`, leaving modal status and DOM reads in `editPanel`.
- Extracted draft initialization plus connection/attribute add-remove transitions into `editDraft`, with direct state-transition coverage. `editPanel` now reads current controls and re-renders its modal around that state.
- Extracted escaped pair-edge editor HTML, connection control selection, summary pills, and value-tone presentation into `editPresentation`. The panel now mounts the returned HTML and owns only DOM upgrade/listener wiring.
- Made edit-panel and page-level Causal event wiring replaceable through owned abort scopes. Reinitialization now retires prior document, window, and control listeners before binding the new page instance; direct coverage verifies the edit-panel disposer removes its document handler.
- Extracted node-editor HTML and JSON attribute serialization into `nodeEditPresentation`, keeping the final node update command in the modal adapter while directly covering escaped form output.
- Mounted the Causal analysis runtime and made it idempotent, so page-change behavior is no longer configured but inactive after the lazy feature loads.
- Replaced the status view's import-time page-change listener with an explicit Causal lifecycle resource. Runtime disposal now releases both the analysis and toast-status listeners (and dismisses any active status toast); direct coverage verifies the paired mount/dispose contract.
- Added a real Causal graph-adapter teardown: ECharts, its resize observer, delayed initialization state, and transient node-editor DOM are released together. Generation-scoped refresh scheduling makes queued retries and late dynamic imports inert after disposal or a replaced chart root; direct regressions cover both chart teardown and stale retry cancellation.
- Chained active Causal discovery cancellation into feature-runtime disposal. A page teardown now aborts its latest compute request before releasing status and graph resources, so a detached run cannot complete against a replacement root.

### Completed: global continuous color-scale ownership

- Added `utils/colorScales.ts` as the canonical owner of the shared Viridis, Plasma, Magma, Coolwarm, and Inferno palettes and interpolation policy.
- Migrated Settings, Timeseries color-by rendering, and Scatter continuous palettes to consume that source. Scatter-only `blues` and `oranges` remain explicit feature extensions rather than competing copies of the shared scales.

### Completed: global discrete series-palette ownership

- Consolidated the persisted chart-palette setting, ChartGPU theme palette, Canvas fallback, FFT renderers, Timeseries chips/gesture picker, analytics chips, and Scatter categorical groups on `utils/seriesColors.ts`.
- The palette utility now owns the named settings choices, active-palette state, validation, per-column overrides, and effective-color resolution. `uiState` retains only the override data; it no longer duplicates color normalization or resolution policy.
- Removed the mutable `CHART_PALETTES` / `SERIES_COLORS` split. Settings applies one typed palette at startup and on Apply, and direct regressions prove settings, ChartGPU, and Scatter observe the same selection.

### Completed: Scatter palette compatibility removal

- Removed the unreachable `features/scatter/colorPalettes.ts` duplicate. It had no production or test consumer and implemented a second, incompatible categorical-palette and label-normalization policy.
- `features/scatter/helpers.ts` remains the sole Scatter color-policy owner; direct coverage retains its active global palette, normalized-category, and low-cardinality behavior.

### Completed: inert settings retirement

- Removed the Export and Spectral settings tabs because their three persisted values (`defaultExportFormat`, `whiteBackgroundExport`, and `defaultFftPreset`) had no runtime consumer.
- The settings loader now reconstructs its canonical shape from supported fields instead of spreading arbitrary persisted JSON into application state, so retired settings cannot regain an owner accidentally.
- Retired the equally inert Causal defaults (`defaultCausalMethod` and `defaultTauMax`): the Causal feature owns its active controls and never read the settings values. The remaining settings tabs now contain only live application behavior.
- Retired `analyticsDrawerOpen` as well. The drawer is explicitly normalized closed at startup and never restored, so it now has transient controller-owned state rather than a dead persisted preference.

### Completed: API blob transport ownership

- Moved sample-dataset downloads onto the shared API blob helper. The endpoint now gets the same no-store, structured-error, and transport-policy behavior as every other API route while remaining explicitly outside dataset-scope invalidation.
- Added the canonical DELETE JSON helper and moved database disconnect onto it, so the last simple JSON route no longer bypasses no-store policy or structured API errors.

### Completed: explicit Upload public surface

- Replaced Upload's wildcard public exports with the five composition-level APIs actually consumed outside the feature. The architecture guard now rejects wildcard feature-index exports, keeping internal upload workflows private by default.

### Completed: retired chart export reference removal

- Removed the unimported `utils/chartExporter.ts` reference implementation. The live, tested export path is owned by `chart/dataChartExport` and its focused chart export modules; retaining a second standalone implementation only invited drift.

### Completed: unused feature-contract removal

- Removed the unreferenced `features/shared/featureContract.ts` abstraction. Feature activation and disposal are already owned by the live page registry and public feature indexes; a second unused contract made the target architecture less clear.

### Completed: app-state compatibility guard removal

- Removed the stale `appStateCompat` allowlist from the architecture checker. The compatibility module and every production import were already gone, so the check now enforces focused store state directly rather than documenting a retired escape hatch.

### Completed: database mutation bridge removal

- Removed the database-load fallback that broadcast `edatime:dataset-changed` on `window`. Application composition already provides the typed dataset-refresh callback, so the global mutation bridge is no longer retained as a compatibility path.

### Completed: typed workflow-refresh feature events

- Added `platform/featureEvents` as the explicit, typed in-process boundary for narrowly scoped feature coordination. Its subscription contract returns an owned cleanup handle, so listeners do not rely on hidden global `window` state.
- Migrated all Timeseries and Causal workflow-refresh producers plus Home's guided-workflow consumer from the `edatime:workflow-refresh` custom DOM event. The workflow refresh is now a declared `workflow:refresh` platform event with direct subscribe/unsubscribe characterization coverage.
- This is the first migration slice. Browser-facing router and session events, along with broader cross-feature event families, remain separate until each has a similarly explicit owner and payload contract.

### Completed: typed analytics-change feature event

- Characterized the current Analytics controls-to-overlay refresh behavior before changing it, then moved the one producer and one consumer off the `edatime:analytics-change` window event.
- Analytics changes now use the declared `analytics:change` platform event and return an owned unsubscribe handle from the overlay listener. The focused regression preserves rolling-overlay refresh and analytics fetch triggering without a global DOM bridge.

### Completed: typed Causal pair-preselection event

- Characterized Scatter's Causal-pair hand-off before migration: the active Scatter X/Y pair replaces the Causal chip selection.
- Replaced `edatime:causal-preselect` with the typed `causal:preselect` payload. The Causal page ties the subscription to its existing abort-scoped lifecycle, and regression coverage proves disposal prevents a retired page from receiving later preselection requests.

### Completed: toolbar zoom command composition

- Characterized the visible toolbar contract through `initAnalysisControls`: Zoom out and Reset invoke the page-composed actions, including the required refetch-aware callbacks.
- Removed the `edatime:zoom-out` and `edatime:reset-zoom` window bridges entirely. Toolbar modal setup now receives those two actions explicitly, so this local UI composition does not need a platform event or global listener.

### Completed: typed session-restoration event and deferred listener ownership

- Characterized the Guided Workflow refresh that follows a restored session, then migrated its sole producer and consumer from `edatime:session-restored` to the typed `session:restored` platform event.
- Deferred shell composition now registers the Analytics listener's returned disposer with the application cleanup scope. Long-lived typed subscriptions are therefore released with the shell rather than only when the source module happens to be discarded.

### Completed: retired dataset mutation bridge removal

- Removed the unowned `edatime:metadata-ready` and `edatime:dataset-changed` broadcasts from Timeseries dataset bootstrap and post-mutation refresh. Metadata publication, workspace dataset commits, UI rebuilding, and visible-data refresh are already explicit composition steps.
- Replaced the old broadcast characterization with a regression that proves neither global event is published during initial metadata bootstrap or a dataset mutation refresh.

### Completed: Scatter canonical filter and viewport observation

- Scatter controls now subscribe to the canonical WorkspaceStore and compare its immutable filter and viewport snapshots. Filter changes refresh the badge and schedule the active Scatter view; viewport changes preserve the existing linked-brush gating.
- Removed the unowned `edatime:chart-range-change` fan-out and its Timeseries callback plumbing. Chart viewport changes are already published through the WorkspaceStore, so no separate global notification is needed.
- The subscription is tied to the Scatter controls abort scope; a regression proves a disposed binding cannot react to later workspace changes. View-switch restoration suppresses only its own synchronous workspace publication, preventing an unnecessary second Scatter request during initialization.

### Completed: typed filter-clear and viewport-reset commands

- Replaced the reusable empty-state component's event-name configuration with explicit reset and clear callbacks. The primitive now owns only button lifecycle; feature composition chooses the resulting action.
- Migrated Scatter empty-state, banner, and toast clear actions plus Timeseries empty-state reset handling from global DOM events to declared `filters:clear` and `viewport:reset-request` commands. Timeseries action wiring and Scatter controls own scoped subscriptions and release them with their feature lifecycles.

### Completed: provenance WorkspaceStore ownership

- Provenance now refreshes from the canonical WorkspaceStore subscription instead of column/adaptive-filter DOM notifications. The open panel therefore reflects every filter or viewport update from its actual state owner.
- Deferred shell composition owns the returned provenance disposer, releasing its workspace, keyboard, and page listeners with the app shell.

### Completed: session autosave WorkspaceStore ownership

- Session autosave now debounces canonical WorkspaceStore publications instead of listening for column/adaptive-filter DOM notifications. Selection, filters, viewport, and dataset changes therefore use the same persistence path.
- Reinitialization retires the prior autosave listeners and timer; the bootstrap returns the disposer and requires the subscribe-capable WorkspaceStore contract through Timeseries readiness.
- App composition retains that bootstrap disposer in `AppRuntime`, so teardown releases the WorkspaceStore subscription and pending autosave timer instead of leaving a process-lifetime listener.

### Completed: Settings panel lifecycle ownership

- Settings initialization now returns an owned disposer for its form, shortcut, and modal listeners. Deferred shell composition registers that disposer, so a remounted shell cannot accumulate Settings handlers.
- The shared modal controller now closes an active dialog and releases its close/backdrop/keyboard bindings on disposal. Direct regression coverage proves a disposed Settings panel no longer opens from its keyboard shortcut.

### Completed: annotation panel lifecycle ownership

- The lazily loaded annotation panel now owns an abort-scoped, idempotent binding for its toolbar, modal, and keyboard handlers. Deferred shell composition registers the returned disposer and closes both annotation dialogs on teardown.
- Added direct lifecycle coverage proving a disposed annotation panel no longer responds to the add-note keyboard shortcut.

### Completed: adaptive filter WorkspaceStore ownership

- Adaptive gesture refresh now compares canonical adaptive-line state from WorkspaceStore. Gesture application, chip removal, clear controls, and filter-modal changes all flow through the same state publication instead of coordinating with DOM events.
- Removed the final `edatime:column-filters-change` and `edatime:adaptive-filters-change` producers, consumers, and the obsolete UI event helper. The gesture lifecycle unsubscribes with its page binding.

### Completed: Timeseries column-filter action ownership

- Replaced the feature-local `edatime:timeseries-open-column-filter` DOM event with an explicit `openColumnFilter` action composed by Timeseries controls. Chip menus, range chips, and the page shortcut now invoke the mounted modal owner directly.
- Moved the double-right-click shortcut out of deferred shell setup and into the Timeseries control lifecycle. Both the modal and shortcut return owned disposers, so a disposed Timeseries feature cannot reopen or retain the modal through a stale browser listener.

### Completed: Drift page decomposition

- Extracted evaluation-mode normalization, latest-window validation, and response-map filtering into `evaluationPolicy` with direct behavior coverage.
- `page.ts` now owns DOM reads and rendering orchestration only; the selectable evaluation policy is independently testable and reusable by exports or future views.
- Extracted investigation overview, segment, quality, and relationship panel projection into `investigationPanels`, with direct empty-state and detailed presentation coverage.
- The page now assigns the four precomputed panel fragments rather than mixing response formatting with chart/request lifecycle behavior.
- Removed the legacy `/api/v1/drift/stats` fallback and its response-shaping implementation. Drift now uses the versioned investigation contract exclusively, and a page regression proves a failed investigation does not make compatibility requests.
- Extracted canonical investigation-request construction and threshold normalization into `requestPayload`. The page supplies current control values while the module owns defaults, ISO conversion, optional segmentation, and analysis flags under direct tests.
- Consolidated Drift compute-toast aggregation onto the existing `viewModels.statusSummary` owner. Failed-column and data-quality warning formatting now has direct regression coverage instead of a duplicate page-local calculation.
- Extracted timeline global and per-column summary HTML into `summaryPanels`, with direct empty-state and severity/metric rendering coverage; `page.ts` now performs only DOM assignment and lifecycle composition.
- Extracted Drift CSV and JSON serialization into `exportPayloads`, preserving evaluated-window fields and export context under direct tests while keeping browser download initiation in the page controller.
- Removed the retired Drift runtime request-task and export wrappers. The runtime is now limited to its live ECharts cache and empty-state bridge, with its tests narrowed to those actual responsibilities.
- Added abort-scoped Drift control and page listeners plus mounted-runtime/resize-observer disposal before re-initialization. A page regression proves a second initialization does not duplicate a Compute request.
- Extended Drift page teardown to clear the controls module's retained picker DOM references and selection callback after listener disposal, so a future page root cannot be updated by a stale control owner.
- Added explicit Timeline and Detail ECharts disposal to Drift teardown, releasing their instances and prior DOM roots alongside the existing resize observer and control scopes.
- Removed the retired hidden `drift-col-select` compatibility mirror. The checkbox picker now owns selected-column state directly, eliminating duplicate DOM state and synchronization writes.

### Completed: Heatmap page decomposition

- Extracted correlation color interpolation, fitted-domain policy, semantic cell styling, scale-label formatting, and HTML-attribute escaping into `colorScale`, with direct positive/negative/domain/accessibility coverage.
- The renderer continues to own DOM/grid composition while consuming this deterministic presentation policy.
- Removed the retired `pearson`/`spearman` response fallback. Heatmap now consumes only the named versioned correlation matrices emitted by the backend and presents a contract-neutral unavailable state when a requested matrix is absent.
- Retired persisted `pearson` and `spearman` correlation-setting aliases. Settings now accept only canonical six-mode values and use the normal default-validation path for invalid stored data.
- Extracted matrix selection (including legacy raw-field normalization), metric compatibility guidance, and compact status construction into `matrixPolicy`, giving the renderer a single authoritative metric-data decision seam.
- Extracted responsive grid geometry into `gridLayout`: label width, fit-to-screen versus slider-capped cell size, header orientation, and CSS templates now have direct wide/narrow layout coverage.
- Extracted manual-order validation, clustering fallback, and render-index-to-source-index mapping into `orderingPolicy`; page-level drag-reorder coverage confirms the mutable interaction remains intact.
- Extracted per-cell signed values, color/tone presentation, tooltip text, and interaction affordance into `cellPresentation`, with direct missing/diagonal and interactive negative-correlation coverage.
- Added abort-scoped Heatmap control listeners and retained runtime/resize-observer cleanup across re-initialization. A lazy-visibility regression proves two initializations still issue one request for one metric change.
- Extracted Heatmap load-error classification into `loadErrorPolicy`, making insufficient-numeric-column guidance and generic request-failure status explicit and directly tested.

### Completed: Scatter rendering decomposition

- Extracted normal Scatter series construction into `seriesPolicy`, covering categorical grouping, finite continuous-value binning, palette sampling, and the stable fallback-series contract under direct tests.
- Extracted Scatter tooltip HTML into `tooltipPresentation`, with direct escaping, categorical/continuous color-value, and column-type-aware formatting coverage.
- Extracted Scatter colorbar visibility, density/continuous labels, range values, and bucketed-cardinality copy into `colorbarPresentation`, with direct mode and metadata coverage.
- Reworked Scatter control binding into one abort-scoped page resource. The page retains its disposer and each rebind retires the previous DOM/window listeners, replacing the old global listener-filtering workaround. Direct coverage proves that only the newest binding receives events and disposal detaches it.
- Replaced the density-zoom `globalThis` render callback with `renderScheduler`, a typed one-way bridge from interaction policy to the page-owned fetch/render pipeline. Existing zoom and one-shot view-preservation regressions now verify the explicit contract.
- Moved the selection-box DOM gesture wiring to `selectionZoom`; rendering retains the chart option and view-state policies, while the dedicated module owns pointer capture, box presentation, density-mode minimum-selection rules, and double-click history/reset behavior.
- Consolidated Scatter request policy: `buildScatterOverviewContext` produces the request payload and matching overview cache key together, and `responsePolicy` owns the API-response-to-state mapping. The page and page-change handler no longer maintain duplicate versions of either contract.
- Extracted chart realization into `chartLifecycle`, which owns signature-based container replacement, WebGPU/ECharts fallback selection, chart reuse, selection-zoom attachment, throttled performance updates, and post-update resize. The page pipeline supplies only option construction and presentation callbacks.
- Removed the retired `viewController` duplicate. `page.ts` is the sole Scatter Plot/Matrix controller because it owns the complete filter-snapshot, matrix-to-plot reset, warning, render, and panel-navigation contract.
- Scatter now has one controller, explicit request/response policies, independently owned chart/gesture lifecycles, and no remaining implicit global bridges or stale controller duplicate.
- Mounted the Scatter analysis runtime when the lazy feature loads and made initialization idempotent. The runtime now owns a real page-change listener/disposer rather than being an inert configuration object.
- Bound Scatter exports at the feature initialization boundary as well as through the runtime lifecycle. This covers the lazy-load ordering where the first Scatter page-change event precedes module evaluation; direct coverage proves the PNG export is live on first visit.
- Added explicit runtime disposal for remounting/embedding hosts, releasing the page lifecycle, empty-state actions, and workspace reference. Direct lifecycle coverage verifies one mount only and listener removal on disposal.

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
