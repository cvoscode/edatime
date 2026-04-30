/**
 * app.ts — Slim orchestrator.
 *
 * All domain logic lives in focused modules:
 *   state.ts          — centralised appState, format helpers, column-range filtering
 *   debug.ts          — DEBUG flag, dbg(), dbgGroup()
 *   ui/columns.ts     — column toggle chips, range chips, filter modal
 *   ui/upload.ts      — upload panel (drag-drop, preview, partial load)
 *   ui/profile.ts     — virtualised column-profile grid
 *   ui/toolbar.ts     — analysis status, zoom/draw/export/label controls, pages
 *   charts/registry.ts — pluggable chart-type registry
 *   charts/fallback.ts — Canvas 2D fallback chart
 *   chart/DataChart.ts — DataChart (ChartGPU WebGPU adapter)
 *   dataClient.ts      — Arrow IPC fetch + aggregate fetch
 *   scatter/scatterPage.ts — full scatter page with plot/matrix views
 */

import { DEBUG, dbg, dbgGroup } from './debug.js';
import {
    appState, SERIES_COLORS,
    setMetaText, buildMetaBar, sanitizeSelectedColumns,
    applyColumnRanges,
    buildAdaptiveLineY,
} from './state.js';
import { buildColumnToggles, buildRangeControls, initColumnFilterModal } from './ui/columns.js';
import { setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata, initUploadPanel } from './ui/upload.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid } from './ui/profile.js';
import { requestGpuAdapter } from './utils/platform.js';
import { getAnalyticsChipColor, getDefaultTimeseriesColumns, getNumericColumns } from './pages/analyticsPageUtils.js';
import { createTimeseriesPageController, computeFrontendRollingBands } from './pages/timeseriesPage.js';
import { initFftPage as initFftPageModule } from './pages/fftPage.js';
import { initHeatmapPage as initHeatmapPageModule } from './pages/heatmapPage.js';
import { initSpectrogramPage as initSpectrogramPageModule } from './pages/spectrogramPage.js';
import { initAppShell } from './bootstrap/appShell.js';
import { restoreSessionAfterChartReady, startSessionPersistence } from './bootstrap/sessionBootstrap.js';
import { initDatasetSearchInputs, initTimeseriesActions } from './bootstrap/timeseriesBootstrap.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView,
    zoomOut, resetZoom,
    initAnalysisControls, bindAnalysisChartEvents,
    initChartPageFilterGesture, initPages,
} from './ui/toolbar.js';
import { registerChartType, getChartType } from './charts/registry.js';
import { FallbackChart } from './charts/fallback.js';
import type { DatasetMetadata } from './types.js';

import { initAnnotations } from './chart/annotations.js';
import { setAnnotationOverlayCallback } from './ui/annotationPanel.js';
import { toast } from './utils/toast.js';

const _appCleanups: Array<() => void> = [];

function storeFetchedMetadata(metadata: DatasetMetadata): void {
    appState.metadata = metadata;
    const revision = Number(metadata?.revision);
    appState.datasetRevision = Number.isFinite(revision) ? revision : 0;
}

/* ── UI Helpers ───────────────────────────────────────── */

/** Set a compute button + loading overlay into loading or idle state. */
function setComputeLoading(btnId: string, overlayId: string, loading: boolean, label = 'Compute'): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement | null;
    const overlay = document.getElementById(overlayId) as HTMLElement | null;
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Computing…' : label; }
    if (overlay) overlay.hidden = !loading;
}

/* ── Lazy-loaded modules ──────────────────────────────── */

let fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null = null;
let fetchData: ((...args: any[]) => Promise<any>) | null = null;
let fetchAnomalies: ((...args: any[]) => Promise<any>) | null = null;
let postTransform: ((...args: any[]) => Promise<any>) | null = null;
let DataChartCtor: (new (...args: any[]) => any) | null = null;

async function ensureChartModules(): Promise<void> {
    if (fetchMetadata && fetchData && DataChartCtor) return;
    const [dataClient, chartModule] = await Promise.all([
        import('./dataClient.js'),
        import('./chart/DataChart.js'),
    ]);
    fetchMetadata = dataClient.fetchMetadata;
    fetchData = dataClient.fetchData;
    fetchAnomalies = dataClient.fetchAnomalies;
    postTransform = dataClient.postTransform;
    DataChartCtor = chartModule.DataChart;

    registerChartType('line', {
        label: 'Line',
        create: (containerId: string, callbacks: any) => new DataChartCtor!(
            containerId,
            callbacks.onZoom,
            callbacks.onYRange,
            callbacks.onZoomOut,
        ),
    });
    registerChartType('fallback', {
        label: 'Fallback (Canvas 2D)',
        create: (containerId: string) => new FallbackChart(containerId),
    });
}

/* ── WebGPU guard ─────────────────────────────────────── */

async function checkWebGPU(): Promise<string | null> {
    if (!navigator.gpu) {
        return 'WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.';
    }
    try {
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('requestAdapter timed out')), 5000));
        const adapter = await Promise.race([
            requestGpuAdapter(),
            timeout,
        ]);
        if (!adapter) {
            return 'No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.';
        }
    } catch (e: any) {
        return `WebGPU adapter request failed: ${e.message}`;
    }
    return null;
}

function showFatalError(message: string): void {
    const container = document.getElementById('main-chart');
    if (container) {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#ff4a6e;font-size:1rem;padding:2rem;text-align:center;';
        div.textContent = message;
        container.replaceChildren(div);
    }
    setMetaText('Error — rendering unavailable');
}

const timeseriesPage = createTimeseriesPageController({
    fetchData: (...args) => fetchData!(...args),
    buildRangeControls,
    updateAnalysisYRange,
    updateAnalysisZoom,
    getCurrentView,
    fetchAndRenderAnalytics: () => fetchAndRenderAnalytics(),
});

const renderCurrentData = () => timeseriesPage.renderCurrentData();
const emitChartRangeChange = (sourceKind = 'data') => timeseriesPage.emitChartRangeChange(sourceKind);
const fetchAndRender = () => timeseriesPage.fetchAndRender();
const onZoomRangeChange = (newStart: number, newEnd: number, sourceKind = 'user') => timeseriesPage.onZoomRangeChange(newStart, newEnd, sourceKind);

function emitAdaptiveFiltersChange(): void {
    window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change', {
        detail: { count: (appState.adaptiveLineFilters || []).length },
    }));
}

function buildAdaptiveFilterFromPoints(column: string, firstPoint: { x: number; y: number }, secondPoint: { x: number; y: number }) {
    if (!column || !firstPoint || !secondPoint) return null;
    if (!appState.lastFetchedData) return null;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    const series = (filtered as any).series?.[column];
    const xs = series?.x;
    const ys = series?.y;
    if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;

    const x1 = Number(firstPoint.x);
    const y1 = Number(firstPoint.y);
    const x2 = Number(secondPoint.x);
    const y2 = Number(secondPoint.y);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2) || x1 === x2) return null;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const tempFilter = { column, x1, y1, x2, y2, keepAbove: true } as any;
    let above = 0;
    let below = 0;
    for (let idx = 0; idx < xs.length; idx++) {
        const x = Number(xs[idx]);
        const y = Number(ys[idx]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
        const lineY = buildAdaptiveLineY(tempFilter, x);
        if (!Number.isFinite(lineY!)) continue;
        if (y >= lineY!) above += 1; else below += 1;
    }

    return {
        id: `adaptive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        column,
        x1,
        y1,
        x2,
        y2,
        keepAbove: above > below,
    };
}

function applyAdaptiveFiltersLocally(sourceKind = 'adaptive'): void {
    buildRangeControls();
    renderCurrentData();
    appState.chart?.requestOverlayRender?.();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, sourceKind);
    emitAdaptiveFiltersChange();
}

function initAdaptiveFilterGesture(): void {
    const container = document.getElementById('main-chart');
    if (!container || (container as any).dataset.adaptiveBound) return;

    let _activePicker: HTMLElement | null = null;
    let _firstPoint: { x: number; y: number } | null = null;
    let _secondPoint: { x: number; y: number } | null = null;
    // Screen position of the last click — used to anchor the picker popup.
    let _lastClickX = 0;
    let _lastClickY = 0;

    const dismissPicker = () => { _activePicker?.remove(); _activePicker = null; };

    const cancelPending = () => {
        _firstPoint = null;
        _secondPoint = null;
        appState.pendingAdaptivePoint = null;
        appState.chart?.requestOverlayRender?.();
    };

    const updateOverlay = () => {
        if (!_firstPoint) { appState.pendingAdaptivePoint = null; return; }
        const col = appState.adaptiveFilterColumn ?? (appState.selectedCols?.[0] ?? '');
        if (_secondPoint) {
            appState.pendingAdaptivePoint = {
                column: col, x: _firstPoint.x, y: _firstPoint.y,
                x2: _secondPoint.x, y2: _secondPoint.y,
            };
        } else {
            appState.pendingAdaptivePoint = { column: col, x: _firstPoint.x, y: _firstPoint.y };
        }
        appState.chart?.requestOverlayRender?.();
    };

    const applyFilterForColumn = (column: string, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        appState.adaptiveFilterColumn = column;
        const filter = buildAdaptiveFilterFromPoints(column, p1, p2);
        if (!filter) return;
        appState.adaptiveLineFilters = [...(appState.adaptiveLineFilters || []), filter];
        applyAdaptiveFiltersLocally();
        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
    };

    // Show the trace-selection popup. Called on Ctrl release when a line is drawn.
    const showTracePicker = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
        const cols = appState.selectedCols;
        if (!cols?.length) return;

        if (cols.length === 1) { applyFilterForColumn(cols[0], p1, p2); return; }

        dismissPicker();
        const picker = document.createElement('div');
        picker.className = 'adaptive-trace-picker';
        picker.style.left = `${_lastClickX}px`;
        picker.style.top = `${_lastClickY}px`;

        const label = document.createElement('div');
        label.className = 'adaptive-trace-picker__label';
        label.textContent = 'Filter which trace?';
        picker.appendChild(label);

        cols.forEach((col, idx) => {
            const color = appState.seriesColors?.[col] ?? SERIES_COLORS[idx % SERIES_COLORS.length];
            const isCurrentTarget = col === appState.adaptiveFilterColumn;
            const btn = document.createElement('button');
            btn.className = 'adaptive-trace-picker__option' + (isCurrentTarget ? ' current' : '');
            btn.type = 'button';
            btn.style.setProperty('--pick-accent', color);
            btn.textContent = col;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissPicker();
                applyFilterForColumn(col, p1, p2);
            });
            picker.appendChild(btn);
        });

        document.body.appendChild(picker);
        _activePicker = picker;

        const onOutside = (e: MouseEvent) => {
            if (!picker.contains(e.target as Node)) {
                dismissPicker();
                document.removeEventListener('click', onOutside, true);
            }
        };
        document.addEventListener('click', onOutside, true);
    };

    container.addEventListener('click', (event) => {
        if (!event.ctrlKey || event.button !== 0) return;

        const cols = appState.selectedCols;
        if (!cols?.length) return;

        const point = appState.chart?.cssPointToData?.(event.clientX, event.clientY) ?? null;
        if (!point) return;

        event.preventDefault(); event.stopPropagation();
        _lastClickX = event.clientX;
        _lastClickY = event.clientY;

        if (!_firstPoint) {
            // First click: anchor the start of the line.
            _firstPoint = point;
            _secondPoint = null;
        } else {
            // Each subsequent Ctrl+click moves the second endpoint forward.
            _secondPoint = point;
        }
        updateOverlay();
    }, true);

    const onEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { dismissPicker(); cancelPending(); }
    };

    // Releasing Ctrl: if a line is fully drawn, show the picker; otherwise cancel.
    const onCtrlUp = (e: KeyboardEvent) => {
        if (e.key !== 'Control') return;
        if (_firstPoint && _secondPoint) {
            const p1 = _firstPoint;
            const p2 = _secondPoint;
            cancelPending();
            showTracePicker(p1, p2);
        } else {
            cancelPending();
        }
    };

    const onAdaptiveChange = () => {
        if (!appState.lastFetchedData) return;
        buildRangeControls(); renderCurrentData();
        appState.chart?.requestOverlayRender?.(); appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'adaptive');
    };

    window.addEventListener('keydown', onEscape);
    window.addEventListener('keyup', onCtrlUp);
    window.addEventListener('edatime:adaptive-filters-change', onAdaptiveChange as EventListener);

    _appCleanups.push(
        () => window.removeEventListener('keydown', onEscape),
        () => window.removeEventListener('keyup', onCtrlUp),
        () => window.removeEventListener('edatime:adaptive-filters-change', onAdaptiveChange as EventListener),
    );

    (container as any).dataset.adaptiveBound = '1';
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

function showPage(pageName: string): void {
    (document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`) as HTMLElement)?.click?.();
}

function initKeyboardShortcuts(): void {
    if ((window as any).__edatime?.keyboardShortcutsBound) return;
    (window as any).__edatime = (window as any).__edatime || {};

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
        if (key === 'e') {
            event.preventDefault();
            if (currentPageName() === 'scatter') document.getElementById('scatter-export-csv-btn')?.click?.();
            else (window as any).__edatime?.exportChartFilteredData?.('csv');
        }
    };

    window.addEventListener('keydown', onKeydown);
    _appCleanups.push(() => window.removeEventListener('keydown', onKeydown));

    (window as any).__edatime.keyboardShortcutsBound = true;
}

/* ── Scatter page init ────────────────────────────────── */

async function initScatterPageModule(): Promise<void> {
    const scatterPage = document.getElementById('page-scatter');
    if (!scatterPage) return;
    const { initScatterPage } = await import('./scatter/scatterPage.js');
    await initScatterPage(appState.metadata!);
}

/* ── Analytics overlay fetch ──────────────────────────── */

let analyticsController: AbortController | null = null;

async function fetchAndRenderAnalytics(): Promise<void> {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    if (analyticsController) analyticsController.abort();
    analyticsController = new AbortController();
    const signal = analyticsController.signal;

    const startIso = new Date(appState.currentStart!).toISOString();
    const endIso = new Date(appState.currentEnd!).toISOString();
    const cols = appState.selectedCols.join(',');

    // Rolling bands are now computed client-side in renderCurrentData
    if (!appState.rollingEnabled) appState.rollingBands = null;

    try {
        if (appState.anomalyEnabled && fetchAnomalies) {
            const resp = await fetchAnomalies(startIso, endIso, cols, appState.anomalyMethod, appState.anomalyThreshold, signal);
            appState.anomalyRegions = resp?.regions || null;
        } else {
            appState.anomalyRegions = null;
        }
    } catch (e: any) {
        if (e?.name !== 'AbortError') console.warn('Anomaly fetch failed:', e);
        appState.anomalyRegions = null;
    }

    appState.chart?.requestOverlayRender?.();
}

function initAnalyticsListeners(): void {
    window.addEventListener('edatime:analytics-change', () => {
        // Recompute client-side rolling bands when settings change
        if (appState.lastFetchedData) {
            if (appState.rollingEnabled) {
                const filtered = applyColumnRanges(appState.lastFetchedData);
                appState.rollingBands = computeFrontendRollingBands(
                    filtered, appState.selectedCols, (appState as any).rollingWindow || 50);
            } else {
                appState.rollingBands = null;
            }
            appState.chart?.requestOverlayRender?.();
        }
        fetchAndRenderAnalytics().catch(() => { });
    });
}

/* ── FFT page ─────────────────────────────────────────── */

async function initFftPage(): Promise<void> {
    await initFftPageModule({
        renderTimeseries: renderCurrentData,
    });
}



/* ── Correlation Heatmap page ─────────────────────────── */
async function initHeatmapPage(): Promise<void> {
    await initHeatmapPageModule({ showPage });
}

const _loadedPageModules = new Set<string>();
let _metadataReady = false;

async function ensurePageModuleLoaded(page: string): Promise<void> {
    if (_loadedPageModules.has(page)) return;

    const loader = pageModuleLoaders[page];
    if (!loader) return;

    if (!_metadataReady) {
        await new Promise<void>((resolve) => {
            const onReady = () => {
                window.removeEventListener('edatime:metadata-ready', onReady);
                resolve();
            };
            window.addEventListener('edatime:metadata-ready', onReady);
        });
    }

    try {
        await loader();
        _loadedPageModules.add(page);
    } catch (error: any) {
        console.error(`Failed to load page module for ${page}:`, error);
    }
}

const pageModuleLoaders: Record<string, () => Promise<void>> = {
    scatter: initScatterPageModule,
    scattermatrix: initScatterPageModule,
    heatmap: initHeatmapPage,
    spectrogram: initSpectrogramPage,
    causal: initCausalPage,
    fft: initFftPage,
    drift: initDriftPage,
};

async function initSpectrogramPage(): Promise<void> {
    await initSpectrogramPageModule({
        setLoading: setComputeLoading,
    });
}

async function initDriftPage(): Promise<void> {
    const { initDriftPage: init } = await import('./drift/driftPage.js');
    await init(appState.metadata);
}

async function initCausalPage(): Promise<void> {
    const { initCausalPage: init } = await import('./causal/causalPage.js');
    const { initCausalComparison } = await import('./causal/causalComparison.js');
    init({
        getMetadata: () => appState.metadata as any,
        chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
        numericColumns: () => getNumericColumns(appState.metadata),
        setLoading: setComputeLoading,
    });
    initCausalComparison();
}

async function refreshDatasetAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
    if (!fetchMetadata) return;
    storeFetchedMetadata(await fetchMetadata());
    appState.numericCols = getNumericColumns(appState.metadata);
    const selectedColumn = options?.selectedColumn;
    if (selectedColumn && !appState.selectedCols.includes(selectedColumn)) {
        appState.selectedCols.push(selectedColumn);
    }
    sanitizeSelectedColumns();
    buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
    buildMetaBar(appState.metadata);
    await fetchAndRender();
}

async function init(): Promise<void> {
    initAppShell({
        ensurePageModuleLoaded,
        showPage,
        fetchAndRender,
        renderCurrentData,
        updateAnalysisYRange,
        zoomOut: () => zoomOut(fetchAndRender),
        resetZoom: () => resetZoom(fetchAndRender),
        initAnalyticsListeners,
        refreshDatasetAfterMutation,
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
        registerCleanup: (cleanup) => _appCleanups.push(cleanup),
    });

    try { await ensureChartModules(); } catch (e: any) {
        console.error('Chart/data modules failed to load:', e);
        setMetaText('Chart modules failed to load, but upload is available.');
        return;
    }

    const gpuError = await checkWebGPU();

    try {
        storeFetchedMetadata(await fetchMetadata!());
        _metadataReady = true;
        window.dispatchEvent(new Event('edatime:metadata-ready'));
        dbgGroup('metadata', () => dbg(appState.metadata));
        setMetaText('Loading chart…');

        if (!(appState.metadata as any).time_range) { setMetaText('No valid time range found.'); return; }

        appState.numericCols = getNumericColumns(appState.metadata);
        appState.selectedCols = getDefaultTimeseriesColumns(appState.metadata);
        appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
        sanitizeSelectedColumns();

        initDatasetSearchInputs({
            rebuildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
            renderColumnProfilesGrid,
        });

        const metadata = appState.metadata;
        if (!metadata) return;
        hydrateColumnProfiles(metadata);
        renderColumnProfilesGrid(true);
        applyPartialTimeRangeFromMetadata(metadata, false);
        setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
        setProfileMode('dataset');

        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
        buildMetaBar(metadata);
        buildRangeControls();
        window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));

        appState.currentStart = Number((appState.metadata as any).time_range.min);
        appState.currentEnd = Number((appState.metadata as any).time_range.max);
        updateAnalysisZoom(appState.currentStart, appState.currentEnd, 'initial');
        emitChartRangeChange('initial');

        initTimeseriesActions({
            rebuildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
            renderColumnProfilesGrid,
            buildRangeControls,
            renderCurrentData,
            fetchAndRender,
            updateAnalysisZoom,
            emitChartRangeChange,
            registerCleanup: (cleanup) => _appCleanups.push(cleanup),
        });

        dbg('initial X range (ms)', { start: appState.currentStart, end: appState.currentEnd });

        const lineType = getChartType('line');
        if (lineType) {
            appState.chart = lineType.create('main-chart', {
                onZoom: onZoomRangeChange,
                onYRange: updateAnalysisYRange,
                onZoomOut: () => zoomOut(fetchAndRender),
            });
        } else {
            appState.chart = new DataChartCtor!('main-chart', onZoomRangeChange, updateAnalysisYRange, () => zoomOut(fetchAndRender));
        }

        if (gpuError) throw new Error(gpuError);

        await Promise.race([
            appState.chart!.init(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000)),
        ]);

        appState.analysisBound = false;
        bindAnalysisChartEvents();
        initAdaptiveFilterGesture();
        refreshZoomControlsState();
        // Wire annotation overlay callback so annotation changes re-render
        setAnnotationOverlayCallback(() => appState.chart?.requestOverlayRender?.());
        appState.chart?.setXRange?.(appState.currentStart!, appState.currentEnd!);
        appState.chart?.setChartText?.(
            appState.chartText?.title || '',
            appState.chartText?.xLabel || '',
            appState.chartText?.yLabel || '',
        );

        renderCurrentData();

        await fetchAndRender();
        appState.initialView = getCurrentView();
        dbgGroup('initialView snapshot', () => dbg(appState.initialView));

        // Restore saved session after chart is ready
        await restoreSessionAfterChartReady({
            metadataTimeRange: (appState.metadata as any)?.time_range ?? null,
            currentDatasetRevision: Number(appState.datasetRevision ?? 0),
            buildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
            buildRangeControls,
            renderCurrentData,
            fetchAndRender,
        });
        startSessionPersistence();
    } catch (e: any) {
        console.error('Primary chart failed, switching to fallback:', e);
        try {
            const fallbackType = getChartType('fallback');
            appState.chart = fallbackType
                ? fallbackType.create('main-chart', {})
                : new FallbackChart('main-chart');
            await appState.chart!.init();
            appState.analysisBound = false;
            bindAnalysisChartEvents();
            refreshZoomControlsState();
            await fetchAndRender();
            setMetaText('Fallback renderer active');
        } catch (fallbackErr: any) {
            console.error('Fallback chart also failed:', fallbackErr);
            setMetaText('Error: ' + fallbackErr.message);
        }
    }
}

init();
