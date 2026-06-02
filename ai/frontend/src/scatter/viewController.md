# ai/frontend/src/scatter/viewController.md
> Scatter view orchestration — active view management, matrix/plot toggle, sidebar selection sync, and cross-page navigation.

## Functions
- `setSidebarAnalyticsSelection(viewName: string): void`
  - Updates sidebar nav active state for scatter/scattermatrix views.
- `syncScatterViewButtons(viewName: string): void`
  - Toggles active class and `aria-pressed` on scatter-view toggle buttons.
- `setScatterView(viewName: string, options?: { render?: boolean }): Promise<void>` [deps: [renderScatterMatrixView][1], [renderScatter][2], [refreshCorrelationsAndSuggestions][3]]
  - Sets current scatter view (plot/matrix), syncs sidebar/button state, shows/hides view panels, and optionally triggers render.
- `refreshActiveScatterView(): Promise<void>`
  - Re-renders whichever view is currently active (convenience wrapper around `setScatterView`).
- `onMatrixCellClick(x: string, y: string, refreshCorrelationsAndSuggestions: () => Promise<void>, renderScatter: () => Promise<void>): Promise<void>` [deps: [selectMatrixPair][4], [handleErr][5]]
  - Handles matrix cell click: shows matrix spinner, calls `selectMatrixPair`, and handles errors.
- `openScatterPairInCausal(): void`
  - Dispatches `edatime:causal-preselect` event with current X/Y columns and navigates to causal page.

---
[1]: ./matrix.md#renderScatterMatrixView
[2]: ./scatterPage.md#renderScatter
[3]: ./scatterPage.md#refreshCorrelationsAndSuggestions
[4]: ./matrix.md#selectMatrixPair
[5]: ./scatterPage.md#handleErr