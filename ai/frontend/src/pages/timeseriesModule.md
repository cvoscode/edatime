# pages/timeseriesModule.md
> Owns the Timeseries page lifecycle: controller, feature entrypoint, dataset bootstrap, and runtime. Chart constructor loading is now lazy via `ensurePrimaryChartCtor`.

## Interface: `TimeseriesModuleDeps`
```typescript
interface TimeseriesModuleDeps {
    fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    ensurePrimaryChartCtor: () => Promise<new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => ChartInstance>;
    markMetadataReady: () => void;
    sanitizeSelectedColumns: () => void;
    clearLoadedPageModules: () => void;
    ensureSessionPersistenceStarted: () => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
    setNumericCols: (cols: string[]) => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    setViewport: (start: number, end: number) => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => ViewSnapshot;
    fetchAndRenderAnalytics: () => Promise<void>;
    refreshZoomControlsState: () => void;
    zoomOut: () => void;
    chartExportPng?: () => void;
    chartExportSvg?: () => void;
    exportFilteredCsv?: () => void;
    exportFilteredJson?: () => void;
    exportFilteredParquet?: () => void;
}
```

## Returned Interface: `TimeseriesModule`
```typescript
interface TimeseriesModule {
    mount: () => () => void;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    rebuildTimeseriesColumns: () => void;
    clearPersistedFilters: () => void;
    rebuildTimeseriesRanges: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    onZoomRangeChange: (view: ViewSnapshot, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    ensureDatasetReady: () => Promise<void>;
    ensureReady: () => Promise<void>;
    refreshAfterMutation: (options?: { selectedColumn?: string }) => Promise<void>;
}
```

### `ensureReady` vs `ensureDatasetReady`
- `ensureDatasetReady()` hydrates metadata and the dataset UI.
- `ensureReady()` runs the full pipeline: it awaits `ensureDatasetReady()` first, then awaits the chart bootstrap. Anything driving the timeseries page (e.g. page-change handlers, the `__edatime.ensureReady` window alias exposed in `app.ts`) must await this exact dataset-then-chart sequence.

## Internal Sub-units (created in order)

### createTimeseriesPageController
- Creates the page controller holding fetch/render/chart state.
- [deps: [createTimeseriesPageController][1]]

### createTimeseriesEntrypoint
- Creates the timeseries feature with column/range controls and UI rendering.
- [deps: [createTimeseriesEntrypoint][2]]

### createTimeseriesRuntime
- Creates the runtime owning page lifecycle via `createPageRuntime`.
- [deps: [createTimeseriesRuntime][3]]

### createDatasetBootstrap (local factory)
- `storeFetchedMetadata(metadata: DatasetMetadata): void`
  - Stores metadata and revision via `setMetadata` / `setDatasetRevision`.
- `initializeDatasetUi(metadata: DatasetMetadata): Promise<void>`
  - Async. Calls `ensureDatasetUiModules()` to dynamically import `ui/profile.js`, `features/upload/preview.js`, and `features/upload/partialLoadControls.js`. Then dispatches `edatime:workflow-refresh`, sets viewport/zoom via `setViewport` / `updateAnalysisZoom`, and emits `edatime:chart-range-change` with source `initial`. Hydrates column profiles, applies the time range, and builds the chip/range controls.
- `clearPersistedFilters(): void`
  - Clears stored scatter range filters, adaptive line filters, and scatter view snapshots before a dataset mutation refresh.
- The dataset bootstrap is given a no-op `ensureChartModules` because the chart constructor now loads lazily in `createTimeseriesBootstrap`.
- Creates the dataset bootstrap with injected deps from `TimeseriesModuleDeps`.

## State
- `datasetUiReady: boolean` [LOCAL - guards initializeDatasetUi]
- `datasetUiModules: { hydrateColumnProfiles, renderColumnProfilesGrid, setProfileMode, setUploadPreviewStatus, formatUploadRowCount, formatUploadRowCountValue, formatCount, loadedRowCountFromResponse } | null` [memoized after first `ensureDatasetUiModules` call]

## Functions

### createTimeseriesModule
- `createTimeseriesModule(deps: TimeseriesModuleDeps): TimeseriesModule`
  - Creates controller, feature, runtime, and bootstrap. Returns the public interface for column/range controls, render, and lifecycle.

### ensureDatasetUiModules (internal)
- `ensureDatasetUiModules(): Promise<DatasetUiModules>`
  - Lazily loads the dataset UI module bundle. Caches the resolved reference in `datasetUiModules` so subsequent calls are synchronous.

---
[1]: ./timeseriesPage.md#createTimeseriesPageController
[2]: ../features/timeseries/entrypoint.md#createTimeseriesEntrypoint
[3]: ./timeseriesRuntime.md#createTimeseriesRuntime
[4]: ../app/bootstrap/datasetBootstrap.md#createDatasetBootstrap
[5]: ../services/timeseries/filtering.md#sanitizeSelectedColumns
[6]: ../ui/profile.md#hydrateColumnProfiles
