# ai/frontend/src/scatter/rendering.md
> Scatter series building, ECharts option construction, tooltips, colorbar, marginal plots, and view management.

## Imports
- Grid constants and metrics from [layout.js](./layout.md)
- `getDropdownValue` from [../ui/primitives/Dropdown.js](../ui/primitives/Dropdown.md)
- `buildKdeCurve`, `computeBoxStats` from [helpers.js](./helpers.md)

## Interfaces
- `ScatterView = { xMin: number; xMax: number; yMin: number; yMax: number }`
- `DensityTooltipCache = { key: string; binSize: number; metrics: any; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, any> }`

## Functions
- `buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[]` [deps: [buildCategoricalColorGroups][1], [paletteForScale][2]]
  - Builds scatter series with optional categorical color grouping or continuous color binning.
- `buildDensitySeries(points: [number, number][], controls: ScatterControls): any[]` [deps: [paletteForScale][2]]
  - Builds density-mode scatter series; filters points to current view bounds and adds `rawBounds` to series.
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
  - Updates the Pearson/Spearman text overlay on the chart.
- `drawMarginalX(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number, mode: string): void`
  - Draws marginal on X axis; mode `'histogram'` | `'kde'` | `'boxplot'`. Uses `getScatterMarginalXMetrics` from layout.
- `drawMarginalY(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number, mode: string): void`
  - Draws marginal on Y axis; mode `'histogram'` | `'kde'` | `'boxplot'`. Uses `getScatterMarginalYMetrics` from layout.
- `updateMarginalPlots(): void`
  - Syncs marginal canvas visibility and triggers `drawMarginalX`/`drawMarginalY` with current `diagonalMode`.
- `buildOption(points: [number, number][], container: HTMLElement | null): any`
  - Constructs the full ECharts option object from controls, points, and series.
- `renderCurrentOption(): void`
  - Updates the scatter chart with current options from controls.
- `applyView(nextView: ScatterView, pushHistory?: boolean): void`
  - Applies new view bounds, optionally pushing to history stack.
- `resetView(clearHistory?: boolean): void`
  - Resets the scatter chart to initial view bounds.
- `syncModeUI(): void`
  - Syncs UI visibility for density vs scatter render modes.
- `updateBinnedReadout(): void`
- `updateCorrelationStats(): void`
- `initSelectionZoom(container: HTMLElement): void`

---
[1]: ./helpers.md#buildCategoricalColorGroups
[2]: ./helpers.md#paletteForScale
[3]: ../../store/appStateCompat.md#appState
function updateMarginalPlots(): void
function buildOption(points: [number, number][], container: HTMLElement | null): any
  - Builds ECharts option from points and controls.

function renderCurrentOption(): void
  - Renders the current option to the chart instance.

function applyView(nextView: ScatterView, pushHistory?: boolean): void
  - Applies new view bounds, optionally pushing to history stack.

function resetView(clearHistory?: boolean): void
function updateBinnedReadout(): void
function updateCorrelationStats(): void
function initSelectionZoom(container: HTMLElement): void
function syncModeUI(): void

// From export.ts:
buildLinearTicks, getScatterExportViewport, drawScatterSeriesToCanvas,
renderScatterExportToCanvas, buildVisibleScatterRows,
exportScatterData, exportScatterPNG, exportScatterSVG, exportScatterHTML, exportScatterParquet
```
