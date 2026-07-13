import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    createTimeseriesModuleMock,
    ensureDatasetReadyMock,
    initAppShellMock,
    markMetadataReadyMock,
    clearLoadedPageModulesMock,
    fetchMetadataMock,
    sanitizeSelectedColumnsMock,
    startSessionPersistenceMock,
    setSelectedColsMock,
    setNumericColsMock,
    setAdaptiveFilterColumnMock,
    setViewportMock,
} = vi.hoisted(() => ({
    createTimeseriesModuleMock: vi.fn(),
    ensureDatasetReadyMock: vi.fn().mockResolvedValue(undefined),
    initAppShellMock: vi.fn(() => ({
        openCommands: vi.fn().mockResolvedValue(undefined),
        openSettings: vi.fn().mockResolvedValue(undefined),
    })),
    markMetadataReadyMock: vi.fn(),
    clearLoadedPageModulesMock: vi.fn(),
    fetchMetadataMock: vi.fn().mockResolvedValue({
        revision: 1,
        columns: [],
        time_range: { min: 0, max: 1 },
    }),
    sanitizeSelectedColumnsMock: vi.fn(),
    startSessionPersistenceMock: vi.fn(),
    setSelectedColsMock: vi.fn(),
    setNumericColsMock: vi.fn(),
    setAdaptiveFilterColumnMock: vi.fn(),
    setViewportMock: vi.fn(),
}));

vi.mock('../debug.js', () => ({
    DEBUG: false,
    dbg: vi.fn(),
    dbgGroup: vi.fn((_label: string, fn: () => void) => fn()),
}));

vi.mock('../ui/errorUI.js', () => ({
    showBootstrapError: vi.fn(),
}));

vi.mock('../features/upload/index.js', () => ({
    hydrateColumnProfiles: vi.fn(),
    renderColumnProfilesGrid: vi.fn(),
}));

vi.mock('../utils/platform.js', () => ({
    installWindowsWebGpuRequestAdapterWorkaround: vi.fn(),
}));

vi.mock('../platform/analyticsColumns.js', () => ({
    getAnalyticsChipColor: vi.fn(() => '#fff'),
    getNumericColumns: vi.fn(() => []),
}));

vi.mock('../services/timeseries/filtering.js', () => ({
    sanitizeSelectedColumns: sanitizeSelectedColumnsMock,
}));

vi.mock('../features/scatter/index.js', () => ({
    initScatterPage: vi.fn(),
}));

vi.mock('../bootstrap/analyticsOverlay.js', () => ({
    initAnalyticsListeners: vi.fn(),
    fetchAndRenderAnalytics: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../app/shell.js', () => ({
    initAppShell: initAppShellMock,
}));

vi.mock('../app/navigation/showPage.js', () => ({
    showPage: vi.fn(),
}));

vi.mock('../app/bootstrap/globalShortcuts.js', () => ({
    initGlobalShortcuts: vi.fn(),
}));

vi.mock('../app/bootstrap/timeseriesShortcuts.js', () => ({
    initTimeseriesShortcuts: vi.fn(),
}));

vi.mock('../app/runtime.js', () => ({
    createAppRuntime: vi.fn(() => ({ registerCleanup: vi.fn() })),
}));

vi.mock('../bootstrap/commands.js', () => ({
    APP_COMMAND_DEFINITIONS: [],
}));

vi.mock('../app/pageRegistry.js', () => ({
    createPageRegistry: vi.fn(() => ({
        ensurePageModuleLoaded: vi.fn(),
        clearLoadedPageModules: clearLoadedPageModulesMock,
        markMetadataReady: markMetadataReadyMock,
        isMetadataReady: vi.fn(),
    })),
}));

vi.mock('../app/pageModules.js', () => ({
    loadPageDescriptors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../platform/runtimeModules.js', () => ({
    ensureDataModules: vi.fn().mockResolvedValue({
        fetchMetadata: fetchMetadataMock,
        fetchData: vi.fn(),
        fetchAnomalies: vi.fn(),
        postTransform: vi.fn(),
    }),
    ensureChartModules: vi.fn().mockResolvedValue({
        fetchMetadata: fetchMetadataMock,
        fetchData: vi.fn(),
        fetchAnomalies: vi.fn(),
        postTransform: vi.fn(),
        DataChartCtor: class { },
    }),
}));

vi.mock('../utils/router.js', () => ({
    getHashPage: vi.fn(() => 'upload'),
}));

vi.mock('../utils/pageBootstrap.js', () => ({
    pageNeedsDatasetBootstrap: vi.fn(() => false),
}));

vi.mock('../features/timeseries/index.js', () => ({
    createTimeseriesModule: createTimeseriesModuleMock,
}));

vi.mock('../ui/toolbar.js', () => ({
    updateAnalysisZoom: vi.fn(),
    updateAnalysisYRange: vi.fn(),
    refreshZoomControlsState: vi.fn(),
    getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 1 })),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    setComputeLoading: vi.fn(),
}));

vi.mock('../bootstrap/sessionBootstrap.js', () => ({
    startSessionPersistence: startSessionPersistenceMock,
}));

vi.mock('../store/chartState.js', () => ({
    chartState: { chart: null, stackFromZero: false },
    initChartStatePrefs: vi.fn(),
    setChartInstance: vi.fn(),
    setViewport: setViewportMock,
}));

vi.mock('../store/datasetState.js', () => ({
    datasetState: { metadata: null },
    setDatasetRevision: vi.fn(),
    setMetadata: vi.fn(),
    setNumericCols: setNumericColsMock,
}));

vi.mock('../store/runtimeState.js', () => ({
    runtimeState: {},
}));

vi.mock('../store/uiState.js', () => ({
    setAdaptiveFilterColumn: setAdaptiveFilterColumnMock,
    setSelectedCols: setSelectedColsMock,
    uiState: { selectedCols: [] },
}));

describe('app -> timeseries bootstrap wiring', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = undefined;
        createTimeseriesModuleMock.mockReturnValue({
            mount: vi.fn(() => vi.fn()),
            ensureDatasetReady: ensureDatasetReadyMock,
            ensureReady: ensureDatasetReadyMock,
            fetchAndRender: vi.fn().mockResolvedValue(undefined),
            renderCurrentData: vi.fn(),
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            emitChartRangeChange: vi.fn(),
            onZoomRangeChange: vi.fn(),
            refreshAfterMutation: vi.fn().mockResolvedValue(undefined),
        });
    });

    afterEach(() => {
        delete (window as any).__edatime;
    });

    it('passes the real bootstrap collaborators into createTimeseriesModule and shell without publishing ready aliases on window', async () => {
        await import('../app.js');

        expect((window as any).__edatime?.state).toBeUndefined();
        expect((window as any).__edatime?.runAnalytics).toBeUndefined();

        expect(createTimeseriesModuleMock).toHaveBeenCalledTimes(1);
        const deps = createTimeseriesModuleMock.mock.calls[0]?.[0];
        expect(deps).toEqual(expect.objectContaining({
            fetchMetadata: expect.any(Function),
            workspace: expect.objectContaining({
                getSnapshot: expect.any(Function),
                beginDatasetSession: expect.any(Function),
                commitDataset: expect.any(Function),
                setSelection: expect.any(Function),
                setFilters: expect.any(Function),
                setViewport: expect.any(Function),
            }),
            markMetadataReady: markMetadataReadyMock,
            sanitizeSelectedColumns: expect.any(Function),
            clearLoadedPageModules: clearLoadedPageModulesMock,
            ensureSessionPersistenceStarted: expect.any(Function),
            setNumericCols: setNumericColsMock,
            setAdaptiveFilterColumn: setAdaptiveFilterColumnMock,
            setViewport: setViewportMock,
        }));

        await deps.fetchMetadata();
        expect(fetchMetadataMock).toHaveBeenCalledTimes(1);

        deps.ensureSessionPersistenceStarted();
        deps.ensureSessionPersistenceStarted();
        expect(startSessionPersistenceMock).toHaveBeenCalledTimes(1);

        expect((window as any).__edatime?.ensureDatasetReady).toBeUndefined();
        expect((window as any).__edatime?.ensureReady).toBeUndefined();

        expect(initAppShellMock).toHaveBeenCalledTimes(1);
        const shellCalls = initAppShellMock.mock.calls as unknown as Array<[{
            ensureDatasetReady: () => Promise<void>;
            showPage: (page: string) => void;
            exportFilteredCsv: () => void;
            exportFilteredJson: () => void;
            exportChartPng: () => void;
        }]>;
        const shellDeps = shellCalls[0][0];
        expect(shellDeps).toEqual(expect.objectContaining({
            ensureDatasetReady: expect.any(Function),
            showPage: expect.any(Function),
            exportFilteredCsv: expect.any(Function),
            exportFilteredJson: expect.any(Function),
            exportChartPng: expect.any(Function),
        }));

        await shellDeps.ensureDatasetReady();
        expect(ensureDatasetReadyMock).toHaveBeenCalledTimes(1);
    });

    it('does not publish a separate ensureReady window alias during bootstrap', async () => {
        await import('../app.js');
        expect((window as any).__edatime?.ensureReady).toBeUndefined();
        expect((window as any).__edatime?.ensureDatasetReady).toBeUndefined();
    });
});
