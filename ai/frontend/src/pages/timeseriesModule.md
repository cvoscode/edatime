# pages/timeseriesModule.md
> Owns the Timeseries page lifecycle: controller, feature entrypoint, dataset bootstrap, and runtime.

## Interface: `TimeseriesModuleDeps`
```typescript
interface TimeseriesModuleDeps {
    fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>;
    fetchMetadata: () => Promise<DatasetMetadata>; // [NEW]
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    markMetadataReady: () => void; // [NEW]
    sanitizeSelectedColumns: () => void; // [NEW]
    clearLoadedPageModules: () => void; // [NEW]
    ensureSessionPersistenceStarted: () => void; // [NEW]
    getSelectedCols: () => string[]; // [NEW]
    setSelectedCols: (cols: string[]) => void; // [NEW]
    setNumericCols: (cols: string[]) => void; // [NEW]
    setAdaptiveFilterColumn: (col: string | null) => void; // [NEW]
    setViewport: (start: number, end: number) => void; // [NEW]
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => { start: number; end: number };
    emitChartRangeChange: (sourceKind?: string) => void;
}
```

## Returned Interface: `TimeseriesModule`
```typescript
interface TimeseriesModule {
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    rebuildTimeseriesColumns: () => void;
    rebuildTimeseriesRanges: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    onZoomRangeChange: (newStart: number, newEnd: number, sourceKind?: string) => void;
    refreshAfterMutation: (options?: { selectedColumn?: string }) => Promise<void>;
}
```

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
- `initializeDatasetUi(metadata: DatasetMetadata): void`
  - Initializes feature, column profiles, viewport, and zoom from metadata. Called exactly once.
- Creates the dataset bootstrap with injected deps from `TimeseriesModuleDeps`.

## State
- `datasetUiReady: boolean` [LOCAL - guards initializeDatasetUi]

## Functions

### createTimeseriesModule
- `createTimeseriesModule(deps: TimeseriesModuleDeps): TimeseriesModule`
  - Creates controller, feature, runtime, and bootstrap. Returns public interface for column/range controls, render, and lifecycle.

---
[1]: ./timeseriesPage.md#createTimeseriesPageController
[2]: ../features/timeseries/entrypoint.md#createTimeseriesEntrypoint
[3]: ./timeseriesRuntime.md#createTimeseriesRuntime
[4]: ../app/bootstrap/datasetBootstrap.md#createDatasetBootstrap
[5]: ../services/timeseries/filtering.md#sanitizeSelectedColumns
[6]: ../ui/profile.md#hydrateColumnProfiles