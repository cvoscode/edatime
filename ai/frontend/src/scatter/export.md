# ai/frontend/src/scatter/export.md
> Scatter export rendering: canvas pipeline, viewport calculation, and PNG/SVG/HTML/Parquet/CSV/JSON export.

## Imports
- `scaleScatterPlotGrid` from [layout.js](./layout.md)
- `buildScatterQueryContext` from [state.js](./state.md)

## Functions
- `buildLinearTicks(min: number, max: number, count?: number): number[]`
  - Generates evenly spaced tick values for a linear axis (default 6 ticks).
- `getScatterExportViewport(): { cssWidth: number; cssHeight: number; width: number; height: number; dpr: number }`
  - Returns scatter chart export viewport dimensions and device pixel ratio.
- `drawScatterSeriesToCanvas(ctx: CanvasRenderingContext2D, plotLeft: number, plotTop: number, plotWidth: number, plotHeight: number, controls: ScatterControls, scale: number): void` [deps: [paletteForScale][1], [sampleGradient][2], [buildCategoricalColorGroups][3]]
  - Draws scatter or density series onto a canvas context for export.
- `renderScatterExportToCanvas(canvas: HTMLCanvasElement): boolean` [deps: [scaleScatterPlotGrid][4]]
  - Renders the full scatter chart (axes, grid, title, labels) onto a canvas for export. Uses `scaleScatterPlotGrid` for grid dimensions.
- `buildVisibleScatterRows(): any[]`
  - Returns the currently visible scatter rows filtered by view bounds.
- `exportScatterData(format: 'csv' | 'json'): boolean`
  - Exports current scatter view as CSV or JSON using `buildVisibleScatterRows()`. Filename: `edatime_scatter_filtered.csv` / `.json`.
- `exportScatterPNG(): Promise<void>`
  - Triggers PNG export for scatter chart. Filename: `edatime_scatter.png`.
- `exportScatterSVG(): Promise<void>`
  - Triggers SVG export (PNG embedded in SVG). Filename: `edatime_scatter.svg`.
- `exportScatterHTML(): Promise<void>`
  - Triggers self-contained HTML export with PNG. Filename: `edatime_scatter.html`.
- `exportScatterParquet(): Promise<boolean>` [deps: [buildScatterQueryContext][5]]
  - Exports scatter points as Parquet binary. Includes query context: time range (`start`, `end`), `filters` (range filters), and `line_filters` (adaptive filters). Filename: `edatime_scatter_filtered.parquet`. Limit: 1,000,000 rows.

## Interfaces
- `ScatterExportViewport = { cssWidth: number; cssHeight: number; width: number; height: number; dpr: number }`

---
[1]: ./helpers.md#paletteForScale
[2]: ./helpers.md#sampleGradient
[3]: ./helpers.md#buildCategoricalColorGroups
[4]: ./export.md#getScatterExportViewport
[5]: ./export.md#drawScatterSeriesToCanvas
[6]: ./export.md#buildLinearTicks
[7]: ../../formatUtils.md#formatValueForColumn
[8]: ./helpers.md#exportScatterPNG
[9]: ../../services/api/index.md#exportScatterParquet
