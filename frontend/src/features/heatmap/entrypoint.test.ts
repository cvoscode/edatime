import { describe, expect, it, vi } from 'vitest';
import { createHeatmapEntrypoint } from './entrypoint.js';

const { initHeatmapPageMock } = vi.hoisted(() => ({ initHeatmapPageMock: vi.fn() }));
vi.mock('../../pages/heatmapPage.js', () => ({
    initHeatmapPage: initHeatmapPageMock,
}));

describe('createHeatmapEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const deps = { showPage: vi.fn() };
        const entrypoint = createHeatmapEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call showPage before init', () => {
        const deps = { showPage: vi.fn() };
        createHeatmapEntrypoint(deps);
        expect(deps.showPage).not.toHaveBeenCalled();
    });

    it('init calls initHeatmapPage with the provided deps', () => {
        const deps = { showPage: vi.fn() };
        const entrypoint = createHeatmapEntrypoint(deps);
        entrypoint.init();
        expect(initHeatmapPageMock).toHaveBeenCalledWith(deps);
    });
});

