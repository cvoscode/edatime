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
});