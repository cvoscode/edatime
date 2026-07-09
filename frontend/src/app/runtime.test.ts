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
});
