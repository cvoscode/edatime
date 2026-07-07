# ai/frontend/src/scatter/runtime.md
> Owns scatter empty-state messaging, inherited-filter UI, export/runtime bootstrap, and cached WebGPU availability.

## Functions
- `getScatterEmptyStateController(): ReturnType<typeof createEmptyStateController>`
  - Lazily creates the scatter empty-state controller.
- `isGPUAvailable(): Promise<boolean>`
  - Probes `navigator.gpu` once via `requestGpuAdapter()` and caches the result.
- `getGpuUnavailable(): boolean | null`
- `setGpuUnavailable(val: boolean): void`
- `syncScatterEmptyState(message?: string): void`
  - Recomputes the scatter empty state from axis readiness, load state, linked-range validity, and filter state; also refreshes the badge/banner surfaces.
- `syncScatterFilterBadge(): void`
  - Shows the scoped active filter count for the current X/Y/color selection.
- `initScatterPageRuntime(): void`
  - Registers the scatter analysis-page runtime and deferred export binding.
- `getScatterRuntime(): ReturnType<typeof createAnalysisPageRuntime> | null`
  - Returns the current runtime handle.

---
[1]: ../ui/emptyState.md#createEmptyStateController
[2]: ../pages/shared/analysisPageRuntime.md#createAnalysisPageRuntime
