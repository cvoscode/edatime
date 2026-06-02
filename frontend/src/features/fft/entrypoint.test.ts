import { describe, expect, it, vi } from 'vitest';
import { createFftEntrypoint } from './entrypoint.js';

const { initFftPageMock } = vi.hoisted(() => ({ initFftPageMock: vi.fn() }));
vi.mock('../../pages/fftPage.js', () => ({
    initFftPage: initFftPageMock,
}));

describe('createFftEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const deps = { getRenderTimeseries: vi.fn() };
        const entrypoint = createFftEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call renderTimeseries before init', () => {
        const deps = { getRenderTimeseries: vi.fn() };
        createFftEntrypoint(deps);
        expect(deps.getRenderTimeseries).not.toHaveBeenCalled();
    });

    it('init calls initFftPage with the provided deps', () => {
        const deps = { getRenderTimeseries: vi.fn() };
        const entrypoint = createFftEntrypoint(deps);
        entrypoint.init();
        expect(initFftPageMock).toHaveBeenCalledWith({ renderTimeseries: deps.getRenderTimeseries });
    });
});

