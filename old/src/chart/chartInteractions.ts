/**
 * chartInteractions.ts — Shared chart interaction utilities.
 *
 * Extracts the selection-box-zoom and canvas-overlay patterns that were
 * duplicated between DataChart and FftChart into reusable helpers.
 */

/* ── Drag state ────────────────────────────────────────── */

export interface DragState {
    pointerId: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
}

/* ── Grid layout ───────────────────────────────────────── */

export interface GridLayout {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/* ── Selection box ─────────────────────────────────────── */

const SELECTION_BOX_CSS =
    'position:absolute;top:0;left:0;width:0;height:0;'
    + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
    + 'pointer-events:none;display:none;z-index:5';

/**
 * Create and append a selection box div to the given container.
 * Returns the div element.
 */
export function createSelectionBox(container: HTMLElement): HTMLElement {
    const box = document.createElement('div');
    box.style.cssText = SELECTION_BOX_CSS;
    container.appendChild(box);
    return box;
}

/**
 * Update the selection box position and size from the current drag state.
 * Clamps to the container dimensions given by `rect`.
 */
export function updateSelectionBox(
    box: HTMLElement,
    drag: DragState,
    containerWidth: number,
    containerHeight: number,
): void {
    const left = Math.max(0, Math.min(drag.startX, drag.endX));
    const right = Math.min(containerWidth, Math.max(drag.startX, drag.endX));
    const top = Math.max(0, Math.min(drag.startY, drag.endY));
    const bottom = Math.min(containerHeight, Math.max(drag.startY, drag.endY));
    box.style.left = `${left}px`;
    box.style.width = `${Math.max(0, right - left)}px`;
    box.style.top = `${top}px`;
    box.style.height = `${Math.max(0, bottom - top)}px`;
    box.style.display = 'block';
}

export function hideSelectionBox(box: HTMLElement): void {
    box.style.display = 'none';
}

/* ── Canvas overlay ────────────────────────────────────── */

/**
 * Create a full-size transparent canvas overlay positioned over a container.
 * Attaches a ResizeObserver that keeps the canvas dimensions in sync and
 * calls `onResize` after each resize.
 */
export function createCanvasOverlay(
    container: HTMLElement,
    onResize: () => void,
): { canvas: HTMLCanvasElement; observer: ResizeObserver } {
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6';
    container.appendChild(canvas);

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            canvas.width = entry.contentRect.width;
            canvas.height = entry.contentRect.height;
            onResize();
        }
    });
    observer.observe(container);

    return { canvas, observer };
}

/* ── Pointer-drag helpers ──────────────────────────────── */

/**
 * Begin a drag. Returns a new DragState.
 */
export function startDrag(event: PointerEvent, container: HTMLElement): DragState {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    try { container.setPointerCapture(event.pointerId); } catch { /* ignored */ }
    return { pointerId: event.pointerId, startX: x, endX: x, startY: y, endY: y };
}

/**
 * Update a drag's end coordinates.
 */
export function moveDrag(event: PointerEvent, drag: DragState, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    drag.endX = event.clientX - rect.left;
    drag.endY = event.clientY - rect.top;
}

/**
 * Convert a CSS-pixel range to a data-range within the plot area.
 * Returns null if the drag was too small to count as a zoom.
 */
export function dragToDataRange(
    drag: DragState,
    containerWidth: number,
    grid: GridLayout,
    dataMin: number,
    dataMax: number,
    minDragPx = 8,
): { min: number; max: number } | null {
    const dx = Math.abs(drag.endX - drag.startX);
    if (dx < minDragPx) return null;

    const plotLeft = grid.left;
    const plotWidth = Math.max(1, containerWidth - grid.left - grid.right);
    const x0 = Math.max(plotLeft, Math.min(drag.startX, drag.endX));
    const x1 = Math.min(plotLeft + plotWidth, Math.max(drag.startX, drag.endX));
    const range = dataMax - dataMin;
    const newMin = dataMin + ((x0 - plotLeft) / plotWidth) * range;
    const newMax = dataMin + ((x1 - plotLeft) / plotWidth) * range;
    if (newMax <= newMin) return null;
    return { min: newMin, max: newMax };
}

/**
 * Ensure a container has a non-static position so overlays work.
 */
export function ensureRelativePosition(container: HTMLElement): void {
    if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }
}

/* ── Composed box-zoom wiring ──────────────────────────── */

export interface BoxZoomOptions {
    container: HTMLElement;
    grid: GridLayout;
    getXRange: () => { min: number; max: number };
    onZoom: (min: number, max: number) => void;
    /** Return true to skip drag start (e.g. drawing mode active) */
    shouldIgnore?: (e: PointerEvent) => boolean;
    /** Called on small click (dx < 4px). */
    onClick?: (cssX: number, cssY: number) => void;
    onDblClick?: () => void;
}

/**
 * Wire up the full box-selection-zoom pattern on a chart container.
 * Returns the selection box element for external reference.
 */
export function initBoxZoom(opts: BoxZoomOptions): HTMLElement {
    const { container, grid, getXRange, onZoom, shouldIgnore, onClick, onDblClick } = opts;
    ensureRelativePosition(container);
    const selectionBox = createSelectionBox(container);
    let drag: DragState | null = null;

    container.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (shouldIgnore?.(e)) return;
        drag = startDrag(e, container);
    });

    container.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        moveDrag(e, drag, container);
        const rect = container.getBoundingClientRect();
        updateSelectionBox(selectionBox, drag, rect.width, rect.height);
    });

    const finishDrag = (e: PointerEvent) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const d = drag;
        drag = null;
        hideSelectionBox(selectionBox);
        try { container.releasePointerCapture(e.pointerId); } catch { /* ignored */ }

        const rect = container.getBoundingClientRect();
        const dx = Math.abs(d.endX - d.startX);
        const { min: xMin, max: xMax } = getXRange();

        if (dx >= 8) {
            const range = dragToDataRange(d, rect.width, grid, xMin, xMax);
            if (range) onZoom(range.min, range.max);
        } else if (dx < 4 && onClick) {
            onClick(d.startX, d.startY);
        }
    };

    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', (e) => {
        if (drag?.pointerId === e.pointerId) {
            drag = null;
            hideSelectionBox(selectionBox);
        }
    });

    if (onDblClick) {
        container.addEventListener('dblclick', (e) => {
            if ((e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey) return;
            onDblClick();
        });
    }

    return selectionBox;
}

/* ── Wheel zoom ────────────────────────────────────────── */

export interface WheelZoomOptions {
    container: HTMLElement;
    grid: GridLayout;
    getXRange: () => { min: number; max: number };
    onZoom: (min: number, max: number) => void;
    clamp?: { min: number; max: number };
}

/**
 * Wire scroll-wheel zoom on a chart container.
 */
export function initWheelZoom(opts: WheelZoomOptions): void {
    const { container, grid, getXRange, onZoom, clamp } = opts;

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const plotL = grid.left;
        const plotW = Math.max(1, rect.width - grid.left - grid.right);
        const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left - plotL) / plotW));
        const { min: curMin, max: curMax } = getXRange();
        const range = curMax - curMin;
        const focus = curMin + xNorm * range;
        const factor = e.deltaY > 0 ? 1.25 : 0.8;
        const newRange = range * factor;
        let newMin = focus - xNorm * newRange;
        let newMax = newMin + newRange;
        if (clamp) {
            newMin = Math.max(clamp.min, newMin);
            newMax = Math.min(clamp.max, newMax);
        }
        if (newMax > newMin + 1e-30) onZoom(newMin, newMax);
    }, { passive: false });
}

/* ── Tooltip builders ──────────────────────────────────── */

export function tooltipRow(name: string, value: string, color?: string): string {
    const dot = color
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span>`
        : '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">${dot}<span>${name}</span><span style="font-variant-numeric:tabular-nums;font-weight:600;">${value}</span></div>`;
}

export function tooltipWrap(header: string, rows: string): string {
    return `<div style="opacity:0.8;margin-bottom:6px;">${header}</div>${rows}`;
}
