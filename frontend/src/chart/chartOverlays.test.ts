import { describe, expect, it, vi } from 'vitest';

import { ChartOverlays } from './chartOverlays.js';

describe('ChartOverlays adaptive filter presentation', () => {
    it('projects source-unit range and adaptive filters into the normalized trace scale', () => {
        const container = document.createElement('div');
        container.getBoundingClientRect = () => ({ width: 240, height: 140 }) as DOMRect;
        const ctx = {
            save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
            moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
            strokeRect: vi.fn(), strokeText: vi.fn(), measureText: () => ({ width: 80 }),
        } as unknown as CanvasRenderingContext2D;
        const overlays = new ChartOverlays({
            getXMin: () => 0, getXMax: () => 100, getContainer: () => container, getOverlayCanvas: () => null,
            getGrid: () => ({ left: 44, right: 16, top: 10, bottom: 30 }), getYRange: () => ({ min: 0, max: 1 }),
            toDisplayY: (column, y) => column === 'HULL' ? (y - 20) / 20 : y,
            getColumnRangeFilters: () => ({ HULL: { from: 20, to: 40 } }),
            getAdaptiveLineFilters: () => [{ id: 'filter', column: 'HULL', x1: 0, x2: 100, y1: 30, y2: 40, keepAbove: false }],
            getPendingAdaptivePoint: () => null,
        });
        overlays.setSelectedColumns(['HULL']);
        overlays.renderAll(ctx, { x: 1, y: 1 });
        expect(ctx.strokeRect).toHaveBeenCalledWith(54, 10, 170, 100);
        expect(ctx.strokeText).toHaveBeenCalledWith('HULL [20.00, 40.00]', 60, expect.any(Number));
        expect(ctx.moveTo).toHaveBeenCalledWith(44, 60);
        expect(ctx.lineTo).toHaveBeenCalledWith(224, 10);
    });

    it('clips a column-range band to the plot and gives it a contrasted range label', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ width: 240, height: 140 }),
        });
        const fillRect = vi.fn();
        const fillText = vi.fn();
        const strokeRect = vi.fn();
        const ctx = {
            save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
            rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
            fillRect, fillText, strokeRect, strokeText: vi.fn(), arc: vi.fn(), fill: vi.fn(),
            measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
            lineCap: 'butt', lineJoin: 'miter', strokeStyle: '', fillStyle: '', lineWidth: 1,
            font: '', textAlign: 'start', textBaseline: 'alphabetic',
        } as unknown as CanvasRenderingContext2D;
        const overlays = new ChartOverlays({
            getXMin: () => 0,
            getXMax: () => 100,
            getContainer: () => container,
            getOverlayCanvas: () => null,
            getGrid: () => ({ left: 44, right: 16, top: 10, bottom: 30 }),
            getYRange: () => ({ min: 0, max: 100 }),
            getColumnRangeFilters: () => ({ HULL: { from: 5, to: 12 } }),
            getAdaptiveLineFilters: () => [],
            getPendingAdaptivePoint: () => null,
        });
        overlays.setSelectedColumns(['HULL']);

        overlays.renderAll(ctx, { x: 1, y: 1 });

        expect(ctx.rect).toHaveBeenCalledWith(44, 10, 180, 100);
        expect(ctx.clip).toHaveBeenCalledOnce();
        expect(strokeRect).toHaveBeenCalledWith(54, 98, 170, 7);
        expect(ctx.strokeText).toHaveBeenCalledWith('HULL [5.00, 12.00]', 60, expect.any(Number));
        expect(fillText).toHaveBeenCalledWith('HULL [5.00, 12.00]', 60, expect.any(Number));
        const labelBackground = fillRect.mock.calls.at(-1)! as number[];
        expect(labelBackground[0]).toBeGreaterThan(44);
        expect(labelBackground[1]).toBeGreaterThanOrEqual(10);
        expect(labelBackground[1] + labelBackground[3]).toBeLessThanOrEqual(110);
    });

    it('hides a range label when the trace legend leaves no non-overlapping position', () => {
        const container = document.createElement('div');
        const legend = document.createElement('div');
        legend.className = 'timeseries-legend-overlay';
        container.appendChild(legend);
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ left: 0, top: 0, right: 240, bottom: 140, width: 240, height: 140 }),
        });
        Object.defineProperty(legend, 'getBoundingClientRect', {
            value: () => ({ left: 50, top: 88, right: 190, bottom: 112, width: 140, height: 24 }),
        });
        const fillText = vi.fn();
        const ctx = {
            save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
            rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), fillText, strokeRect: vi.fn(),
            strokeText: vi.fn(), measureText: vi.fn(() => ({ width: 150 })),
            lineCap: 'butt', lineJoin: 'miter', strokeStyle: '', fillStyle: '', lineWidth: 1,
            font: '', textAlign: 'start', textBaseline: 'alphabetic',
        } as unknown as CanvasRenderingContext2D;
        const overlays = new ChartOverlays({
            getXMin: () => 0, getXMax: () => 100, getContainer: () => container,
            getOverlayCanvas: () => null,
            getGrid: () => ({ left: 44, right: 16, top: 10, bottom: 30 }),
            getYRange: () => ({ min: 0, max: 100 }),
            getColumnRangeFilters: () => ({ HULL: { from: 5, to: 12 } }),
            getAdaptiveLineFilters: () => [], getPendingAdaptivePoint: () => null,
        });
        overlays.setSelectedColumns(['HULL']);

        overlays.renderAll(ctx, { x: 1, y: 1 });

        expect(fillText).not.toHaveBeenCalled();
    });

    it('clips the line and keeps its contrasted label inside the resized plot', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ width: 200, height: 100 }),
        });
        const fillRect = vi.fn();
        const fillText = vi.fn();
        const ctx = {
            save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
            rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
            fillRect, fillText, arc: vi.fn(), fill: vi.fn(),
            measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
            lineCap: 'butt', lineJoin: 'miter', strokeStyle: '', fillStyle: '', lineWidth: 1,
            font: '', textAlign: 'start', textBaseline: 'alphabetic',
        } as unknown as CanvasRenderingContext2D;
        const overlays = new ChartOverlays({
            getXMin: () => 0,
            getXMax: () => 100,
            getContainer: () => container,
            getOverlayCanvas: () => null,
            getGrid: () => ({ left: 40, right: 20, top: 10, bottom: 30 }),
            getYRange: () => ({ min: 0, max: 10 }),
            getAdaptiveLineFilters: () => [{
                id: 'filter-1', column: 'A very long signal column name',
                x1: 0, y1: -100, x2: 100, y2: 200, keepAbove: true,
            }],
            getPendingAdaptivePoint: () => null,
        });
        overlays.setSelectedColumns(['A very long signal column name']);

        overlays.renderAll(ctx, { x: 1, y: 1 });

        expect(ctx.rect).toHaveBeenCalledWith(40, 10, 140, 60);
        expect(ctx.clip).toHaveBeenCalledOnce();
        const [x, y, width, height] = fillRect.mock.calls.at(-1)! as number[];
        expect(x).toBeGreaterThanOrEqual(40);
        expect(y).toBeGreaterThanOrEqual(10);
        expect(x + width).toBeLessThanOrEqual(180);
        expect(y + height).toBeLessThanOrEqual(70);
        expect(fillText.mock.calls.at(-1)?.[0]).toMatch(/…$/u);
    });
});
