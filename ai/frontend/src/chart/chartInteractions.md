# chartInteractions.ts

Shared chart interaction utilities providing selection-box-zoom and canvas-overlay patterns for DataChart and FftChart.

## Interfaces

```typescript
export interface DragState {
  pointerId: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

export interface GridLayout {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BoxZoomOptions {
  container: HTMLElement;
  grid: GridLayout;
  getXRange: () => { min: number; max: number };
  onZoom: (min: number, max: number) => void;
  shouldIgnore?: (e: PointerEvent) => boolean;
  onClick?: (cssX: number, cssY: number) => void;
  onDblClick?: () => void;
}

export interface WheelZoomOptions {
  container: HTMLElement;
  grid: GridLayout;
  getXRange: () => { min: number; max: number };
  onZoom: (min: number, max: number) => void;
  clamp?: { min: number; max: number };
}
```

## Functions

```typescript
export function createSelectionBox(container: HTMLElement): HTMLElement;
export function updateSelectionBox(
  box: HTMLElement,
  drag: DragState,
  containerWidth: number,
  containerHeight: number,
): void;
export function hideSelectionBox(box: HTMLElement): void;
export function createCanvasOverlay(
  container: HTMLElement,
  onResize: () => void,
): { canvas: HTMLCanvasElement; observer: ResizeObserver };
export function startDrag(event: PointerEvent, container: HTMLElement): DragState;
export function moveDrag(event: PointerEvent, drag: DragState, container: HTMLElement): void;
export function dragToDataRange(
  drag: DragState,
  containerWidth: number,
  grid: GridLayout,
  dataMin: number,
  dataMax: number,
  minDragPx?: number,
): { min: number; max: number } | null;
export function ensureRelativePosition(container: HTMLElement): void;
export function initBoxZoom(opts: BoxZoomOptions): HTMLElement;
export function initWheelZoom(opts: WheelZoomOptions): void;
export function tooltipRow(name: string, value: string, color?: string): string;
export function tooltipWrap(header: string, rows: string): string;
```
