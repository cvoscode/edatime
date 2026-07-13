import { describe, expect, it, vi } from 'vitest';

const { createCanvasOverlayMock } = vi.hoisted(() => ({
    createCanvasOverlayMock: vi.fn(),
}));

vi.mock('./chartInteractions.js', () => ({
    createCanvasOverlay: createCanvasOverlayMock,
}));

import { FftOverlayResources } from './fftOverlayResources.js';

describe('FftOverlayResources', () => {
    it('releases the prior observer and canvas before mounting a replacement', () => {
        const firstCanvas = document.createElement('canvas');
        const firstObserver = { disconnect: vi.fn() } as unknown as ResizeObserver;
        const secondCanvas = document.createElement('canvas');
        const secondObserver = { disconnect: vi.fn() } as unknown as ResizeObserver;
        createCanvasOverlayMock
            .mockReturnValueOnce({ canvas: firstCanvas, observer: firstObserver })
            .mockReturnValueOnce({ canvas: secondCanvas, observer: secondObserver });
        const container = document.createElement('div');
        const redraw = vi.fn();
        const resources = new FftOverlayResources();

        resources.mount(container, redraw);
        resources.mount(container, redraw);

        expect(firstObserver.disconnect).toHaveBeenCalledOnce();
        expect(firstCanvas.isConnected).toBe(false);
        expect(resources.canvas).toBe(secondCanvas);

        resources.dispose();

        expect(secondObserver.disconnect).toHaveBeenCalledOnce();
        expect(secondCanvas.isConnected).toBe(false);
        expect(resources.canvas).toBeNull();
    });
});
