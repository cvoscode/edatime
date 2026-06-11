# ai/frontend/src/app.md
> Bootstraps the frontend runtime, Timeseries controller, dataset lifecycle, lazy page modules, and global shortcuts.

## State
- `_appCleanups: Array<() => void>`
- `runtime: ReturnType<typeof createAppRuntime>`
- `timeseriesFeature: ReturnType<typeof createTimeseriesEntrypoint> | null`
- `uploadFeature: ReturnType<typeof createUploadEntrypoint> | null`
- `_timeseriesReady: boolean`
- `_timeseriesReadyPromise: Promise<void> | null`
- `_sessionPersistenceStarted: boolean` [NEW]
- `_timeseriesBootstrap: { ensureReady: () => Promise<void>; isReady: () => boolean } | null`
- `_datasetReadyPromise: Promise<void> | null`
- `_datasetUiReady: boolean`
- `fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null`
- `fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null`
- `fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null`
- `postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null`
- `DataChartCtor: (new (containerId: string, onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) => void) => ChartInstance) | null`
- `timeseriesModule: { buildColumnToggles, buildRangeControls, ... }` [NEW]

## Imports (selected)
- `sanitizeSelectedColumns` from `./services/timeseries/filtering.js` [NEW]
- `ensurePageModuleLoaded, clearLoadedPageModules, markMetadataReady` from `./app/pageRegistry.js` [MODIFIED]
- `startSessionPersistence` from `./bootstrap/sessionBootstrap.js` [NEW]

## Functions

### rebuildTimeseriesColumns / rebuildTimeseriesRanges
- `rebuildTimeseriesColumns(): void`
  - Delegates to `timeseriesFeature?.rebuildColumns()`.
- `rebuildTimeseriesRanges(): void`
  - Delegates to `timeseriesFeature?.buildRangeControls()`.

### renderTimeseries / renderCurrentData / emitChartRangeChange
- `renderTimeseries(): void`
  - Alias for `timeseriesPage.renderCurrentData()`.
- `renderCurrentData(): void`
  - Alias for `timeseriesPage.renderCurrentData()`.
- `emitChartRangeChange(sourceKind?: string): void`
  - Alias for `timeseriesPage.emitChartRangeChange(sourceKind)`.

### fetchAndRender / onZoomRangeChange
- `fetchAndRender(): Promise<void>` [deps: [createTimeseriesPageController][1]]
  - Ensures timeseries bootstrap is ready, then delegates to `timeseriesPage.fetchAndRender()`.
- `onZoomRangeChange(view: ViewSnapshot, sourceKind?: string): void` [deps: [createTimeseriesPageController][1]]
  - Delegates zoom-range updates to the Timeseries page controller. The `view` argument is a `ViewSnapshot` (`{ xMin, xMax, yMin, yMax }`).

### __edatime window surface
- `__edatime.ensureDatasetReady(): Promise<void>` — `timeseriesModule.ensureDatasetReady()`.
- `__edatime.ensureReady(): Promise<void>` — `timeseriesModule.ensureReady()` (dataset + chart bootstrap in order). Distinct from `ensureDatasetReady`.
- `__edatime.runAnalytics(): Promise<void>` — `fetchAndRenderAnalytics()`.

### ensureSessionPersistenceStarted
- `ensureSessionPersistenceStarted(): void`
  - Starts session persistence once (guards against double-call). Delegates to `startSessionPersistence()`.

### ensureTimeseriesReady
- `ensureTimeseriesReady(): Promise<void>`
  - Delegates to `_timeseriesBootstrap?.ensureReady()`.

### createTimeseriesModule (factory)
- `createTimeseriesModule(deps: TimeseriesModuleDeps): TimeseriesModule`
  - Creates the Timeseries module with a dependency-injected interface covering viewport, selection, column state, and lifecycle hooks.

### init
- `init(): Promise<void>` [deps: [initAppShell][4], [loadEntrypoints][5], [initGlobalShortcuts][6], [initTimeseriesShortcuts][7], [createTimeseriesModule][8]]
  - Creates the Timeseries module with full dependency injection, initializes app shell with analytics listeners, loads page entrypoints, and performs first-page bootstrap.

---
[1]: ./pages/timeseriesPage.md#createTimeseriesPageController
[2]: ./features/timeseries/entrypoint.md#createTimeseriesEntrypoint
[3]: ./ui/metaBar.md#buildMetaBar
[4]: ./app/shell.md#initAppShell
[5]: ./app/pageModules.md#loadEntrypoints
[6]: ./app/bootstrap/globalShortcuts.md#initGlobalShortcuts
[7]: ./app/bootstrap/timeseriesShortcuts.md#initTimeseriesShortcuts
[8]: ./pages/timeseriesModule.md#createTimeseriesModule
[9]: ./services/timeseries/filtering.md#sanitizeSelectedColumns
[10]: ./app/pageRegistry.md#markMetadataReady
[11]: ./app/pageRegistry.md#clearLoadedPageModules