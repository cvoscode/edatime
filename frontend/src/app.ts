/**
 * app.ts — Slim orchestrator.
 *
 * All domain logic lives in focused modules:
 *   store/          — centralized sub-states (chart, analytics, ui, dataset, scatter)
 *   app/            — bootstrap helpers (WebGPU guard, adaptive gesture, keyboard shortcuts, page modules)
 *   debug.ts        — DEBUG flag, dbg(), dbgGroup()
 *   features/upload/panel.ts — upload panel (drag-drop, preview, partial load)
 *   features/upload/profile.ts — virtualised column-profile grid
 *   ui/toolbar.ts   — analysis status, zoom/draw/export/label controls, pages
 *   charts/registry.ts — pluggable chart-type registry
 *   charts/fallback.ts — Canvas 2D fallback chart
 *   chart/DataChart.ts — DataChart (ChartGPU WebGPU adapter)
 *   services/api/   — Arrow IPC fetch + aggregate fetch
 *   scatter/scatterPage.ts — full scatter page with plot/matrix views
 */

import { DEBUG, dbg, dbgGroup } from './debug.js';
import { showBootstrapError } from './ui/errorUI.js';
import { installWindowsWebGpuRequestAdapterWorkaround } from './utils/platform.js';
import { getAnalyticsChipColor } from './platform/analyticsColumns.js';
import {
    createTimeseriesModule,
    fetchAndRenderAnalytics as doFetchAndRenderAnalytics,
    sanitizeSelectedColumns,
} from './features/timeseries/index.js';
// `initScatterPage` lives behind the scatter feature entrypoint and is
// dynamically imported on first navigation. Keeping the import out of
// app.ts ensures scatter's heavy chunks (echarts, chartgpu, apache-arrow)
// never enter the initial app bundle.
import { initAppShell } from './app/shell.js';
import { showPage } from './app/navigation/showPage.js';
import { createAppRuntime } from './app/runtime.js';
import { createWorkspaceStore } from './workspace/workspaceStore.js';
import { markAppReady, resetAppReady } from './app/bootState.js';
import { upgradeSelects } from './ui/primitives/Dropdown.js';
import { upgradeFlexibleNumberInputs } from './ui/primitives/FlexibleNumberInput.js';
import { createPageRegistry } from './app/pageRegistry.js';
import { loadPageDescriptors } from './app/pageModules.js';
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

import { chartState, initChartStatePrefs, setChartInstance, setViewport } from './store/chartState.js';
import { datasetState, setDatasetRevision, setMetadata, setNumericCols } from './store/datasetState.js';
import { runtimeState } from './store/runtimeState.js';
import { setAdaptiveFilterColumn } from './store/uiState.js';

const runtime = createAppRuntime();
const pageRegistry = createPageRegistry();
const workspace = createWorkspaceStore();
const exportFeature = createExportFeature({ workspace, getData: () => runtimeState.lastFetchedData });
runtime.registerCleanup(() => workspace.dispose());
runtime.registerCleanup(pageRegistry.dispose);
let timeseriesModule!: ReturnType<typeof createTimeseriesModule>;
let appDisposed = false;

/**
 * Releases the application composition root and every resource registered
 * beneath it. Embedding hosts and future hot-reload entrypoints use this
 * instead of reaching into individual feature or shell lifecycles.
 */
export function disposeApp(): void {
    if (appDisposed) return;
    appDisposed = true;
    runtime.dispose();
    resetAppReady();
}

/* ── Lazy-loaded modules ──────────────────────────────── */

let DataChartCtor: (new (containerId: string, onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null = null;
let _sessionPersistenceStarted = false;
let disposeSessionPersistence: (() => void) | null = null;

type DataChartCtorType = new (
    containerId: string,
    onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
    onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
    onZoomOutCb: (() => void) | null,
) => ChartInstance;

async function ensurePrimaryChartCtor(): Promise<DataChartCtorType> {
    if (DataChartCtor) return DataChartCtor;
    const modules = await ensureChartBootstrapModules();
    DataChartCtor = modules.DataChartCtor;
    return DataChartCtor!;
}

/* ── Analytics overlay fetch ──────────────────────────── */

async function fetchAndRenderAnalytics(): Promise<void> {
    const { fetchAnomalies } = await ensureBootstrapDataModules();
    await doFetchAndRenderAnalytics(fetchAnomalies, workspace);
}

function ensureSessionPersistenceStarted(): void {
    if (_sessionPersistenceStarted) return;
    disposeSessionPersistence = startSessionPersistence(workspace);
    runtime.registerCleanup(() => {
        disposeSessionPersistence?.();
        disposeSessionPersistence = null;
        _sessionPersistenceStarted = false;
    });
    _sessionPersistenceStarted = true;
}

/* ── Module creation helpers ──────────────────────────── */
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
        markMetadataReady: pageRegistry.markMetadataReady,
        isMetadataReady: pageRegistry.isMetadataReady,
        sanitizeSelectedColumns: () => sanitizeSelectedColumns(workspace),
        clearLoadedPageModules: pageRegistry.clearLoadedPageModules,
        ensureSessionPersistenceStarted,
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
        exportFilteredCsv: exportFeature.exportFilteredCsv,
        exportFilteredJson: exportFeature.exportFilteredJson,
        exportFilteredParquet: exportFeature.exportFilteredParquet,
    });

    // Mount registers page lifecycle (page-change listener, etc.)
    runtime.registerCleanup(timeseriesModule.mount());

    initAppShell({
        ensurePageModuleLoaded: pageRegistry.ensurePageModuleLoaded,
        ensureDatasetReady: () => timeseriesModule.ensureDatasetReady(),
        showPage,
        fetchAndRender: () => timeseriesModule.fetchAndRender(),
        fetchAndRenderAnalytics,
        exportFilteredCsv: exportFeature.exportFilteredCsv,
        exportFilteredJson: exportFeature.exportFilteredJson,
        exportChartPng: () => chartState.chart?.exportPNG?.(),
        renderCurrentData: () => timeseriesModule.renderCurrentData(),
        updateAnalysisYRange,
        buildTimeseriesColumns: () => timeseriesModule.buildColumnToggles(),
        buildTimeseriesRanges: () => timeseriesModule.buildRangeControls(),
        zoomOut: () => timeseriesModule.zoomOut(),
        resetZoom: () => timeseriesModule.resetZoom(),
        refreshDatasetAfterMutation: (opts) => timeseriesModule.refreshAfterMutation(opts),
        registerCleanup: runtime.registerCleanup,
        workspace,
    });

    // Register lazy-loaded page modules. Each descriptor resolves its own
    // heavy dependencies via dynamic import; app.ts only passes the small
    // runtime helpers each page needs.
    await loadPageDescriptors(pageRegistry, {
        getRenderTimeseries: () => timeseriesModule.renderCurrentData(),
        showPage,
        chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
        setLoading: setComputeLoading,
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

resetAppReady();
void init().finally(() => {
    if (!appDisposed) markAppReady();
});
