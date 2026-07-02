# ai/frontend/src/chart/chartInteractions.md
> Shared chart interaction utilities: drag-state, grid layout, selection box, canvas overlay, box-zoom, and wheel-zoom helpers.

## Interfaces
- `DragState` — `{ pointerId: number; startX: number; endX: number; startY: number; endY: number }`
- `GridLayout` — `{ left: number; right: number; top: number; bottom: number }`
- `NumericRange` — `{ min: number; max: number }`
- `BoxZoomOptions` — `{ container: HTMLElement; grid: GridLayout; getXRange: () => NumericRange; getYRange?: () => NumericRange; onZoom: (min: number, max: number) => void | (view: { xMin: number; xMax: number; yMin: number; yMax: number }) => void; shouldIgnore?: (e: PointerEvent) => boolean; onClick?: (cssX: number, cssY: number) => void; onDblClick?: () => void }`
- `WheelZoomOptions` — `{ container: HTMLElement; grid: GridLayout; getXRange: () => NumericRange; onZoom: (min: number, max: number) => void; clamp?: NumericRange }`
- `WheelZoomViewportOptions` — `{ container: HTMLElement; grid: GridLayout; getXRange: () => NumericRange; getYRange: () => NumericRange; onZoom: (view: { xMin: number; xMax: number; yMin: number; yMax: number }) => void; clampX?: NumericRange; clampY?: NumericRange; shouldIgnore?: (e: WheelEvent) => boolean; zoomInFactor?: number; zoomOutFactor?: number }`
- `CtrlPanOptions` — `{ container: HTMLElement; grid: GridLayout; getXRange: () => NumericRange; getYRange: () => NumericRange | null; onPan: (view: { xMin: number; xMax: number; yMin: number; yMax: number } | { xMin: number; xMax: number }) => void; shouldIgnore?: (e: PointerEvent) => boolean; minDragPx?: number }` — Pan only fires while `ctrlKey || metaKey` is held; `shouldIgnore` is invoked on `pointerdown` (e.g. draw mode); `minDragPx` defaults to 4 CSS pixels.

## Functions
- `createSelectionBox(container: HTMLElement): HTMLElement` — Creates and appends a selection-box div to the container.
- `updateSelectionBox(box: HTMLElement, drag: DragState, containerWidth: number, containerHeight: number): void` — Updates the box position and size from the current drag state.
- `hideSelectionBox(box: HTMLElement): void` — Hides the selection box.
- `createCanvasOverlay(container: HTMLElement, onResize: () => void): { canvas: HTMLCanvasElement; observer: ResizeObserver }` — Creates a transparent full-size canvas overlay with a ResizeObserver.
- `startDrag(event: PointerEvent, container: HTMLElement): DragState` — Begins a drag with pointer capture.
- `moveDrag(event: PointerEvent, drag: DragState, container: HTMLElement): void` — Updates drag end coordinates.
- `dragToDataRange(drag: DragState, containerWidth: number, grid: GridLayout, dataMin: number, dataMax: number, minDragPx?: number): { min: number; max: number } | null` — Converts a CSS-pixel drag to a data range; returns null if drag is too small.
- `dragToViewport(drag: DragState, containerWidth: number, containerHeight: number, grid: GridLayout, xRange: NumericRange, yRange: NumericRange, minDragPx?: number): { xMin: number; xMax: number; yMin: number; yMax: number } | null` [deps: [SCATTER_PLOT_GRID][1]]
  - Converts a CSS-pixel box to a 2D viewport using the grid layout. Honors the `SCATTER_PLOT_GRID` padding so drags that start at the plot's left edge map to `view.xMin` exactly. Returns null when the drag is shorter than `minDragPx` in either axis.
- `ensureRelativePosition(container: HTMLElement): void` — Sets `position: relative` on the container if it is statically positioned.
- `initBoxZoom(opts: BoxZoomOptions): HTMLElement` — Wires up the full box-selection-zoom pattern; returns the selection box element. Routes to `dragToDataRange` (x-only) or `dragToViewport` (2D) depending on whether `getYRange` is provided.
- `initCtrlPan(opts: CtrlPanOptions): void` — Wires up a Ctrl/Meta + left-button drag that pans the visible view. Each `pointermove` computes the new x range (and y range when `getYRange` is non-null), batches callbacks into a single `requestAnimationFrame` per frame, and forwards the result via `onPan`. `pointerdown` is only consumed when Ctrl is held so the existing selection-zoom and click handlers are unaffected.
- `initWheelZoom(opts: WheelZoomOptions): void` — Wires up scroll-wheel zoom with optional clamping.
- `initWheelZoomViewport(opts: WheelZoomViewportOptions): void` — Wires up 2D scroll-wheel zoom that preserves aspect ratio and clamps each axis to the data range.

---
[1]: ../scatter/layout.md#SCATTER_PLOT_GRID
