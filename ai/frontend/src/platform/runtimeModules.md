# frontend/src/platform/runtimeModules.ts
> Lazy shared transport and chart module loader. Keeps application composition free of direct API / chart imports while preserving one idempotent runtime-module cache.

## Interfaces
- `DataModules`
  - `fetchMetadata(options?): Promise<DatasetMetadata>`
  - `fetchData(start, end, width, columns?, colorColumn?, lookaroundMs?, options?): Promise<DataObject>`
  - `fetchAnomalies(start, end, columns, method?, threshold?, options?): Promise<AnomalyResponse>`
- `ChartModules extends DataModules`
  - `DataChartCtor: (new (containerId, onZoomCb, onYRangeCb, onZoomOutCb) => ChartInstance) | null`
- `BootstrapChartCallbacks`
  - `onZoom`, `onYRange`, `onZoomOut`

## Functions
- `ensureDataModules(): Promise<DataModules>` — idempotent dynamic import of `../services/api/index.js`.
- `ensureChartModules(): Promise<ChartModules>` — idempotent: combines `ensureDataModules()` with dynamic import of `../chart/DataChart.js`, and registers `'line'` and `'fallback'` chart types on `charts/registry.ts`.
- `getChartModules(): ChartModules | null` — returns the resolved module bundle without forcing a load.