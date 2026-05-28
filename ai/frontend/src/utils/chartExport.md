# chartExport.ts

Lightweight helpers for exporting analytics charts (FFT, spectrogram, heatmap) to PNG, SVG, HTML, and CSV formats.

## Functions

```typescript
function exportContainerCanvasPNG(containerId: string, filename: string): void
```

Composite all canvas elements inside a container into one PNG.

```typescript
async function exportElementPNG(elementId: string, filename: string): Promise<void>
```

Export an HTML element as PNG via SVG foreignObject.

```typescript
function exportElementSVG(elementId: string, filename: string): void
```

Export an HTML element as SVG using foreignObject.

```typescript
function exportEChartsPNG(chartInstance: any, filename: string): void
```

Export an ECharts instance as PNG.

```typescript
function exportContainerCanvasSVG(containerId: string, filename: string): void
```

Export a canvas-based chart container as SVG (PNG-in-SVG wrapper).

```typescript
function exportContainerCanvasHTML(containerId: string, filename: string): void
```

Export a canvas-based chart container as a standalone HTML page.

```typescript
function exportEChartsSVG(chartInstance: any, filename: string): void
```

Export an ECharts instance as SVG file.

```typescript
function exportEChartsHTML(chartInstance: any, filename: string): void
```

Export an ECharts instance as a standalone HTML page.

```typescript
async function exportElementHTML(elementId: string, filename: string): Promise<void>
```

Export an HTML element as a standalone HTML page.

```typescript
function exportMatrixCSV(columns: string[], data: (number | null)[][], filename: string): void
```

Export a matrix as CSV.

```typescript
function exportTraceCSV(traces: { column: string; xs: number[]; ys: number[] }[], xLabel: string, filename: string): void
```

Export trace data as CSV.