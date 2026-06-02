import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createDriftEntrypoint } from './entrypoint.js';

const initDriftPageMock = vi.fn();
vi.mock('../../drift/driftPage.js', () => ({
    initDriftPage: initDriftPageMock,
}));

describe('createDriftEntrypoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        initDriftPageMock.mockImplementation(() => {});
    });

    it('returns an explicit init surface', () => {
        const deps = {
            initDriftPage: vi.fn(),
            getMetadata: vi.fn().mockReturnValue(null),
        };
        const entrypoint = createDriftEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call initDriftPage before init', () => {
        const deps = {
            initDriftPage: vi.fn(),
            getMetadata: vi.fn().mockReturnValue(null),
        };
        createDriftEntrypoint(deps);
        expect(deps.initDriftPage).not.toHaveBeenCalled();
    });

    it('init only calls initDriftPage once on repeated calls', async () => {
        const deps = {
            initDriftPage: vi.fn(),
            getMetadata: vi.fn().mockReturnValue(null),
        };
        const entrypoint = createDriftEntrypoint(deps);
        await entrypoint.init();
        await entrypoint.init();
        expect(initDriftPageMock).toHaveBeenCalledTimes(1);
    });

    it('init calls initDriftPage with metadata from getMetadata', async () => {
        const metadata = { columns: [] };
        const deps = {
            initDriftPage: vi.fn(),
            getMetadata: vi.fn().mockReturnValue(metadata),
        };
        const entrypoint = createDriftEntrypoint(deps);
        await entrypoint.init();
        expect(initDriftPageMock).toHaveBeenCalledWith(metadata);
    });
});

