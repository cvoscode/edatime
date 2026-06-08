# ai/frontend/src/scatter/runtime.md
> Scatter page runtime owner for analysis-page lifecycle, empty-state policy, filter badge updates, and WebGPU availability checks.

## State
- `scatterRuntime: ReturnType<typeof createAnalysisPageRuntime> | null`
- `scatterEmptyStateController: ReturnType<typeof createEmptyStateController> | null`
- `_gpuUnavailable: boolean | null`

## Functions
- `getScatterEmptyStateController(): ReturnType<typeof createEmptyStateController>` [deps: [createEmptyStateController][1]]
  - Lazily creates the scatter empty-state controller.
- `isGPUAvailable(): Promise<boolean>`
  - Probes WebGPU support once and caches the result. Uses static imports from [../utils/platform.js](../utils/platform.md).
- `getGpuUnavailable(): boolean | null`
  - Returns the cached GPU-unavailable flag.
- `setGpuUnavailable(val: boolean): void`
  - Overrides the cached GPU-unavailable flag.
- `syncScatterEmptyState(message?: string): void`
  - Recomputes scatter empty-state visibility and messaging from the current scatter/page state. Uses `getDropdownValue('scatter-x-col')` and `getDropdownValue('scatter-y-col')` for axis readiness check.
- `syncScatterFilterBadge(): void`
  - Updates the active filter badge element (`scatter-active-filter-badge`). Shows column count and names when filters are active.
- `initScatterPageRuntime(): void` [deps: [createAnalysisPageRuntime][2]]
  - Bootstraps the scatter analysis-page runtime and deferred export binding.
- `getScatterRuntime(): ReturnType<typeof createAnalysisPageRuntime> | null`
  - Returns the active scatter runtime handle.

---
[1]: ../ui/emptyState.md#createEmptyStateController
[2]: ../pages/shared/analysisPageRuntime.md#createAnalysisPageRuntime
