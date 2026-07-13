import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Causal page runtime lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('mounts once and releases both page and status listeners on disposal', async () => {
        vi.resetModules();
        const addListener = vi.spyOn(window, 'addEventListener');
        const removeListener = vi.spyOn(window, 'removeEventListener');

        const runtime = await import('./runtime.js');
        const first = runtime.getCausalRuntime();
        const second = runtime.initCausalPageRuntime();

        expect(first).not.toBeNull();
        expect(second).toBe(first);
        expect(addListener).toHaveBeenCalledTimes(2);
        expect(addListener).toHaveBeenCalledWith(
            'edatime:page-change',
            expect.any(Function),
            undefined,
        );

        runtime.disposeCausalPageRuntime();

        expect(runtime.getCausalRuntime()).toBeNull();
        expect(removeListener).toHaveBeenCalledTimes(2);
        expect(removeListener).toHaveBeenCalledWith(
            'edatime:page-change',
            expect.any(Function),
            undefined,
        );
    });
});
