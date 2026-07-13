import { describe, expect, it, vi } from 'vitest';
import { createAppRuntime } from './runtime';
import { createPageRegistry } from './pageRegistry';

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

describe('page registry', () => {
    it('waits for metadata readiness before initializing a gated page', async () => {
        const init = vi.fn(async () => {});
        const registry = createPageRegistry();
        registry.register('scatter', { requiresMetadata: true, init });
        const pending = registry.ensurePageModuleLoaded('scatter');
        expect(init).not.toHaveBeenCalled();
        registry.markMetadataReady();
        await pending;
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('shares one pending initialization between concurrent page requests', async () => {
        let releaseInit!: () => void;
        const init = vi.fn(() => new Promise<void>((resolve) => { releaseInit = resolve; }));
        const registry = createPageRegistry();
        registry.register('scatter', { requiresMetadata: false, init });

        const first = registry.ensurePageModuleLoaded('scatter');
        const second = registry.ensurePageModuleLoaded('scatter');
        expect(init).toHaveBeenCalledTimes(1);

        releaseInit();
        await Promise.all([first, second]);
        await registry.ensurePageModuleLoaded('scatter');
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('disposes mounted page resources before making descriptors loadable again', async () => {
        const dispose = vi.fn();
        const registry = createPageRegistry();
        registry.register('scatter', {
            requiresMetadata: false,
            init: async () => dispose,
        });

        await registry.ensurePageModuleLoaded('scatter');
        registry.clearLoadedPageModules();

        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('releases mounted pages permanently when the owning app runtime is disposed', async () => {
        const disposePage = vi.fn();
        const init = vi.fn(async () => disposePage);
        const registry = createPageRegistry();
        registry.register('scatter', { requiresMetadata: false, init });

        await registry.ensurePageModuleLoaded('scatter');
        registry.dispose();
        await registry.ensurePageModuleLoaded('scatter');

        expect(disposePage).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('disposes a stale initialization that completes after a dataset reset', async () => {
        let releaseInit!: (dispose: () => void) => void;
        const dispose = vi.fn();
        const registry = createPageRegistry();
        registry.register('scatter', {
            requiresMetadata: false,
            init: () => new Promise((resolve) => { releaseInit = resolve; }),
        });

        const pending = registry.ensurePageModuleLoaded('scatter');
        registry.clearLoadedPageModules();
        releaseInit(dispose);
        await pending;

        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
