# ai/frontend/src/scatter/scatterPage.md
> Main scatter analytics page entry: orchestrates chart creation, controls, view switching, WebGPU probing, and empty-state management.

## State
- `_gpuUnavailable: boolean | null` — cached WebGPU availability flag
- `scatterEmptyStateController: ReturnType<typeof createEmptyStateController> | null`
- `_scatterAbort: AbortController | null`
- `_scatterDebounceTimer: ReturnType<typeof setTimeout> | null`

## Functions
- `handleErr(err: unknown): void` [deps: [showError][1]]
  - Logs error to console and displays it in the scatter error element.
- `getScatterEmptyStateController(): ReturnType<typeof createEmptyStateController>` [deps: [createEmptyStateController][2]]
  - Lazily creates and returns the scatter empty-state controller.
- `syncScatterEmptyState(message?: string): void`
  - Updates empty-state visibility, reason, and text based on GPU availability, axes selection, loading, and filter state.
- `syncScatterFilterBadge(): void`
  - Updates the active filter count badge from current scatter controls.
- `isGPUAvailable(): Promise<boolean>` [deps: [requestGpuAdapter][3]]
  - Probes WebGPU availability once and caches the result.
- `setSidebarAnalyticsSelection(viewName: string): void`
  - Updates sidebar nav active state for scatter/scattermatrix views.
- `syncScatterViewButtons(viewName: string): void`
  - Toggles active class on scatter-view toggle buttons.
- `setScatterView(viewName: string, options?: { render?: boolean }): Promise<void>` [deps: [renderScatter][4], [renderScatterMatrixView][5]]
  - Sets the current scatter view (plot/matrix) and optionally triggers render.
- `refreshActiveScatterView(): Promise<void>`
  - Re-renders whichever view is currently active.
- `renderSuggestions(suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>): void`
  - Renders correlation suggestion chips in the scatter sidebar.
- `refreshCorrelationsAndSuggestions(): Promise<void>` [deps: [fetchScatterCorrelations][6]]
  - Fetches correlation data and updates suggestion list.
- `renderScatter(): Promise<void>` [deps: [fetchScatterPoints][7], [buildOption][8], [renderCurrentOption][9], [initSelectionZoom][10], [syncModeUI][11]]
  - Fetches scatter points and renders the scatter chart.
- `onMatrixCellClick(x: string, y: string): Promise<void>` [deps: [selectMatrixPair][12]]
  - Handles matrix cell click to populate scatter axes.
- `bindControls(): void`
  - Wires scatter control DOM elements to state updates.
- `initScatterPage(metadata: DatasetMetadata): Promise<void>` [deps: [createChart][13], [fetchScatterCorrelations][6], [buildOption][8], [renderCurrentOption][9], [initSelectionZoom][10], [syncModeUI][11], [renderScatterMatrixView][5]]
  - Initializes scatter page, chart, controls, sidebar, and matrix view.

---
[1]: ./helpers.md#showError
[2]: ../../ui/emptyState.md#createEmptyStateController
[3]: ../../utils/platform.md#requestGpuAdapter
[4]: ./rendering.md#renderScatter
[5]: ./matrix.md#renderScatterMatrixView
[6]: ../../services/api/index.md#fetchScatterCorrelations
[7]: ../../services/api/index.md#fetchScatterPoints
[8]: ./rendering.md#buildOption
[9]: ./rendering.md#renderCurrentOption
[10]: ./rendering.md#initSelectionZoom
[11]: ./rendering.md#syncModeUI
[12]: ./matrix.md#selectMatrixPair
[13]: ../../libs/chartgpu/dist/index.md#createChart
