import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    ensureStyleModule: vi.fn(),
    initFftPage: vi.fn(),
    initHeatmapPage: vi.fn(),
    initScatterPage: vi.fn(),
    initSpectrogramPage: vi.fn(),
    initCausalPage: vi.fn(),
    initDriftPage: vi.fn(),
}));

vi.mock('../utils/pageStyles.js', () => ({ ensureStyleModule: mocks.ensureStyleModule }));
vi.mock('../features/fft/page.js', () => ({ initFftPage: mocks.initFftPage }));
vi.mock('../features/heatmap/page.js', () => ({ initHeatmapPage: mocks.initHeatmapPage }));
vi.mock('../scatter/scatterPage.js', () => ({ initScatterPage: mocks.initScatterPage }));
vi.mock('../features/spectrogram/page.js', () => ({ initSpectrogramPage: mocks.initSpectrogramPage }));
vi.mock('../causal/causalPage.js', () => ({ initCausalPage: mocks.initCausalPage }));
vi.mock('../features/drift/page.js', () => ({ initDriftPage: mocks.initDriftPage }));

import { loadPageDescriptors, type PageDescriptorInitDeps } from './pageModules.js';
import type { PageRegistry } from './pageRegistry.js';
import { makeWorkspaceSnapshot } from '../workspace/workspaceStore.js';

function createDeps(): PageDescriptorInitDeps {
    return {
        getRenderTimeseries: vi.fn(),
        showPage: vi.fn(),
        chipColor: vi.fn(() => '#fff'),
        setLoading: vi.fn(),
        workspace: { getSnapshot: vi.fn(() => makeWorkspaceSnapshot()), setFilters: vi.fn() },
    };
}

describe('page module descriptors', () => {
    it('registers lightweight descriptors without importing page implementations', async () => {
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, createDeps());

        expect(register).toHaveBeenCalledTimes(6);
        expect(register.mock.calls.map(([name]) => name)).toEqual([
            'fft', 'heatmap', 'scatter', 'spectrogram', 'causal', 'drift',
        ]);
    });

    it('loads Scatter directly from its descriptor only on first page initialization', async () => {
        const metadata = { total_rows: 0, numeric_columns: [], columns: [], column_profiles: [], time_column: '', time_range: { min: 0, max: 1 } } as any;
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot({ dataset: { metadata } })),
            setFilters: vi.fn(),
        };
        const deps = { ...createDeps(), workspace };
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const scatter = register.mock.calls.find(([name]) => name === 'scatter')?.[1];

        expect(scatter).toBeDefined();
        expect(mocks.ensureStyleModule).not.toHaveBeenCalled();
        await scatter!.init();

        expect(mocks.ensureStyleModule).toHaveBeenCalledWith('scatter');
        expect(mocks.initScatterPage).toHaveBeenCalledWith(metadata, { workspace: deps.workspace });
    });

    it('loads Heatmap directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const heatmap = register.mock.calls.find(([name]) => name === 'heatmap')?.[1];

        expect(mocks.initHeatmapPage).not.toHaveBeenCalled();
        await heatmap!.init();

        expect(mocks.initHeatmapPage).toHaveBeenCalledWith({ showPage: deps.showPage });
    });

    it('loads FFT directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const fft = register.mock.calls.find(([name]) => name === 'fft')?.[1];

        expect(mocks.initFftPage).not.toHaveBeenCalled();
        await fft!.init();

        expect(mocks.initFftPage).toHaveBeenCalledWith({
            renderTimeseries: deps.getRenderTimeseries,
            workspace: deps.workspace,
        });
    });

    it('loads Spectrogram directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const spectrogram = register.mock.calls.find(([name]) => name === 'spectrogram')?.[1];

        expect(mocks.initSpectrogramPage).not.toHaveBeenCalled();
        await spectrogram!.init();

        expect(mocks.initSpectrogramPage).toHaveBeenCalledWith({
            setLoading: deps.setLoading,
            workspace: deps.workspace,
        });
    });

    it('loads Drift directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const drift = register.mock.calls.find(([name]) => name === 'drift')?.[1];

        expect(mocks.initDriftPage).not.toHaveBeenCalled();
        await drift!.init();

        expect(mocks.initDriftPage).toHaveBeenCalledWith(null);
    });

    it('loads Causal directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const causal = register.mock.calls.find(([name]) => name === 'causal')?.[1];

        expect(mocks.initCausalPage).not.toHaveBeenCalled();
        await causal!.init();

        expect(mocks.initCausalPage).toHaveBeenCalledWith({
            workspace: deps.workspace,
            chipColor: deps.chipColor,
            setLoading: deps.setLoading,
        });
    });

});
