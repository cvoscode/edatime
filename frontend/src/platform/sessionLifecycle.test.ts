import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    applySession: vi.fn(),
    autoRestoreSession: vi.fn<() => unknown>(() => null),
    configureSessionWorkspace: vi.fn(),
    initAutoSave: vi.fn(),
    getHashPage: vi.fn(() => ''),
}));

vi.mock('../utils/router.js', () => ({
    getHashPage: mocks.getHashPage,
}));

vi.mock('../utils/session.js', () => ({
    applySession: mocks.applySession,
    autoRestoreSession: mocks.autoRestoreSession,
    configureSessionWorkspace: mocks.configureSessionWorkspace,
    initAutoSave: mocks.initAutoSave,
}));

describe('startSessionPersistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.autoRestoreSession.mockReturnValue(null);
        mocks.getHashPage.mockReturnValue('');
        delete (window as any).__edatime;
    });

    it('configures the workspace and starts autosave without publishing window commands', async () => {
        const { startSessionPersistence } = await import('./sessionLifecycle.js');
        const workspace = {
            getSnapshot: vi.fn(),
            setSelection: vi.fn(),
            setFilters: vi.fn(),
            setViewport: vi.fn(),
            subscribe: vi.fn(() => vi.fn()),
        };

        startSessionPersistence(workspace);

        expect(mocks.configureSessionWorkspace).toHaveBeenCalledWith(workspace);
        expect(mocks.initAutoSave).toHaveBeenCalledTimes(1);
        expect((window as any).__edatime).toBeUndefined();
    });

    it('restores a compatible session into the supplied workspace and refreshes the ready chart', async () => {
        const { restoreSessionAfterChartReady } = await import('./sessionLifecycle.js');
        const savedSession = { version: 1, datasetRevision: 42 };
        mocks.autoRestoreSession.mockReturnValue(savedSession);
        mocks.getHashPage.mockReturnValue('timeseries');
        const workspace = {
            getSnapshot: vi.fn(),
            setSelection: vi.fn(),
            setFilters: vi.fn(),
            setViewport: vi.fn(),
            subscribe: vi.fn(() => vi.fn()),
        };
        const deps = {
            metadataTimeRange: { min: 1, max: 2 },
            currentDatasetRevision: 42,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            workspace,
        };

        await restoreSessionAfterChartReady(deps);

        expect(mocks.applySession).toHaveBeenCalledWith(savedSession, expect.objectContaining({
            metadataTimeRange: deps.metadataTimeRange,
            currentDatasetRevision: 42,
            preferHashPage: true,
            workspace,
        }));
        expect(deps.buildColumnToggles).toHaveBeenCalledTimes(1);
        expect(deps.buildRangeControls).toHaveBeenCalledTimes(1);
        expect(deps.renderCurrentData).toHaveBeenCalledTimes(1);
        expect(deps.fetchAndRender).toHaveBeenCalledTimes(1);
    });
});
