import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initFftPageMock, fftPageImported } = vi.hoisted(() => ({
    initFftPageMock: vi.fn(),
    fftPageImported: { value: false },
}));
vi.mock('../../pages/fftPage.js', () => ({
    ...(() => {
        fftPageImported.value = true;
        return {};
    })(),
    initFftPage: initFftPageMock,
}));

describe('createFftEntrypoint', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        fftPageImported.value = false;
    });

    it('returns an explicit init surface', async () => {
        const { createFftEntrypoint } = await import('./entrypoint.js');
        const deps = { getRenderTimeseries: vi.fn(), workspace: { getSnapshot: vi.fn() } };
        const entrypoint = createFftEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
        expect(fftPageImported.value).toBe(false);
    });

    it('does not call renderTimeseries before init', async () => {
        const { createFftEntrypoint } = await import('./entrypoint.js');
        const deps = { getRenderTimeseries: vi.fn(), workspace: { getSnapshot: vi.fn() } };
        createFftEntrypoint(deps);
        expect(deps.getRenderTimeseries).not.toHaveBeenCalled();
        expect(fftPageImported.value).toBe(false);
    });

    it('init loads the fft page only when first invoked', async () => {
        const { createFftEntrypoint } = await import('./entrypoint.js');
        const deps = { getRenderTimeseries: vi.fn(), workspace: { getSnapshot: vi.fn() } };
        const entrypoint = createFftEntrypoint(deps);
        await entrypoint.init();
        expect(fftPageImported.value).toBe(true);
        expect(initFftPageMock).toHaveBeenCalledWith({ renderTimeseries: deps.getRenderTimeseries, workspace: deps.workspace });
    });
});
