import { describe, expect, it, vi } from 'vitest';
import { createSpectrogramEntrypoint } from './entrypoint.js';

const { initSpectrogramPageMock } = vi.hoisted(() => ({ initSpectrogramPageMock: vi.fn() }));
vi.mock('../../pages/spectrogramPage.js', () => ({
    initSpectrogramPage: initSpectrogramPageMock,
}));

describe('createSpectrogramEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const deps = { setLoading: vi.fn() };
        const entrypoint = createSpectrogramEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call setLoading before init', () => {
        const deps = { setLoading: vi.fn() };
        createSpectrogramEntrypoint(deps);
        expect(deps.setLoading).not.toHaveBeenCalled();
    });

    it('init calls initSpectrogramPage with the provided deps', () => {
        const deps = { setLoading: vi.fn() };
        const entrypoint = createSpectrogramEntrypoint(deps);
        entrypoint.init();
        expect(initSpectrogramPageMock).toHaveBeenCalledWith(deps);
    });
});

