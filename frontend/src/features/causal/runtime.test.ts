import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Causal page runtime lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('mounts once without creating window page-change listeners', async () => {
        vi.resetModules();
        const addListener = vi.spyOn(window, 'addEventListener');
        const removeListener = vi.spyOn(window, 'removeEventListener');

        const runtime = await import('./runtime.js');
        const first = runtime.getCausalRuntime();
        const second = runtime.initCausalPageRuntime();

        expect(first).not.toBeNull();
        expect(second).toBe(first);
        expect(addListener).not.toHaveBeenCalledWith('edatime:page-change', expect.any(Function), undefined);

        runtime.disposeCausalPageRuntime();

        expect(runtime.getCausalRuntime()).toBeNull();
        expect(removeListener).not.toHaveBeenCalledWith('edatime:page-change', expect.any(Function), undefined);
    });
});
