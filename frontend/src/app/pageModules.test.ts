import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    ensureStyleModule: vi.fn(),
    createFftEntrypoint: vi.fn(() => ({ init: vi.fn() })),
    createHeatmapEntrypoint: vi.fn(() => ({ init: vi.fn() })),
    createScatterEntrypoint: vi.fn(() => ({ init: vi.fn() })),
    createSpectrogramEntrypoint: vi.fn(() => ({ init: vi.fn() })),
    createCausalEntrypoint: vi.fn(() => ({ init: vi.fn() })),
    createDriftEntrypoint: vi.fn(() => ({ init: vi.fn() })),
}));

vi.mock('../utils/pageStyles.js', () => ({ ensureStyleModule: mocks.ensureStyleModule }));
vi.mock('../features/fft/entrypoint.js', () => ({ createFftEntrypoint: mocks.createFftEntrypoint }));
vi.mock('../features/heatmap/entrypoint.js', () => ({ createHeatmapEntrypoint: mocks.createHeatmapEntrypoint }));
vi.mock('../features/scatter/entrypoint.js', () => ({ createScatterEntrypoint: mocks.createScatterEntrypoint }));
vi.mock('../features/spectrogram/entrypoint.js', () => ({ createSpectrogramEntrypoint: mocks.createSpectrogramEntrypoint }));
vi.mock('../features/causal/entrypoint.js', () => ({ createCausalEntrypoint: mocks.createCausalEntrypoint }));
vi.mock('../features/drift/entrypoint.js', () => ({ createDriftEntrypoint: mocks.createDriftEntrypoint }));

import { loadPageDescriptors, type PageDescriptorInitDeps } from './pageModules.js';
import type { PageRegistry } from './pageRegistry.js';

function createDeps(): PageDescriptorInitDeps {
    return {
        getRenderTimeseries: vi.fn(),
        showPage: vi.fn(),
        chipColor: vi.fn(() => '#fff'),
        setLoading: vi.fn(),
        workspace: { getSnapshot: vi.fn() },
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
        expect(mocks.createFftEntrypoint).not.toHaveBeenCalled();
        expect(mocks.createScatterEntrypoint).not.toHaveBeenCalled();
        expect(mocks.createDriftEntrypoint).not.toHaveBeenCalled();
    });

    it('loads page-owned CSS and the page implementation only on first page initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const scatter = register.mock.calls.find(([name]) => name === 'scatter')?.[1];

        expect(scatter).toBeDefined();
        expect(mocks.ensureStyleModule).not.toHaveBeenCalled();
        await scatter!.init();

        expect(mocks.ensureStyleModule).toHaveBeenCalledWith('scatter');
        expect(mocks.createScatterEntrypoint).toHaveBeenCalledWith(expect.objectContaining({
            workspace: deps.workspace,
        }));
        expect(mocks.createScatterEntrypoint.mock.results[0].value.init).toHaveBeenCalledTimes(1);
    });

    it('injects the workspace boundary into causal initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const causal = register.mock.calls.find(([name]) => name === 'causal')?.[1];

        await causal!.init();

        expect(mocks.createCausalEntrypoint).toHaveBeenCalledWith(expect.objectContaining({
            workspace: deps.workspace,
        }));
    });

    it('injects the workspace boundary into drift initialization', async () => {
        const deps = createDeps();
        const register = vi.fn();
        await loadPageDescriptors({ register } as unknown as PageRegistry, deps);
        const drift = register.mock.calls.find(([name]) => name === 'drift')?.[1];

        await drift!.init();

        expect(mocks.createDriftEntrypoint).toHaveBeenCalledWith({ workspace: deps.workspace });
    });
});
