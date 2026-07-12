import { describe, expect, it, vi } from 'vitest';
import { renderChartExportCanvas } from './chartExportCanvasRenderer.js';

describe('renderChartExportCanvas', () => {
    it('composes a canvas and invokes optional drawing export at CSS-to-pixel scale', () => {
        const context = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 0 })) };
        const canvas = { getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
        const renderDrawings = vi.fn();
        renderChartExportCanvas({ canvas, viewport: { cssWidth: 100, cssHeight: 50, width: 200, height: 100, dpr: 2 }, domains: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }, grid: { left: 10, right: 10, top: 10, bottom: 10 }, series: [], labels: { title: '', xAxis: '', yAxis: '' }, legendEntries: [], renderDrawings });
        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
        expect(renderDrawings).toHaveBeenCalledWith(context, { x: 2, y: 2 });
    });
});
