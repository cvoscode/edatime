import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    ensureStyleModule: vi.fn(),
    initPreparePage: vi.fn(),
    initFftPage: vi.fn(),
    initHeatmapPage: vi.fn(),
    initHeatmapScatterLayer: vi.fn(),
    initHeatmapPairPlot: vi.fn(),
    selectPair: vi.fn(),
    initSpectrogramPage: vi.fn(),
    initCausalPage: vi.fn(),
    initDriftPage: vi.fn(),
}));

vi.mock('../utils/pageStyles.js', () => ({ ensureStyleModule: mocks.ensureStyleModule }));
vi.mock('../features/prepare/index.js', () => ({ initPreparePage: mocks.initPreparePage }));
vi.mock('../features/fft/index.js', () => ({ initFftPage: mocks.initFftPage }));
vi.mock('../features/heatmap/index.js', () => ({
    initHeatmapPage: mocks.initHeatmapPage,
    initHeatmapScatterLayer: mocks.initHeatmapScatterLayer,
}));
vi.mock('../features/heatmap/pairPlot/index.js', () => ({ initHeatmapPairPlot: mocks.initHeatmapPairPlot }));
vi.mock('../features/spectrogram/index.js', () => ({ initSpectrogramPage: mocks.initSpectrogramPage }));
vi.mock('../features/causal/index.js', () => ({ initCausalPage: mocks.initCausalPage }));
vi.mock('../features/drift/index.js', () => ({ initDriftPage: mocks.initDriftPage }));

import { loadPageDescriptors, type PageDescriptorInitDeps } from './pageModules.js';
import type { FeatureRegistry } from './featureRegistry.js';
import { makeWorkspaceSnapshot } from '../workspace/workspaceStore.js';
import { createCleaningPlanStore } from '../cleaning/store.js';

function createDeps(): PageDescriptorInitDeps {
    return {
        getRenderTimeseries: vi.fn(),
        getCurrentTimeseriesData: vi.fn(() => null),
        refreshDatasetAfterMutation: vi.fn(),
        registerCleanup: vi.fn(),
        showPage: vi.fn(),
        chipColor: vi.fn(() => '#fff'),
        setLoading: vi.fn(),
        onCleaningPlanChanged: vi.fn(),
        cleaningPlanStore: createCleaningPlanStore(),
        workspace: { getSnapshot: vi.fn(() => makeWorkspaceSnapshot()), setFilters: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
    };
}

describe('page module descriptors', () => {
    mocks.initHeatmapPairPlot.mockResolvedValue({ dispose: vi.fn(), selectPair: mocks.selectPair });

    it('registers lightweight descriptors without importing page implementations', async () => {
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, createDeps());

        expect(register).toHaveBeenCalledTimes(6);
        expect(register.mock.calls.map(([name]) => name)).toEqual([
            'prepare', 'fft', 'heatmap', 'spectrogram', 'causal', 'drift',
        ]);
    });

    it('loads Prepare only when its route is first initialized', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
        const prepare = register.mock.calls.find(([name]) => name === 'prepare')?.[1];

        expect(mocks.initPreparePage).not.toHaveBeenCalled();
        await prepare!.init();

        expect(mocks.initPreparePage).toHaveBeenCalledTimes(1);
        expect(mocks.initPreparePage).toHaveBeenCalledWith({
            workspace: deps.workspace,
            showPage: deps.showPage,
            onPlanChanged: deps.onCleaningPlanChanged,
            getCurrentData: deps.getCurrentTimeseriesData,
            refreshDatasetAfterMutation: deps.refreshDatasetAfterMutation,
        });
    });

    it('loads the heatmap, embedded Pair plot, and unified cell layer together', async () => {
        const metadata = { total_rows: 0, numeric_columns: [], columns: [], column_profiles: [], time_column: '', time_range: { min: 0, max: 1 } } as any;
        const deps = {
            ...createDeps(),
            workspace: {
                getSnapshot: vi.fn(() => makeWorkspaceSnapshot({ dataset: { metadata } })),
                setFilters: vi.fn(),
                subscribe: vi.fn(() => vi.fn()),
            },
        };
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
        const heatmap = register.mock.calls.find(([name]) => name === 'heatmap')?.[1];

        expect(mocks.initHeatmapPage).not.toHaveBeenCalled();
        await heatmap!.init();

        expect(mocks.ensureStyleModule).toHaveBeenCalledWith('scatter');
        expect(mocks.initHeatmapPage).toHaveBeenCalledWith({
            showPage: deps.showPage,
            selectPair: mocks.selectPair,
            cleaningPlanStore: deps.cleaningPlanStore,
            onPlanChanged: deps.onCleaningPlanChanged,
        });
        expect(mocks.initHeatmapPairPlot).toHaveBeenCalledWith(metadata, {
            workspace: deps.workspace,
        });
        expect(mocks.initHeatmapScatterLayer).toHaveBeenCalledWith(metadata, {
            workspace: deps.workspace,
        });
    });

    it('does not register a standalone Pair plot descriptor', async () => {
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, createDeps());

        expect(register.mock.calls.some(([name]) => name === 'scatter')).toBe(false);
    });

    it('loads FFT directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
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
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
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
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
        const drift = register.mock.calls.find(([name]) => name === 'drift')?.[1];

        expect(mocks.initDriftPage).not.toHaveBeenCalled();
        await drift!.init();

        expect(mocks.initDriftPage).toHaveBeenCalledWith(null, {
            workspace: expect.any(Object),
        });
    });

    it('loads Causal directly from its descriptor only on initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
        const causal = register.mock.calls.find(([name]) => name === 'causal')?.[1];

        expect(mocks.initCausalPage).not.toHaveBeenCalled();
        await causal!.init();

        expect(mocks.initCausalPage).toHaveBeenCalledWith({
            workspace: deps.workspace,
            chipColor: deps.chipColor,
            setLoading: deps.setLoading,
        });
    });

    it('forwards a feature cleanup handle to the registry descriptor', async () => {
        const dispose = vi.fn();
        mocks.initSpectrogramPage.mockResolvedValueOnce(dispose);
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as FeatureRegistry, deps);
        const spectrogram = register.mock.calls.find(([name]) => name === 'spectrogram')?.[1];

        const result = await spectrogram!.init();

        expect(result).toBe(dispose);
    });

});
