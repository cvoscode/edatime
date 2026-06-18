# ai/frontend/src/scatter/scatterPage.md
> Scatter analytics page — main entry, controls binding, and orchestration. Live point fetches now size their request limit with `computeInteractiveScatterLimit`.

## Imports
- `createChart` from `../../libs/chartgpu/dist/index.js`
- `EchartsScatterChart` from [../chart/EchartsScatterChart.js](../chart/EchartsScatterChart.md)
- `fetchScatterPoints` from [../services/api/index.js](../services/api/index.md)
- `appState` from [../store/index.js](../store/index.md)
- `requestTask` from [../pages/shared/requestTask.js](../pages/shared/requestTask.md)
- `computeInteractiveScatterLimit` from [./renderLimit.js](./renderLimit.md)
- Page runtime helpers from [./runtime.js](./runtime.md)
- Suggestion / correlation helpers from [./correlationsPanel.js](./correlationsPanel.md)
- Matrix view from [./matrix.js](./matrix.md)
- Controls from [./controls.js](./controls.md)
- State helpers from [./state.js](./state.md)
- Render / option helpers from [./rendering.js](./rendering.md)
- Toolbar overflow popout from [./toolbarOverflow.js](./toolbarOverflow.md)

## Module-Scoped State
- `scatterTask: RequestTask` — single in-flight request with abort-before-new semantics. Toggles `#scatter-chart-loading` and reports errors via `showError`.
- `_preserveViewOnNextRender: boolean` — one-shot flag consumed by the next `renderScatter()` to skip the default "reset to full extent" behavior (set by the density-mode zoom path).
- `__scatterScheduleRender` — attached to `globalThis` so [rendering.js](./rendering.md) can trigger a debounced re-render without an import cycle. Accepts `{ preserveView?: boolean }`.

## Functions
- `handleErr(err: unknown): void`
  - Logs the error and surfaces it via `showError`.
- `refreshActiveScatterView(): Promise<void>`
  - Renders the currently active view.
- `renderScatterDebounced(): void`
  - Debounced (~32ms) wrapper around `renderScatter`.
- `renderScatter(): Promise<void>`
  - Main render pipeline. Reads X/Y, fetches points via `fetchScatterPoints` with `computeInteractiveScatterLimit(container)`, populates `allPoints` / `allColorValues` / `allColorLabels`, then either reuses the chart or creates a new ChartGPU instance (or `EchartsScatterChart` fallback when WebGPU is unavailable). Re-binds selection zoom on a new chart and refreshes the colorbar, marginals, and correlations. Honors `_preserveViewOnNextRender` so the density-mode zoom path keeps the new view bounds. Records `appState.scatter.lastQueryContextKey` after the request resolves so the page-change handler in [controls.ts][4] can short-circuit identical re-entries.
- `rerenderScatterFromCache(resetViewFlag?: boolean): Promise<void>`
  - Re-applies the cached `allPoints` to the chart without a network round trip.
- `initScatterPage(metadata: DatasetMetadata): Promise<void>`
  - Records metadata on `appState.scatter`, populates the X/Y dropdowns (excluding the chosen X from the Y list), runs the first correlation refresh + render, and skips the fetch entirely when no numeric columns are present. On first init, also calls [initScatterToolbarOverflow][8] against the rendered `.scatter-toolbar` (wrapped in try/catch so a presentation failure cannot block the page).
- `setScatterView(viewName: string, options?: { render?: boolean }): Promise<void>`
  - Clears any pending debounce timer before switching the active scatter view, then toggles the plot/matrix panels. When rendering is enabled it renders the matrix view directly or schedules a plot resize on the next animation frame.
- `bindControls(): Promise<void>`
  - Dynamic-import wrapper for `bindScatterControls` to keep the static dep graph cycle-free. After the dynamic import resolves, registers the suggestion-apply handler via [correlationsPanel.setSuggestionApplyHandler][7] so clicking a correlation pill re-runs `refreshCorrelationsAndSuggestions` + `renderScatter` for the freshly selected X/Y pair.

## Module Bootstrap
- `initScatterPageRuntime()` is called at module load so the runtime's listeners register before any `edatime:page-change 'scatter'` event can fire.

---
[1]: ./runtime.md
[2]: ./correlationsPanel.md
[3]: ./matrix.md
[4]: ./controls.md
[5]: ./state.md
[6]: ./rendering.md
[7]: ./correlationsPanel.md#setSuggestionApplyHandler
[8]: ./toolbarOverflow.md#initScatterToolbarOverflow
