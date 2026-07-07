# ai/frontend/src/app/bootstrap/chartBootstrap.md
> Lazy bootstrap for API transport and chart constructors; loads the shared API client on demand and registers the line/fallback chart adapters when the chart chunk is needed.

## Interface `DataModules`
- `fetchMetadata: (signal?: AbortSignal) => Promise<DatasetMetadata>`
- `fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, lookaroundMs?: number, signal?: AbortSignal) => Promise<DataObject>`
- `fetchAnomalies: (start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>`
- `postTransform: (expression: string, outputName: string) => Promise<TransformResponse>`

## Interface `ChartModules extends DataModules`
- `DataChartCtor: (new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null`

## Interface `BootstrapChartCallbacks`
- `onZoom: ((view: ViewSnapshot, sourceKind: string) => void) | null`
- `onYRange: ((min: number, max: number, sourceKind: string) => void) | null`
- `onZoomOut: (() => void) | null`

## Functions
- `ensureDataModules(): Promise<DataModules>`
  - Lazy-loads the shared API transport once and caches the result.
- `ensureChartModules(): Promise<ChartModules>`
  - Lazy-loads the chart module, reuses the cached data transport, and registers the `line` and `fallback` chart adapters.
- `getChartModules(): ChartModules | null`
