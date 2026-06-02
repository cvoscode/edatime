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
import { appState } from './store/appStateCompat.js';
import { SERIES_COLORS } from './utils/seriesColors.js';
import { setMetaText, buildMetaBar } from './ui/metaBar.js';
import { showBootstrapError } from './ui/errorUI.js';
import { emitAdaptiveFiltersChange } from './ui/eventHelpers.js';
import {
    sanitizeSelectedColumns,
    applyColumnRanges,
} from './services/timeseries/filtering.js';
import { setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata } from './ui/upload.js';
import { createUploadEntrypoint } from './features/upload/entrypoint.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid } from './ui/profile.js';
import { installWindowsWebGpuRequestAdapterWorkaround } from './utils/platform.js';
import { getAnalyticsChipColor, getDefaultTimeseriesColumns, getNumericColumns } from './pages/analyticsPageUtils.js';
import { createTimeseriesPageController } from './pages/timeseriesPage.js';
import { initScatterPage } from './scatter/scatterPage.js';
import { fetchAnomalyRegions, computeAndSetRollingBands, cancelAnalyticsFetch, initAnalyticsListeners, fetchAndRenderAnalytics as doFetchAndRenderAnalytics } from './bootstrap/analyticsOverlay.js';
import { initAppShell } from './app/shell.js';
import { showPage } from './app/navigation/showPage.js';
import { initGlobalShortcuts } from './app/bootstrap/globalShortcuts.js';
import { initTimeseriesShortcuts } from './app/bootstrap/timeseriesShortcuts.js';
import { createAppRuntime } from './app/runtime.js';
import { APP_COMMAND_DEFINITIONS } from './bootstrap/commands.js';
import { ensurePageModuleLoaded, isMetadataReady, markMetadataReady, clearLoadedPageModules } from './app/pageRegistry.js';
import { restoreSessionAfterChartReady, startSessionPersistence } from './bootstrap/sessionBootstrap.js';
import { checkWebGPU, showFatalError } from './app/webgpuGuard.js';
import { initAdaptiveFilterGesture, buildAdaptiveFilterFromPoints } from './app/adaptiveGesture.js';
import { loadEntrypoints } from './app/pageModules.js';
import { ensureChartModules as ensureChartBootstrapModules } from './app/bootstrap/chartBootstrap.js';
import { getHashPage } from './utils/router.js';
import { pageNeedsDatasetBootstrap } from './utils/pageBootstrap.js';
import { createTimeseriesBootstrap } from './app/bootstrap/ensureTimeseriesReady.js';
import { createTimeseriesEntrypoint } from './features/timeseries/entrypoint.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView,
    zoomOut, resetZoom,
    initAnalysisControls, bindAnalysisChartEvents,
    initChartPageFilterGesture, initPages,
    setComputeLoading,
} from './ui/toolbar.js';
import { getChartType } from './charts/registry.js';
import { FallbackChart } from './charts/fallback.js';
import type { DatasetMetadata, DataObject, AnomalyResponse, TransformResponse, ChartInstance, AdaptiveLineFilter } from './types.js';

import { initAnnotations } from './chart/annotations.js';
import { setAnnotationOverlayCallback } from './ui/annotationPanel.js';
import { setAnomalyOverlayCallback } from './bootstrap/analyticsOverlay.js';
import { toast } from './utils/toast.js';
import {
    appendAdaptiveLineFilter,
    setAdaptiveFilterColumn,
    setAnalysisBound,
    setChartInstance,
    setDatasetRevision,
    setInitialView,
    setMetadata,
    setNumericCols,
    setPendingAdaptivePoint,
    setRollingBands,
    setSelectedCols,
    setViewport,
} from './store/index.js';

const _appCleanups: Array<() => void> = [];
const runtime = createAppRuntime();
let timeseriesFeature: ReturnType<typeof createTimeseriesEntrypoint> | null = null;
let uploadFeature: ReturnType<typeof createUploadEntrypoint> | null = null;

const rebuildTimeseriesColumns = () => {
    timeseriesFeature?.rebuildColumns();
};

const rebuildTimeseriesRanges = () => {
    timeseriesFeature?.buildRangeControls();
};

const timeseriesPage = createTimeseriesPageController({
    fetchData: (start, end, width, columns, colorColumn, signal) => fetchData!(start, end, width, columns, colorColumn, signal),
    buildRangeControls: rebuildTimeseriesRanges,
    updateAnalysisYRange,
    updateAnalysisZoom,
    getCurrentView,
    fetchAndRenderAnalytics: () => fetchAndRenderAnalytics(),
});

const renderTimeseries = () => timeseriesPage.renderCurrentData();

let _timeseriesReady = false;
let _timeseriesReadyPromise: Promise<void> | null = null;
let _sessionPersistenceStarted = false;
let _timeseriesBootstrap: { ensureReady: () => Promise<void>; isReady: () => boolean } | null = null;

const renderCurrentData = () => timeseriesPage.renderCurrentData();
const emitChartRangeChange = (sourceKind = 'data') => timeseriesPage.emitChartRangeChange(sourceKind);
const fetchAndRender = async () => {
    const bs = _timeseriesBootstrap;
    if (bs) await bs.ensureReady();
    return timeseriesPage.fetchAndRender();
};
const onZoomRangeChange = (newStart: number, newEnd: number, sourceKind = 'user') => timeseriesPage.onZoomRangeChange(newStart, newEnd, sourceKind);

function ensureSessionPersistenceStarted(): void {
    if (_sessionPersistenceStarted) return;
    startSessionPersistence();
    _sessionPersistenceStarted = true;
}

async function ensureTimeseriesReady(): Promise<void> {
    await _timeseriesBootstrap?.ensureReady();
}

/* ── Event helpers ─────────────────────────────────────── */
// emitAdaptiveFiltersChange moved to ui/eventHelpers.ts

/* ── Keyboard shortcuts ───────────────────────────────── */
// Alt+1..0 navigation handled by initGlobalShortcuts via APP_COMMAND_DEFINITIONS
// Shift+R/Z/C/P/E handled by initTimeseriesShortcuts
// Both are called in init() below

/* ── UI Helpers ───────────────────────────────────────── */

/* setComputeLoading moved to ui/toolbar.ts — use toolbar.setComputeLoading instead */

/* ── Lazy-loaded modules ──────────────────────────────── */

let fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null = null;
let fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null = null;
let fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null = null;
let postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null = null;
let DataChartCtor: (new (containerId: string, onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null = null;

async function ensureChartModules(): Promise<void> {
    if (fetchMetadata && fetchData && DataChartCtor) return;
    const modules = await ensureChartBootstrapModules();
    fetchMetadata = modules.fetchMetadata;
    fetchData = modules.fetchData;
    fetchAnomalies = modules.fetchAnomalies;
    postTransform = modules.postTransform;
    DataChartCtor = modules.DataChartCtor;
}

/* ── Analytics overlay fetch ──────────────────────────── */

async function fetchAndRenderAnalytics(): Promise<void> {
    await doFetchAndRenderAnalytics(fetchAnomalies);
}

let _datasetReadyPromise: Promise<void> | null = null;
let _datasetUiReady = false;

function storeFetchedMetadata(metadata: DatasetMetadata): void {
    setMetadata(metadata);
    const revision = metadata?.revision;
    setDatasetRevision(typeof revision === 'number' ? revision : 0);
}

function initializeDatasetUi(metadata: DatasetMetadata): void {
    if (!_datasetUiReady) {
        timeseriesFeature?.init();
        ensureSessionPersistenceStarted();
        window.addEventListener('edatime:page-change', (event: Event) => {
            const ce = event as CustomEvent<{ page?: string }>;
            if (ce.detail?.page === 'timeseries') {
                void ensureTimeseriesReady();
            }
        });
        _datasetUiReady = true;
    }

    hydrateColumnProfiles(metadata);
    renderColumnProfilesGrid(true);
    applyPartialTimeRangeFromMetadata(metadata, false);
    setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
    setProfileMode('dataset');

    rebuildTimeseriesColumns();
    buildMetaBar(metadata);
    rebuildTimeseriesRanges();
    window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));

    const timeRange = metadata.time_range;
    if (!timeRange) return;
    const start = Number(timeRange.min);
    const end = Number(timeRange.max);
    setViewport(start, end);
    updateAnalysisZoom(start, end, 'initial');
    emitChartRangeChange('initial');
}

async function ensureDatasetReady(_pageName = 'timeseries'): Promise<void> {
    if (isMetadataReady()) return;
    if (_datasetReadyPromise) return _datasetReadyPromise;

    _datasetReadyPromise = (async () => {
        await ensureChartModules();

        const metadata = await fetchMetadata!();
        storeFetchedMetadata(metadata);
        markMetadataReady();
        window.dispatchEvent(new Event('edatime:metadata-ready'));
        dbgGroup('metadata', () => dbg(appState.metadata));

        const metadataTimeRange = appState.metadata?.time_range;
        if (!metadataTimeRange) {
            setMetaText('No valid time range found.');
            return;
        }

        setNumericCols(getNumericColumns(metadata));
        if (!appState.selectedCols.length) {
            setSelectedCols(getDefaultTimeseriesColumns(metadata));
        }
        setAdaptiveFilterColumn(appState.selectedCols[0] || null);
        sanitizeSelectedColumns();

        initializeDatasetUi(metadata);
    })().catch((error) => {
        _datasetReadyPromise = null;
        throw error;
    });

    return _datasetReadyPromise;
}

async function refreshDatasetAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
    clearLoadedPageModules();
    if (!fetchMetadata) return;
    storeFetchedMetadata(await fetchMetadata());
    markMetadataReady();
    setNumericCols(getNumericColumns(appState.metadata));
    const selectedColumn = options?.selectedColumn;
    if (selectedColumn && !appState.selectedCols.includes(selectedColumn)) {
        setSelectedCols([...appState.selectedCols, selectedColumn]);
    }
    sanitizeSelectedColumns();
    rebuildTimeseriesColumns();
    buildMetaBar(appState.metadata);
    await fetchAndRender();
}

async function init(): Promise<void> {
    installWindowsWebGpuRequestAdapterWorkaround();
    buildMetaBar(null);

    timeseriesFeature = createTimeseriesEntrypoint({
        fetchAndRender,
        renderCurrentData,
        updateAnalysisYRange,
        renderColumnProfilesGrid,
        updateAnalysisZoom,
        emitChartRangeChange,
        registerCleanup: (cleanup) => _appCleanups.push(cleanup),
    });

    uploadFeature = createUploadEntrypoint({
        buildColumnToggles: rebuildTimeseriesColumns,
        buildRangeControls: rebuildTimeseriesRanges,
    });
    uploadFeature.init(
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
    );

    initAppShell({
        ensurePageModuleLoaded,
        showPage,
        fetchAndRender,
        renderCurrentData,
        updateAnalysisYRange,
        buildTimeseriesColumns: rebuildTimeseriesColumns,
        buildTimeseriesRanges: rebuildTimeseriesRanges,
        zoomOut: () => zoomOut(fetchAndRender),
        resetZoom: () => resetZoom(fetchAndRender),
        initAnalyticsListeners: () => initAnalyticsListeners(fetchAndRenderAnalytics),
        refreshDatasetAfterMutation,
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
        registerCleanup: runtime.registerCleanup,
    });

    // Register lazy-loaded page modules.
    await loadEntrypoints({
        getRenderTimeseries: renderTimeseries,
        showPage,
        initScatterPage,
        getMetadata: () => appState.metadata ?? null,
        chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
        numericColumns: () => getNumericColumns(appState.metadata),
        setLoading: setComputeLoading,
        initDriftPage: (metadata: unknown) => { void import('./drift/driftPage.js').then(m => m.initDriftPage(metadata)); },
    });

    (window).__edatime = (window).__edatime || {};
    (window).__edatime.ensureDatasetReady = ensureDatasetReady;

    initGlobalShortcuts({
        showPage,
        zoomOut: () => zoomOut(fetchAndRender),
        resetZoom: () => resetZoom(fetchAndRender),
        registerCleanup: runtime.registerCleanup,
        chartExportPng: () => appState.chart?.exportPNG?.(),
        exportFilteredCsv: () => (window as any).__edatime?.exportChartFilteredData?.('csv'),
        exportFilteredJson: () => (window as any).__edatime?.exportChartFilteredData?.('json'),
    }, APP_COMMAND_DEFINITIONS);

    initTimeseriesShortcuts({
        fetchAndRender,
        zoomOut: () => zoomOut(fetchAndRender),
        resetZoom: () => resetZoom(fetchAndRender),
        chartExportPng: () => appState.chart?.exportPNG?.(),
        exportFilteredCsv: () => (window as any).__edatime?.exportChartFilteredData?.('csv'),
        exportFilteredJson: () => (window as any).__edatime?.exportChartFilteredData?.('json'),
        registerCleanup: runtime.registerCleanup,
    });

    _timeseriesBootstrap = createTimeseriesBootstrap({
        DataChartCtor: null as any,
        onZoom: onZoomRangeChange,
        onYRange: updateAnalysisYRange,
        onZoomOut: () => zoomOut(fetchAndRender),
        buildColumnToggles: rebuildTimeseriesColumns,
        buildRangeControls: rebuildTimeseriesRanges,
        renderCurrentData,
        fetchAndRender: () => timeseriesPage.fetchAndRender(),
        refreshZoomControlsState,
    });

    try {
        const initialPage = getHashPage();
        if (pageNeedsDatasetBootstrap(initialPage)) {
            await ensureDatasetReady(initialPage!);
        }

        if (initialPage === 'timeseries' && isMetadataReady()) {
            await ensureTimeseriesReady();
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Initial bootstrap failed:', e);
        showBootstrapError({ message });
    }
}

init();
