# ai/frontend/src/scatter/scatterPage.md
> Main scatter analytics page entry: composes scatter runtime, controls, view switching, request lifecycles, and chart rendering.

## State
- `_scatterDebounceTimer: ReturnType<typeof setTimeout> | null` — debounce timer for render coalescing
- `scatterTask: ReturnType<typeof createRequestTask>` — abortable request task for scatter fetches [deps: [createRequestTask][1]]

## Functions
- `handleErr(err: unknown): void` [deps: [showError][2]]
  - Logs error to console and displays it in the scatter error element.
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
- `renderScatter(): Promise<void>` [deps: [scatterTask.run][1], [fetchScatterPoints][7], [buildOption][8], [renderCurrentOption][9], [initSelectionZoom][10], [syncModeUI][11]]
  - Fetches scatter points and renders the scatter chart using the shared request task.
- `onMatrixCellClick(x: string, y: string): Promise<void>` [deps: [selectMatrixPair][12]]
  - Handles matrix cell click to populate scatter axes.
- `bindControls(): Promise<void>` [deps: [bindScatterControls][13]]
  - Dynamically imports `controls.ts` and wires all scatter control DOM elements to state updates.
- `renderScatterDebounced(): void`
  - Coalesces scatter rerenders through a short debounce.
- `initScatterPage(metadata: DatasetMetadata): Promise<void>` [deps: [createChart][14], [initScatterPageRuntime][15], [refreshCorrelationsAndSuggestions][16], [bindScatterControls][13]]
  - Initializes scatter page state, runtime wiring, chart, controls, and matrix/sidebar flows. The function is the single authoritative writer of `appState.scatter.metadata` and `appState.scatter.columnTypes`. It always populates the X/Y `<select>` elements (defaulting X to `numeric[0]` and Y to `numeric[1]` if available, never equal to X); when no numeric columns exist the selects are explicitly emptied, the page stays in the empty state, and the fetch path is skipped entirely. Subsequent metadata refreshes are expected to call `initScatterPage` again.

---
[1]: ../pages/shared/requestTask.md#createRequestTask
[2]: ./helpers.md#showError
[4]: ./rendering.md#renderScatter
[5]: ./matrix.md#renderScatterMatrixView
[6]: ../../services/api/index.md#fetchScatterCorrelations
[7]: ../../services/api/index.md#fetchScatterPoints
[8]: ./rendering.md#buildOption
[9]: ./rendering.md#renderCurrentOption
[10]: ./rendering.md#initSelectionZoom
[11]: ./rendering.md#syncModeUI
[12]: ./matrix.md#selectMatrixPair
[13]: ./controls.md#bindScatterControls
[14]: ../../libs/chartgpu/dist/index.md#createChart
[15]: ./runtime.md#initScatterPageRuntime
[16]: ./correlationsPanel.md#refreshCorrelationsAndSuggestions
