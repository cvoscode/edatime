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
import { getAnalyticsChipColor, getEffectiveColumnNames } from './platform/analyticsColumns.js';
import {
    createTimeseriesModule,
    createAnalyticsOverlayController,
    sanitizeSelectedColumns,
    setAdaptiveFilterColumn,
} from './features/timeseries/index.js';
import { createTimeseriesPlanFilterSync } from './platform/planFilterSync.js';
// Scatter is dynamically imported on first navigation through the feature
// registry, keeping its heavy chunks out of the initial application bundle.
import { showPage } from './app/navigation/showPage.js';
import { createAppRuntime } from './app/runtime.js';
import { configureSeriesColorWorkspace } from './utils/seriesColors.js';
import { createWorkspaceStore } from './workspace/workspaceStore.js';
import { cleaningDatasetIdentityFromMetadata, cleaningPlanStore } from './cleaning/index.js';
import { markAppReady, resetAppReady } from './app/bootState.js';
import { upgradeSelects } from './ui/primitives/Dropdown.js';
import { upgradeFlexibleNumberInputs } from './ui/primitives/FlexibleNumberInput.js';
import { createFeatureRegistry } from './app/featureRegistry.js';
import {
    ensureChartModules as ensureChartBootstrapModules,
    ensureDataModules as ensureBootstrapDataModules,
} from './platform/runtimeModules.js';
import { getHashPage } from './utils/router.js';
import { pageNeedsDatasetBootstrap, resolveBackingPageName } from './utils/pageBootstrap.js';
import { startSessionPersistence } from './platform/sessionLifecycle.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView,
    setComputeLoading,
} from './ui/toolbar.js';
import type { ExportFeature } from './features/export/index.js';
import type { DatasetMetadata, DataObject, AnomalyResponse } from './types/api.js';
import type { ApiRequestOptions } from './services/api/http.js';
import type { ChartInstance, ViewSnapshot } from './types/chart.js';

import { primaryChart } from './charts/primaryChart.js';
import { initDataFreshnessIndicator } from './ui/freshnessIndicator.js';
import { getCleaningPlanHash } from './cleaning/store.js';
import { setExportProvenanceContext } from './utils/exportProvenanceContext.js';
import { invalidateDatasetRequestScope } from './services/api/datasetRequestScope.js';
import { clearScatterViewSnapshots } from './store/scatterState.js';
import { setSpectralFilterPreview, setAnomalyRegions, setAnomalySummaryStats } from './store/analyticsState.js';

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
    runtime.registerCleanup(initDataFreshnessIndicator());
    const fetchMetadata = async (options?: ApiRequestOptions) => {
        const modules = await ensureBootstrapDataModules();
        return modules.fetchMetadata(options);
    };
    let homeMetadataBootstrap: ReturnType<typeof import('./features/home/index.js').createHomeMetadataBootstrap> | null = null;
    const ensureDatasetMetadata = async () => {
        const { createHomeMetadataBootstrap } = await import('./features/home/index.js');
        if (appDisposed) throw new DOMException('Application disposed.', 'AbortError');
        homeMetadataBootstrap ??= createHomeMetadataBootstrap({
            workspace,
            fetchMetadata,
        });
        return homeMetadataBootstrap.ensure();
    };
    // Keep the cleaning plan identity in lockstep with the dataset before any
    // feature subscriber can issue a request. Workspace listeners run in
    // registration order, so installing this invariant at composition time
    // closes the brief stale-plan window created by a dataset replacement.
    let cleaningDatasetKey = '';
    runtime.registerCleanup(workspace.subscribe((snapshot) => {
        const dataset = snapshot.dataset;
        if (!dataset.metadata) return;
        const identity = cleaningDatasetIdentityFromMetadata(dataset.metadata, dataset.revision);
        const nextKey = JSON.stringify(identity);
        if (nextKey === cleaningDatasetKey) return;
        cleaningDatasetKey = nextKey;
        cleaningPlanStore.resetForDataset(identity);
    }));
    runtime.registerCleanup(configureSeriesColorWorkspace(workspace));
    const analyticsOverlay = createAnalyticsOverlayController();
    let timeseriesModule!: ReturnType<typeof createTimeseriesModule>;
    runtime.registerCleanup(setExportProvenanceContext({
        workspace,
        cleaningPlanStore,
        getData: () => timeseriesModule?.getCurrentData() ?? null,
        loadAppliedPlanHistory: async (versionId) => {
            const { getAppliedPlanHistory } = await import('./cleaning/api.js');
            return getAppliedPlanHistory(versionId);
        },
    }));
    let exportFeatureLoad: Promise<ExportFeature> | null = null;
    const runExport = async (action: keyof ExportFeature) => {
        try {
            exportFeatureLoad ??= import('./features/export/index.js').then(({ createExportFeature }) =>
                createExportFeature({
                    workspace,
                    cleaningPlanStore,
                    getData: () => timeseriesModule?.getCurrentData() ?? null,
                }));
            const feature = await exportFeatureLoad;
            if (appDisposed) return;
            const result = await feature[action]();
            if (!result.ok) throw new Error(
                result.reason === 'no_data' ? 'No plotted data is available yet.' :
                result.reason === 'no_plan' ? 'Load a dataset before exporting.' :
                result.reason === 'row_limit_exceeded' ? (action === 'exportFilteredParquet'
                    ? 'The export exceeds the configured row limit.'
                    : 'Use the Parquet dataset export for this amount of data.') :
                'Could not export the data. Try again.');
        } catch (error) {
            exportFeatureLoad = null;
            if (appDisposed) return;
            const { toast } = await import('./utils/toast.js');
            if (!appDisposed) toast(error instanceof Error ? error.message : 'Could not export the data.', 'error');
        }
    };
    const exportFeature = {
        exportFilteredCsv: () => { void runExport('exportFilteredCsv'); },
        exportFilteredJson: () => { void runExport('exportFilteredJson'); },
        exportFilteredParquet: () => { void runExport('exportFilteredParquet'); },
    };
    runtime.registerCleanup(() => workspace.dispose());
    runtime.registerCleanup(() => primaryChart.dispose());
    runtime.registerCleanup(featureRegistry.dispose);
    runtime.registerCleanup(analyticsOverlay.dispose);

    let appDisposed = false;
    let disposeDatasetFreshnessTracking: (() => void) | null = null;
    runtime.registerCleanup(() => { disposeDatasetFreshnessTracking?.(); disposeDatasetFreshnessTracking = null; });
    void import('./app/datasetFreshnessTracking.js').then(({ trackDatasetFreshness }) => {
        if (!appDisposed) disposeDatasetFreshnessTracking = trackDatasetFreshness(workspace);
    });
    let appStart: Promise<void> | null = null;
    let dataChartCtor: DataChartCtorType | null = null;
    let sessionPersistenceStarted = false;
    let disposeSessionPersistence: (() => void) | null = null;
    let cleaningPanelLoad: Promise<void> | null = null;
    let disposeCleaningPanel: (() => void) | null = null;

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

    async function refreshDatasetAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
        await timeseriesModule.refreshAfterMutation(options);
        if (!appDisposed) showPage(getHashPage() ?? 'timeseries');
        if (appDisposed) return;

        // A version switch or materialization can reuse an exact report already
        // in the server cache, or start one for this immutable source. The API
        // response is checked against the refreshed workspace before it is used.
        const activeVersionId = workspace.getSnapshot().dataset.activeSourceVersionId;
        if (!activeVersionId) return;
        try {
            const { fetchDatasetProfile, startDatasetProfile } = await import('./services/api/profile.js');
            const current = await fetchDatasetProfile();
            if (current.sourceVersion.id !== activeVersionId) return;
            if (['ready', 'queued', 'running', 'cancelling'].includes(current.status)) return;
            const started = await startDatasetProfile();
            if (started.sourceVersion.id !== activeVersionId
                || workspace.getSnapshot().dataset.activeSourceVersionId !== activeVersionId) return;
        } catch {
            // The dataset refresh already succeeded. The Preparation report
            // retains its explicit retry action if background profiling fails.
        }
    }

    async function ensureCleaningPanelMounted(refreshCleaningPlanConsumers: () => void): Promise<void> {
        if (disposeCleaningPanel || appDisposed) return;
        if (!cleaningPanelLoad) {
            cleaningPanelLoad = import('./cleaning/panel.js').then(({ mountCleaningPlanPanel }) => {
                if (appDisposed || disposeCleaningPanel) return;
                disposeCleaningPanel = mountCleaningPlanPanel({
                    planStore: cleaningPlanStore,
                    getViewport: () => workspace.getSnapshot().viewport,
                    getColumns: (beforeStageId) => {
                        const plan = cleaningPlanStore.getSnapshot();
                        const index = plan?.stages.findIndex((stage) => stage.id === beforeStageId) ?? -1;
                        return getEffectiveColumnNames(workspace.getSnapshot().dataset.metadata,
                            plan && index >= 0 ? { ...plan, stages: plan.stages.slice(0, index) } : plan);
                    },
                    onPlanChanged: refreshCleaningPlanConsumers,
                    onPlanApplied: () => refreshDatasetAfterMutation(),
                });
                runtime.registerCleanup(() => {
                    disposeCleaningPanel?.();
                    disposeCleaningPanel = null;
                });
            });
        }
        await cleaningPanelLoad;
    }

    async function init(): Promise<void> {
        if (appDisposed) return;

        upgradeSelects(document);
        upgradeFlexibleNumberInputs(document);
        installWindowsWebGpuRequestAdapterWorkaround();
        // Hydrate persisted chart preferences (Y-range "stack from 0", etc.)
        // BEFORE the toolbar wires up so the toggle starts in the right state.
        // Data transport and chart rendering remain behind their feature readiness paths.
        timeseriesModule = createTimeseriesModule({
            fetchData: async (start, end, width, columns, colorColumn, lookaroundMs, options) => {
                const { fetchData } = await ensureBootstrapDataModules();
                return fetchData(start, end, width, columns, colorColumn, lookaroundMs, options);
            },
            fetchMetadata,
            workspace,
            ensurePrimaryChartCtor,
            markMetadataReady: featureRegistry.markMetadataReady,
            isMetadataReady: featureRegistry.isMetadataReady,
            sanitizeSelectedColumns: () => sanitizeSelectedColumns(workspace),
            clearLoadedPageModules: featureRegistry.clearLoadedFeatures,
            ensureSessionPersistenceStarted,
            setAdaptiveFilterColumn,
            updateAnalysisYRange,
            updateAnalysisZoom,
            getCurrentView: () => getCurrentView(workspace),
            fetchAndRenderAnalytics,
            refreshZoomControlsState: () => refreshZoomControlsState(workspace),
            setAnomalyOverlayRenderCallback: analyticsOverlay.setRenderCallback,
            chartExportPng: () => primaryChart.current?.exportPNG?.(),
            chartExportSvg: () => primaryChart.current?.exportSVG?.(),
            exportFilteredCsv: exportFeature.exportFilteredCsv,
            exportFilteredJson: exportFeature.exportFilteredJson,
            exportFilteredParquet: exportFeature.exportFilteredParquet,
            cleaningPlanStore,
        });

        // Mount registers page lifecycle (page-change listener, etc.)
        runtime.registerCleanup(timeseriesModule.mount());
        const syncTimeseriesPlanFilters = createTimeseriesPlanFilterSync(workspace);
        // A restored draft can already exist before this subscription is
        // registered. Hydrate its Signals ranges immediately as well as on
        // later plan changes.
        syncTimeseriesPlanFilters(cleaningPlanStore.getSnapshot());
        let planRefreshQueued = false;
        let analysisRefreshNeeded = false;
        let renderedPlanHash = getCleaningPlanHash();
        const refreshCleaningPlanConsumers = () => {
            if (appDisposed) return;
            const planHash = getCleaningPlanHash();
            const datasetChanged = planHash !== renderedPlanHash;
            if (datasetChanged) {
                analysisRefreshNeeded = true;
                renderedPlanHash = planHash;
                invalidateDatasetRequestScope();
                timeseriesModule.invalidateData();
                analyticsOverlay.cancel();
                setAnomalyRegions(null);
                setAnomalySummaryStats(null);
                setSpectralFilterPreview(null);
                clearScatterViewSnapshots();
                // Preparation owns the editor. Retire cached analyses so later
                // visits cannot present results from an earlier working dataset.
                featureRegistry.clearLoadedFeatures(['prepare']);
            }
            if (planRefreshQueued) return;
            planRefreshQueued = true;
            queueMicrotask(() => {
                planRefreshQueued = false;
                if (appDisposed) return;
                syncTimeseriesPlanFilters(cleaningPlanStore.getSnapshot());
                sanitizeSelectedColumns(workspace);
                timeseriesModule.buildColumnToggles();
                timeseriesModule.buildRangeControls();
                timeseriesModule.renderCurrentData();
                void timeseriesModule.fetchAndRender();
                const activePage = getHashPage() ?? 'timeseries';
                const refreshAnalysis = analysisRefreshNeeded;
                analysisRefreshNeeded = false;
                if (refreshAnalysis && !['home', 'upload', 'timeseries', 'prepare'].includes(activePage)) showPage(activePage);
            });
        };
        // A plan is the plot request contract. Subscribe once at the owner so
        // every editor, page action, import, undo, and history restore updates
        // the visible plot without requiring each caller to remember a refresh.
        runtime.registerCleanup(cleaningPlanStore.subscribe(() => refreshCleaningPlanConsumers()));
        // Register lazy page factories without blocking the shell. Navigation
        // must wait for registration before loading a feature or emitting its
        // activation event, including when the initial URL opens an analysis.
        const pageDescriptorsReady = (async () => {
            const { loadPageDescriptors } = await import('./app/pageModules.js');
            await loadPageDescriptors(featureRegistry, {
                getRenderTimeseries: () => timeseriesModule.renderCurrentData(),
                getCurrentTimeseriesData: () => timeseriesModule.getCurrentData(),
                refreshDatasetAfterMutation,
                registerCleanup: runtime.registerCleanup,
                showPage,
                chipColor: (col) => getAnalyticsChipColor(col),
                setLoading: setComputeLoading,
                onCleaningPlanChanged: refreshCleaningPlanConsumers,
                cleaningPlanStore,
                workspace,
            });
        })();
        const { initAppShell } = await import('./app/shell.js');
        if (appDisposed) return;
        initAppShell({
            ensurePageModuleLoaded: async (page) => {
                await pageDescriptorsReady;
                if (!appDisposed) await featureRegistry.ensureFeatureLoaded(page);
            },
            ensureDatasetMetadata,
            ensureDatasetReady: () => timeseriesModule.ensureDatasetReady(),
            showPage,
            fetchAndRender: () => timeseriesModule.fetchAndRender(),
            fetchAndRenderAnalytics,
            getCurrentTimeseriesData: () => timeseriesModule.getCurrentData(),
            exportFilteredCsv: exportFeature.exportFilteredCsv,
            exportFilteredJson: exportFeature.exportFilteredJson,
            exportChartPng: () => primaryChart.current?.exportPNG?.(),
            renderCurrentData: () => timeseriesModule.renderCurrentData(),
            updateAnalysisYRange,
            requestAnnotationOverlayRender: () => primaryChart.current?.requestOverlayRender?.(),
            buildTimeseriesColumns: () => timeseriesModule.buildColumnToggles(),
            buildTimeseriesRanges: () => timeseriesModule.buildRangeControls(),
            zoomOut: () => timeseriesModule.zoomOut(),
            resetZoom: () => timeseriesModule.resetZoom(),
            refreshDatasetAfterMutation,
            registerCleanup: runtime.registerCleanup,
            workspace,
            cleaningPlanStore,
            onCleaningPlanChanged: refreshCleaningPlanConsumers,
        });

        // The workbench is a large, isolated feature. Keep it entirely out of
        // startup and mount it only when the existing global Plan trigger is
        // first used. Re-dispatch that first click after mounting so the user
        // sees the workbench immediately rather than needing a second click.
        const planTrigger = document.getElementById('open-cleaning-plan-btn') as HTMLButtonElement | null;
        const openCleaningPanel = () => {
            planTrigger?.removeEventListener('click', openCleaningPanel);
            void ensureCleaningPanelMounted(refreshCleaningPlanConsumers).then(() => planTrigger?.click());
        };
        planTrigger?.addEventListener('click', openCleaningPanel);
        runtime.registerCleanup(() => planTrigger?.removeEventListener('click', openCleaningPanel));

        await pageDescriptorsReady;

        // The root may be disposed while deferred page descriptors are loading.
        // Do not continue into dataset startup after its lifetime has ended.
        if (appDisposed) return;

        try {
            const initialPage = getHashPage();
            if (pageNeedsDatasetBootstrap(initialPage)) {
                await timeseriesModule.ensureDatasetReady();
            }
            // Resolve aliases against the latest route before marking the app
            // ready; the user may have navigated while bootstrap was pending.
            if (!appDisposed) {
                await featureRegistry.ensureFeatureLoaded(resolveBackingPageName(getHashPage()) ?? 'home');
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
