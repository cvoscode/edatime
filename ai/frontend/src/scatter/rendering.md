# ai/frontend/src/scatter/rendering.md
> Scatter series building, ECharts option construction, tooltips, colorbar, marginal plots, and view management.

## Imports
- Grid constants and metrics from [layout.js](./layout.md)
- `getDropdownValue` from [../ui/primitives/Dropdown.js](../ui/primitives/Dropdown.md)
- `dragToViewport`, `DragState` from [../chart/chartInteractions.js](../chart/chartInteractions.md)
- `disposeScatterChart`, `resetScatterContainer` from [state.js](./state.md)
- `buildKdeCurve`, `computeBoxStats` from [helpers.js](./helpers.md)

## Interfaces
- `ScatterView = { xMin: number; xMax: number; yMin: number; yMax: number }`
- `DensityTooltipCache = { key: string; binSize: number; metrics: any; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, any> }`

## Functions
- `buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[]` [deps: [buildCategoricalColorGroups][1], [paletteForScale][2]]
  - Builds scatter series with optional categorical color grouping or continuous color binning.
- `buildDensitySeries(points: [number, number][], controls: ScatterControls): any[]` [deps: [paletteForScale][2], [appState][3]]
  - Builds density-mode scatter series. Passes the full point set as both `rawData` and `data` so ChartGPU's binner uses the unfiltered buffer; `rawBounds` is set to the current `appState.scatter.view` so the binner clips to the visible region.
- `buildDensityTooltipCache(series: any[], controls: ScatterControls, container: HTMLElement | null): DensityTooltipCache | null`
  - Pre-computes density grid bins for tooltip lookup; cached by view signature.
- `densityTooltipFormatterFactory(controls: ScatterControls, container: HTMLElement | null): (params: any) => string`
  - Returns tooltip formatter for density mode with cursor tracking.
- `scatterTooltipFormatterFactory(controls: ScatterControls): (params: any) => string`
  - Returns tooltip formatter for normal scatter mode.
- `setColorbarVisible(visible: boolean): void`
  - Shows or hides the colorbar canvas overlay.
- `renderColorbarCanvas(): void`
  - Renders the colorbar gradient onto the colorbar canvas.
- `updateColorbarUI(): void` [deps: [appState][3]]
  - Updates colorbar DOM elements from current scatter state.
- `setCorrelationOverlayText(pearson?: number | null, spearman?: number | null): void`
  - Currently a no-op that hides the overlay; kept for backward compatibility.
- `drawMarginalX(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number, mode: string): void`
  - Draws marginal on X axis; mode `'histogram'` | `'kde'` | `'boxplot'`. Uses `getScatterMarginalXMetrics` from layout.
- `drawMarginalY(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number, mode: string): void`
  - Draws marginal on Y axis; mode `'histogram'` | `'kde'` | `'boxplot'`. Uses `getScatterMarginalYMetrics` from layout.
- `updateMarginalPlots(): void`
  - Syncs marginal canvas visibility and triggers `drawMarginalX`/`drawMarginalY` with current `diagonalMode`. Also toggles the `.with-x-marginal` class on `#scatter-chart`.
- `buildOption(points: [number, number][], container: HTMLElement | null): any`
  - Constructs the full ECharts option object from controls, points, and series.
- `renderCurrentOption(): void`
  - Updates the scatter chart with current options from controls.
- `applyView(nextView: ScatterView, pushHistory?: boolean): void` [deps: [clampView][4], [scheduleRenderScatter][5]]
  - Applies new view bounds, optionally pushing to history stack. Delegates to `refreshView()`.
- `resetView(clearHistory?: boolean): void` [deps: [refreshView][5]]
  - Resets the scatter chart to initial view bounds and clears history by default.
- `refreshView(): void` (private) [deps: [disposeScatterChart][6], [resetScatterContainer][6], [scheduleRenderScatter][5]]
  - In density mode, disposes the chart, recreates the container, and schedules a debounced re-render with `preserveView: true` so the new view bounds stick. In non-density modes, falls through to `renderCurrentOption()`.
- `scheduleRenderScatter(opts?: { preserveView?: boolean }): void` (private)
  - Calls `globalThis.__scatterScheduleRender` (set up by [scatterPage.js](./scatterPage.md)) to trigger a debounced re-render. Falls back to `renderCurrentOption()` when no helper is registered (e.g. unit tests).
- `updateBinnedReadout(): void`
  - No-op stub; the count is now surfaced through chart performance callbacks.
- `updateCorrelationStats(): void`
  - Reads current X/Y from the dropdowns, looks up Pearson/Spearman in `appState.scatter.correlationsByColumn`, and updates the stats bar.
- `initSelectionZoom(container: HTMLElement): void` [deps: [dragToViewport][7], [SCATTER_PLOT_GRID][8], [applyView][4], [resetView][4]]
  - Wires pointerdown/move/up/cancel for box-selection zoom and dblclick for view pop/reset. Uses `dragToViewport` to honor `SCATTER_PLOT_GRID` padding; ignores drags smaller than 8px in either axis and ignores wheel events on density mode.
- `syncModeUI(): void`
  - Toggles visibility of analytics / density / color-scale / export / stats / suggestions groups based on `appState.scatter.activeView` and `renderMode`. Also calls `updateColorbarUI()`.

## Re-exports from `./export.js`
- `buildLinearTicks`, `getScatterExportViewport`, `drawScatterSeriesToCanvas`, `renderScatterExportToCanvas`, `buildVisibleScatterRows`
- `exportScatterData`, `exportScatterPNG`, `exportScatterSVG`, `exportScatterHTML`, `exportScatterParquet`

---
[1]: ./helpers.md#buildCategoricalColorGroups
[2]: ./helpers.md#paletteForScale
[3]: ../../store/index.md#appState
[4]: ./state.md#clampView
[5]: ./scatterPage.md#__scatterScheduleRender
[6]: ./state.md#disposeScatterChart
[7]: ../chart/chartInteractions.md#dragToViewport
[8]: ./layout.md#SCATTER_PLOT_GRID
