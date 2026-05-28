# chartOverlays.ts

Renders rolling bands, anomaly regions, adaptive filter lines, and annotations on a transparent canvas overlaying the chart.

## Interface: ChartOverlayOptions

```typescript
interface ChartOverlayOptions {
  getXMin: () => number | null;
  getXMax: () => number | null;
  getContainer: () => HTMLElement | null;
  getOverlayCanvas: () => HTMLCanvasElement | null;
  getYRange: () => { min: number; max: number } | null;
  getPendingAdaptivePoint: () => { column: string; x: number; y: number; x2?: number; y2?: number } | null;
}
```

## Class: ChartOverlays

```typescript
export class ChartOverlays {
  constructor(opts: ChartOverlayOptions);
}
```

### Methods

```typescript
renderAll(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void;
```
