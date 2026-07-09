/**
 * app.ts — Slim orchestrator.
 *
 * All domain logic lives in focused modules:
 *   store/          — centralized sub-states (chart, analytics, ui, dataset, scatter)
 *   app/            — bootstrap helpers (WebGPU guard, adaptive gesture, keyboard shortcuts, page modules)
 *   debug.ts        — DEBUG flag, dbg(), dbgGroup()
 *   ui/upload.ts    — upload panel (drag-drop, preview, partial load)
 *   ui/profile.ts   — virtualised column-profile grid
 *   ui/toolbar.ts   — analysis status, zoom/draw/export/label controls, pages
 *   charts/registry.ts — pluggable chart-type registry
 *   charts/fallback.ts — Canvas 2D fallback chart
 *   chart/DataChart.ts — DataChart (ChartGPU WebGPU adapter)
 *   dataClient.ts   — Arrow IPC fetch + aggregate fetch
 *   scatter/scatterPage.ts — full scatter page with plot/matrix views
 */

import { DEBUG, dbg, dbgGroup } from './debug.js';
import { showBootstrapError } from './ui/errorUI.js';
import { installWindowsWebGpuRequestAdapterWorkaround } from './utils/platform.js';
import { getAnalyticsChipColor, getNumericColumns } from './pages/analyticsPageUtils.js';
import { sanitizeSelectedColumns } from './services/timeseries/filtering.js';
// `initScatterPage` lives behind the scatter feature entrypoint and is
// dynamically imported on first navigation. Keeping the import out of
// app.ts ensures scatter's heavy chunks (echarts, chartgpu, apache-arrow)
// never enter the initial app bundle.
import { fetchAndRenderAnalytics as doFetchAndRenderAnalytics } from './bootstrap/analyticsOverlay.js';
import { initAppShell } from './app/shell.js';
import { showPage } from './app/navigation/showPage.js';
import { initGlobalShortcuts } from './app/bootstrap/globalShortcuts.js';
import { initTimeseriesShortcuts } from './app/bootstrap/timeseriesShortcuts.js';
import { createAppRuntime } from './app/runtime.js';
import { markAppReady, resetAppReady } from './app/bootState.js';
import { upgradeSelects } from './ui/primitives/Dropdown.js';
import { upgradeFlexibleNumberInputs } from './ui/primitives/FlexibleNumberInput.js';
import { createPageRegistry } from './app/pageRegistry.js';
import { loadPageDescriptors } from './app/pageModules.js';
import {
    ensureChartModules as ensureChartBootstrapModules,
    ensureDataModules as ensureBootstrapDataModules,
} from './app/bootstrap/chartBootstrap.js';
import { getHashPage } from './utils/router.js';
import { pageNeedsDatasetBootstrap } from './utils/pageBootstrap.js';
import { createTimeseriesModule } from './pages/timeseriesModule.js';
import { startSessionPersistence } from './bootstrap/sessionBootstrap.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView,
    setComputeLoading,
} from './ui/toolbar.js';
import { exportChartFilteredData, exportChartFilteredParquet } from './ui/exportControls.js';
import type { DatasetMetadata, DataObject, AnomalyResponse, TransformResponse, ChartInstance, ViewSnapshot } from './types.js';

import {
    appStateComposite,
    chartState,
    datasetState,
    initChartStatePrefs,
    setAdaptiveFilterColumn,
    setChartInstance,
    setDatasetRevision,
    setMetadata,
    setNumericCols,
    setSelectedCols,
    setViewport,
    uiState,
} from './store/index.js';

// ── Debugging hook ──────────────────────────────────────────────────────────
// Expose appState on window.__edatime for interactive debugging from DevTools.
// Using direct property assignment (not a getter) to avoid closure issues with
// variable renaming across Vite's chunk bundling.
const __edatime_state = appStateComposite;
window.__edatime = window.__edatime || {};
try {
    Object.defineProperty(window.__edatime, 'state', {
        get: () => __edatime_state,
        set: (v) => { Object.assign(__edatime_state, v); },
        configurable: true,
        enumerable: true,
    });
} catch (_) {
    // Already defined — leave it alone.
}
window.__edatime.DEBUG = true;

const _appCleanups: Array<() => void> = [];
const runtime = createAppRuntime();
const pageRegistry = createPageRegistry();
let timeseriesModule!: ReturnType<typeof createTimeseriesModule>;

/* ── Lazy-loaded modules ──────────────────────────────── */

let fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null = null;
let fetchData: ((
    start: string,
    end: string,
    width: number,
    columns?: string,
    colorColumn?: string | null,
    lookaroundMs?: number,
    signal?: AbortSignal,
) => Promise<DataObject>) | null = null;
let fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null = null;
let postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null = null;
let DataChartCtor: (new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null = null;
let _sessionPersistenceStarted = false;

type DataChartCtorType = new (
    containerId: string,
    onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
    onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
    onZoomOutCb: (() => void) | null,
) => ChartInstance;

async function ensureDataModules(): Promise<void> {
    if (fetchMetadata && fetchData && fetchAnomalies && postTransform) return;
    const modules = await ensureBootstrapDataModules();
    fetchMetadata = modules.fetchMetadata;
    fetchData = modules.fetchData;
    fetchAnomalies = modules.fetchAnomalies;
    postTransform = modules.postTransform;
}

async function ensurePrimaryChartCtor(): Promise<DataChartCtorType> {
    if (DataChartCtor) return DataChartCtor;
    const modules = await ensureChartBootstrapModules();
    DataChartCtor = modules.DataChartCtor;
    return DataChartCtor!;
}

/* ── Analytics overlay fetch ──────────────────────────── */

async function fetchAndRenderAnalytics(): Promise<void> {
    await doFetchAndRenderAnalytics(fetchAnomalies);
}

function ensureSessionPersistenceStarted(): void {
    if (_sessionPersistenceStarted) return;
    startSessionPersistence();
    _sessionPersistenceStarted = true;
}

/* ── Module creation helpers ──────────────────────────── */
// NOTE: createDatasetBootstrap and dataset bootstrap are now owned by timeseriesModule
// (see createDatasetBootstrap inside timeseriesModule.ts)

async function init(): Promise<void> {
    upgradeSelects(document);
    upgradeFlexibleNumberInputs(document);
    installWindowsWebGpuRequestAdapterWorkaround();
    // Hydrate persisted chart preferences (Y-range "stack from 0", etc.)
    // BEFORE the toolbar wires up so the toggle starts in the right state.
    initChartStatePrefs();
    // Load data transport first; chart rendering stays behind timeseries readiness.
    await ensureDataModules();

    timeseriesModule = createTimeseriesModule({
        fetchData: (start, end, width, columns, colorColumn, lookaroundMs, signal) => fetchData!(start, end, width, columns, colorColumn, lookaroundMs, signal),
        fetchMetadata: () => fetchMetadata!(),
        ensurePrimaryChartCtor,
        markMetadataReady: pageRegistry.markMetadataReady,
        isMetadataReady: pageRegistry.isMetadataReady,
        sanitizeSelectedColumns,
        clearLoadedPageModules: pageRegistry.clearLoadedPageModules,
        ensureSessionPersistenceStarted,
        getSelectedCols: () => uiState.selectedCols,
        setSelectedCols,
        setNumericCols,
        setAdaptiveFilterColumn,
        setViewport,
        updateAnalysisYRange,
        updateAnalysisZoom,
        getCurrentView,
        fetchAndRenderAnalytics,
        refreshZoomControlsState,
        chartExportPng: () => chartState.chart?.exportPNG?.(),
        chartExportSvg: () => chartState.chart?.exportSVG?.(),
        exportFilteredCsv: () => exportChartFilteredData('csv'),
        exportFilteredJson: () => exportChartFilteredData('json'),
        exportFilteredParquet: () => exportChartFilteredParquet(),
    });

    // Mount registers page lifecycle (page-change listener, etc.)
    timeseriesModule.mount();

    const shell = initAppShell({
        ensurePageModuleLoaded: pageRegistry.ensurePageModuleLoaded,
        ensureDatasetReady: () => timeseriesModule.ensureDatasetReady(),
        showPage,
        fetchAndRender: () => timeseriesModule.fetchAndRender(),
        renderCurrentData: () => timeseriesModule.renderCurrentData(),
        updateAnalysisYRange,
        buildTimeseriesColumns: () => timeseriesModule.buildColumnToggles(),
        buildTimeseriesRanges: () => timeseriesModule.buildRangeControls(),
        zoomOut: () => timeseriesModule.zoomOut(),
        resetZoom: () => timeseriesModule.resetZoom(),
        refreshDatasetAfterMutation: (opts) => timeseriesModule.refreshAfterMutation(opts),
        registerCleanup: runtime.registerCleanup,
    });

    // Register lazy-loaded page modules. Each descriptor resolves its own
    // heavy dependencies via dynamic import; app.ts only passes the small
    // runtime helpers each page needs.
    await loadPageDescriptors(pageRegistry, {
        getRenderTimeseries: () => timeseriesModule.renderCurrentData(),
        showPage,
        getMetadata: () => datasetState.metadata ?? null,
        chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
        numericColumns: () => getNumericColumns(datasetState.metadata),
        setLoading: setComputeLoading,
        initDriftPage: (metadata: unknown) => { void import('./drift/driftPage.js').then(m => m.initDriftPage(metadata)); },
    });

    (window).__edatime = (window).__edatime || {};
    (window).__edatime.ensureDatasetReady = () => timeseriesModule.ensureDatasetReady();
    (window).__edatime.ensureReady = () => timeseriesModule.ensureReady();
    (window).__edatime.runAnalytics = () => fetchAndRenderAnalytics();

    initGlobalShortcuts({
        showPage,
        openCommands: shell.openCommands,
        openSettings: shell.openSettings,
        registerCleanup: runtime.registerCleanup,
    });

    initTimeseriesShortcuts({
        fetchAndRender: () => timeseriesModule.fetchAndRender(),
        zoomOut: () => timeseriesModule.zoomOut(),
        resetZoom: () => timeseriesModule.resetZoom(),
        chartExportPng: () => chartState.chart?.exportPNG?.(),
        exportFilteredCsv: () => (window as any).__edatime?.exportChartFilteredData?.('csv'),
        exportFilteredJson: () => (window as any).__edatime?.exportChartFilteredData?.('json'),
        registerCleanup: runtime.registerCleanup,
    });

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

resetAppReady();
void init().finally(() => {
    markAppReady();
});
