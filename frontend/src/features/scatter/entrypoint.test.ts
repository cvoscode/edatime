import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initScatterPageMock, scatterPageImported } = vi.hoisted(() => ({
    initScatterPageMock: vi.fn(),
    scatterPageImported: { value: false },
}));
vi.mock('../../scatter/scatterPage.js', () => ({
    ...(() => {
        scatterPageImported.value = true;
        return {};
    })(),
    initScatterPage: initScatterPageMock,
}));

describe('createScatterEntrypoint', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        scatterPageImported.value = false;
    });

    it('returns an explicit init surface', async () => {
        const { createScatterEntrypoint } = await import('./entrypoint.js');
        const deps = {
            getMetadata: vi.fn().mockReturnValue({} as any),
        };
        const entrypoint = createScatterEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
        expect(scatterPageImported.value).toBe(false);
    });

    it('does not import scatterPage before init', async () => {
        const { createScatterEntrypoint } = await import('./entrypoint.js');
        const deps = {
            getMetadata: vi.fn().mockReturnValue({} as any),
        };
        createScatterEntrypoint(deps);
        expect(scatterPageImported.value).toBe(false);
    });

    it('init reads metadata from getMetadata and forwards it to scatterPage', async () => {
        const { createScatterEntrypoint } = await import('./entrypoint.js');
        const metadata = { columns: [], timeRange: [0, 100] } as any;
        const deps = {
            getMetadata: vi.fn().mockReturnValue(metadata),
        };
        const entrypoint = createScatterEntrypoint(deps);
        await entrypoint.init();
        expect(scatterPageImported.value).toBe(true);
        expect(deps.getMetadata).toHaveBeenCalled();
        expect(initScatterPageMock).toHaveBeenCalledWith(metadata);
    });
});
