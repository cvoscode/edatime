import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appState } from '../store/appStateCompat.js';
import { initSelectionZoom, applyView, resetView } from './rendering.js';
import { SCATTER_PLOT_GRID, getScatterPlotMetrics } from './layout.js';

/* ── Helpers ──────────────────────────────────────────── */

function bindRect(element: HTMLElement, width: number, height: number) {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            width,
            height,
            toJSON: () => ({}),
        }),
    });
}

function resetState(): void {
    appState.scatter.selectionBox = null;
    appState.scatter.drag = null;
    appState.scatter.zoomHistory = [];
    appState.scatter.view = { xMin: -2.16, xMax: 110.05, yMin: -30.63, yMax: 37.75 };
    appState.scatter.full = { ...appState.scatter.view };
    appState.scatter.chart = { setOption: vi.fn(), resize: vi.fn() } as any;
}

function dispatchPointer(target: HTMLElement, type: string, opts: { clientX: number; clientY: number; pointerId?: number }): void {
    const ev = new PointerEvent(type, {
        button: 0,
        pointerId: opts.pointerId ?? 1,
        clientX: opts.clientX,
        clientY: opts.clientY,
        bubbles: true,
    });
    target.dispatchEvent(ev);
}

/* ── Tests ────────────────────────────────────────────── */

describe('scatter selection zoom (initSelectionZoom)', () => {
    let container: HTMLElement;
    const CONTAINER_WIDTH = 800;
    const CONTAINER_HEIGHT = 600;

    beforeEach(() => {
        document.body.innerHTML = '<div id="scatter-chart"></div>';
        container = document.getElementById('scatter-chart') as HTMLElement;
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        bindRect(container, CONTAINER_WIDTH, CONTAINER_HEIGHT);
        resetState();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('maps a drag that covers the full plot area to the full data domain', () => {
        initSelectionZoom(container);
        const metrics = getScatterPlotMetrics(CONTAINER_WIDTH, CONTAINER_HEIGHT);

        dispatchPointer(container, 'pointerdown', {
            clientX: metrics.plotLeft,
            clientY: metrics.plotTop,
        });
        dispatchPointer(container, 'pointermove', {
            clientX: metrics.plotRight,
            clientY: metrics.plotBottom,
        });
        dispatchPointer(container, 'pointerup', {
            clientX: metrics.plotRight,
            clientY: metrics.plotBottom,
        });

        // Full-plot drag covers the full view — applying it on top of the
        // current view should leave the bounds essentially unchanged.
        expect(appState.scatter.view.xMin).toBeCloseTo(appState.scatter.full.xMin, 6);
        expect(appState.scatter.view.xMax).toBeCloseTo(appState.scatter.full.xMax, 6);
        expect(appState.scatter.view.yMin).toBeCloseTo(appState.scatter.full.yMin, 6);
        expect(appState.scatter.view.yMax).toBeCloseTo(appState.scatter.full.yMax, 6);
    });

    it('does not skew the zoom by the SCATTER_PLOT_GRID padding', () => {
        // Without grid awareness, the old implementation would map a drag
        // that starts at the plot's left edge (which is grid.left pixels in
        // from the container's left edge) to a data x just past view.xMin
        // instead of exactly view.xMin. Verify the grid padding is honored.
        initSelectionZoom(container);
        const metrics = getScatterPlotMetrics(CONTAINER_WIDTH, CONTAINER_HEIGHT);

        dispatchPointer(container, 'pointerdown', {
            clientX: metrics.plotLeft,
            clientY: metrics.plotTop,
        });
        dispatchPointer(container, 'pointermove', {
            clientX: metrics.plotLeft + 50,
            clientY: metrics.plotTop + metrics.plotHeight / 2,
        });
        dispatchPointer(container, 'pointerup', {
            clientX: metrics.plotLeft + 50,
            clientY: metrics.plotTop + metrics.plotHeight / 2,
        });

        // xMin must be exactly the current xMin — no left-padding offset.
        expect(appState.scatter.view.xMin).toBeCloseTo(appState.scatter.full.xMin, 6);
        // y should be mapped from the plot grid, not the full container.
        const ySpan = appState.scatter.full.yMax - appState.scatter.full.yMin;
        const expectedYMin = appState.scatter.full.yMax - (metrics.plotHeight / 2 / metrics.plotHeight) * ySpan;
        expect(appState.scatter.view.yMin).toBeCloseTo(expectedYMin, 6);
        expect(appState.scatter.view.yMax).toBeCloseTo(appState.scatter.full.yMax, 6);
        // xMax should advance by (50 / plotWidth) of the x span, not the
        // container width.
        const xSpan = appState.scatter.full.xMax - appState.scatter.full.xMin;
        const expected = appState.scatter.full.xMin + (50 / metrics.plotWidth) * xSpan;
        expect(appState.scatter.view.xMax).toBeCloseTo(expected, 6);
    });

    it('clamps a drag that starts outside the plot area to the plot area', () => {
        initSelectionZoom(container);
        // Start the drag inside the y-axis label area (left of the plot).
        dispatchPointer(container, 'pointerdown', { clientX: 5, clientY: 5 });
        dispatchPointer(container, 'pointermove', { clientX: 10, clientY: 10 });
        dispatchPointer(container, 'pointerup', { clientX: 10, clientY: 10 });

        // Drag is below the 8px threshold relative to the plot area, so no
        // zoom should be applied.
        expect(appState.scatter.view.xMin).toBe(appState.scatter.full.xMin);
        expect(appState.scatter.view.xMax).toBe(appState.scatter.full.xMax);
    });

    it('ignores drags shorter than 8 pixels in either dimension', () => {
        initSelectionZoom(container);
        const metrics = getScatterPlotMetrics(CONTAINER_WIDTH, CONTAINER_HEIGHT);

        dispatchPointer(container, 'pointerdown', {
            clientX: metrics.plotLeft + 20,
            clientY: metrics.plotTop + 20,
        });
        dispatchPointer(container, 'pointermove', {
            clientX: metrics.plotLeft + 24, // only 4px wide
            clientY: metrics.plotTop + 200,
        });
        dispatchPointer(container, 'pointerup', {
            clientX: metrics.plotLeft + 24,
            clientY: metrics.plotTop + 200,
        });

        expect(appState.scatter.view).toEqual(appState.scatter.full);
    });

    it('requires a real box selection before zooming density plots', () => {
        document.body.innerHTML += `
            <select id="scatter-render-mode">
                <option value="density" selected>Density</option>
            </select>
        `;
        initSelectionZoom(container);
        const metrics = getScatterPlotMetrics(CONTAINER_WIDTH, CONTAINER_HEIGHT);

        dispatchPointer(container, 'pointerdown', {
            clientX: metrics.plotLeft + 20,
            clientY: metrics.plotTop + 120,
        });
        dispatchPointer(container, 'pointermove', {
            clientX: metrics.plotLeft + 220,
            clientY: metrics.plotTop + 123,
        });
        dispatchPointer(container, 'pointerup', {
            clientX: metrics.plotLeft + 220,
            clientY: metrics.plotTop + 123,
        });

        expect(appState.scatter.view).toEqual(appState.scatter.full);
        expect(appState.scatter.zoomHistory).toEqual([]);
    });

    it('pushes the prior view onto the zoom history on each successful zoom', () => {
        initSelectionZoom(container);
        const metrics = getScatterPlotMetrics(CONTAINER_WIDTH, CONTAINER_HEIGHT);

        // First zoom: shrink the view horizontally.
        dispatchPointer(container, 'pointerdown', {
            clientX: metrics.plotLeft,
            clientY: metrics.plotTop,
        });
        dispatchPointer(container, 'pointermove', {
            clientX: metrics.plotLeft + metrics.plotWidth / 2,
            clientY: metrics.plotBottom,
        });
        dispatchPointer(container, 'pointerup', {
            clientX: metrics.plotLeft + metrics.plotWidth / 2,
            clientY: metrics.plotBottom,
        });

        expect(appState.scatter.zoomHistory.length).toBe(1);
        expect(appState.scatter.zoomHistory[0]).toEqual(appState.scatter.full);
    });
});

describe('scatter non-box gestures (initSelectionZoom)', () => {
    let container: HTMLElement;
    const CONTAINER_WIDTH = 800;
    const CONTAINER_HEIGHT = 600;

    function dispatchWheel(target: HTMLElement, opts: { deltaY: number; clientX: number; clientY: number }): boolean {
        const ev = new Event('wheel', { bubbles: true, cancelable: true }) as unknown as WheelEvent;
        Object.defineProperty(ev, 'deltaY', { value: opts.deltaY });
        Object.defineProperty(ev, 'clientX', { value: opts.clientX });
        Object.defineProperty(ev, 'clientY', { value: opts.clientY });
        return target.dispatchEvent(ev);
    }

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="scatter-chart"></div>
            <select id="scatter-render-mode">
                <option value="density" selected>Density</option>
            </select>
        `;
        container = document.getElementById('scatter-chart') as HTMLElement;
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        bindRect(container, CONTAINER_WIDTH, CONTAINER_HEIGHT);
        resetState();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('does not zoom density plots from the mouse wheel', () => {
        initSelectionZoom(container);
        const metrics = getScatterPlotMetrics(CONTAINER_WIDTH, CONTAINER_HEIGHT);
        const cx = metrics.plotLeft + metrics.plotWidth / 2;
        const cy = metrics.plotTop + metrics.plotHeight / 2;
        dispatchWheel(container, { deltaY: -100, clientX: cx, clientY: cy });

        expect(appState.scatter.view).toEqual(appState.scatter.full);
        expect(appState.scatter.zoomHistory).toEqual([]);
    });
});

describe('scatter view reset / history pop', () => {
    let container: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '<div id="scatter-chart"></div>';
        container = document.getElementById('scatter-chart') as HTMLElement;
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        bindRect(container, 800, 600);
        resetState();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('resetView restores the full data domain and clears history by default', () => {
        appState.scatter.view = { xMin: 0, xMax: 50, yMin: 0, yMax: 50 };
        appState.scatter.zoomHistory = [{ xMin: 0, xMax: 25, yMin: 0, yMax: 25 }];
        resetView();
        expect(appState.scatter.view).toEqual(appState.scatter.full);
        expect(appState.scatter.zoomHistory.length).toBe(0);
    });

    it('applyView with pushHistory=true records the previous view for undo', () => {
        appState.scatter.full = { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };
        appState.scatter.view = { ...appState.scatter.full };
        appState.scatter.zoomHistory = [];

        applyView({ xMin: 10, xMax: 90, yMin: 10, yMax: 90 }, true);
        expect(appState.scatter.zoomHistory.length).toBe(1);
        expect(appState.scatter.zoomHistory[0]).toEqual({ xMin: 0, xMax: 100, yMin: 0, yMax: 100 });
        expect(appState.scatter.view).toEqual({ xMin: 10, xMax: 90, yMin: 10, yMax: 90 });
    });
});
