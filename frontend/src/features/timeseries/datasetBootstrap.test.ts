import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';

const {
    fakeState,
    isMetadataReadyMock,
    setMetadataMock,
    setDatasetRevisionMock,
    hydrateColumnProfilesMock,
    renderColumnProfilesGridMock,
    setUploadPreviewStatusMock,
    setProfileModeMock,
    applyPartialTimeRangeFromMetadataMock,
} = vi.hoisted(() => {
    const fakeState: Record<string, any> = {
        metadata: null,
        selectedCols: [],
    };

    return {
        fakeState,
        isMetadataReadyMock: vi.fn(() => false),
        setMetadataMock: vi.fn((metadata: unknown) => {
            fakeState.metadata = metadata;
        }),
        setDatasetRevisionMock: vi.fn(),
        hydrateColumnProfilesMock: vi.fn(),
        renderColumnProfilesGridMock: vi.fn(),
        setUploadPreviewStatusMock: vi.fn(),
        setProfileModeMock: vi.fn(),
        applyPartialTimeRangeFromMetadataMock: vi.fn(),
    };
});

vi.mock('../../store/datasetState.js', () => ({
    setMetadata: setMetadataMock,
    setDatasetRevision: setDatasetRevisionMock,
}));

vi.mock('../../features/upload/index.js', () => ({
    hydrateColumnProfiles: hydrateColumnProfilesMock,
    renderColumnProfilesGrid: renderColumnProfilesGridMock,
}));

vi.mock('../../ui/upload.js', () => ({
    setUploadPreviewStatus: setUploadPreviewStatusMock,
    setProfileMode: setProfileModeMock,
    applyPartialTimeRangeFromMetadata: applyPartialTimeRangeFromMetadataMock,
}));

vi.mock('../../debug.js', () => ({
    DEBUG: false,
    dbg: vi.fn(),
    dbgGroup: vi.fn((_label: string, fn: () => void) => fn()),
}));

const baseMetadata = {
    revision: 42,
    columns: [{ name: 'value', dtype: 'float64' }],
    time_range: { min: 10, max: 20 },
} as any;

type DatasetBootstrapDeps = import('./datasetBootstrap.js').DatasetBootstrapDeps;

function createDeps(overrides: Partial<DatasetBootstrapDeps> = {}): DatasetBootstrapDeps {
    return {
        ensureChartModules: vi.fn().mockResolvedValue(undefined),
        fetchMetadata: vi.fn().mockResolvedValue(baseMetadata),
        workspace: {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot({
                selection: { columns: fakeState.selectedCols, colorColumn: null },
                filters: { columnRanges: {}, adaptiveLines: [] },
            })),
            beginDatasetSession: vi.fn(() => ({ id: 1, signal: new AbortController().signal })),
            commitDataset: vi.fn(() => true),
            setSelection: vi.fn((cols: string[]) => {
                fakeState.selectedCols = cols;
            }),
            setFilters: vi.fn(),
        },
        markMetadataReady: vi.fn(),
        isMetadataReady: isMetadataReadyMock,
        clearLoadedPageModules: vi.fn(),
        storeFetchedMetadata: vi.fn(),
        initializeDatasetUi: vi.fn(),
        setNumericCols: vi.fn(),
        setDefaultSelectedColumns: vi.fn(),
        sanitizeSelectedColumns: vi.fn(),
        refreshVisibleData: vi.fn().mockResolvedValue(undefined),
        getNumericColumns: vi.fn(() => ['value']),
        getDefaultTimeseriesColumns: vi.fn(() => ['value']),
        rebuildTimeseriesColumns: vi.fn(),
        clearPersistedFilters: vi.fn(),
        setAdaptiveFilterColumn: vi.fn(),
        timeseriesFeatureInit: vi.fn(),
        ensureSessionPersistenceStarted: vi.fn(),
        setViewport: vi.fn(),
        updateAnalysisZoom: vi.fn(),
        emitChartRangeChange: vi.fn(),
        emitWorkflowRefresh: vi.fn(),
        ...overrides,
    };
}

async function importCreateDatasetBootstrap() {
    const mod = await import('./datasetBootstrap.js');
    return mod.createDatasetBootstrap;
}

describe('createDatasetBootstrap', () => {
    beforeEach(() => {
        vi.resetModules();
        fakeState.metadata = null;
        fakeState.selectedCols = [];
        isMetadataReadyMock.mockReturnValue(false);
        setMetadataMock.mockClear();
        setDatasetRevisionMock.mockClear();
        hydrateColumnProfilesMock.mockClear();
        renderColumnProfilesGridMock.mockClear();
        setUploadPreviewStatusMock.mockClear();
        setProfileModeMock.mockClear();
        applyPartialTimeRangeFromMetadataMock.mockClear();
    });

    it('uses the injected storeFetchedMetadata and markMetadataReady callbacks during dataset bootstrap', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps();
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(deps.storeFetchedMetadata).toHaveBeenCalledWith(baseMetadata);
        expect(deps.markMetadataReady).toHaveBeenCalledTimes(1);
        expect(deps.workspace.commitDataset).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1 }), baseMetadata, 42,
        );
        expect(deps.workspace.setSelection).toHaveBeenCalledWith(['value']);
    });

    it('seeds the workspace before sanitation so default series survive a fresh dataset bootstrap', async () => {
        let workspaceSelection: string[] = [];
        const setSelection = vi.fn((columns: readonly string[]) => {
            workspaceSelection = [...columns];
        });
        const deps = createDeps({
            workspace: {
                getSnapshot: vi.fn(() => makeWorkspaceSnapshot({
                    selection: { columns: workspaceSelection, colorColumn: null },
                    filters: { columnRanges: {}, adaptiveLines: [] },
                })),
                beginDatasetSession: vi.fn(() => ({ id: 1, signal: new AbortController().signal })),
                commitDataset: vi.fn(() => true),
                setSelection,
                setFilters: vi.fn(),
            },
        });
        deps.sanitizeSelectedColumns = vi.fn(() => {
            // The real sanitizer reads and writes only workspace selection.
            workspaceSelection = workspaceSelection.filter(Boolean);
        });
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(workspaceSelection).toEqual(['value']);
        expect(deps.setAdaptiveFilterColumn).toHaveBeenCalledWith('value');
    });

    it('uses the injected initializeDatasetUi callback instead of hardcoding UI hydration internally', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps();
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(deps.initializeDatasetUi).toHaveBeenCalledWith(baseMetadata);
        expect(hydrateColumnProfilesMock).not.toHaveBeenCalled();
    });

    it('reuses initializeDatasetUi and refreshes visible data after a dataset mutation', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps({
            initializeDatasetUi: vi.fn(),
            refreshVisibleData: vi.fn().mockResolvedValue(undefined),
        });
        const bootstrap = createDatasetBootstrap(deps);
        isMetadataReadyMock.mockReturnValue(true);

        await bootstrap.refreshAfterMutation();

        expect(deps.storeFetchedMetadata).toHaveBeenCalledWith(baseMetadata);
        expect(deps.markMetadataReady).toHaveBeenCalledTimes(1);
        expect(deps.clearPersistedFilters).toHaveBeenCalledTimes(1);
        expect(deps.workspace.setFilters).toHaveBeenCalledWith({ columnRanges: {}, adaptiveLines: [] });
        expect(deps.initializeDatasetUi).toHaveBeenCalledWith(baseMetadata);
        expect(deps.refreshVisibleData).toHaveBeenCalledTimes(1);
    });

    it('keeps default series selected after an upload refresh when sanitation uses workspace state', async () => {
        let workspaceSelection: string[] = [];
        const deps = createDeps({
            workspace: {
                getSnapshot: vi.fn(() => makeWorkspaceSnapshot({
                    selection: { columns: workspaceSelection, colorColumn: null },
                    filters: { columnRanges: {}, adaptiveLines: [] },
                })),
                beginDatasetSession: vi.fn(() => ({ id: 1, signal: new AbortController().signal })),
                commitDataset: vi.fn(() => true),
                setSelection: vi.fn((columns: readonly string[]) => {
                    workspaceSelection = [...columns];
                }),
                setFilters: vi.fn(),
            },
        });
        deps.sanitizeSelectedColumns = vi.fn(() => {
            workspaceSelection = workspaceSelection.filter(Boolean);
        });
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const bootstrap = createDatasetBootstrap(deps);
        isMetadataReadyMock.mockReturnValue(true);

        await bootstrap.refreshAfterMutation();

        expect(workspaceSelection).toEqual(['value']);
        expect(deps.refreshVisibleData).toHaveBeenCalledTimes(1);
    });

    it('broadcasts a dataset-changed event with the previous and next revision after mutation refresh', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps({
            fetchMetadata: vi.fn()
                .mockResolvedValueOnce(baseMetadata)
                .mockResolvedValueOnce({ ...baseMetadata, revision: 43 }),
        });
        const bootstrap = createDatasetBootstrap(deps);
        const listener = vi.fn();
        window.addEventListener('edatime:dataset-changed', listener as EventListener);

        await bootstrap.ensureDatasetReady();
        isMetadataReadyMock.mockReturnValue(true);
        await bootstrap.refreshAfterMutation();

        expect(listener).toHaveBeenCalledTimes(1);
        expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
            previousRevision: 42,
            nextRevision: 43,
        });
    });

    it('starts a fresh metadata bootstrap when a dataset mutation happens during initial bootstrap', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        let resolveInitialMetadata!: (metadata: typeof baseMetadata) => void;
        const initialMetadata = new Promise<typeof baseMetadata>((resolve) => {
            resolveInitialMetadata = resolve;
        });
        const freshMetadata = { ...baseMetadata, revision: 43 };
        const deps = createDeps({
            fetchMetadata: vi.fn()
                .mockReturnValueOnce(initialMetadata)
                .mockResolvedValueOnce(freshMetadata),
        });
        const bootstrap = createDatasetBootstrap(deps);

        const initialBootstrap = bootstrap.ensureDatasetReady();
        await Promise.resolve();

        const refresh = bootstrap.refreshAfterMutation();
        await Promise.resolve();

        expect(deps.fetchMetadata).toHaveBeenCalledTimes(2);
        resolveInitialMetadata(baseMetadata);

        await refresh;
        await expect(initialBootstrap).rejects.toMatchObject({ name: 'AbortError' });

        expect(deps.storeFetchedMetadata).toHaveBeenCalledWith(freshMetadata);
    });

    it('does not publish metadata when a newer workspace session supersedes the refresh', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps({
            workspace: {
                getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
                beginDatasetSession: vi.fn(() => ({ id: 1, signal: new AbortController().signal })),
                commitDataset: vi.fn(() => false),
                setSelection: vi.fn(),
                setFilters: vi.fn(),
            },
        });
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(deps.storeFetchedMetadata).not.toHaveBeenCalled();
        expect(deps.initializeDatasetUi).not.toHaveBeenCalled();
    });
});
