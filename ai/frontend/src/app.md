# frontend/src/app.ts
> Main bootstrapping — orchestrates app shell, chart, pages, analytics overlays.

## Key Functions

### `setComputeLoading(btnId, overlayId, loading, label?): void`
- Set a compute button + loading overlay into loading or idle state.

### Internal bootstrap
- `ensureChartModules(): Promise<void>` — lazy-loads data client and DataChart
- `checkWebGPU(): Promise<string | null>` — checks WebGPU availability
- `showFatalError(message: string): void`
- `fetchAndRenderAnalytics(): Promise<void>`
- `ensureTimeseriesReady(): Promise<void>`
- `ensureDatasetReady(pageName?): Promise<void>`
- `refreshDatasetAfterMutation(options?): Promise<void>`
- `init(): Promise<void>` — main entry point

### Page controller factory
- `createTimeseriesPageController(deps)` — creates timeseries page controller