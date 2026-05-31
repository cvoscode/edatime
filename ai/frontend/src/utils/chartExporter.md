# ai/frontend/src/utils/chartExporter.md

> Standalone export helpers extracted from DataChart; encapsulates PNG/SVG/HTML export and SVG drawing serialization.

## Interface: DrawItem
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

## Interface: ExportViewport
```typescript
interface ExportViewport {
    cssWidth: number;
    cssHeight: number;
    width: number;
    height: number;
    dpr: number;
}
```

## Interface: ExportDomains
```typescript
interface ExportDomains {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}
```

## Functions
- `getExportViewport(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null): ExportViewport`
  - Computes viewport dimensions and device pixel ratio for export rendering.
- `getExportDomains(xMin: number | null, xMax: number | null, lastXDomainMin: number | null, lastXDomainMax: number | null, getYRange: () => { min: number; max: number } | null): ExportDomains | null`
  - Computes safe axis domains with 4% Y-axis padding.
- `renderChartToCanvas(canvas: HTMLCanvasElement, viewport: ExportViewport, domains: ExportDomains, seriesList: unknown[]): void`
  - Renders chart series and axes to an off-DOM canvas for export.
- `exportSVGDrawings(drawings: DrawItem[], currentDraw: DrawItem | null, overlayCanvas: HTMLCanvasElement | null, container: HTMLElement | null, viewWidth: number, viewHeight: number): string`
  - Serializes line/rectangle drawing annotations as SVG markup.
- `getCombinedExportCanvas(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, getXRange: () => { min: number; max: number }, lastSeriesList: unknown[], getYRange: () => { min: number; max: number } | null, lastXDomainMin: number | null, lastXDomainMax: number | null, renderFn: typeof renderChartToCanvas, includeDrawings: boolean): Promise<HTMLCanvasElement | null>`
  - Combines chart canvas and drawings into a single export canvas.