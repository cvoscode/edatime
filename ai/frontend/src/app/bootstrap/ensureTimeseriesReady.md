# ai/frontend/src/app/bootstrap/ensureTimeseriesReady.md
> Coordinate chart bootstrap and timeseries page init. Extracted from app.ts so the orchestrator stays thin.

## Interface: TimeseriesBootstrapDeps
```ts
interface TimeseriesBootstrapDeps {
    appState: any;
    createChart: () => Promise<ChartInstance>;
    bindAnalysisChartEvents: () => void;
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
}
```

## Functions
- `createTimeseriesBootstrap(deps: TimeseriesBootstrapDeps)` [deps: [createChart][1]]
  - Returns an object with `ensureReady(): Promise<void>` (idempotent init) and `isReady(): boolean`.
  - `ensureReady()` creates the chart, binds events, fetches data, and renders — called exactly once.

---
[1]: ../../chart/DataChart.md#createChart