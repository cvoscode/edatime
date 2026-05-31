# ai/frontend/src/scatter/export.md
> Scatter export rendering: canvas pipeline, viewport calculation, and PNG/SVG/HTML/Parquet/CSV/JSON export.

## Functions
- `buildLinearTicks(min: number, max: number, count?: number): number[]`
  - Generates evenly spaced tick values for a linear axis (default 6 ticks).
- `getScatterExportViewport(): { cssWidth: number; cssHeight: number; width: number; height: number; dpr: number }`
  - Returns scatter chart export viewport dimensions and device pixel ratio.
- `drawScatterSeriesToCanvas(ctx: CanvasRenderingContext2D, plotLeft: number, plotTop: number, plotWidth: number, plotHeight: number, controls: ScatterControls, scale: number): void` [deps: [paletteForScale][1], [sampleGradient][2], [buildCategoricalColorGroups][3]]
  - Draws scatter or density series onto a canvas context for export.
- `renderScatterExportToCanvas(canvas: HTMLCanvasElement): boolean` [deps: [getScatterExportViewport][4], [drawScatterSeriesToCanvas][5], [buildLinearTicks][6], [formatValueForColumn][7]]
  - Renders the full scatter chart (axes, grid, title, labels) onto a canvas for export.
- `buildVisibleScatterRows(): any[]`
  - Returns the currently visible scatter rows filtered by view.
- `exportScatterData(format?: string): boolean`
  - Exports scatter points as CSV or JSON.
- `exportScatterPNG(): Promise<void>` [deps: [exportScatterPNG][8]]
  - Triggers PNG export for scatter chart.
- `exportScatterSVG(): Promise<void>`
  - Triggers SVG export for scatter chart.
- `exportScatterHTML(): Promise<void>`
  - Triggers self-contained HTML export for scatter chart.
- `exportScatterParquet(): Promise<boolean>` [deps: [exportScatterParquet][9]]
  - Exports scatter points as Parquet binary.

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
