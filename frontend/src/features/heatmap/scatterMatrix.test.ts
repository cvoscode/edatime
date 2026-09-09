import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';

const mocks = vi.hoisted(() => ({
    renderScatterMatrixView: vi.fn(),
    requestScatterPair: vi.fn(),
    disposeSession: vi.fn(),
}));

vi.mock('../scatter/matrix.js', () => ({
    createMatrixRenderSession: () => ({
        begin: () => new AbortController().signal,
        currentSignal: () => new AbortController().signal,
        dispose: mocks.disposeSession,
    }),
    renderScatterMatrixView: mocks.renderScatterMatrixView,
}));
vi.mock('../scatter/pairIntent.js', () => ({ requestScatterPair: mocks.requestScatterPair }));

import { initHeatmapScatterMatrix } from './scatterMatrix.js';

function buildDom(): void {
    document.body.innerHTML = `
        <section class="heatmap-scatter-matrix">
            <button type="button" data-matrix-mode="scatter" aria-pressed="true"></button>
            <button type="button" data-matrix-mode="density" aria-pressed="false"></button>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" type="range" value="160">
            <span id="scatter-matrix-cell-size-value"></span>
            <select id="heatmap-scatter-diagonal-mode"><option value="kde">KDE</option></select>
            <input id="scatter-matrix-link-range" type="checkbox">
            <div id="scatter-matrix-loading" hidden></div>
        </section>
        <select id="scatter-diagonal-mode"><option value="histogram">Histogram</option><option value="kde">KDE</option></select>
    `;
}

describe('Correlation page Scatter matrix', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildDom();
        mocks.renderScatterMatrixView.mockResolvedValue(undefined);
    });

    it('renders on Correlations and opens a selected cell in the Pair plot', async () => {
        const showPage = vi.fn();
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
            subscribe: vi.fn(() => vi.fn()),
        };
        const dispose = await initHeatmapScatterMatrix({ numeric_columns: ['x', 'y'] } as any, {
            workspace,
            showPage,
        });

        expect(mocks.renderScatterMatrixView).toHaveBeenCalledOnce();
        const onCellClick = mocks.renderScatterMatrixView.mock.calls[0]![0];
        onCellClick('x', 'y');

        expect(mocks.requestScatterPair).toHaveBeenCalledWith('x', 'y');
        expect(showPage).toHaveBeenCalledWith('scatter');

        (document.querySelector('[data-matrix-mode="density"]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(mocks.renderScatterMatrixView).toHaveBeenCalledTimes(2));
        expect((document.getElementById('scatter-matrix-mode') as HTMLInputElement).value).toBe('density');
        dispose();
        expect(mocks.disposeSession).toHaveBeenCalledOnce();
    });
});
