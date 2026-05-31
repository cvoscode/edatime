# ai/frontend/src/scatter/rendering.md
> Scatter series building, ECharts option construction, tooltips, colorbar, marginal plots, and view management.

## Constants
- `SCATTER_GRID_LEFT = 72` — left grid margin in pixels
- `SCATTER_GRID_RIGHT = 72` — right grid margin
- `SCATTER_GRID_TOP = 24` — top grid margin
- `SCATTER_GRID_BOTTOM = 50` — bottom grid margin

## Interfaces
- `ScatterView = { xMin: number; xMax: number; yMin: number; yMax: number }`
- `DensityTooltipCache = { key: string; binSize: number; metrics: any; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, any> }`

## Functions
- `buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[]` [deps: [buildCategoricalColorGroups][1], [paletteForScale][2]]
  - Builds scatter series with optional categorical color grouping or continuous color binning.
- `buildDensitySeries(points: [number, number][], controls: ScatterControls): any[]` [deps: [paletteForScale][2]]
  - Builds density-mode scatter series with binSize, colormap, and normalization.
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
- `drawMarginalX(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number): void`
  - Draws marginal histogram on the X axis.
- `drawMarginalY(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number): void`
  - Draws marginal histogram on the Y axis.
- `buildOption(controls: ScatterControls, points: [number, number][], series: any[]): object`
  - Constructs the full ECharts option object from controls, points, and series.
- `renderCurrentOption(controls: ScatterControls): void`
  - Updates the scatter chart with current options from controls.
- `initSelectionZoom(): void`
  - Initializes drag-to-zoom selection box on the scatter chart.
- `syncModeUI(renderMode: string): void`
  - Syncs UI visibility for density vs scatter render modes.
- `applyView(view: ScatterView): void`
  - Applies a view state (zoom, pan) to the scatter chart.
- `resetView(): void`
  - Resets the scatter chart to initial view bounds.

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
