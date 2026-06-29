import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    initBoxZoom,
    initCtrlPan,
    initWheelZoomViewport,
} from './chartInteractions.js';

describe('initBoxZoom', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="chart"></div>';
    });

    it('converts a drag box into a full viewport snapshot with x and y ranges', () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onZoom = vi.fn();

        initBoxZoom({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        } as any);

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 100,
            clientY: 60,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 200,
            clientY: 140,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 1,
            clientX: 200,
            clientY: 140,
            bubbles: true,
        }));

        expect(onZoom).toHaveBeenCalledWith({
            xMin: 25,
            xMax: 75,
            yMin: 25,
            yMax: 75,
        });
    });

    it('treats a horizontal-only drag as a full x-zoom with the full y-range', () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onZoom = vi.fn();

        initBoxZoom({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 10, max: 90 }),
            onZoom,
        } as any);

        // Horizontal-only drag (dy = 2px, dx = 100px): the box zoom should
        // still fire and report the full current y-range.
        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 100,
            clientY: 80,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 200,
            clientY: 82,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 1,
            clientX: 200,
            clientY: 82,
            bubbles: true,
        }));

        expect(onZoom).toHaveBeenCalledTimes(1);
        expect(onZoom).toHaveBeenCalledWith({
            xMin: 25,
            xMax: 75,
            yMin: 10,
            yMax: 90,
        });
    });

    it('ignores a drag that does not clear the minimum horizontal distance', () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onZoom = vi.fn();

        initBoxZoom({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 10, max: 90 }),
            onZoom,
        } as any);

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 100,
            clientY: 80,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 103,
            clientY: 82,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 1,
            clientX: 103,
            clientY: 82,
            bubbles: true,
        }));

        expect(onZoom).not.toHaveBeenCalled();
    });
});

/* ── initWheelZoomViewport ──────────────────────────────────── */

describe('initWheelZoomViewport', () => {
    let container: HTMLElement;
    const W = 300;
    const H = 200;
    const GRID = { left: 50, right: 50, top: 20, bottom: 20 };

    beforeEach(() => {
        document.body.innerHTML = '<div id="wheel-chart"></div>';
        container = document.getElementById('wheel-chart') as HTMLElement;
        container.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: W, bottom: H, width: W, height: H,
            toJSON: () => ({}),
        } as DOMRect);
    });

    function dispatchWheel(target: HTMLElement, opts: { deltaY: number; clientX: number; clientY: number; cancelable?: boolean }): boolean {
        // happy-dom's WheelEvent constructor does not honour the `clientX`
        // / `clientY` options, so we build a base Event and graft the
        // properties the wheel handler reads.
        const ev = new Event('wheel', { bubbles: true, cancelable: opts.cancelable ?? true }) as unknown as WheelEvent;
        Object.defineProperty(ev, 'deltaY', { value: opts.deltaY });
        Object.defineProperty(ev, 'clientX', { value: opts.clientX });
        Object.defineProperty(ev, 'clientY', { value: opts.clientY });
        return target.dispatchEvent(ev);
    }

    it('zooms in (range shrinks) when the wheel scrolls up (deltaY < 0)', () => {
        const onZoom = vi.fn();
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        });

        // Cursor sits in the middle of the plot area (x = plotLeft + plotW/2,
        // y = plotTop + plotH/2). Container is 300x200, plot is 200x160.
        const plotL = GRID.left;
        const plotR = W - GRID.right;
        const plotT = GRID.top;
        const plotB = H - GRID.bottom;
        const midX = (plotL + plotR) / 2;
        const midY = (plotT + plotB) / 2;

        dispatchWheel(container, { deltaY: -100, clientX: midX, clientY: midY });

        expect(onZoom).toHaveBeenCalledTimes(1);
        const next = onZoom.mock.calls[0][0];
        // Aspect ratio preserved: x and y ranges should shrink by the same factor.
        expect(next.xMax - next.xMin).toBeCloseTo(100 * 0.8, 6);
        expect(next.yMax - next.yMin).toBeCloseTo(100 * 0.8, 6);
        // Focal point stays under the cursor (middle).
        expect((next.xMin + next.xMax) / 2).toBeCloseTo(50, 6);
        expect((next.yMin + next.yMax) / 2).toBeCloseTo(50, 6);
    });

    it('zooms out (range grows) when the wheel scrolls down (deltaY > 0)', () => {
        const onZoom = vi.fn();
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        });

        const plotL = GRID.left;
        const plotR = W - GRID.right;
        const plotT = GRID.top;
        const plotB = H - GRID.bottom;
        const midX = (plotL + plotR) / 2;
        const midY = (plotT + plotB) / 2;

        dispatchWheel(container, { deltaY: 100, clientX: midX, clientY: midY });

        expect(onZoom).toHaveBeenCalledTimes(1);
        const next = onZoom.mock.calls[0][0];
        expect(next.xMax - next.xMin).toBeCloseTo(100 * 1.25, 6);
        expect(next.yMax - next.yMin).toBeCloseTo(100 * 1.25, 6);
    });

    it('keeps the cursor focal point under the mouse x position', () => {
        const onZoom = vi.fn();
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        });

        // Cursor at 25% of the plot width.
        const plotL = GRID.left;
        const plotW = W - GRID.left - GRID.right;
        const cursorX = plotL + plotW * 0.25;
        const cursorY = GRID.top + (H - GRID.top - GRID.bottom) * 0.5;

        dispatchWheel(container, { deltaY: -100, clientX: cursorX, clientY: cursorY });
        const next = onZoom.mock.calls[0][0];
        const xFocus = next.xMin + 0.25 * (next.xMax - next.xMin);
        // The data point that was under the cursor (25% into the data range)
        // should still be under it after zoom.
        expect(xFocus).toBeCloseTo(25, 6);
    });

    it('clamps the new view against the supplied clamp bounds', () => {
        const onZoom = vi.fn();
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            clampX: { min: 0, max: 100 },
            clampY: { min: 0, max: 100 },
            onZoom,
        });

        // Aggressively zoom out: a single 1.25x step would push the range to
        // 125, so the clamp should keep it at 100.
        const plotL = GRID.left;
        const plotR = W - GRID.right;
        const plotT = GRID.top;
        const plotB = H - GRID.bottom;
        const midX = (plotL + plotR) / 2;
        const midY = (plotT + plotB) / 2;

        dispatchWheel(container, { deltaY: 100, clientX: midX, clientY: midY });
        const next = onZoom.mock.calls[0][0];
        expect(next.xMin).toBe(0);
        expect(next.xMax).toBe(100);
        expect(next.yMin).toBe(0);
        expect(next.yMax).toBe(100);
    });

    it('does not fire onZoom when shouldIgnore returns true', () => {
        const onZoom = vi.fn();
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
            shouldIgnore: () => true,
        });

        dispatchWheel(container, { deltaY: -100, clientX: 100, clientY: 100 });
        expect(onZoom).not.toHaveBeenCalled();
    });

    it('ignores wheel events that originate inside form controls', () => {
        const onZoom = vi.fn();
        container.innerHTML = '<select id="x"><option>A</option><option>B</option></select>';
        const select = container.querySelector('select') as HTMLElement;
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        });

        dispatchWheel(select, { deltaY: -100, clientX: 100, clientY: 100 });
        expect(onZoom).not.toHaveBeenCalled();
    });

    it('preventDefault on the wheel event so the page does not scroll under the cursor', () => {
        const onZoom = vi.fn();
        initWheelZoomViewport({
            container,
            grid: GRID,
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: 0, max: 100 }),
            onZoom,
        });

        const prevented = dispatchWheel(container, { deltaY: -100, clientX: 100, clientY: 100 });
        expect(prevented).toBe(false); // default was prevented
        expect(onZoom).toHaveBeenCalledTimes(1);
    });
});

describe('initCtrlPan', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="chart"></div>';
    });

    it('shifts xMin/xMax opposite to the cursor when Ctrl is held', async () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onPan = vi.fn();
        initCtrlPan({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 1000, max: 1100 }),
            getYRange: () => null,
            onPan,
        });

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            ctrlKey: true,
            pointerId: 7,
            clientX: 100,
            clientY: 100,
            bubbles: true,
        }));
        // Drag right 50px → x range should shift left by 25% of span (25).
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 7,
            ctrlKey: true,
            clientX: 150,
            clientY: 100,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 7,
            clientX: 150,
            clientY: 100,
            bubbles: true,
        }));

        // Allow the rAF callback to flush.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        expect(onPan).toHaveBeenCalled();
        const view = onPan.mock.calls[0][0];
        expect(view.xMin).toBeCloseTo(975, 5);
        expect(view.xMax).toBeCloseTo(1075, 5);
    });

    it('does not pan without Ctrl held', async () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onPan = vi.fn();
        initCtrlPan({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => null,
            onPan,
        });

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            pointerId: 7,
            clientX: 100,
            clientY: 100,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 7,
            clientX: 150,
            clientY: 100,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 7,
            clientX: 150,
            clientY: 100,
            bubbles: true,
        }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        expect(onPan).not.toHaveBeenCalled();
    });

    it('also shifts yMin/yMax when a y range is known', async () => {
        const container = document.getElementById('chart') as HTMLElement & {
            setPointerCapture?: (pointerId: number) => void;
            releasePointerCapture?: (pointerId: number) => void;
        };
        container.style.position = 'relative';
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 300,
            bottom: 200,
            width: 300,
            height: 200,
            toJSON: () => ({}),
        } as DOMRect);

        const onPan = vi.fn();
        initCtrlPan({
            container,
            grid: { left: 50, right: 50, top: 20, bottom: 20 },
            getXRange: () => ({ min: 0, max: 100 }),
            getYRange: () => ({ min: -50, max: 50 }),
            onPan,
        });

        container.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0,
            ctrlKey: true,
            pointerId: 8,
            clientX: 150,
            clientY: 100,
            bubbles: true,
        }));
        // Drag down 40px on a 160px plot (25% of plot height) →
        // y range shifts by 25% of the span (25) in the same direction.
        container.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 8,
            ctrlKey: true,
            clientX: 150,
            clientY: 140,
            bubbles: true,
        }));
        container.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 8,
            clientX: 150,
            clientY: 140,
            bubbles: true,
        }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        expect(onPan).toHaveBeenCalled();
        const view = onPan.mock.calls[0][0];
        expect(view.yMin).toBeCloseTo(-25, 5);
        expect(view.yMax).toBeCloseTo(75, 5);
    });
});
