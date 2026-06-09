import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initHeatmapPageMock, heatmapPageImported } = vi.hoisted(() => ({
    initHeatmapPageMock: vi.fn(),
    heatmapPageImported: { value: false },
}));
vi.mock('../../pages/heatmapPage.js', () => ({
    ...(() => {
        heatmapPageImported.value = true;
        return {};
    })(),
    initHeatmapPage: initHeatmapPageMock,
}));

describe('createHeatmapEntrypoint', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        heatmapPageImported.value = false;
    });

    it('returns an explicit init surface', async () => {
        const { createHeatmapEntrypoint } = await import('./entrypoint.js');
        const deps = { showPage: vi.fn() };
        const entrypoint = createHeatmapEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
        expect(heatmapPageImported.value).toBe(false);
    });

    it('does not call showPage before init', async () => {
        const { createHeatmapEntrypoint } = await import('./entrypoint.js');
        const deps = { showPage: vi.fn() };
        createHeatmapEntrypoint(deps);
        expect(deps.showPage).not.toHaveBeenCalled();
        expect(heatmapPageImported.value).toBe(false);
    });

    it('init loads the heatmap page only when first invoked', async () => {
        const { createHeatmapEntrypoint } = await import('./entrypoint.js');
        const deps = { showPage: vi.fn() };
        const entrypoint = createHeatmapEntrypoint(deps);
        await entrypoint.init();
        expect(heatmapPageImported.value).toBe(true);
        expect(initHeatmapPageMock).toHaveBeenCalledWith(deps);
    });
});
