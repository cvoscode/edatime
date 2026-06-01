# ai/frontend/src/app.md
> Bootstraps the frontend runtime, Timeseries controller, dataset lifecycle, lazy page modules, and global shortcuts.

## State
- `_appCleanups: Array<() => void>`
- `runtime: ReturnType<typeof createAppRuntime>`
- `timeseriesFeature: ReturnType<typeof createTimeseriesEntrypoint> | null`
- `_timeseriesReady: boolean`
- `_timeseriesReadyPromise: Promise<void> | null`
- `_sessionPersistenceStarted: boolean`
- `fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null`
- `fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null`
- `fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null`
- `postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null`
- `DataChartCtor: (new (containerId: string, onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null`
- `_datasetReadyPromise: Promise<void> | null`
- `_datasetUiReady: boolean`

## Functions
- `rebuildTimeseriesColumns(): void`
  - Rebuilds Timeseries column chips through the feature entrypoint.
- `rebuildTimeseriesRanges(): void`
  - Rebuilds Timeseries range chips through the feature entrypoint.
- `renderTimeseries(): void`
  - Delegates to the Timeseries page controller's current render pass.
- `renderCurrentData(): void`
  - Delegates to the Timeseries page controller's current render pass.
- `emitChartRangeChange(sourceKind?: string): void`
  - Re-emits the chart-range change via the Timeseries page controller.
- `fetchAndRender(): Promise<void>` [deps: [createTimeseriesPageController][1]]
  - Ensures the Timeseries chart is ready, then fetches and renders the current range.
- `onZoomRangeChange(newStart: number, newEnd: number, sourceKind?: string): void` [deps: [createTimeseriesPageController][1]]
  - Delegates zoom-range updates to the Timeseries page controller.
- `ensureSessionPersistenceStarted(): void`
  - Starts session persistence once.
- `ensureTimeseriesReady(): Promise<void>` [deps: [checkWebGPU][2], [initAdaptiveFilterGesture][3], [restoreSessionAfterChartReady][4]]
  - Lazily initializes the primary or fallback chart runtime, overlays, and first Timeseries fetch.
- `emitAdaptiveFiltersChange(): void`
  - Broadcasts the current adaptive-filter count.
- `isTypingTarget(target: EventTarget | null): boolean`
  - Detects whether keyboard shortcuts should ignore the current target.
- `currentPageName(): string`
  - Returns the visible page name from the DOM.
- `showPage(pageName: string): void`
  - Navigates by clicking the matching sidebar item.
- `initKeyboardShortcuts(): void`
  - Binds global Alt/Shift navigation and export shortcuts once.
- `setComputeLoading(btnId: string, overlayId: string, loading: boolean, label?: string): void`
  - Syncs a compute button and loading overlay.
- `ensureChartModules(): Promise<void>` [deps: [fetchMetadata][5], [fetchData][5]]
  - Lazy-loads API and chart modules, then registers line and fallback chart types.
- `fetchAndRenderAnalytics(): Promise<void>` [deps: [fetchAnomalyRegions][6]]
  - Refreshes analytics overlays for the current Timeseries view.
- `storeFetchedMetadata(metadata: DatasetMetadata): void`
  - Stores dataset metadata and revision in shared state.
- `initializeDatasetUi(metadata: DatasetMetadata): void` [deps: [createTimeseriesEntrypoint][7], [buildMetaBar][8]]
  - Initializes dataset-driven Timeseries UI, profile UI, and viewport state after metadata loads.
- `ensureDatasetReady(_pageName?: string): Promise<void>`
  - Fetches metadata once, derives default Timeseries selections, and initializes dataset UI.
- `refreshDatasetAfterMutation(options?: { selectedColumn?: string }): Promise<void>`
  - Reloads metadata and rerenders Timeseries after a transform or outlier mutation.
- `init(): Promise<void>` [deps: [initAppShell][9], [loadEntrypoints][10]]
  - Creates the Timeseries feature/runtime graph, loads page entrypoints, and performs first-page bootstrap.

---
[1]: ./pages/timeseriesPage.md#createTimeseriesPageController
[2]: ./app/webgpuGuard.md#checkWebGPU
[3]: ./app/adaptiveGesture.md#initAdaptiveFilterGesture
[4]: ./bootstrap/sessionBootstrap.md#restoreSessionAfterChartReady
[5]: ./services/api/index.md
[6]: ./bootstrap/analyticsOverlay.md#fetchAnomalyRegions
[7]: ./features/timeseries/entrypoint.md#createTimeseriesEntrypoint
[8]: ./ui/metaBar.md#buildMetaBar
[9]: ./app/shell.md#initAppShell
[10]: ./app/pageModules.md#loadEntrypoints
