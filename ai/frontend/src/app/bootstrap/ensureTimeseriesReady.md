# ai/frontend/src/app/bootstrap/ensureTimeseriesReady.md
> Coordinate chart bootstrap and timeseries page init. Extracted from app.ts so the orchestrator stays thin. Wires the chart with `ViewSnapshot`-shaped zoom callbacks.

## Interface: ViewSnapshot (re-used from types)
- `{ xMin: number; xMax: number; yMin: number | null; yMax: number | null }`

## Interface: TimeseriesBootstrapCallbacks
```ts
interface TimeseriesBootstrapCallbacks {
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
}
```

## Interface: TimeseriesBootstrapDeps
```ts
interface TimeseriesBootstrapDeps {
    DataChartCtor: new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => ChartInstance;
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    refreshZoomControlsState: () => void;
}
```

## Functions

### createTimeseriesBootstrap
- `createTimeseriesBootstrap(deps: TimeseriesBootstrapDeps)` [deps: [setChartInstance][1], [checkWebGPU][2]]
  - Returns `{ ensureReady(): Promise<void>, isReady(): boolean }`.
  - `ensureReady()` is idempotent: creates primary or fallback chart, binds events, inits adaptive filter gesture, wires annotation/anomaly overlay callbacks, sets X range, renders data, fetches analytics, and restores session — called exactly once.
  - `isReady()` returns whether bootstrap has completed.

## Notes
- The zoom callback contract changed: it now receives a `ViewSnapshot` (`{ xMin, xMax, yMin, yMax }`) instead of two numeric `start`/`end` arguments. The chart-side zoom handler wraps `(start, end, sourceKind)` into `{ xMin: start, xMax: end, yMin: null, yMax: null }` and forwards to `deps.onZoom`.
- `onYRange` and `onZoomOut` retain their original numeric / void signatures.

---
[1]: ../../../store/index.md#setChartInstance
[2]: ../../webgpuGuard.md#checkWebGPU
