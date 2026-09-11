import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspaceSnapshot } from '../../../workspace/workspaceStore.js';

const mocks = vi.hoisted(() => ({
    dispose: vi.fn(),
    initScatterPage: vi.fn(),
    selectScatterPair: vi.fn(),
}));

vi.mock('../../scatter/index.js', () => ({
    initScatterPage: mocks.initScatterPage,
    selectScatterPair: mocks.selectScatterPair,
}));

import { initHeatmapPairPlot } from './index.js';

describe('combined correlation Pair plot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.initScatterPage.mockResolvedValue(mocks.dispose);
        document.body.innerHTML = `
            <section id="heatmap-pair-plot" hidden></section>
            <section id="page-heatmap">
                <main class="main--padded">
                    <div id="heatmap-container"></div>
                    <div id="heatmap-empty-state"></div>
                    <div id="heatmap-loading"></div>
                </main>
            </section>
        `;
    });

    it('mounts the matrix and Pair plot as one workspace', async () => {
        const metadata = { numeric_columns: ['x', 'y'] } as any;
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot({ dataset: { metadata } })),
            setFilters: vi.fn(),
            subscribe: vi.fn(() => vi.fn()),
        };

        const result = await initHeatmapPairPlot(metadata, { workspace });

        const combined = document.querySelector('.correlation-workspace');
        expect(combined?.querySelector('.correlation-workspace__matrix #heatmap-container')).not.toBeNull();
        expect(combined?.querySelector('#heatmap-pair-plot')).not.toBeNull();
        expect((document.getElementById('heatmap-pair-plot') as HTMLElement).hidden).toBe(false);
        expect(mocks.initScatterPage).toHaveBeenCalledWith(metadata, { workspace });
        expect(result.selectPair).toBe(mocks.selectScatterPair);
    });
});
