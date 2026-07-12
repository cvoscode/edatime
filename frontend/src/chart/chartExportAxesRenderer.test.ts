import { describe, expect, it, vi } from 'vitest';
import { renderExportAxes } from './chartExportAxesRenderer.js';

describe('renderExportAxes', () => {
    it('draws axes, grid lines, and labels for a finite domain', () => {
        const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
        const fontSize = renderExportAxes(ctx, { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }, { left: 10, top: 20, width: 100, height: 50 }, 1, { border: '#1', borderHi: '#2', textDim: '#3' });
        expect(fontSize).toBe(12);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalled();
    });
});
