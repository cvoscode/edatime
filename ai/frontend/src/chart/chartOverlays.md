# ai/frontend/src/chart/chartOverlays.md
> Renders rolling bands, anomaly regions, adaptive filter lines, and annotations on a transparent canvas overlaying the chart.

## Interface: ChartOverlayPlotMetrics
- `cssWidth: number`
- `cssHeight: number`
- `plotLeft: number`
- `plotTop: number`
- `plotRight: number`
- `plotBottom: number`
- `plotWidth: number`
- `plotHeight: number`
- `strokeScale: number`

## Function: getOverlayPlotMetrics
- `getOverlayPlotMetrics(container: HTMLElement | null, overlayCanvas: HTMLCanvasElement | null, scale: { x: number; y: number }): ChartOverlayPlotMetrics | null`
  - Shared plot-geometry helper; centralises plotLeft/plotTop/plotRight/plotBottom/plotWidth/plotHeight/strokeScale arithmetic. Returns `null` when container is missing.

## Class: ChartOverlays
- `constructor(opts: ChartOverlayOptions)` — Creates the overlay renderer with accessor functions.
- `renderAll(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void` — Renders all overlay layers using `getOverlayPlotMetrics`.

## Interface: ChartOverlayOptions
- `getXMin: () => number | null`
- `getXMax: () => number | null`
- `getContainer: () => HTMLElement | null`
- `getOverlayCanvas: () => HTMLCanvasElement | null`
- `getYRange: () => { min: number; max: number } | null`
- `getPendingAdaptivePoint: () => { column: string; x: number; y: number; x2?: number; y2?: number } | null`

---
[1]: ../store/appStateCompat.md#appState
[2]: ../services/timeseries/filtering.md#buildAdaptiveLineY
[3]: ./chartInteractions.md#createCanvasOverlay
