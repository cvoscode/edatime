import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    syncModeUIMock,
    renderScatterMatrixViewMock,
    selectMatrixPairMock,
} = vi.hoisted(() => ({
    syncModeUIMock: vi.fn(),
    renderScatterMatrixViewMock: vi.fn(async () => undefined),
    selectMatrixPairMock: vi.fn(async () => undefined),
}));

vi.mock('./rendering.js', () => ({
    syncModeUI: syncModeUIMock,
}));

vi.mock('./matrix.js', () => ({
    renderScatterMatrixView: renderScatterMatrixViewMock,
    selectMatrixPair: selectMatrixPairMock,
}));

import { scatterState } from '../../store/scatterState.js';
import { setScatterView } from './viewController.js';

describe('viewController', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div class="sidebar">
                <button class="nav-item" data-page="scatter"></button>
                <button class="nav-item" data-page="scattermatrix"></button>
            </div>
            <button data-scatter-view="plot"></button>
            <button data-scatter-view="matrix"></button>
            <div data-scatter-view-panel="plot"></div>
            <div data-scatter-view-panel="matrix" hidden></div>
        `;
        syncModeUIMock.mockClear();
        renderScatterMatrixViewMock.mockClear();
        selectMatrixPairMock.mockClear();
        scatterState.activeView = 'plot';
        scatterState.chart = { resize: vi.fn() } as any;
    });

    it('updates activeView and resizes the chart through scatterState without appStateCompat', async () => {
        await new Promise<void>((resolve) => {
            vi.spyOn(window, 'requestAnimationFrame').mockImplementationOnce((cb: FrameRequestCallback) => {
                cb(0);
                resolve();
                return 1;
            });
            void setScatterView('plot');
        });

        expect(scatterState.activeView).toBe('plot');
        expect(syncModeUIMock).toHaveBeenCalledTimes(1);
        expect(scatterState.chart?.resize).toHaveBeenCalledTimes(1);
    });
});
