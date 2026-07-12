import { describe, expect, it, vi } from 'vitest';
import { renderExportLineSeries } from './chartExportSeriesRenderer.js';

describe('renderExportLineSeries', () => {
    it('draws visible finite line points and skips hidden or invalid ones', () => {
        const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D;
        renderExportLineSeries(ctx, [
            { type: 'line', color: '#f00', data: [[0, 0], [10, 10], [Number.NaN, 1]] },
            { type: 'line', visible: false, data: [[0, 0]] },
        ] as any, { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }, { left: 5, top: 10, width: 100, height: 50 }, 2, '#000');

        expect(ctx.moveTo).toHaveBeenCalledWith(5, 60);
        expect(ctx.lineTo).toHaveBeenCalledWith(105, 10);
        expect(ctx.stroke).toHaveBeenCalledOnce();
    });
});
