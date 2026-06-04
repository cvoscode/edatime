import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    fakeState,
    isMetadataReadyMock,
    importedMarkMetadataReadyMock,
    setMetadataMock,
    setDatasetRevisionMock,
    hydrateColumnProfilesMock,
    renderColumnProfilesGridMock,
    setUploadPreviewStatusMock,
    setProfileModeMock,
    applyPartialTimeRangeFromMetadataMock,
    importedSetMetaTextMock,
} = vi.hoisted(() => {
    const fakeState: Record<string, any> = {
        metadata: null,
        selectedCols: [],
    };

    return {
        fakeState,
        isMetadataReadyMock: vi.fn(() => false),
        importedMarkMetadataReadyMock: vi.fn(),
        setMetadataMock: vi.fn((metadata: unknown) => {
            fakeState.metadata = metadata;
        }),
        setDatasetRevisionMock: vi.fn(),
        hydrateColumnProfilesMock: vi.fn(),
        renderColumnProfilesGridMock: vi.fn(),
        setUploadPreviewStatusMock: vi.fn(),
        setProfileModeMock: vi.fn(),
        applyPartialTimeRangeFromMetadataMock: vi.fn(),
        importedSetMetaTextMock: vi.fn(),
    };
});

vi.mock('../pageRegistry.js', () => ({
    isMetadataReady: isMetadataReadyMock,
    markMetadataReady: importedMarkMetadataReadyMock,
}));

vi.mock('../../store/index.js', () => ({
    setMetadata: setMetadataMock,
    setDatasetRevision: setDatasetRevisionMock,
}));

vi.mock('../../store/appStateCompat.js', () => ({
    appState: fakeState,
}));

vi.mock('../../ui/profile.js', () => ({
    hydrateColumnProfiles: hydrateColumnProfilesMock,
    renderColumnProfilesGrid: renderColumnProfilesGridMock,
}));

vi.mock('../../ui/upload.js', () => ({
    setUploadPreviewStatus: setUploadPreviewStatusMock,
    setProfileMode: setProfileModeMock,
    applyPartialTimeRangeFromMetadata: applyPartialTimeRangeFromMetadataMock,
}));

vi.mock('../../ui/metaBar.js', () => ({
    setMetaText: importedSetMetaTextMock,
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
        markMetadataReady: vi.fn(),
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
        buildMetaBar: vi.fn(),
        setAdaptiveFilterColumn: vi.fn(),
        getSelectedCols: vi.fn(() => fakeState.selectedCols),
        setSelectedCols: vi.fn((cols: string[]) => {
            fakeState.selectedCols = cols;
        }),
        timeseriesFeatureInit: vi.fn(),
        ensureSessionPersistenceStarted: vi.fn(),
        setMetaText: vi.fn(),
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
        importedMarkMetadataReadyMock.mockReset();
        setMetadataMock.mockClear();
        setDatasetRevisionMock.mockClear();
        hydrateColumnProfilesMock.mockClear();
        renderColumnProfilesGridMock.mockClear();
        setUploadPreviewStatusMock.mockClear();
        setProfileModeMock.mockClear();
        applyPartialTimeRangeFromMetadataMock.mockClear();
        importedSetMetaTextMock.mockClear();
    });

    it('uses the injected storeFetchedMetadata and markMetadataReady callbacks during dataset bootstrap', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps();
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(deps.storeFetchedMetadata).toHaveBeenCalledWith(baseMetadata);
        expect(deps.markMetadataReady).toHaveBeenCalledTimes(1);
    });

    it('uses the injected initializeDatasetUi callback instead of hardcoding UI hydration internally', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps();
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(deps.initializeDatasetUi).toHaveBeenCalledWith(baseMetadata);
        expect(hydrateColumnProfilesMock).not.toHaveBeenCalled();
    });

    it('uses the injected setMetaText callback when metadata has no time range', async () => {
        const createDatasetBootstrap = await importCreateDatasetBootstrap();
        const deps = createDeps({
            fetchMetadata: vi.fn().mockResolvedValue({
                ...baseMetadata,
                time_range: null,
            }),
        });
        const bootstrap = createDatasetBootstrap(deps);

        await bootstrap.ensureDatasetReady();

        expect(deps.setMetaText).toHaveBeenCalledWith('No valid time range found.');
        expect(importedSetMetaTextMock).not.toHaveBeenCalled();
    });
});
