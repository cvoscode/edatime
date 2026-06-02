# ai/frontend/src/drift/runtime.md
> Drift page runtime owner for empty-state delegation, cached ECharts loading, request-task creation, and drift export helpers.

## Interface: DriftComputeTaskOptions
- `setLoading: (loading: boolean) => void`
- `onError: (message: string) => void`
- `statusEl?: HTMLElement | null`
- `emptyStateEl?: HTMLElement | null`

## State
- `driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`
- `driftPageCleanup: (() => void) | null`
- `_syncDriftEmptyState: (show: boolean, message?: string) => void`
- `_echartsModule: typeof import('echarts') | null`

## Functions
- `syncDriftEmptyState(show: boolean, message?: string): void`
  - Forwards drift empty-state updates through the current runtime-owned callback.
- `setSyncDriftEmptyState(fn: (show: boolean, message?: string) => void): void`
  - Replaces the runtime-owned drift empty-state callback.
- `getECharts(): Promise<typeof import('echarts')>`
  - Returns the cached ECharts module, loading it on first use.
- `getEChartsModule(): typeof import('echarts') | null`
  - Returns the cached ECharts module without loading.
- `_setEchartsModule(m: typeof import('echarts') | null): void`
  - Test hook that resets or overrides the cached ECharts module.
- `createDriftComputeTask(options: DriftComputeTaskOptions): ReturnType<typeof createRequestTask>` [deps: [createRequestTask][1]]
  - Creates the shared abortable drift compute task wrapper.
- `exportDriftCsv(responsesByColumn: Map<string, unknown>): void`
  - Exports all drift responses as CSV.
- `exportDriftJson(responsesByColumn: Map<string, unknown>): void`
  - Exports all drift responses as JSON.
- `exportTimelinePNG(timelineChart: { getDataURL?: (opts?: Record<string, unknown>) => string } | null, activeDetailColumn: string | null): void`
  - Exports the timeline chart as PNG when present.
- `exportDetailPNG(detailChart: { getDataURL?: (opts?: Record<string, unknown>) => string } | null, activeDetailColumn: string | null): void`
  - Exports the detail chart as PNG when present.
- `getDriftRuntime(): ReturnType<typeof createAnalysisPageRuntime> | null`
  - Returns the active drift runtime handle.

---
[1]: ../pages/shared/requestTask.md#createRequestTask
