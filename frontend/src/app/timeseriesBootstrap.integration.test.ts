import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppShellDeps } from './shell.js';

const {
    createTimeseriesModuleMock,
    createAnalyticsOverlayControllerMock,
    ensureDatasetReadyMock,
    initAppShellMock,
    markMetadataReadyMock,
    clearLoadedPageModulesMock,
    disposePageRegistryMock,
    fetchMetadataMock,
    sanitizeSelectedColumnsMock,
    startSessionPersistenceMock,
    registerRuntimeCleanupMock,
    disposeRuntimeMock,
    setNumericColsMock,
    setAdaptiveFilterColumnMock,
    setViewportMock,
} = vi.hoisted(() => ({
    createTimeseriesModuleMock: vi.fn(),
    createAnalyticsOverlayControllerMock: vi.fn(() => ({
        fetchAndRender: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn(),
        setRenderCallback: vi.fn(),
        dispose: vi.fn(),
    })),
    ensureDatasetReadyMock: vi.fn().mockResolvedValue(undefined),
    initAppShellMock: vi.fn(() => ({
        openCommands: vi.fn().mockResolvedValue(undefined),
        openSettings: vi.fn().mockResolvedValue(undefined),
    })),
    markMetadataReadyMock: vi.fn(),
    clearLoadedPageModulesMock: vi.fn(),
    disposePageRegistryMock: vi.fn(),
    fetchMetadataMock: vi.fn().mockResolvedValue({
        revision: 1,
        columns: [],
        time_range: { min: 0, max: 1 },
    }),
    sanitizeSelectedColumnsMock: vi.fn(),
    startSessionPersistenceMock: vi.fn(),
    registerRuntimeCleanupMock: vi.fn(),
    disposeRuntimeMock: vi.fn(),
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

vi.mock('../features/timeseries/analyticsOverlay.js', () => ({
    initAnalyticsListeners: vi.fn(),
    fetchAndRenderAnalytics: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../app/shell.js', () => ({
    initAppShell: initAppShellMock,
}));

vi.mock('../app/navigation/showPage.js', () => ({
    showPage: vi.fn(),
}));

vi.mock('../app/runtime.js', () => ({
    createAppRuntime: vi.fn(() => ({
        registerCleanup: registerRuntimeCleanupMock,
        dispose: disposeRuntimeMock,
    })),
}));

vi.mock('./shell/commands.js', () => ({
    APP_COMMAND_DEFINITIONS: [],
}));

vi.mock('../app/featureRegistry.js', () => ({
    createFeatureRegistry: vi.fn(() => ({
        ensureFeatureLoaded: vi.fn(),
        clearLoadedFeatures: clearLoadedPageModulesMock,
        dispose: disposePageRegistryMock,
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
    }),
    ensureChartModules: vi.fn().mockResolvedValue({
        fetchMetadata: fetchMetadataMock,
        fetchData: vi.fn(),
        fetchAnomalies: vi.fn(),
        DataChartCtor: class { },
    }),
}));

vi.mock('../utils/router.js', () => ({
    getHashPage: vi.fn(() => 'upload'),
}));

vi.mock('../utils/pageBootstrap.js', async (importOriginal) => ({
    ...await importOriginal<typeof import('../utils/pageBootstrap.js')>(),
    pageNeedsDatasetBootstrap: vi.fn(() => false),
}));

vi.mock('../features/timeseries/index.js', () => ({
    createAnalyticsOverlayController: createAnalyticsOverlayControllerMock,
    createTimeseriesModule: createTimeseriesModuleMock,
    setAdaptiveFilterColumn: setAdaptiveFilterColumnMock,
    sanitizeSelectedColumns: sanitizeSelectedColumnsMock,
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

vi.mock('../platform/sessionLifecycle.js', () => ({
    startSessionPersistence: startSessionPersistenceMock,
}));

vi.mock('../charts/primaryChart.js', () => ({
    primaryChart: { current: null, dispose: vi.fn() },
    initChartStatePrefs: vi.fn(),
    setPrimaryChartInstance: vi.fn(),
    setViewport: setViewportMock,
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
            invalidateData: vi.fn(),
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            onZoomRangeChange: vi.fn(),
            refreshAfterMutation: vi.fn().mockResolvedValue(undefined),
        });
    });

    afterEach(() => {
        delete (window as any).__edatime;
    });

    it('passes the real bootstrap collaborators into createTimeseriesModule and shell without publishing ready aliases on window', async () => {
        await import('../app.js');
        await vi.waitFor(() => expect(initAppShellMock).toHaveBeenCalledTimes(1));

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

            setAdaptiveFilterColumn: setAdaptiveFilterColumnMock,
        }));

        await deps.fetchMetadata();
        expect(fetchMetadataMock).toHaveBeenCalledTimes(1);

        const disposeSessionPersistence = vi.fn();
        startSessionPersistenceMock.mockReturnValue(disposeSessionPersistence);
        deps.ensureSessionPersistenceStarted();
        deps.ensureSessionPersistenceStarted();
        expect(startSessionPersistenceMock).toHaveBeenCalledTimes(1);
        const runtimeCleanup = registerRuntimeCleanupMock.mock.calls.at(-1)?.[0] as (() => void) | undefined;
        expect(runtimeCleanup).toBeTypeOf('function');
        runtimeCleanup?.();
        expect(disposeSessionPersistence).toHaveBeenCalledTimes(1);

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

    it('invalidates old plot data and refreshes the active analysis when a pipeline changes', async () => {
        const { startApp } = await import('../app.js');
        await startApp();
        const { cleaningPlanStore } = await import('../cleaning/store.js');
        const { getHashPage } = await import('../utils/router.js');
        const { showPage } = await import('../app/navigation/showPage.js');
        vi.mocked(getHashPage).mockReturnValue('fft');
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        await Promise.resolve();
        const timeseries = createTimeseriesModuleMock.mock.results[0].value;
        const overlay = createAnalyticsOverlayControllerMock.mock.results[0].value;
        timeseries.invalidateData.mockClear();
        timeseries.fetchAndRender.mockClear();
        clearLoadedPageModulesMock.mockClear();
        vi.mocked(showPage).mockClear();

        cleaningPlanStore.addStage({ kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'timeseries', label: 'Keep window', startMs: 10, endMs: 20, mode: 'keepInside' });

        expect(timeseries.invalidateData).toHaveBeenCalledTimes(1);
        expect(overlay.cancel).toHaveBeenCalled();
        expect(clearLoadedPageModulesMock).toHaveBeenCalledWith(['prepare']);
        await Promise.resolve();
        expect(timeseries.fetchAndRender).toHaveBeenCalledTimes(1);
        expect(showPage).toHaveBeenCalledWith('fft');
        vi.mocked(getHashPage).mockReturnValue('upload');
    });

    it('does not publish a separate ensureReady window alias during bootstrap', async () => {
        await import('../app.js');
        expect((window as any).__edatime?.ensureReady).toBeUndefined();
        expect((window as any).__edatime?.ensureDatasetReady).toBeUndefined();
    });

    it('waits for deferred page registration before allowing navigation to load its feature', async () => {
        const { loadPageDescriptors } = await import('./pageModules.js');
        let finishRegistration!: () => void;
        vi.mocked(loadPageDescriptors).mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishRegistration = resolve;
        }));
        const { startApp } = await import('../app.js');
        await Promise.all([
            vi.waitFor(() => expect(loadPageDescriptors).toHaveBeenCalledTimes(1)),
            vi.waitFor(() => expect(initAppShellMock).toHaveBeenCalledTimes(1)),
        ]);
        const registry = vi.mocked(loadPageDescriptors).mock.calls[0]![0];
        const shellCalls = initAppShellMock.mock.calls as unknown as Array<[AppShellDeps]>;
        let navigationReady = false;
        const navigation = shellCalls[0]![0].ensurePageModuleLoaded('heatmap').then(() => {
            navigationReady = true;
        });

        await Promise.resolve();
        expect(navigationReady).toBe(false);
        expect(registry.ensureFeatureLoaded).not.toHaveBeenCalled();

        finishRegistration();
        await Promise.all([navigation, startApp()]);
        expect(navigationReady).toBe(true);
        expect(registry.ensureFeatureLoaded).toHaveBeenCalledWith('heatmap');
    });

    it.each([
        ['prepare', 'prepare'],
        ['correlations', 'heatmap'],
    ])('loads initial route %s through its registered backing feature %s', async (route, feature) => {
        const { getHashPage } = await import('../utils/router.js');
        vi.mocked(getHashPage).mockReturnValue(route);
        try {
            const { startApp } = await import('../app.js');
            await startApp();
            const { loadPageDescriptors } = await import('./pageModules.js');
            const registry = vi.mocked(loadPageDescriptors).mock.calls[0]![0];
            expect(registry.ensureFeatureLoaded).toHaveBeenCalledWith(feature);
        } finally {
            vi.mocked(getHashPage).mockReturnValue('upload');
        }
    });

    it('deduplicates explicit startup behind the entrypoint lifecycle', async () => {
        const { startApp } = await import('../app.js');

        await startApp();
        await startApp();

        expect(createTimeseriesModuleMock).toHaveBeenCalledTimes(1);
        expect(initAppShellMock).toHaveBeenCalledTimes(1);
    });

    it('creates independently disposable app roots without duplicating one root start', async () => {
        const { createApp, startApp } = await import('../app.js');
        await startApp();

        const embeddedApp = createApp();
        await Promise.all([embeddedApp.start(), embeddedApp.start()]);

        expect(createTimeseriesModuleMock).toHaveBeenCalledTimes(2);
        expect(initAppShellMock).toHaveBeenCalledTimes(2);

        embeddedApp.dispose();
        await embeddedApp.start();

        expect(createTimeseriesModuleMock).toHaveBeenCalledTimes(2);
        expect(initAppShellMock).toHaveBeenCalledTimes(2);
    });

    it('registers page-registry teardown with the app runtime', async () => {
        await import('../app.js');

        expect(registerRuntimeCleanupMock).toHaveBeenCalledWith(disposePageRegistryMock);
    });

    it('exposes root application disposal through the owned runtime', async () => {
        const { disposeApp, startApp } = await import('../app.js');

        disposeApp();
        disposeApp();
        await startApp();

        expect(disposeRuntimeMock).toHaveBeenCalledTimes(1);
        expect(createTimeseriesModuleMock).toHaveBeenCalledTimes(1);
    });

    it('defers data transport loading until a dataset-backed operation requests it', async () => {
        const runtimeModules = await import('../platform/runtimeModules.js');
        await import('../app.js');

        expect(runtimeModules.ensureDataModules).not.toHaveBeenCalled();

        const deps = createTimeseriesModuleMock.mock.calls[0]?.[0];
        await deps.fetchMetadata();

        expect(runtimeModules.ensureDataModules).toHaveBeenCalledTimes(1);
        expect(fetchMetadataMock).toHaveBeenCalledTimes(1);
    });
});
