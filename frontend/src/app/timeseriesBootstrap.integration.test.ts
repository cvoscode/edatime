import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    createTimeseriesModuleMock,
    createUploadEntrypointMock,
    uploadEntrypointInitMock,
    ensureDatasetReadyMock,
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
    createUploadEntrypointMock: vi.fn(),
    uploadEntrypointInitMock: vi.fn(),
    ensureDatasetReadyMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../features/upload/entrypoint.js', () => ({
    createUploadEntrypoint: createUploadEntrypointMock,
}));

vi.mock('../ui/profile.js', () => ({
    hydrateColumnProfiles: vi.fn(),
    renderColumnProfilesGrid: vi.fn(),
}));

vi.mock('../utils/platform.js', () => ({
    installWindowsWebGpuRequestAdapterWorkaround: vi.fn(),
}));

vi.mock('../pages/analyticsPageUtils.js', () => ({
    getAnalyticsChipColor: vi.fn(() => '#fff'),
    getNumericColumns: vi.fn(() => []),
}));

vi.mock('../services/timeseries/filtering.js', () => ({
    sanitizeSelectedColumns: sanitizeSelectedColumnsMock,
}));

vi.mock('../scatter/scatterPage.js', () => ({
    initScatterPage: vi.fn(),
}));

vi.mock('../bootstrap/analyticsOverlay.js', () => ({
    initAnalyticsListeners: vi.fn(),
    fetchAndRenderAnalytics: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../app/shell.js', () => ({
    initAppShell: vi.fn(),
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
    ensurePageModuleLoaded: vi.fn(),
    clearLoadedPageModules: clearLoadedPageModulesMock,
    markMetadataReady: markMetadataReadyMock,
}));

vi.mock('../app/pageModules.js', () => ({
    loadPageDescriptors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../app/bootstrap/chartBootstrap.js', () => ({
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

vi.mock('../pages/timeseriesModule.js', () => ({
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

vi.mock('../store/appStateCompat.js', () => ({
    appState: { metadata: null, chart: null, selectedCols: [] },
}));

vi.mock('../store/index.js', () => ({
    setAdaptiveFilterColumn: setAdaptiveFilterColumnMock,
    setChartInstance: vi.fn(),
    setDatasetRevision: vi.fn(),
    setMetadata: vi.fn(),
    setNumericCols: setNumericColsMock,
    setSelectedCols: setSelectedColsMock,
    setViewport: setViewportMock,
}));

describe('app -> timeseries bootstrap wiring', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = undefined;
        createUploadEntrypointMock.mockReturnValue({ init: uploadEntrypointInitMock });
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

    it('passes the real bootstrap collaborators into createTimeseriesModule and exposes ensureDatasetReady', async () => {
        await import('../app.js');

        expect(createUploadEntrypointMock).not.toHaveBeenCalled();
        expect(uploadEntrypointInitMock).not.toHaveBeenCalled();

        expect(createTimeseriesModuleMock).toHaveBeenCalledTimes(1);
        const deps = createTimeseriesModuleMock.mock.calls[0]?.[0];
        expect(deps).toEqual(expect.objectContaining({
            fetchMetadata: expect.any(Function),
            markMetadataReady: markMetadataReadyMock,
            sanitizeSelectedColumns: sanitizeSelectedColumnsMock,
            clearLoadedPageModules: clearLoadedPageModulesMock,
            ensureSessionPersistenceStarted: expect.any(Function),
            getSelectedCols: expect.any(Function),
            setSelectedCols: setSelectedColsMock,
            setNumericCols: setNumericColsMock,
            setAdaptiveFilterColumn: setAdaptiveFilterColumnMock,
            setViewport: setViewportMock,
        }));

        await deps.fetchMetadata();
        expect(fetchMetadataMock).toHaveBeenCalledTimes(1);

        deps.ensureSessionPersistenceStarted();
        deps.ensureSessionPersistenceStarted();
        expect(startSessionPersistenceMock).toHaveBeenCalledTimes(1);

        await (window as any).__edatime.ensureDatasetReady();
        expect(ensureDatasetReadyMock).toHaveBeenCalledTimes(1);
    });
});
