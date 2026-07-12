# ai/frontend/src/scatter/scatterPage.md
> Scatter page entrypoint: live plot fetch/render orchestration, per-view filter snapshots, plot/matrix switching, and GPU-probed chart creation.

## Internal State
- `_scatterDebounceTimer: ReturnType<typeof setTimeout> | null` — pending debounce handle.
- `_warnOnEmptyPlotAfterMatrix: boolean` — one-shot flag to warn when matrix filters hide all points on plot return.
- `_preserveViewOnNextRender: boolean` — when set by the density-zoom path, next `renderScatter` skips the default view reset so zoom bounds persist.
- `scatterTask: RequestTask` — wraps `renderScatter` with abort-before-new semantics; installs loading UI and error handler.
- `globalThis.__scatterScheduleRender` — debounced render trigger hooked by [rendering.ts][6]; density zoom sets `preserveView` via this path.

## Private Helpers
- `setSidebarAnalyticsSelection(viewName: string): void`
  - Toggles `.active` on scatter/matrix sidebar nav items.
- `syncScatterViewButtons(viewName: string): void`
  - Toggles `.active` and `aria-pressed` on `[data-scatter-view]` buttons.
- `onMatrixCellClick(x: string, y: string): Promise<void>`
  - Shows matrix loading indicator, calls `selectMatrixPair`, hides indicator on completion.

## Request Task Setup
```
scatterTask = createRequestTask({
    setLoading: (loading) => { appState.scatter.loading = loading; },
    onError: (message) => { showError(message); },
})
```

## Functions

### `handleErr(err: unknown): void`
- Logs to console and surfaces via `showError`.

### `renderScatterDebounced(): void`
- Clears any pending timer and schedules a 32 ms debounced `renderScatter`.

### `renderScatter(): Promise<void>`
- Reads `preserveView` flag from `_preserveViewOnNextRender` **before** the `fetchScatterPoints` await so a slow request cannot steal the flag from a subsequent render.
- On success reads `response.color_cardinality` and writes `appState.scatter.colorCardinality`.
- On empty-plot-after-matrix with active filters, shows a dismissible "Clear" toast.
- If the chart does not exist yet, probes GPU availability and creates either a `EchartsScatterChart` fallback or a ChartGPU instance via `createChart`.
- Calls `applyScatterStateFromCache(!preserveView)` to reset or preserve view bounds.
- Installs a `chart.onPerformanceUpdate` callback that throttles `updateBinnedReadout` to 100 ms.
- Updates UI: `updateColorbarUI`, `updateBinnedReadout`, `updateCorrelationStats`, `renderSuggestions`, `updateMarginalPlots`.

### `setScatterView(viewName: string, options: { render?: boolean } = {}): Promise<void>`
- Clears pending scatter debounce and dismisses all toasts.
- When switching between `plot` ↔ `matrix`: snapshots the leaving view's `columnRanges` + `lineFilters` into the per-view snapshot, then restores the entering view's snapshot into global `uiState`.
- When returning from `matrix` to `plot`: resets `appState.scatter.view` to `full`, clears zoom history, sets `_preserveViewOnNextRender = false` and `_warnOnEmptyPlotAfterMatrix = true`.
- Toggles sidebar nav, view buttons, and `[data-scatter-view-panel]` visibility.
- If `options.render !== false`: renders `matrix` via `renderScatterMatrixView` or plot via `renderScatter`, then calls `syncScatterEmptyState()` and resizes the chart.

### `refreshActiveScatterView(): Promise<void>`
- Calls `setScatterView(appState.scatter.activeView, { render: true })`.

### `rerenderScatterFromCache(resetViewFlag = true): Promise<void>`
- Re-applies cached points from `appState.scatter.allPoints`, calls `applyScatterStateFromCache(resetViewFlag)`, re-renders current option, updates correlation stats and suggestions, syncs empty state, and refreshes the active view.

### `bindControls(): Promise<void>`
- Lazily imports `controls.js` and calls `bindScatterControls` once. Registers the `activeApplyHandler` closure for correlation pills. Installs toolbar overflow helper.

### `initScatterPage(metadata: DatasetMetadata): Promise<void>` [deps: [initScatterHelp][7]]
- Populates `appState.scatter.metadata` and `columnTypes` from metadata.
- Always populates or clears X/Y selects (even with zero numeric columns) so controls are deterministically initialized.
- On first call (`!appState.scatter.initialized`): calls `bindControls()`, installs toolbar overflow, wires the page-level `?` help button via `initScatterHelp`, sets `initialized = true`.
- On first page visit (`!appState.scatter.pageInitialized`): triggers `refreshCorrelationsAndSuggestions({ preferTopPairOnFirstLoad: true })` and `renderScatter`; sets `pageInitialized = true`.
- Subsequent calls do nothing (early return).

## Public Re-exports for `controls.ts` and `viewController.ts`
- `renderScatter`, `rerenderScatterFromCache`, `refreshActiveScatterView`, `setScatterView`, `refreshCorrelationsAndSuggestions`

---
[1]: ./rendering.md
[2]: ./controls.md
[3]: ./matrix.md
[4]: ./runtime.md
[5]: ./state.md
[6]: ./rendering.md
[7]: ../pages/scatterHelp.md#initScatterHelp
