# ai/frontend/src/chart/chartInteractions.md
> Shared chart interaction helpers for selection boxes, box zoom, wheel zoom, and Ctrl/Meta drag panning.

## Interfaces
- `DragState`
  - `{ pointerId: number; startX: number; endX: number; startY: number; endY: number }`
- `GridLayout`
  - `{ left: number; right: number; top: number; bottom: number }`
- `NumericRange`
  - `{ min: number; max: number }`
- `CtrlPanOptions`
  - `{ container: HTMLElement; grid: GridLayout; getXRange: () => NumericRange; getYRange: () => NumericRange | null; onPan: (view: { xMin: number; xMax: number; yMin: number; yMax: number } | { xMin: number; xMax: number }) => void; shouldIgnore?: (e: PointerEvent) => boolean; minDragPx?: number }`
- `XOnlyBoxZoomOptions`
- `ViewportBoxZoomOptions`
- `BoxZoomOptions = XOnlyBoxZoomOptions | ViewportBoxZoomOptions`
- `WheelZoomOptions`
- `WheelZoomViewportOptions`

## Functions
- `createSelectionBox(container: HTMLElement): HTMLElement`
- `updateSelectionBox(box: HTMLElement, drag: DragState, containerWidth: number, containerHeight: number): void`
- `hideSelectionBox(box: HTMLElement): void`
- `createCanvasOverlay(container: HTMLElement, onResize: () => void): { canvas: HTMLCanvasElement; observer: ResizeObserver }`
- `startDrag(event: PointerEvent, container: HTMLElement): DragState`
- `moveDrag(event: PointerEvent, drag: DragState, container: HTMLElement): void`
- `dragToDataRange(drag: DragState, containerWidth: number, grid: GridLayout, dataMin: number, dataMax: number, minDragPx?: number): { min: number; max: number } | null`
- `dragToViewport(drag: DragState, containerWidth: number, containerHeight: number, grid: GridLayout, xRange: NumericRange, yRange: NumericRange, minDragPx?: number): { xMin: number; xMax: number; yMin: number; yMax: number } | null`
  - Supports horizontal-only drags by preserving the full Y range when vertical motion is below the minimum threshold.
- `ensureRelativePosition(container: HTMLElement): void`
- `initCtrlPan(opts: CtrlPanOptions): void`
  - Wires Ctrl/Meta drag panning, batches drag updates through `requestAnimationFrame`, and carries recent horizontal velocity into a decaying post-release inertia pass.
- `initBoxZoom(opts: BoxZoomOptions): HTMLElement`
- `initWheelZoom(opts: WheelZoomOptions): void`
- `initWheelZoomViewport(opts: WheelZoomViewportOptions): void`
- `tooltipRow(name: string, value: string, color?: string): string`
- `tooltipWrap(header: string, rows: string): string`
