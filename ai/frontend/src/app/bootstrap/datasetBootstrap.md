# app/bootstrap/datasetBootstrap.md
> Manages dataset readiness, metadata refresh, and post-mutation UI rehydration. Coordinates: chart modules → metadata fetch → store → mark ready → column setup → UI hydration. Dispatches `edatime:metadata-ready` on both bootstrap and refresh, and `edatime:dataset-changed` after mutation refresh.

## Interface: `DatasetBootstrapDeps`
```typescript
interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    markMetadataReady: () => void;
    clearLoadedPageModules: () => void;
    storeFetchedMetadata: (metadata: DatasetMetadata) => void;
    initializeDatasetUi: (metadata: DatasetMetadata) => Promise<void>;
    setNumericCols: (cols: string[]) => void;
    setDefaultSelectedColumns: (cols: string[]) => void;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    getNumericColumns: (metadata: DatasetMetadata) => string[];
    getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => string[];
    rebuildTimeseriesColumns: () => void;
    clearPersistedFilters: () => void;
    onMetadataReady?: () => void;
    emitWorkflowRefresh?: () => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
    timeseriesFeatureInit?: () => void;
    ensureSessionPersistenceStarted?: () => void;
    setViewport: (start: number, end: number) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
}
```

## BootstrapResult
```typescript
interface BootstrapResult {
    ensureDatasetReady(): Promise<void>;
    refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void>;
}
```

## State
- `_datasetReadyPromise: Promise<void> | null` — module-level deduplication of in-flight readiness.

## Functions

### createDatasetBootstrap
- `createDatasetBootstrap(deps: DatasetBootstrapDeps): BootstrapResult`
  - Factory that returns `ensureDatasetReady` and `refreshAfterMutation` closures.

### ensureDatasetReady
- `(): Promise<void>`
  - Idempotent. Captures the dataset request scope, awaits `ensureChartModules`, fetches metadata, asserts scope is still active, calls `storeFetchedMetadata` and `markMetadataReady`, dispatches `edatime:metadata-ready`, and (if `metadata.time_range` is set) calls `syncDatasetSelection` and `await initializeDatasetUi`. Concurrent callers share the same promise. On error, the in-flight promise is cleared so the next caller retries.

### refreshAfterMutation
- `(options?: { selectedColumn?: string }): Promise<void>`
  - Invalidates the dataset request scope and clears `_datasetReadyPromise`. If metadata is not yet ready, delegates to `ensureDatasetReady`. Otherwise clears loaded page modules and persisted filters, re-fetches metadata, stores it, calls `markMetadataReady`, dispatches `edatime:metadata-ready`, dispatches `edatime:dataset-changed` with `{ previousRevision, nextRevision }`, then runs `syncDatasetSelection`, `await initializeDatasetUi`, `rebuildTimeseriesColumns`, and `await refreshVisibleData`.

### syncDatasetSelection
- `(metadata: DatasetMetadata, selectedColumn?: string): void`
  - Sets numeric columns, ensures a default selected column set is present, optionally adds a specific column, sanitizes, falls back to defaults if empty, and sets the adaptive filter target.

## Notes
- The dataset request-scope helpers (`captureDatasetRequestScope`, `assertDatasetRequestScopeActive`, `invalidateDatasetRequestScope`) live in [services/api/datasetRequestScope][1] and are re-exported from [services/api/http][2].
- `initializeDatasetUi` returns `Promise<void>` (tightened from the prior `void | Promise<void>`) so the bootstrap pipeline can `await` it.

---
[1]: ../../services/api/datasetRequestScope.md
[2]: ../../services/api/http.md
[3]: ../../pages/timeseriesModule.md#createTimeseriesModule
[4]: ../pageRegistry.md#isMetadataReady
[5]: ../../store/index.md#setMetadata
[6]: ../../ui/profile.md#hydrateColumnProfiles
