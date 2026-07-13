import { describe, expect, it, vi } from 'vitest';

const { initBoxZoomMock } = vi.hoisted(() => ({
    initBoxZoomMock: vi.fn(),
}));

vi.mock('./chartInteractions.js', () => ({
    initBoxZoom: initBoxZoomMock,
}));

import { FftInteractionResources } from './fftInteractionResources.js';

describe('FftInteractionResources', () => {
    it('disposes the previous box-zoom binding before replacing or clearing it', () => {
        const first = Object.assign(document.createElement('div'), { dispose: vi.fn() });
        const second = Object.assign(document.createElement('div'), { dispose: vi.fn() });
        initBoxZoomMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
        const resources = new FftInteractionResources();
        const options = {
            container: document.createElement('div'),
            grid: { left: 0, right: 0, top: 0, bottom: 0 },
            getXRange: () => ({ min: 0, max: 1 }),
            onZoom: vi.fn(),
        };

        resources.mount(options);
        resources.mount(options);

        expect(first.dispose).toHaveBeenCalledOnce();

        resources.dispose();

        expect(second.dispose).toHaveBeenCalledOnce();
    });
});
