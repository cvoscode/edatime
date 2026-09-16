import { describe, expect, it, vi } from 'vitest';
import { createAppRuntime } from './runtime';
import { createFeatureRegistry } from './featureRegistry';

describe('app runtime', () => {
    it('runs registered cleanups once when disposed', () => {
        const runtime = createAppRuntime();
        const cleanup = vi.fn();
        runtime.registerCleanup(cleanup);
        runtime.dispose();
        runtime.dispose();
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('exposes an abort signal for app-owned asynchronous work', () => {
        const runtime = createAppRuntime();
        expect(runtime.signal.aborted).toBe(false);

        runtime.dispose();

        expect(runtime.signal.aborted).toBe(true);
    });
});

describe('feature registry', () => {
    it('retires analysis results after pipeline edits while preserving the preparation editor', async () => {
        const registry = createFeatureRegistry();
        const disposePrepare = vi.fn();
        const disposePlot = vi.fn();
        const prepare = vi.fn(async () => disposePrepare);
        const plot = vi.fn(async () => disposePlot);
        registry.register('prepare', { requiresMetadata: false, init: prepare });
        registry.register('fft', { requiresMetadata: false, init: plot });
        await registry.ensureFeatureLoaded('prepare');
        await registry.ensureFeatureLoaded('fft');
        registry.clearLoadedFeatures(['prepare']);
        await registry.ensureFeatureLoaded('prepare');
        await registry.ensureFeatureLoaded('fft');
        expect(disposePrepare).not.toHaveBeenCalled();
        expect(prepare).toHaveBeenCalledOnce();
        expect(disposePlot).toHaveBeenCalledOnce();
        expect(plot).toHaveBeenCalledTimes(2);
        registry.dispose();
    });

    it('remounts the latest plot when a pipeline edit races with a lazy initialization', async () => {
        const registry = createFeatureRegistry();
        let release!: (dispose: () => void) => void;
        const oldDispose = vi.fn();
        const init = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
            .mockResolvedValue(vi.fn());
        registry.register('fft', { requiresMetadata: false, init });
        const first = registry.ensureFeatureLoaded('fft');
        registry.clearLoadedFeatures(['prepare']);
        // The shell passes this callback without a `this` binding.
        const load = registry.ensureFeatureLoaded;
        const latest = load('fft');
        release(oldDispose);
        await Promise.all([first, latest]);
        expect(oldDispose).toHaveBeenCalledOnce();
        expect(init).toHaveBeenCalledTimes(2);
        registry.dispose();
    });
    it('waits for metadata readiness before initializing a gated page', async () => {
        const init = vi.fn(async () => {});
        const registry = createFeatureRegistry();
        registry.register('scatter', { requiresMetadata: true, init });
        const pending = registry.ensureFeatureLoaded('scatter');
        expect(init).not.toHaveBeenCalled();
        registry.markMetadataReady();
        await pending;
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('shares one pending initialization between concurrent page requests', async () => {
        let releaseInit!: () => void;
        const init = vi.fn(() => new Promise<void>((resolve) => { releaseInit = resolve; }));
        const registry = createFeatureRegistry();
        registry.register('scatter', { requiresMetadata: false, init });

        const first = registry.ensureFeatureLoaded('scatter');
        const second = registry.ensureFeatureLoaded('scatter');
        expect(init).toHaveBeenCalledTimes(1);

        releaseInit();
        await Promise.all([first, second]);
        await registry.ensureFeatureLoaded('scatter');
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('disposes mounted page resources before making descriptors loadable again', async () => {
        const dispose = vi.fn();
        const registry = createFeatureRegistry();
        registry.register('scatter', {
            requiresMetadata: false,
            init: async () => dispose,
        });

        await registry.ensureFeatureLoaded('scatter');
        registry.clearLoadedFeatures();

        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('releases mounted pages permanently when the owning app runtime is disposed', async () => {
        const disposePage = vi.fn();
        const init = vi.fn(async () => disposePage);
        const registry = createFeatureRegistry();
        registry.register('scatter', { requiresMetadata: false, init });

        await registry.ensureFeatureLoaded('scatter');
        registry.dispose();
        await registry.ensureFeatureLoaded('scatter');

        expect(disposePage).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('disposes a stale initialization that completes after a dataset reset', async () => {
        let releaseInit!: (dispose: () => void) => void;
        const dispose = vi.fn();
        const registry = createFeatureRegistry();
        registry.register('scatter', {
            requiresMetadata: false,
            init: vi.fn().mockImplementationOnce(() => new Promise((resolve) => { releaseInit = resolve; }))
                .mockResolvedValue(vi.fn()),
        });

        const pending = registry.ensureFeatureLoaded('scatter');
        registry.clearLoadedFeatures();
        releaseInit(dispose);
        await pending;

        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('finishes a direct page navigation when startup invalidates it before metadata is ready', async () => {
        const registry = createFeatureRegistry();
        const init = vi.fn(async () => vi.fn());
        registry.register('prepare', { requiresMetadata: true, init });
        const navigation = registry.ensureFeatureLoaded('prepare');
        registry.clearLoadedFeatures();
        registry.markMetadataReady();
        await navigation;
        expect(init).toHaveBeenCalledOnce();
        await registry.ensureFeatureLoaded('prepare');
        expect(init).toHaveBeenCalledOnce();
        registry.dispose();
    });
});
