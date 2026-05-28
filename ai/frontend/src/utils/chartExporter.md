# chartExporter.ts

Standalone export helpers for PNG/SVG/HTML chart export with SVG drawing serialization. Reference implementation extracted from DataChart.

## Interfaces

```typescript
interface DrawItem {
    type: string;
    color: string;
    width: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    alpha?: number;
}
```

```typescript
interface ExportViewport {
    cssWidth: number;
    cssHeight: number;
    width: number;
    height: number;
    dpr: number;
}
```

```typescript
interface ExportDomains {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}
```

## Functions

```typescript
function getExportViewport(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null): ExportViewport
```

Get viewport dimensions for export.

```typescript
function getExportDomains(xMin: number | null, xMax: number | null, lastXDomainMin: number | null, lastXDomainMax: number | null, getYRange: () => { min: number; max: number } | null): ExportDomains | null
```

Get export domains from range values.

```typescript
function renderChartToCanvas(canvas: HTMLCanvasElement, viewport: ExportViewport, domains: ExportDomains, seriesList: unknown[]): void
```

Render chart data to canvas.

```typescript
function exportSVGDrawings(drawings: DrawItem[], currentDraw: DrawItem | null, overlayCanvas: HTMLCanvasElement | null, container: HTMLElement | null, viewWidth: number, viewHeight: number): string
```

Export SVG drawings as SVG markup.

```typescript
async function getCombinedExportCanvas(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, getXRange: () => { min: number; max: number }, lastSeriesList: unknown[], getYRange: () => { min: number; max: number } | null, lastXDomainMin: number | null, lastXDomainMax: number | null, renderFn: typeof renderChartToCanvas, includeDrawings: boolean): Promise<HTMLCanvasElement | null>
```

Get combined export canvas with chart and drawings.

```typescript
async function exportChartPNG(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, getXRange: () => { min: number; max: number }, lastSeriesList: unknown[], getYRange: () => { min: number; max: number } | null, lastXDomainMin: number | null, lastXDomainMax: number | null, renderFn: typeof renderChartToCanvas): Promise<void>
```

Export chart as PNG.

```typescript
async function exportChartSVG(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, getXRange: () => { min: number; max: number }, lastSeriesList: unknown[], getYRange: () => { min: number; max: number } | null, lastXDomainMin: number | null, lastXDomainMax: number | null, renderFn: typeof renderChartToCanvas, drawings: DrawItem[], currentDraw: DrawItem | null, viewWidth: number, viewHeight: number): Promise<void>
```

Export chart as SVG.

```typescript
async function exportChartHTML(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, getXRange: () => { min: number; max: number }, lastSeriesList: unknown[], getYRange: () => { min: number; max: number } | null, lastXDomainMin: number | null, lastXDomainMax: number | null, renderFn: typeof renderChartToCanvas): Promise<void>
```

Export chart as standalone HTML.