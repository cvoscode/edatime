import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initSpectrogramPageMock, spectrogramPageImported } = vi.hoisted(() => ({
    initSpectrogramPageMock: vi.fn(),
    spectrogramPageImported: { value: false },
}));
vi.mock('../../pages/spectrogramPage.js', () => ({
    ...(() => {
        spectrogramPageImported.value = true;
        return {};
    })(),
    initSpectrogramPage: initSpectrogramPageMock,
}));

describe('createSpectrogramEntrypoint', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        spectrogramPageImported.value = false;
    });

    it('returns an explicit init surface', async () => {
        const { createSpectrogramEntrypoint } = await import('./entrypoint.js');
        const deps = { setLoading: vi.fn() };
        const entrypoint = createSpectrogramEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
        expect(spectrogramPageImported.value).toBe(false);
    });

    it('does not call setLoading before init', async () => {
        const { createSpectrogramEntrypoint } = await import('./entrypoint.js');
        const deps = { setLoading: vi.fn() };
        createSpectrogramEntrypoint(deps);
        expect(deps.setLoading).not.toHaveBeenCalled();
        expect(spectrogramPageImported.value).toBe(false);
    });

    it('init loads the spectrogram page only when first invoked', async () => {
        const { createSpectrogramEntrypoint } = await import('./entrypoint.js');
        const deps = { setLoading: vi.fn() };
        const entrypoint = createSpectrogramEntrypoint(deps);
        await entrypoint.init();
        expect(spectrogramPageImported.value).toBe(true);
        expect(initSpectrogramPageMock).toHaveBeenCalledWith(deps);
    });
});
