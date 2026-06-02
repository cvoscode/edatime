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
import {
    sanitizeSelectedColumns,
    applyColumnRanges,
} from './services/timeseries/filtering.js';
import { setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata, initUploadPanel } from './ui/upload.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid } from './ui/profile.js';
import { installWindowsWebGpuRequestAdapterWorkaround } from './utils/platform.js';
import { getAnalyticsChipColor, getDefaultTimeseriesColumns, getNumericColumns } from './pages/analyticsPageUtils.js';
import { createTimeseriesPageController } from './pages/timeseriesPage.js';
import { initScatterPage } from './scatter/scatterPage.js';
import { fetchAnomalyRegions, computeAndSetRollingBands, cancelAnalyticsFetch } from './bootstrap/analyticsOverlay.js';
import { initAppShell } from './app/shell.js';
import { showPage } from './app/navigation/showPage.js';
import { initGlobalShortcuts } from './app/bootstrap/globalShortcuts.js';
import { createAppRuntime } from './app/runtime.js';
import { APP_COMMAND_DEFINITIONS } from './bootstrap/commands.js';
import { ensurePageModuleLoaded, isMetadataReady, markMetadataReady, clearLoadedPageModules } from './app/pageRegistry.js';
import { restoreSessionAfterChartReady, startSessionPersistence } from './bootstrap/sessionBootstrap.js';
import { checkWebGPU, showFatalError } from './app/webgpuGuard.js';
import { initAdaptiveFilterGesture, buildAdaptiveFilterFromPoints } from './app/adaptiveGesture.js';
import { loadEntrypoints } from './app/pageModules.js';
import { getHashPage } from './utils/router.js';
import { pageNeedsDatasetBootstrap } from './utils/pageBootstrap.js';
import { createTimeseriesEntrypoint } from './features/timeseries/entrypoint.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView,
    zoomOut, resetZoom,
    initAnalysisControls, bindAnalysisChartEvents,
    initChartPageFilterGesture, initPages,
} from './ui/toolbar.js';
import { registerChartType, getChartType } from './charts/registry.js';
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

const renderCurrentData = () => timeseriesPage.renderCurrentData();
const emitChartRangeChange = (sourceKind = 'data') => timeseriesPage.emitChartRangeChange(sourceKind);
const fetchAndRender = async () => {
    await ensureTimeseriesReady();
    return timeseriesPage.fetchAndRender();
};
const onZoomRangeChange = (newStart: number, newEnd: number, sourceKind = 'user') => timeseriesPage.onZoomRangeChange(newStart, newEnd, sourceKind);

function ensureSessionPersistenceStarted(): void {
    if (_sessionPersistenceStarted) return;
    startSessionPersistence();
    _sessionPersistenceStarted = true;
}

async function ensureTimeseriesReady(): Promise<void> {
    if (_timeseriesReady) return;
    if (_timeseriesReadyPromise) {
        await _timeseriesReadyPromise;
        return;
    }

    _timeseriesReadyPromise = (async () => {
        if (appState.chart) {
            _timeseriesReady = true;
            return;
        }

        const gpuError = await checkWebGPU();

        try {
            dbg('initial X range (ms)', { start: appState.currentStart, end: appState.currentEnd });

            const lineType = getChartType('line');
            if (lineType) {
                setChartInstance(lineType.create('main-chart', {
                    onZoom: onZoomRangeChange,
                    onYRange: updateAnalysisYRange,
                    onZoomOut: () => zoomOut(fetchAndRender),
                }));
            } else {
                if (!DataChartCtor) throw new Error('DataChart module not loaded');
                setChartInstance(new DataChartCtor('main-chart', onZoomRangeChange, updateAnalysisYRange, () => zoomOut(fetchAndRender)));
            }

            if (gpuError) throw new Error(gpuError);

            await Promise.race([
                appState.chart!.init(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000)),
            ]);

            setAnalysisBound(false);
            bindAnalysisChartEvents();
            initAdaptiveFilterGesture({
                buildColumnToggles: rebuildTimeseriesColumns,
                buildRangeControls: rebuildTimeseriesRanges,
                renderCurrentData,
                updateAnalysisYRange,
            });
            refreshZoomControlsState();
            setAnnotationOverlayCallback(() => appState.chart?.requestOverlayRender?.());
            setAnomalyOverlayCallback(() => appState.chart?.requestOverlayRender?.());
            const chart = appState.chart as ChartInstance | null;
            chart?.setXRange?.(appState.currentStart!, appState.currentEnd!);
            chart?.setChartText?.(
                appState.chartText?.title || '',
                appState.chartText?.xLabel || '',
                appState.chartText?.yLabel || '',
            );

            renderCurrentData();

            await timeseriesPage.fetchAndRender();
            setInitialView(getCurrentView());
            dbgGroup('initialView snapshot', () => dbg(appState.initialView));

            await restoreSessionAfterChartReady({
                metadataTimeRange: appState.metadata?.time_range ?? null,
                currentDatasetRevision: Number(appState.datasetRevision ?? 0),
                buildColumnToggles: rebuildTimeseriesColumns,
                buildRangeControls: rebuildTimeseriesRanges,
                renderCurrentData,
                fetchAndRender: () => timeseriesPage.fetchAndRender(),
            });

            _timeseriesReady = true;
        } catch (e: unknown) {
            console.warn('Primary chart failed, switching to fallback:', e);
            try {
                const fallbackType = getChartType('fallback');
                setChartInstance(fallbackType
                    ? fallbackType.create('main-chart', {})
                    : new FallbackChart('main-chart'));

                await appState.chart!.init();
                setAnalysisBound(false);
                bindAnalysisChartEvents();
                refreshZoomControlsState();
                await timeseriesPage.fetchAndRender();
                setMetaText('Fallback renderer active');
                _timeseriesReady = true;
            } catch (fallbackErr: unknown) {
                const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
                console.error('Fallback chart also failed:', fallbackErr);
                setMetaText('Error: ' + msg);
            }
        }
    })();

    try {
        await _timeseriesReadyPromise;
    } finally {
        _timeseriesReadyPromise = null;
    }
}

function emitAdaptiveFiltersChange(): void {
    window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change', {
        detail: { count: (appState.adaptiveLineFilters || []).length },
    }));
}

/* ── Keyboard shortcuts ───────────────────────────────── */

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function currentPageName(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement)?.dataset?.pageName || 'upload';
}

function initKeyboardShortcuts(): void {
    const win = window as Window & typeof globalThis;
    if (win.__edatime?.keyboardShortcutsBound) return;
    if (!win.__edatime) win.__edatime = {};

    const onKeydown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;
        const key = String(event.key || '').toLowerCase();

        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            if (key === '1') { event.preventDefault(); showPage('upload'); return; }
            if (key === '2') { event.preventDefault(); showPage('timeseries'); return; }
            if (key === '3') { event.preventDefault(); showPage('scatter'); return; }
            if (key === '4') { event.preventDefault(); showPage('scattermatrix'); return; }
            if (key === '6') { event.preventDefault(); showPage('fft'); return; }
            if (key === '7') { event.preventDefault(); showPage('heatmap'); return; }
            if (key === '8') { event.preventDefault(); showPage('spectrogram'); return; }
            if (key === '9') { event.preventDefault(); showPage('causal'); return; }
            if (key === '0') { event.preventDefault(); showPage('drift'); return; }
        }

        if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        if (key === 'r' && currentPageName() === 'timeseries') { event.preventDefault(); resetZoom(fetchAndRender); return; }
        if (key === 'z' && currentPageName() === 'timeseries') { event.preventDefault(); zoomOut(fetchAndRender); return; }
        if (key === 'c' && currentPageName() === 'timeseries') { event.preventDefault(); document.getElementById('adaptive-clear-btn')?.click?.(); return; }
        if (key === 'p') { event.preventDefault(); appState.chart?.exportPNG?.(); return; }
        if (key === 'e') {
            event.preventDefault();
            if (currentPageName() === 'scatter') document.getElementById('scatter-export-csv-btn')?.click?.();
            else ((window as Window & typeof globalThis).__edatime?.exportChartFilteredData?.('csv'));
        }
    };

    window.addEventListener('keydown', onKeydown);
    _appCleanups.push(() => window.removeEventListener('keydown', onKeydown));

    (window).__edatime.keyboardShortcutsBound = true;
}

/* ── UI Helpers ───────────────────────────────────────── */

/** Set a compute button + loading overlay into loading or idle state. */
export function setComputeLoading(btnId: string, overlayId: string, loading: boolean, label = 'Compute'): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement | null;
    const overlay = document.getElementById(overlayId) as HTMLElement | null;
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Computing…' : label; }
    if (overlay) overlay.hidden = !loading;
}

/* ── Lazy-loaded modules ──────────────────────────────── */

let fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null = null;
let fetchData: ((start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<DataObject>) | null = null;
let fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null = null;
let postTransform: ((expression: string, outputName: string) => Promise<TransformResponse>) | null = null;
let DataChartCtor: (new (containerId: string, onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCb: (() => void) | null) => ChartInstance) | null = null;

async function ensureChartModules(): Promise<void> {
    if (fetchMetadata && fetchData && DataChartCtor) return;
    const [dataClient, chartModule] = await Promise.all([
        import('./services/api/index.js'),
        import('./chart/DataChart.js'),
    ]);
    fetchMetadata = dataClient.fetchMetadata;
    fetchData = dataClient.fetchData;
    fetchAnomalies = dataClient.fetchAnomalies;
    postTransform = dataClient.postTransform;
    DataChartCtor = chartModule.DataChart;

    registerChartType('line', {
        label: 'Line',
        create: (containerId: string, callbacks: Record<string, unknown>) => {
            const ctor = DataChartCtor;
            if (!ctor) throw new Error('DataChart module not loaded');
            return new ctor(
                containerId,
                (callbacks.onZoom as ((start: number, end: number, sourceKind: string) => void) | null) ?? null,
                (callbacks.onYRange as ((min: number, max: number, sourceKind: string) => void) | null) ?? null,
                (callbacks.onZoomOut as (() => void) | null) ?? null,
            );
        },
    });
    registerChartType('fallback', {
        label: 'Fallback (Canvas 2D)',
        create: (containerId: string) => new FallbackChart(containerId),
    });
}

/* ── Analytics overlay fetch ──────────────────────────── */

async function fetchAndRenderAnalytics(): Promise<void> {
    const { fetchAnomalies: fa } = await import('./services/api/index.js');
    await fetchAnomalyRegions(fa ?? fetchAnomalies);
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
        initAnalyticsListeners: () => {
            window.addEventListener('edatime:analytics-change', async () => {
                if (appState.lastFetchedData) {
                    if (appState.rollingEnabled) {
                        const filtered = applyColumnRanges(appState.lastFetchedData);
                        const { computeFrontendRollingBands } = await import('./bootstrap/analyticsOverlay.js');
                        setRollingBands(computeFrontendRollingBands(filtered as any, appState.selectedCols, (appState.rollingWindow as number | undefined) || 50));
                    } else {
                        setRollingBands(null);
                    }
                    appState.chart?.requestOverlayRender?.();
                }
                fetchAndRenderAnalytics().catch((err: unknown) => { console.warn('Analytics fetch failed:', err); });
            });
        },
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
        setMetaText('Error: ' + message);

        const retryBtn = document.getElementById('bootstrap-retry-btn');
        if (!retryBtn) {
            const metaEl = document.querySelector('.meta-bar');
            if (metaEl) {
                const btn = document.createElement('button');
                btn.id = 'bootstrap-retry-btn';
                btn.className = 'btn btn-ghost btn-sm';
                btn.style.marginLeft = '8px';
                btn.textContent = 'Retry';
                btn.addEventListener('click', () => {
                    btn.disabled = true;
                    btn.textContent = 'Retrying…';
                    setMetaText('Reinitializing…');
                    location.reload();
                });
                metaEl.appendChild(btn);
            }
        }
    }
}

init();
