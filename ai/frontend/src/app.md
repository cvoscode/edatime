# ai/frontend/src/app.md
> Bootstraps the frontend runtime, Timeseries controller, dataset lifecycle, lazy page modules, and global shortcuts.

## State
- `_appCleanups: Array<() => void>`
- `runtime: ReturnType<typeof createAppRuntime>`
- `timeseriesFeature: ReturnType<typeof createTimeseriesEntrypoint> | null`
- `uploadFeature: ReturnType<typeof createUploadEntrypoint> | null`
- `_timeseriesReady: boolean`
- `_timeseriesReadyPromise: Promise<void> | null`
- `_sessionPersistenceStarted: boolean`
- `_timeseriesBootstrap: { ensureReady: () => Promise<void>; isReady: () => boolean } | null`
- `_datasetReadyPromise: Promise<void> | null`
- `_datasetUiReady: boolean`
- `fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null`
- `fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null`
- `fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null`
- `postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null`
- `DataChartCtor: (new (containerId: string, onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null`

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
- `onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void` [deps: [createTimeseriesPageController][1]]
  - Delegates zoom-range updates to the Timeseries page controller.

### ensureSessionPersistenceStarted
- `ensureSessionPersistenceStarted(): void`
  - Starts session persistence once (guards against double-call).

### ensureTimeseriesReady
- `ensureTimeseriesReady(): Promise<void>`
  - Delegates to `_timeseriesBootstrap?.ensureReady()`.

### storeFetchedMetadata / initializeDatasetUi
- `storeFetchedMetadata(metadata: DatasetMetadata): void`
  - Stores metadata and revision in shared state via `setMetadata` / `setDatasetRevision`.
- `initializeDatasetUi(metadata: DatasetMetadata): void` [deps: [createTimeseriesEntrypoint][2], [buildMetaBar][3]]
  - Initializes timeseries/upload feature, column profiles, viewport, and analysis zoom from metadata. Called exactly once.

### ensureDatasetReady
- `ensureDatasetReady(_pageName?: string): Promise<void>`
  - Fetches metadata once, derives default timeseries selections, and calls `initializeDatasetUi`.

### refreshDatasetAfterMutation
- `refreshDatasetAfterMutation(options?: { selectedColumn?: string }): Promise<void>`
  - Reloads metadata, rerenders column profiles, and triggers timeseries fetch after a transform or outlier mutation.

### init
- `init(): Promise<void>` [deps: [initAppShell][4], [loadEntrypoints][5], [initGlobalShortcuts][6], [initTimeseriesShortcuts][7]]
  - Creates the Timeseries feature/runtime graph, initializes app shell with analytics listeners, loads page entrypoints, and performs first-page bootstrap.

---
[1]: ./pages/timeseriesPage.md#createTimeseriesPageController
[2]: ./features/timeseries/entrypoint.md#createTimeseriesEntrypoint
[3]: ./ui/metaBar.md#buildMetaBar
[4]: ./app/shell.md#initAppShell
[5]: ./app/pageModules.md#loadEntrypoints
[6]: ./app/bootstrap/globalShortcuts.md#initGlobalShortcuts
[7]: ./app/bootstrap/timeseriesShortcuts.md#initTimeseriesShortcuts