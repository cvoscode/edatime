# export.ts

Scatter plot export utilities for PNG, SVG, HTML, Parquet, CSV, and JSON formats.

## Functions

```typescript
function buildLinearTicks(min: number, max: number, count?: number): number[]
function getScatterExportViewport(): { cssWidth: number; cssHeight: number; width: number; height: number; dpr: number }
function drawScatterSeriesToCanvas(
    ctx: CanvasRenderingContext2D,
    plotLeft: number, plotTop: number, plotWidth: number, plotHeight: number,
    controls: ScatterControls, scale: number,
): void
function renderScatterExportToCanvas(canvas: HTMLCanvasElement): boolean
function buildVisibleScatterRows(): any[]
function exportScatterData(format?: string): boolean
function exportScatterPNG(): Promise<void>
function exportScatterSVG(): Promise<void>
function exportScatterHTML(): Promise<void>
function exportScatterParquet(): Promise<boolean>
```
