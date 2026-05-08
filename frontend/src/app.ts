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
import { installWindowsWebGpuRequestAdapterWorkaround, requestGpuAdapter } from './utils/platform.js';
import { getDefaultTimeseriesColumns, getNumericColumns } from './pages/analyticsPageUtils.js';
import { createTimeseriesPageController, computeFrontendRollingBands } from './pages/timeseriesPage.js';
import { initAppShell } from './bootstrap/appShell.js';
import { ensurePageModuleLoaded, isMetadataReady, markMetadataReady } from './bootstrap/pageLoaders.js';
import { restoreSessionAfterChartReady, startSessionPersistence } from './bootstrap/sessionBootstrap.js';
import { getHashPage } from './utils/router.js';
import { pageNeedsDatasetBootstrap } from './utils/pageBootstrap.js';
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
import type { DatasetMetadata, DataObject, AnomalyResponse, TransformResponse, ChartInstance, AdaptiveLineFilter } from './types.js';

import { initAnnotations } from './chart/annotations.js';
import { setAnnotationOverlayCallback } from './ui/annotationPanel.js';
import { toast } from './utils/toast.js';

const _appCleanups: Array<() => void> = [];

function storeFetchedMetadata(metadata: DatasetMetadata): void {
    appState.metadata = metadata;
    const revision = metadata?.revision;
    appState.datasetRevision = typeof revision === 'number' ? revision : 0;
}

/* ── UI Helpers ───────────────────────────────────────── */

/** Set a compute button + loading overlay into loading or idle state. */
export function setComputeLoading(btnId: string, overlayId: string, loading: boolean, label = 'Compute'): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement | null;
    const overlay = document.getElementById(overlayId) as HTMLElement | null;
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Computing…' : label; }
    if (overlay) overlay.hidden = !loading;
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
    } catch (e: unknown) {
        if (!(e instanceof Error) || e.name !== 'AbortError') {
            console.warn('Anomaly fetch failed:', e);
        }
        appState.anomalyRegions = null;
    }

    appState.chart?.requestOverlayRender?.();
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
    } catch (e: unknown) {
        const message = (e as Error).message ?? 'Unknown error';
        return `WebGPU adapter request failed: ${message}`;
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
    fetchData: (start, end, width, columns, colorColumn, signal) => fetchData!(start, end, width, columns, colorColumn, signal),
    buildRangeControls,
    updateAnalysisYRange,
    updateAnalysisZoom,
    getCurrentView,
    fetchAndRenderAnalytics: () => fetchAndRenderAnalytics(),
});

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
                appState.chart = lineType.create('main-chart', {
                    onZoom: onZoomRangeChange,
                    onYRange: updateAnalysisYRange,
                    onZoomOut: () => zoomOut(fetchAndRender),
                });
            } else {
                if (!DataChartCtor) throw new Error('DataChart module not loaded');
                appState.chart = new DataChartCtor('main-chart', onZoomRangeChange, updateAnalysisYRange, () => zoomOut(fetchAndRender));
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
            setAnnotationOverlayCallback(() => appState.chart?.requestOverlayRender?.());
            appState.chart?.setXRange?.(appState.currentStart!, appState.currentEnd!);
            appState.chart?.setChartText?.(
                appState.chartText?.title || '',
                appState.chartText?.xLabel || '',
                appState.chartText?.yLabel || '',
            );

            renderCurrentData();

            await timeseriesPage.fetchAndRender();
            appState.initialView = getCurrentView();
            dbgGroup('initialView snapshot', () => dbg(appState.initialView));

            await restoreSessionAfterChartReady({
                metadataTimeRange: appState.metadata?.time_range ?? null,
                currentDatasetRevision: Number(appState.datasetRevision ?? 0),
                buildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
                buildRangeControls,
                renderCurrentData,
                fetchAndRender: () => timeseriesPage.fetchAndRender(),
            });

            _timeseriesReady = true;
        } catch (e: unknown) {
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

function buildAdaptiveFilterFromPoints(column: string, firstPoint: { x: number; y: number }, secondPoint: { x: number; y: number }) {
    if (!column || !firstPoint || !secondPoint) return null;
    if (!appState.lastFetchedData) return null;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    const columnData = filtered.series?.[column] || filtered.values?.[column];
    const xs = columnData?.x;
    const ys = columnData?.y;
    if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;

    const x1 = Number(firstPoint.x);
    const y1 = Number(firstPoint.y);
    const x2 = Number(secondPoint.x);
    const y2 = Number(secondPoint.y);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2) || x1 === x2) return null;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const tempFilter: AdaptiveLineFilter = { column, x1, y1, x2, y2, keepAbove: true };
    let above = 0;
    let below = 0;
    for (let idx = 0; idx < xs.length; idx++) {
        const x = Number(xs[idx]);
        const y = Number(ys[idx]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
        const lineY = buildAdaptiveLineY(tempFilter, x);
        if (lineY == null || !Number.isFinite(lineY)) continue;
        if (y >= lineY) above += 1; else below += 1;
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
    const container: (HTMLElement & { dataset: DOMStringMap }) | null = document.getElementById('main-chart');
    if (!container || container.dataset.adaptiveBound) return;

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

    (container as HTMLElement & { dataset: DOMStringMap }).dataset.adaptiveBound = '1';
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

let _datasetReadyPromise: Promise<void> | null = null;
let _datasetUiReady = false;

function initializeDatasetUi(metadata: DatasetMetadata): void {
    if (!_datasetUiReady) {
        initDatasetSearchInputs({
            rebuildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
            renderColumnProfilesGrid,
        });

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

    buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
    buildMetaBar(metadata);
    buildRangeControls();
    window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));

    const timeRange = metadata.time_range;
    if (!timeRange) return;
    appState.currentStart = Number(timeRange.min);
    appState.currentEnd = Number(timeRange.max);
    updateAnalysisZoom(appState.currentStart, appState.currentEnd, 'initial');
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

        appState.numericCols = getNumericColumns(metadata);
        if (!appState.selectedCols.length) {
            appState.selectedCols = getDefaultTimeseriesColumns(metadata);
        }
        appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
        sanitizeSelectedColumns();

        initializeDatasetUi(metadata);
    })().catch((error) => {
        _datasetReadyPromise = null;
        throw error;
    });

    return _datasetReadyPromise;
}

async function refreshDatasetAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
    if (!fetchMetadata) return;
    storeFetchedMetadata(await fetchMetadata());
    markMetadataReady();
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
    installWindowsWebGpuRequestAdapterWorkaround();
    buildMetaBar(null);

    initAppShell({
        ensurePageModuleLoaded,
        showPage,
        fetchAndRender,
        renderCurrentData,
        updateAnalysisYRange,
        zoomOut: () => zoomOut(fetchAndRender),
        resetZoom: () => resetZoom(fetchAndRender),
        initAnalyticsListeners: () => { window.addEventListener('edatime:analytics-change', () => { if (appState.lastFetchedData) { if (appState.rollingEnabled) { const filtered = applyColumnRanges(appState.lastFetchedData); appState.rollingBands = computeFrontendRollingBands(filtered, appState.selectedCols, (appState.rollingWindow as number | undefined) || 50); } else { appState.rollingBands = null; } appState.chart?.requestOverlayRender?.(); } fetchAndRenderAnalytics().catch((err: unknown) => { console.warn('Analytics fetch failed:', err); }); }); },
        refreshDatasetAfterMutation,
        hydrateColumnProfiles,
        renderColumnProfilesGrid,
        registerCleanup: (cleanup) => _appCleanups.push(cleanup),
    });

    (window).__edatime = (window).__edatime || {};
    (window).__edatime.ensureDatasetReady = ensureDatasetReady;

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
    }
}

init();
