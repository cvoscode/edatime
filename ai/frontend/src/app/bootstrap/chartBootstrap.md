# ai/frontend/src/app/bootstrap/chartBootstrap.md
> Lazy bootstrap for API transport and chart constructors. Loads the shared API client on demand and registers the line/fallback chart adapters when the chart chunk is needed.

## Interface: DataModules
- `fetchMetadata: (signal?: AbortSignal) => Promise<DatasetMetadata>`
- `fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>`
- `fetchAnomalies: (start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>`
- `postTransform: (expression: string, outputName: string) => Promise<TransformResponse>`

## Interface: ChartModules
- `fetchMetadata: (signal?: AbortSignal) => Promise<DatasetMetadata>` [deps: [DataModules][1]]
- `fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>` [deps: [DataModules][1]]
- `fetchAnomalies: (start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>` [deps: [DataModules][1]]
- `postTransform: (expression: string, outputName: string) => Promise<TransformResponse>` [deps: [DataModules][1]]
- `DataChartCtor: (new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null`

## Interface: BootstrapChartCallbacks
- `onZoom: ((view: ViewSnapshot, sourceKind: string) => void) | null`
- `onYRange: ((min: number, max: number, sourceKind: string) => void) | null`
- `onZoomOut: (() => void) | null`

## State
- `dataModules: DataModules | null`
- `dataPending: Promise<DataModules> | null`
- `modules: ChartModules | null`
- `pending: Promise<ChartModules> | null`

## Functions
- `ensureDataModules(): Promise<DataModules>`
  - Lazy-loads the shared API transport once and caches the result.
- `ensureChartModules(): Promise<ChartModules>` [deps: [registerChartType][2], [FallbackChart][3], [ensureDataModules][4]]
  - Lazy-loads API/chart modules, reuses the cached data transport, and registers the line/fallback chart types.
- `getChartModules(): ChartModules | null`
  - Returns the cached chart module set when already loaded.

---
[1]: ../../services/api/index.md
[2]: ../../charts/registry.md#registerChartType
[3]: ../../charts/fallback.md#FallbackChart
[4]: #ensureDataModules
