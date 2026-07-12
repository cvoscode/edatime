import { describe, expect, it, vi } from 'vitest';
import { renderExportDecorations } from './chartExportDecorationsRenderer.js';

describe('renderExportDecorations', () => {
    it('renders trimmed labels and only visible legend entries', () => {
        const ctx = { save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 20 })), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), translate: vi.fn(), rotate: vi.fn() } as unknown as CanvasRenderingContext2D;
        renderExportDecorations(ctx, { width: 400, height: 200 }, { left: 40, top: 20, width: 300, height: 140 }, 1, 12, { surface: '#1', border: '#2', text: '#3', textDim: '#4' }, { title: ' Title ', xAxis: ' Time ', yAxis: ' Value ' }, [{ name: 'A', color: '#a', visible: true }, { name: 'B', color: '#b', visible: false }]);
        expect(ctx.fillText).toHaveBeenCalledWith('Title', 200, expect.any(Number));
        expect(ctx.fillText).toHaveBeenCalledWith('A', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).not.toHaveBeenCalledWith('B', expect.any(Number), expect.any(Number));
    });
});
