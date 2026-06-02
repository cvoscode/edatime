# ai/frontend/src/app/bootstrap/chartBootstrap.md
> Lazy chart/data module bootstrapper that hydrates shared chart constructors and registers line/fallback chart types once.

## Interface: ChartModules
- `fetchMetadata: (signal?: AbortSignal) => Promise<DatasetMetadata>`
- `fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>`
- `fetchAnomalies: (start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>`
- `postTransform: (expression: string, outputName: string) => Promise<TransformResponse>`
- `DataChartCtor: (new (containerId: string, onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null`

## Interface: BootstrapChartCallbacks
- `onZoom: ((start: number, end: number, sourceKind: string) => void) | null`
- `onYRange: ((min: number, max: number, sourceKind: string) => void) | null`
- `onZoomOut: (() => void) | null`

## State
- `modules: ChartModules | null`
- `pending: Promise<ChartModules> | null`

## Functions
- `ensureChartModules(): Promise<ChartModules>` [deps: [registerChartType][1], [FallbackChart][2]]
  - Lazy-loads API/chart modules, caches them, and registers the line/fallback chart types.
- `getChartModules(): ChartModules | null`
  - Returns the cached chart module set when already loaded.

---
[1]: ../../charts/registry.md#registerChartType
[2]: ../../charts/fallback.md#FallbackChart
