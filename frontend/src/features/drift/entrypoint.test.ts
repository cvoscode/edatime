import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createDriftEntrypoint } from './entrypoint.js';

const initDriftPageMock = vi.fn();
vi.mock('../../drift/driftPage.js', () => ({
    initDriftPage: initDriftPageMock,
}));

describe('createDriftEntrypoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        initDriftPageMock.mockImplementation(() => { });
    });

    it('returns an explicit init surface', () => {
        const deps = {
            workspace: { getSnapshot: vi.fn().mockReturnValue({ dataset: { metadata: null } }) },
        };
        const entrypoint = createDriftEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not read the workspace before init', () => {
        const deps = {
            workspace: { getSnapshot: vi.fn() },
        };
        createDriftEntrypoint(deps);
        expect(deps.workspace.getSnapshot).not.toHaveBeenCalled();
    });

    it('init only calls initDriftPage once on repeated calls', async () => {
        const deps = {
            workspace: { getSnapshot: vi.fn().mockReturnValue({ dataset: { metadata: null } }) },
        };
        const entrypoint = createDriftEntrypoint(deps);
        await entrypoint.init();
        await entrypoint.init();
        expect(initDriftPageMock).toHaveBeenCalledTimes(1);
    });

    it('init calls initDriftPage with metadata from the workspace', async () => {
        const metadata = { columns: [] };
        const deps = {
            workspace: { getSnapshot: vi.fn().mockReturnValue({ dataset: { metadata } }) },
        };
        const entrypoint = createDriftEntrypoint(deps);
        await entrypoint.init();
        expect(initDriftPageMock).toHaveBeenCalledWith(metadata);
    });
});
