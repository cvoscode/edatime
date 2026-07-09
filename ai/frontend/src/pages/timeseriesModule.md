# ai/frontend/src/pages/timeseriesModule.md
> Owns the timeseries page lifecycle: controller, feature entrypoint, dataset bootstrap, and runtime. Chart constructor loading is lazy via `ensurePrimaryChartCtor`.

## Interface `TimeseriesModuleDeps`
- `fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, lookaroundMs?: number, signal?: AbortSignal) => Promise<DataObject>`
- `fetchMetadata: () => Promise<DatasetMetadata>`
- `ensurePrimaryChartCtor: () => Promise<new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance>`
- `markMetadataReady: () => void`
- `sanitizeSelectedColumns: () => void`
- `clearLoadedPageModules: () => void`
- `ensureSessionPersistenceStarted: () => void`
- `getSelectedCols: () => string[]`
- `setSelectedCols: (cols: string[]) => void`
- `setNumericCols: (cols: string[]) => void`
- `setAdaptiveFilterColumn: (col: string | null) => void`
- `setViewport: (start: number, end: number) => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void`
- `getCurrentView: () => ViewSnapshot`
- `fetchAndRenderAnalytics: () => Promise<void>`
- `refreshZoomControlsState: () => void`
- `chartExportPng?: () => void`
- `chartExportSvg?: () => void`
- `exportFilteredCsv?: () => void`
- `exportFilteredJson?: () => void`
- `exportFilteredParquet?: () => void`

## Returned interface `TimeseriesModule`
- `mount: () => () => void`
- `buildColumnToggles: () => void`
- `buildRangeControls: () => void`
- `rebuildTimeseriesColumns: () => void`
- `clearPersistedFilters: () => void`
- `rebuildTimeseriesRanges: () => void`
- `renderCurrentData: () => void`
- `fetchAndRender: () => Promise<void>`
- `onZoomRangeChange: (view: ViewSnapshot, sourceKind?: string) => void`
- `emitChartRangeChange: (sourceKind?: string) => void`
- `zoomOut: () => void`
- `resetZoom: () => void`
- `ensureDatasetReady: () => Promise<void>`
- `ensureReady: () => Promise<void>`
- `refreshAfterMutation: (options?: { selectedColumn?: string }) => Promise<void>`

## Functions
- `createTimeseriesModule(deps: TimeseriesModuleDeps): TimeseriesModule`
