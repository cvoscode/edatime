/**
 * app.ts — Slim orchestrator.
 *
 * All domain logic lives in focused modules:
 *   store/          — centralized sub-states (chart, analytics, ui, dataset, scatter)
 *   app/            — composition, lifecycle, lazy feature registry, and page modules
 *   debug.ts        — DEBUG flag, dbg(), dbgGroup()
 *   features/upload/panel.ts — upload panel (drag-drop, preview, partial load)
 *   features/upload/profile.ts — virtualised column-profile grid
 *   ui/toolbar.ts   — analysis status, zoom/draw/export/label controls, pages
 *   charts/registry.ts — pluggable chart-type registry
 *   charts/fallback.ts — Canvas 2D fallback chart
 *   chart/DataChart.ts — DataChart (ChartGPU WebGPU adapter)
 *   services/api/   — Arrow IPC fetch + aggregate fetch
 *   features/scatter/ — full Scatter feature with plot/matrix views
 */

import { DEBUG, dbg, dbgGroup } from './debug.js';
import { showBootstrapError } from './ui/errorUI.js';
import { installWindowsWebGpuRequestAdapterWorkaround } from './utils/platform.js';
import { getAnalyticsChipColor } from './platform/analyticsColumns.js';
import {
    createTimeseriesModule,
    createAnalyticsOverlayController,
    sanitizeSelectedColumns,
} from './features/timeseries/index.js';
// Scatter is dynamically imported on first navigation through the feature
// registry, keeping its heavy chunks out of the initial application bundle.
import { initAppShell } from './app/shell.js';
import { showPage } from './app/navigation/showPage.js';
import { createAppRuntime } from './app/runtime.js';
import { createWorkspaceStore } from './workspace/workspaceStore.js';
import { bindCleaningPlanCompatibility, cleaningDatasetIdentityFromMetadata, cleaningPlanStore } from './cleaning/index.js';
import { markAppReady, resetAppReady } from './app/bootState.js';
import { upgradeSelects } from './ui/primitives/Dropdown.js';
import { upgradeFlexibleNumberInputs } from './ui/primitives/FlexibleNumberInput.js';
import { createFeatureRegistry } from './app/featureRegistry.js';
import {
    ensureChartModules as ensureChartBootstrapModules,
    ensureDataModules as ensureBootstrapDataModules,
} from './platform/runtimeModules.js';
import { getHashPage } from './utils/router.js';
import { pageNeedsDatasetBootstrap } from './utils/pageBootstrap.js';
import { startSessionPersistence } from './platform/sessionLifecycle.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView,
    setComputeLoading,
} from './ui/toolbar.js';
import { createExportFeature } from './features/export/index.js';
import type { DatasetMetadata, DataObject, AnomalyResponse } from './types/api.js';
import type { ChartInstance, ViewSnapshot } from './types/chart.js';

import { chartState, initChartStatePrefs, setChartInstance } from './store/chartState.js';
import { datasetState, setDatasetRevision, setMetadata, setNumericCols } from './store/datasetState.js';
import { setAdaptiveFilterColumn } from './store/uiState.js';

type DataChartCtorType = new (
    containerId: string,
    onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
    onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
    onZoomOutCb: (() => void) | null,
) => ChartInstance;

export interface AppRoot {
    start(): Promise<void>;
    dispose(): void;
}

/**
 * Creates one application composition root. All mutable orchestration state
 * stays in this closure, making ownership and disposal explicit instead of
 * coupling it to the `app.ts` module instance.
 */
export function createApp(): AppRoot {
    const runtime = createAppRuntime();
    const featureRegistry = createFeatureRegistry();
    const workspace = createWorkspaceStore();
    const disposeCleaningCompatibility = bindCleaningPlanCompatibility(cleaningPlanStore, workspace);
    const analyticsOverlay = createAnalyticsOverlayController();
    let timeseriesModule!: ReturnType<typeof createTimeseriesModule>;
    const exportFeature = createExportFeature({
        workspace,
        cleaningPlanStore,
        getData: () => timeseriesModule?.getCurrentData() ?? null,
    });
    runtime.registerCleanup(() => workspace.dispose());
    runtime.registerCleanup(disposeCleaningCompatibility);
    runtime.registerCleanup(featureRegistry.dispose);
    runtime.registerCleanup(analyticsOverlay.dispose);

    let appDisposed = false;
    let appStart: Promise<void> | null = null;
    let dataChartCtor: DataChartCtorType | null = null;
    let sessionPersistenceStarted = false;
    let disposeSessionPersistence: (() => void) | null = null;

    async function ensurePrimaryChartCtor(): Promise<DataChartCtorType> {
        if (dataChartCtor) return dataChartCtor;
        const modules = await ensureChartBootstrapModules();
        dataChartCtor = modules.DataChartCtor;
        return dataChartCtor!;
    }

    async function fetchAndRenderAnalytics(): Promise<void> {
        const { fetchAnomalies } = await ensureBootstrapDataModules();
        await analyticsOverlay.fetchAndRender(fetchAnomalies, workspace);
    }

    function ensureSessionPersistenceStarted(): void {
        if (sessionPersistenceStarted) return;
        disposeSessionPersistence = startSessionPersistence(workspace);
        runtime.registerCleanup(() => {
            disposeSessionPersistence?.();
            disposeSessionPersistence = null;
            sessionPersistenceStarted = false;
        });
        sessionPersistenceStarted = true;
    }

    async function init(): Promise<void> {
        if (appDisposed) return;

        upgradeSelects(document);
        upgradeFlexibleNumberInputs(document);
        installWindowsWebGpuRequestAdapterWorkaround();
        // Hydrate persisted chart preferences (Y-range "stack from 0", etc.)
        // BEFORE the toolbar wires up so the toggle starts in the right state.
        initChartStatePrefs();
        // Data transport and chart rendering remain behind their feature readiness paths.
        timeseriesModule = createTimeseriesModule({
            fetchData: async (start, end, width, columns, colorColumn, lookaroundMs, options) => {
                const { fetchData } = await ensureBootstrapDataModules();
                return fetchData(start, end, width, columns, colorColumn, lookaroundMs, options);
            },
            fetchMetadata: async () => {
                const { fetchMetadata } = await ensureBootstrapDataModules();
                return fetchMetadata();
            },
            workspace,
            ensurePrimaryChartCtor,
            markMetadataReady: featureRegistry.markMetadataReady,
            isMetadataReady: featureRegistry.isMetadataReady,
            sanitizeSelectedColumns: () => sanitizeSelectedColumns(workspace),
            clearLoadedPageModules: featureRegistry.clearLoadedFeatures,
            ensureSessionPersistenceStarted,
            setNumericCols,
            setAdaptiveFilterColumn,
            updateAnalysisYRange,
            updateAnalysisZoom,
            getCurrentView,
            fetchAndRenderAnalytics,
            refreshZoomControlsState,
            setAnomalyOverlayRenderCallback: analyticsOverlay.setRenderCallback,
            chartExportPng: () => chartState.chart?.exportPNG?.(),
            chartExportSvg: () => chartState.chart?.exportSVG?.(),
            exportFilteredCsv: exportFeature.exportFilteredCsv,
            exportFilteredJson: exportFeature.exportFilteredJson,
            exportFilteredParquet: exportFeature.exportFilteredParquet,
            cleaningPlanStore,
            onDatasetCommitted: (metadata, revision) => {
                cleaningPlanStore.resetForDataset(cleaningDatasetIdentityFromMetadata(metadata, revision));
            },
        });

        // Mount registers page lifecycle (page-change listener, etc.)
        runtime.registerCleanup(timeseriesModule.mount());
        const refreshCleaningPlanConsumers = () => {
            timeseriesModule.buildRangeControls();
            timeseriesModule.renderCurrentData();
            void timeseriesModule.fetchAndRender();
        };
        initAppShell({
            ensurePageModuleLoaded: featureRegistry.ensureFeatureLoaded,
            ensureDatasetReady: () => timeseriesModule.ensureDatasetReady(),
            showPage,
            fetchAndRender: () => timeseriesModule.fetchAndRender(),
            fetchAndRenderAnalytics,
            getCurrentTimeseriesData: () => timeseriesModule.getCurrentData(),
            exportFilteredCsv: exportFeature.exportFilteredCsv,
            exportFilteredJson: exportFeature.exportFilteredJson,
            exportChartPng: () => chartState.chart?.exportPNG?.(),
            renderCurrentData: () => timeseriesModule.renderCurrentData(),
            updateAnalysisYRange,
            requestAnnotationOverlayRender: () => chartState.chart?.requestOverlayRender?.(),
            buildTimeseriesColumns: () => timeseriesModule.buildColumnToggles(),
            buildTimeseriesRanges: () => timeseriesModule.buildRangeControls(),
            zoomOut: () => timeseriesModule.zoomOut(),
            resetZoom: () => timeseriesModule.resetZoom(),
            refreshDatasetAfterMutation: (opts) => timeseriesModule.refreshAfterMutation(opts),
            registerCleanup: runtime.registerCleanup,
            workspace,
        });

        // The workbench owns its graph/editor/export implementation, so keep
        // it out of the initial chart shell. The global Plan trigger is
        // already present in markup and becomes active as soon as this small
        // feature chunk is ready.
        const { mountCleaningPlanPanel } = await import('./cleaning/panel.js');
        runtime.registerCleanup(mountCleaningPlanPanel({
            planStore: cleaningPlanStore,
            getViewport: () => workspace.getSnapshot().viewport,
            onPlanChanged: refreshCleaningPlanConsumers,
            onPlanApplied: () => timeseriesModule.refreshAfterMutation(),
        }));

        // Descriptor registration is independent of the primary shell and is
        // itself deferred so every advanced page factory stays outside the
        // initial app bundle. The shell starts first to preserve the existing
        // fast startup contract; a page transition waits on its descriptor.
        const { loadPageDescriptors } = await import('./app/pageModules.js');
        await loadPageDescriptors(featureRegistry, {
            getRenderTimeseries: () => timeseriesModule.renderCurrentData(),
            showPage,
            chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
            setLoading: setComputeLoading,
            onCleaningPlanChanged: refreshCleaningPlanConsumers,
            workspace,
        });

        // The root may be disposed while deferred page descriptors are loading.
        // Do not continue into dataset startup after its lifetime has ended.
        if (appDisposed) return;

        try {
            const initialPage = getHashPage();
            if (pageNeedsDatasetBootstrap(initialPage)) {
                await timeseriesModule.ensureDatasetReady();
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('Initial bootstrap failed:', e);
            showBootstrapError({ message });
        }
    }

    function dispose(): void {
        if (appDisposed) return;
        appDisposed = true;
        runtime.dispose();
        resetAppReady();
    }

    function start(): Promise<void> {
        if (appDisposed) return Promise.resolve();
        if (appStart) return appStart;

        resetAppReady();
        appStart = init().finally(() => {
            if (!appDisposed) markAppReady();
        });
        return appStart;
    }

    return { start, dispose };
}

const browserApp = createApp();

/** Starts the application root used by the HTML entrypoint. */
export function startApp(): Promise<void> {
    return browserApp.start();
}

/** Releases the application root used by the HTML entrypoint. */
export function disposeApp(): void {
    browserApp.dispose();
}

void startApp();
