# rendering.ts

Scatter rendering logic: series building, option construction, tooltips, colorbar, marginal plots, and view management.

## Constants

```typescript
SCATTER_GRID_LEFT: 72
SCATTER_GRID_RIGHT: 72
SCATTER_GRID_TOP: 24
SCATTER_GRID_BOTTOM: 50
```

## Interfaces

```typescript
type ScatterView = { xMin: number; xMax: number; yMin: number; yMax: number }
type DensityTooltipCache = { key: string; binSize: number; metrics: any; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, any> }
```

## Functions

```typescript
function buildNormalScatterSeries(points: [number, number][], controls: ScatterControls): any[]
function buildDensitySeries(points: [number, number][], controls: ScatterControls): any[]
function buildDensityTooltipCache(series: any[], controls: ScatterControls, container: HTMLElement | null): DensityTooltipCache | null
function densityTooltipFormatterFactory(controls: ScatterControls, container: HTMLElement | null): (params: any) => string
function scatterTooltipFormatterFactory(controls: ScatterControls): (params: any) => string
function setColorbarVisible(visible: boolean): void
function renderColorbarCanvas(): void
function updateColorbarUI(): void
function setCorrelationOverlayText(pearson?: number | null, spearman?: number | null): void
function drawMarginalX(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number): void
function drawMarginalY(canvas: HTMLCanvasElement, values: number[], viewMin: number, viewMax: number): void
function updateMarginalPlots(): void
function buildOption(points: [number, number][], container: HTMLElement | null): any
function renderCurrentOption(): void
function applyView(nextView: ScatterView, pushHistory?: boolean): void
function resetView(clearHistory?: boolean): void
function updateBinnedReadout(): void
function updateCorrelationStats(): void
function initSelectionZoom(container: HTMLElement): void
function syncModeUI(): void
```

## Re-exports

```typescript
// From export.ts:
buildLinearTicks, getScatterExportViewport, drawScatterSeriesToCanvas, renderScatterExportToCanvas, buildVisibleScatterRows, exportScatterData, exportScatterPNG, exportScatterSVG, exportScatterHTML, exportScatterParquet
```
