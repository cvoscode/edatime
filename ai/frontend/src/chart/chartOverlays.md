# ai/frontend/src/chart/chartOverlays.md
> Renders rolling bands, anomaly regions, and adaptive-filter overlays on the transparent chart canvas.

## Interface `ChartOverlayPlotMetrics`
- `cssWidth: number`
- `cssHeight: number`
- `plotLeft: number`
- `plotTop: number`
- `plotRight: number`
- `plotBottom: number`
- `plotWidth: number`
- `plotHeight: number`
- `strokeScale: number`

## Functions
- `getOverlayPlotMetrics(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, grid: GridLayout, scale: { x: number; y: number }): ChartOverlayPlotMetrics | null`
  - Computes plot geometry for overlay rendering.

## Interface `ChartOverlayOptions`
- `getXMin: () => number | null`
- `getXMax: () => number | null`
- `getContainer: () => HTMLElement | null`
- `getOverlayCanvas: () => HTMLCanvasElement | null`
- `getGrid: () => GridLayout`
- `getYRange: () => { min: number; max: number } | null`
- `getPendingAdaptivePoint: () => { column: string; x: number; y: number; x2?: number; y2?: number } | null`

## Class `ChartOverlays`
- `constructor(opts: ChartOverlayOptions)`
  - Creates the overlay renderer from chart accessor callbacks.
- `renderAll(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void`
  - Renders rolling bands, optional global anomaly shading, per-series anomaly regions, and adaptive filter lines.
