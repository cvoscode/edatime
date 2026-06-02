import { describe, expect, it, vi } from 'vitest';
import { createScatterEntrypoint } from './entrypoint.js';

describe('createScatterEntrypoint', () => {
    it('returns an explicit init surface', () => {
        const deps = {
            initScatterPage: vi.fn().mockResolvedValue(undefined),
            getMetadata: vi.fn().mockReturnValue({} as any),
        };
        const entrypoint = createScatterEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call initScatterPage before init', () => {
        const deps = {
            initScatterPage: vi.fn().mockResolvedValue(undefined),
            getMetadata: vi.fn().mockReturnValue({} as any),
        };
        createScatterEntrypoint(deps);
        expect(deps.initScatterPage).not.toHaveBeenCalled();
    });

    it('init calls initScatterPage with metadata from getMetadata', async () => {
        const metadata = { columns: [], timeRange: [0, 100] } as any;
        const deps = {
            initScatterPage: vi.fn().mockResolvedValue(undefined),
            getMetadata: vi.fn().mockReturnValue(metadata),
        };
        const entrypoint = createScatterEntrypoint(deps);
        await entrypoint.init();
        expect(deps.getMetadata).toHaveBeenCalled();
        expect(deps.initScatterPage).toHaveBeenCalledWith(metadata);
    });
});
