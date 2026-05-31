# ai/frontend/src/chart/chartInteractions.md
> Shared chart interaction utilities: drag-state, grid layout, selection box, canvas overlay, box-zoom, and wheel-zoom helpers.

## Interfaces
- `DragState` — `{ pointerId: number; startX: number; endX: number; startY: number; endY: number }`
- `GridLayout` — `{ left: number; right: number; top: number; bottom: number }`
- `BoxZoomOptions` — `{ container: HTMLElement; grid: GridLayout; getXRange: () => { min: number; max: number }; onZoom: (min: number, max: number) => void; shouldIgnore?: (e: PointerEvent) => boolean; onClick?: (cssX: number, cssY: number) => void; onDblClick?: () => void }`
- `WheelZoomOptions` — `{ container: HTMLElement; grid: GridLayout; getXRange: () => { min: number; max: number }; onZoom: (min: number, max: number) => void; clamp?: { min: number; max: number } }`

## Functions
- `createSelectionBox(container: HTMLElement): HTMLElement` — Creates and appends a selection-box div to the container.
- `updateSelectionBox(box: HTMLElement, drag: DragState, containerWidth: number, containerHeight: number): void` — Updates the box position and size from the current drag state.
- `hideSelectionBox(box: HTMLElement): void` — Hides the selection box.
- `createCanvasOverlay(container: HTMLElement, onResize: () => void): { canvas: HTMLCanvasElement; observer: ResizeObserver }` — Creates a transparent full-size canvas overlay with a ResizeObserver.
- `startDrag(event: PointerEvent, container: HTMLElement): DragState` — Begins a drag with pointer capture.
- `moveDrag(event: PointerEvent, drag: DragState, container: HTMLElement): void` — Updates drag end coordinates.
- `dragToDataRange(drag: DragState, containerWidth: number, grid: GridLayout, dataMin: number, dataMax: number, minDragPx?: number): { min: number; max: number } | null` — Converts a CSS-pixel drag to a data range; returns null if drag is too small.
- `ensureRelativePosition(container: HTMLElement): void` — Sets `position: relative` on the container if it is statically positioned.
- `initBoxZoom(opts: BoxZoomOptions): HTMLElement` — Wires up the full box-selection-zoom pattern; returns the selection box element.
- `initWheelZoom(opts: WheelZoomOptions): void` — Wires up scroll-wheel zoom with optional clamping.

---
[1]: ../store/appStateCompat.md#appState
