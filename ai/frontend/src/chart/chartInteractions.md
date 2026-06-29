# ai/frontend/src/chart/chartInteractions.md
> Shared chart interaction primitives — box zoom, Ctrl+drag pan, wheel zoom, drawing overlays, and tooltip helpers.

## Interfaces
- `export interface DragState { startX, startY, containerRect: DOMRect }` — Pointer drag state during box zoom initialization.
- `export interface GridLayout { left, right, top, bottom }` — Chart grid padding (pixels).
- `export interface NumericRange { min: number; max: number }` — Simple numeric range type used by zoom helpers.
- `export interface CtrlPanOptions { container, grid, getXRange, getYRange?, shouldIgnore?, onPan, onDblClick? }` [deps: [GridLayout][1], [ViewSnapshot][2]] — Ctrl+drag pan configuration.
- `export interface XOnlyBoxZoomOptions { container, grid, getXRange, getYRange?, onZoom, shouldIgnore?, onDblClick? }` — X-only box zoom (time axis only).
- `export interface ViewportBoxZoomOptions { container, grid, getXRange, getYRange, onZoom, shouldIgnore?, onDblClick? }` — Full viewport box zoom.
- `export type BoxZoomOptions = XOnlyBoxZoomOptions | ViewportBoxZoomOptions` — Union of box zoom option types.
- `export interface WheelZoomOptions { container, getXRange, getYRange, onZoom, shouldIgnore?, onDblClick? }` — Mouse wheel zoom config.
- `export interface WheelZoomViewportOptions { container, grid, getXRange, getYRange, onZoom, shouldIgnore?, onDblClick? }` — Viewport-aware mouse wheel zoom.

## Functions
- `export function createSelectionBox(container: HTMLElement): HTMLElement` [deps: [GridLayout][1]]
  - Creates a selection box overlay element positioned within the chart container.

- `export function updateSelectionBox(box, startX, startY, currentX, currentY): void` — Updates selection box geometry during drag.

- `export function hideSelectionBox(box: HTMLElement): void` — Hides the selection box (removes from DOM or sets display:none).

- `export function createCanvasOverlay(container, onResize: () => void) -> { canvas, observer }` [deps: [GridLayout][1]]
  - Creates a drawing overlay canvas with ResizeObserver for automatic resize handling.

- `export function startDrag(event: PointerEvent, container: HTMLElement): DragState` — Initializes drag state from pointer event and container bounds.

- `export function moveDrag(event: PointerEvent, drag: DragState, container: HTMLElement): void` — Updates drag geometry during pointermove.

- `export function dragToDataRange(clientX, clientY, rangeMin, rangeMax) -> number | null` — Maps CSS coordinate to data range value (0–1 normalized).

- `export function dragToViewport(clientX, clientY, containerRect: DOMRect) -> { x, y }` — Maps pointer event to viewport-relative coordinates.

- `export function ensureRelativePosition(container: HTMLElement): void` — Ensures the container has relative positioning for absolute child elements.

- `export function initCtrlPan(opts: CtrlPanOptions): void` [deps: [ViewSnapshot][2]]
  - Wires up Ctrl/Meta + left-button drag to pan the visible view, forwarding new view through `onPan`.

- `export function initBoxZoom(opts: BoxZoomOptions): HTMLElement` — Creates selection box and wires pointer events for mouse-selection zoom.

- `export function initWheelZoom(opts: WheelZoomOptions): void` — Wires up mouse wheel to zoom the time axis.

- `export function initWheelZoomViewport(opts: WheelZoomViewportOptions): void` — Viewport-aware mouse wheel zoom with grid-based coordinate mapping.

- `export function tooltipRow(name, value, color?): string` — Formats a single tooltip row HTML string.

- `export function tooltipWrap(header, rows: string): string` — Wraps header + rows in tooltip container HTML.

[deps: [GridLayout][1], [ViewSnapshot][2]]

---
[1]: #GridLayout
[2]: ../types.md#ViewSnapshot