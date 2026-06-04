# app/bootstrap/datasetBootstrap.md
> Manages dataset readiness: fetching metadata, populating store, initializing UI, and refreshing after mutations.

## Interface: `DatasetBootstrapDeps`
```typescript
interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    storeFetchedMetadata: (metadata: DatasetMetadata) => void; // [NEW]
    markMetadataReady: () => void; // [NEW]
    initializeDatasetUi: (metadata: DatasetMetadata) => void; // [NEW]
    setNumericCols: (cols: string[]) => void;
    setDefaultSelectedColumns: (cols: string[]) => void;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    clearLoadedPageModules: () => void;
    getNumericColumns: (metadata: DatasetMetadata) => string[];
    getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => string[];
    rebuildTimeseriesColumns: () => void;
    buildMetaBar: (metadata: DatasetMetadata) => void;
    timeseriesFeatureInit: () => void;
    ensureSessionPersistenceStarted: () => void;
    setViewport: (start: number, end: number) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    setMetaText: (text: string) => void; // [NEW]
    emitWorkflowRefresh: () => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
}
```

## BootstrapResult
```typescript
interface BootstrapResult {
    ensureDatasetReady: () => Promise<void>;
    refreshAfterMutation: (options?: { selectedColumn?: string }) => Promise<void>;
}
```

## State
- `_datasetReadyPromise: Promise<void> | null` [MOVED from app.ts]
- `_datasetUiReady: boolean` [MOVED from app.ts, now local to bootstrap]

## Functions

### createDatasetBootstrap
- `createDatasetBootstrap(deps: DatasetBootstrapDeps): BootstrapResult`
  - Factory that returns `ensureDatasetReady` and `refreshAfterMutation` closures.

### ensureDatasetReady
- `(): Promise<void>`
  - Fetches metadata once, stores it, marks metadata ready, derives numeric columns, sanitizes selections, initializes dataset UI, and sets initial viewport/zoom.

### refreshAfterMutation
- `(options?: { selectedColumn?: string }): Promise<void>`
  - Clears page modules, re-fetches metadata, re-derives numeric columns, optionally selects a specific column, and triggers visible data refresh.

---
[1]: ../../pages/timeseriesModule.md#createTimeseriesModule
[2]: ../pageRegistry.md#isMetadataReady
[3]: ../../store/index.md#setMetadata
[4]: ../../ui/profile.md#hydrateColumnProfiles
[5]: ../../ui/metaBar.md#buildMetaBar