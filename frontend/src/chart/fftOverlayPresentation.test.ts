import { describe, expect, it, vi } from 'vitest';

import { renderFftOverlay } from './fftOverlayPresentation.js';

function makeContext() {
    return {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        setLineDash: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 12 })),
    } as unknown as CanvasRenderingContext2D;
}

describe('renderFftOverlay', () => {
    it('uses the chart display model for peak-marker coordinates', () => {
        const context = makeContext();
        const canvas = {
            width: 200,
            height: 100,
            getContext: vi.fn(() => context),
        } as unknown as HTMLCanvasElement;

        renderFftOverlay(canvas, { left: 10, right: 10, top: 10, bottom: 10 }, {
            xMin: 0,
            xMax: 2,
            unit: 'Hz',
            annotations: [],
            showPeakLabels: true,
            dominantPeaks: [{ frequency_hz: 1, magnitude: 1, power: 1, rank: 1 }],
            primaryTracePoints: [[0, 0], [1, 10], [2, 0]],
            yMin: 0,
            yMax: 10,
        });

        expect(context.arc).toHaveBeenCalledWith(100, 10, 4, 0, Math.PI * 2);
    });
});
