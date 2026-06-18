# ai/frontend/src/app/bootstrap/ensureTimeseriesReady.md
> Coordinates chart bootstrap and timeseries page init. The chart constructor is fetched lazily via `ensurePrimaryChartCtor`, so the timeseries page can boot without eagerly importing `DataChart`.

## Interface: TimeseriesBootstrapCallbacks
- `onZoom: (view: ViewSnapshot, sourceKind: string) => void`
- `onYRange: (min: number, max: number, sourceKind: string) => void`
- `onZoomOut: () => void`

## Interface: TimeseriesBootstrapDeps
- `ensurePrimaryChartCtor: () => Promise<new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance>`
- `onZoom: (view: ViewSnapshot, sourceKind: string) => void`
- `onYRange: (min: number, max: number, sourceKind: string) => void`
- `onZoomOut: () => void`
- `buildColumnToggles: () => void`
- `buildRangeControls: () => void`
- `renderCurrentData: () => void`
- `fetchAndRender: () => Promise<void>`
- `refreshZoomControlsState: () => void`

## Functions
- `createTimeseriesBootstrap(deps: TimeseriesBootstrapDeps)` [deps: [setChartInstance][1], [checkWebGPU][2], [getChartType][3], [FallbackChart][4]]
  - Returns `{ ensureReady(): Promise<void>, isReady(): boolean }`.
  - `ensureReady()` is idempotent: it reuses an existing chart, prefers a registered `line` chart adapter when available, otherwise awaits `ensurePrimaryChartCtor()` and instantiates `DataChart` directly. On GPU failure it falls back to the registered `fallback` chart adapter or `FallbackChart`, binds events, wires adaptive gestures and overlays, restores the session, and marks the bootstrap complete.
  - `isReady()` reports whether the bootstrap has completed.

---
[1]: ../../../store/index.md#setChartInstance
[2]: ../../webgpuGuard.md#checkWebGPU
[3]: ../../../charts/registry.md#getChartType
[4]: ../../../charts/fallback.md#FallbackChart
