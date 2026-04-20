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
 *   scatter/scatterPage.ts — full scatter page with plot/distributions/matrix views
 */

import { DEBUG, dbg, dbgGroup } from './debug.js';
import {
    appState, SERIES_COLORS,
    setMetaText, buildMetaBar, sanitizeSelectedColumns,
    ensureRangeStateFromData, applyColumnRanges,
    buildAdaptiveLineY,
} from './state.js';
import { buildColumnToggles, buildRangeControls, initColumnFilterModal } from './ui/columns.js';
import { setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata, initUploadPanel } from './ui/upload.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid } from './ui/profile.js';
import { debounce } from './utils/dom.js';
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
import type { FftTrace } from './chart/FftChart.js';

import { initHashRouting } from './utils/router.js';
import { initAutoSave, autoRestoreSession, applySession, exportSessionToFile, importSessionFromFile } from './utils/session.js';
import { initCommandPalette, registerCommands, openPalette } from './utils/palette.js';
import { initProvenance, toggleProvenance } from './utils/provenance.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportEChartsPNG, exportEChartsSVG, exportEChartsHTML, exportElementPNG, exportElementSVG, exportElementHTML, exportMatrixCSV, exportTraceCSV } from './utils/chartExport.js';
import { toast } from './utils/toast.js';

const _appCleanups: Array<() => void> = [];
const EMPTY_TIMESERIES_DATA = { ts: [], values: {}, series: {}, colorByColumn: {} } as any;

/* ── UI Helpers ───────────────────────────────────────── */

/** Wire close/cancel/backdrop-click for a modal dialog. Returns the close function. */
function initModalClose(modalId: string, closeBtnId: string, cancelBtnId: string, onClose?: () => void): (() => void) | null {
    const modal = document.getElementById(modalId) as HTMLElement | null;
    if (!modal) return null;
    const close = () => { modal.hidden = true; onClose?.(); };
    document.getElementById(closeBtnId)?.addEventListener('click', close);
    document.getElementById(cancelBtnId)?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    return close;
}

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
let fetchFft: ((...args: any[]) => Promise<any>) | null = null;
let postTransform: ((...args: any[]) => Promise<any>) | null = null;
let DataChartCtor: (new (...args: any[]) => any) | null = null;
let FftChartCtor: (new (...args: any[]) => any) | null = null;

async function ensureChartModules(): Promise<void> {
    if (fetchMetadata && fetchData && DataChartCtor) return;
    const [dataClient, chartModule, fftModule] = await Promise.all([
        import('./dataClient.js'),
        import('./chart/DataChart.js'),
        import('./chart/FftChart.js'),
    ]);
    fetchMetadata = dataClient.fetchMetadata;
    fetchData = dataClient.fetchData;
    fetchAnomalies = dataClient.fetchAnomalies;
    fetchFft = dataClient.fetchFft;
    postTransform = dataClient.postTransform;
    DataChartCtor = chartModule.DataChart;
    FftChartCtor = fftModule.FftChart;

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
    if (!navigator.gpu)
        return 'WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.';
    try {
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('requestAdapter timed out')), 5000));
        const adapter = await Promise.race([navigator.gpu.requestAdapter(), timeout]);
        if (!adapter)
            return 'No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.';
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

/* ── Debug Y snapshot ─────────────────────────────────── */

function computeRenderedYDebugSnapshot() {
    if (!appState.lastFetchedData) return null;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;
    const perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }> = [];

    for (const col of appState.selectedCols || []) {
        const seriesData = (filtered as any).series?.[col];
        const yValues = seriesData ? seriesData.y : (filtered as any).values?.[col];
        if (!yValues) continue;
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        let count = 0;
        for (let i = 0; i < yValues.length; i++) {
            const y = Number(yValues[i]);
            if (!Number.isFinite(y)) continue;
            count += 1;
            if (y < min) min = y;
            if (y > max) max = y;
        }
        if (count > 0) { if (min < globalMin) globalMin = min; if (max > globalMax) globalMax = max; }
        perSeries.push({ name: col, points: count, yMin: count > 0 ? min : null, yMax: count > 0 ? max : null });
    }

    return {
        selectedCols: [...(appState.selectedCols || [])],
        globalYMin: Number.isFinite(globalMin) ? globalMin : null,
        globalYMax: Number.isFinite(globalMax) ? globalMax : null,
        perSeries,
    };
}

/* ── Core data pipeline ───────────────────────────────── */

function computeFrontendRollingBands(data: any, cols: string[], windowSize: number): any[] {
    const ts = data?.ts;
    if (!ts || ts.length < 2) return [];
    const n = ts.length;
    const half = Math.floor((windowSize - 1) / 2);
    const bands: any[] = [];
    for (const col of cols) {
        const ys = data?.series?.[col]?.y;
        if (!ys || ys.length !== n) continue;
        const tsOut = new Array(n);
        const mean: (number | null)[] = new Array(n).fill(null);
        const upper1: (number | null)[] = new Array(n).fill(null);
        const lower1: (number | null)[] = new Array(n).fill(null);
        const upper2: (number | null)[] = new Array(n).fill(null);
        const lower2: (number | null)[] = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
            tsOut[i] = Number(ts[i]);
            const start = Math.max(0, i - half);
            const end = Math.min(n, i + half + 1);
            let sum = 0, sumSq = 0, cnt = 0;
            for (let j = start; j < end; j++) {
                const v = Number(ys[j]);
                if (Number.isFinite(v)) { sum += v; sumSq += v * v; cnt++; }
            }
            if (cnt >= 2) {
                const m = sum / cnt;
                const std = Math.sqrt(Math.max(0, (sumSq / cnt) - m * m));
                mean[i] = m; upper1[i] = m + std; lower1[i] = m - std;
                upper2[i] = m + 2 * std; lower2[i] = m - 2 * std;
            }
        }
        bands.push({ column: col, ts: tsOut, mean, upper1, lower1, upper2, lower2 });
    }
    return bands;
}

function renderCurrentData(): void {
    const emptyState = document.getElementById('timeseries-empty-state') as HTMLElement | null;
    const hasSelection = Array.isArray(appState.selectedCols) && appState.selectedCols.length > 0;
    if (emptyState) {
        emptyState.hidden = hasSelection;
        emptyState.setAttribute('data-empty-reason', hasSelection ? '' : 'no-columns-selected');
    }
    if (!appState.chart) return;
    if (!hasSelection) {
        appState.rollingBands = null;
        appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
        return;
    }
    if (!appState.lastFetchedData) return;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    appState.chart.updateDataMulti(filtered, appState.selectedCols);
    if (appState.rollingEnabled) {
        appState.rollingBands = computeFrontendRollingBands(filtered, appState.selectedCols, (appState as any).rollingWindow || 50);
        appState.chart?.requestOverlayRender?.();
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
    const series = (filtered as any).series?.[column];
    const xs = series?.x;
    const ys = series?.y;
    if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;

    const x1 = Number(firstPoint.x); const y1 = Number(firstPoint.y);
    const x2 = Number(secondPoint.x); const y2 = Number(secondPoint.y);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2) || x1 === x2) return null;

    const minX = Math.min(x1, x2); const maxX = Math.max(x1, x2);
    const tempFilter = { column, x1, y1, x2, y2, keepAbove: true } as any;
    let above = 0; let below = 0;
    for (let idx = 0; idx < xs.length; idx++) {
        const x = Number(xs[idx]); const y = Number(ys[idx]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
        const lineY = buildAdaptiveLineY(tempFilter, x);
        if (!Number.isFinite(lineY!)) continue;
        if (y >= lineY!) above += 1; else below += 1;
    }

    return {
        id: `adaptive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        column, x1, y1, x2, y2, keepAbove: above > below,
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

function emitChartRangeChange(sourceKind = 'data'): void {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    window.dispatchEvent(new CustomEvent('edatime:chart-range-change', {
        detail: { start: appState.currentStart, end: appState.currentEnd, source: sourceKind },
    }));
}

/* ── Data fetch with AbortController ──────────────────── */

let dataFetchController: AbortController | null = null;

async function fetchAndRender(): Promise<void> {
    sanitizeSelectedColumns();
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    if (appState.currentStart! >= appState.currentEnd!) return;
    if (!Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
        buildRangeControls();
        renderCurrentData();
        return;
    }

    // Cancel any in-flight data fetch
    if (dataFetchController) dataFetchController.abort();
    dataFetchController = new AbortController();
    const signal = dataFetchController.signal;

    const loadingEl = document.getElementById('main-chart-loading');
    if (loadingEl) loadingEl.hidden = false;

    try {
        const startIso = new Date(appState.currentStart!).toISOString();
        const endIso = new Date(appState.currentEnd!).toISOString();
        const width = document.getElementById('main-chart')?.clientWidth || 1200;
        const cols = appState.selectedCols.join(',');
        const colorCol = appState.selectedColorColumn || null;

        dbgGroup('fetchAndRender', () => {
            dbg('request', { startIso, endIso, width, cols, colorCol });
            dbg('selectedCols', appState.selectedCols);
            dbg('selectedColorColumn', appState.selectedColorColumn);
        });

        const data = await fetchData!(startIso, endIso, width, cols, colorCol, signal);
        appState.lastFetchedData = data;

        if (DEBUG) {
            const n = data?.ts?.length ?? 0;
            let tsMin = null; let tsMax = null;
            if (n > 0) { tsMin = data.ts[0]; tsMax = data.ts[n - 1]; }
            dbg('response points', n, 'tsMin/tsMax', tsMin, tsMax);
            if (!data?.ts || data.ts.length === 0) console.warn('[edatime] fetchAndRender: empty result for range', { startIso, endIso, width, cols });
        }

        ensureRangeStateFromData(data);
        buildRangeControls();
        // Call setXRange before renderCurrentData so overlay has correct x mapping
        appState.chart?.setXRange?.(appState.currentStart!, appState.currentEnd!);
        renderCurrentData();
        emitChartRangeChange('data');

        // Rolling bands computed client-side in renderCurrentData; only anomaly needs backend
        if (appState.anomalyEnabled) {
            fetchAndRenderAnalytics().catch(() => { /* non-fatal */ });
        }

        if (DEBUG) {
            const snapshot = computeRenderedYDebugSnapshot();
            (window as any).__edatime.debugYSnapshot = snapshot;
            dbg('post-render renderedSnapshot', snapshot);
        }

        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'data');
        if (DEBUG) dbg('post-render yRange', yr);

        appState.pendingYMode = null;
        appState.pendingRestoreY = null;
    } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to fetch data:', err);
        setMetaText('Error: ' + err.message);
    } finally {
        const loadingEl = document.getElementById('main-chart-loading');
        if (loadingEl) loadingEl.hidden = true;
    }
}

/* ── Zoom handler ─────────────────────────────────────── */

function onZoomRangeChange(newStart: number, newEnd: number, sourceKind = 'user'): void {
    if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);

    dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
        dbg('prev', { start: appState.currentStart, end: appState.currentEnd });
        dbg('next', { start: newStart, end: newEnd });
    });

    if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

    if (Number.isFinite(appState.currentStart) && Number.isFinite(appState.currentEnd)) {
        const snap = getCurrentView();
        appState.zoomHistory = [...appState.zoomHistory, snap].slice(-5);
        dbg('pushed history snapshot', snap);
        dbg('history depth (after push)', appState.zoomHistory.length);
    }

    appState.currentStart = newStart;
    appState.currentEnd = newEnd;
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
    appState.pendingYMode = 'fit';
    appState.pendingRestoreY = null;

    updateAnalysisZoom(newStart, newEnd, sourceKind);
    emitChartRangeChange(sourceKind);
    if (!appState.refetchOnZoom) return;
    appState.fetchDebounceId = setTimeout(fetchAndRender, 150);
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
            if (key === '5') { event.preventDefault(); showPage('distributions'); return; }
            if (key === '6') { event.preventDefault(); showPage('fft'); return; }
            if (key === '7') { event.preventDefault(); showPage('heatmap'); return; }
            if (key === '8') { event.preventDefault(); showPage('spectrogram'); return; }
            if (key === '9') { event.preventDefault(); showPage('causal'); return; }
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

/* ── Transform modal ──────────────────────────────────── */

function initTransformModal(): void {
    const applyBtn = document.getElementById('transform-apply-btn');
    const exprInput = document.getElementById('transform-expression') as HTMLInputElement | null;
    const nameInput = document.getElementById('transform-output-name') as HTMLInputElement | null;
    const errorEl = document.getElementById('transform-error') as HTMLElement | null;

    const close = initModalClose('transform-modal', 'transform-close-btn', 'transform-cancel-btn',
        () => { if (errorEl) errorEl.textContent = ''; });
    if (!close) return;

    applyBtn?.addEventListener('click', async () => {
        const expr = exprInput?.value?.trim();
        const name = nameInput?.value?.trim();
        if (!expr) { if (errorEl) errorEl.textContent = 'Expression is required.'; return; }
        if (!name) { if (errorEl) errorEl.textContent = 'Output column name is required.'; return; }
        if (errorEl) errorEl.textContent = '';

        try {
            applyBtn.textContent = 'Applying…';
            (applyBtn as HTMLButtonElement).disabled = true;
            await postTransform!(expr, name);
            close();
            // Reload metadata and data after transform
            if (fetchMetadata) {
                appState.metadata = await fetchMetadata();
                appState.numericCols = ((appState.metadata as any).numeric_columns || [])
                    .filter((col: string) => col && col.toLowerCase() !== 'ts');
                if (!appState.selectedCols.includes(name)) appState.selectedCols.push(name);
                sanitizeSelectedColumns();
                buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
                buildMetaBar(appState.metadata);
                await fetchAndRender();
            }
        } catch (e: any) {
            if (errorEl) errorEl.textContent = e?.message || 'Transform failed.';
        } finally {
            applyBtn.textContent = 'Apply';
            (applyBtn as HTMLButtonElement).disabled = false;
        }
    });
}

/* ── FFT page ─────────────────────────────────────────── */

let _fftTraces: FftTrace[] = [];
let _fftMode = 'magnitude';
let _fftLogScale = true;
let _fftChart: any = null;
const _FFT_CHIP_COLORS = ['#7ad151', '#4ac3e8', '#f97316', '#e879f9', '#facc15', '#60a5fa', '#f43f5e'];
const _fftTraceColors: Record<string, string> = {};

function _fftColumns(): string[] {
    return ((appState.metadata?.numeric_columns || []) as string[])
        .filter((c: string) => c.toLowerCase() !== 'ts');
}

function _fftColorFor(col: string, fallbackIdx: number): string {
    return _fftTraceColors[col] || _FFT_CHIP_COLORS[Math.max(0, fallbackIdx) % _FFT_CHIP_COLORS.length];
}

function _fftUpdateZoomBtn(isZoomed?: boolean): void {
    const btn = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;
    if (btn) btn.hidden = !(isZoomed ?? _fftChart?.getIsZoomed() ?? false);
}

function _fftRerenderOrClear(): void {
    const emptyState = document.getElementById('fft-empty-state') as HTMLElement | null;
    if (emptyState) {
        emptyState.hidden = _fftTraces.length > 0;
        emptyState.setAttribute('data-empty-reason', _fftTraces.length > 0 ? '' : 'no-columns-selected');
    }
    if (!_fftChart) return;
    if (_fftTraces.length === 0) {
        _fftChart.clear();
    } else {
        _fftChart.updateData(_fftTraces, _fftMode, _fftLogScale);
    }
}

function _fftRenderChips(): void {
    const bar = document.getElementById('fft-traces-bar');
    const statusEl = document.getElementById('fft-status') as HTMLElement | null;
    if (!bar || !appState.metadata) return;
    const allCols = _fftColumns();

    const existing = new Map<string, HTMLElement>();
    for (const el of bar.querySelectorAll<HTMLElement>('.fft-trace-chip')) {
        const col = (el as any).dataset.col as string;
        if (allCols.includes(col)) existing.set(col, el);
        else el.remove();
    }

    const zoomBtn = bar.querySelector('#fft-zoom-reset-btn');
    for (const [idx, col] of allCols.entries()) {
        const activeIdx = _fftTraces.findIndex(t => t.column === col);
        const isActive = activeIdx >= 0;
        const color = _fftColorFor(col, idx);
        let chip = existing.get(col) as HTMLButtonElement | undefined;
        if (!chip) {
            chip = document.createElement('button') as HTMLButtonElement;
            chip.className = 'series-chip fft-trace-chip';
            chip.type = 'button';
            (chip as any).dataset.col = col;
            chip.addEventListener('click', async (e) => {
                const c = (chip as any).dataset.col as string;
                if ((e.target as HTMLElement)?.closest?.('.chip-color-picker')) return;
                if ((e.target as HTMLElement).classList.contains('fft-chip-remove')) {
                    _fftTraces = _fftTraces.filter(t => t.column !== c);
                    _fftRenderChips();
                    _fftRerenderOrClear();
                    if (statusEl) statusEl.textContent = _fftTraces.length
                        ? _fftTraces.map(t => t.column).join(', ')
                        : 'Select a column chip to compute its FFT.';
                    return;
                }
                if (_fftTraces.some(t => t.column === c)) return;
                chip!.classList.add('loading');
                chip!.disabled = true;
                const fftLoadingEl = document.getElementById('fft-chart-loading');
                if (fftLoadingEl) fftLoadingEl.hidden = false;
                if (statusEl) statusEl.textContent = `Computing FFT for ${c}…`;
                try {
                    await _fftFetchAndAdd(c);
                    _fftRenderChips();
                    _fftRerenderOrClear();
                    const bins = _fftTraces.find(t => t.column === c)?.frequencies.length ?? 0;
                    if (statusEl) statusEl.textContent = `${_fftTraces.map(t => t.column).join(', ')} · ${bins} bins`;
                } catch (e2: any) {
                    if (statusEl) statusEl.textContent = `FFT failed for ${c}: ${e2?.message || 'error'}`;
                } finally {
                    chip!.classList.remove('loading');
                    chip!.disabled = false;
                    if (fftLoadingEl) fftLoadingEl.hidden = true;
                }
            });
            bar.insertBefore(chip, zoomBtn || null);

        }
        chip.className = `series-chip fft-trace-chip${isActive ? ' active' : ''}`;
        chip.style.setProperty('--chip-accent', color);
        chip.innerHTML = `<span class="chip-label">${col}</span>`
            + `<input type="color" class="chip-color-picker fft-chip-color-picker" value="${color}" aria-label="Set ${col} FFT color" title="Set ${col} FFT color">`
            + (isActive ? '<span class="fft-chip-remove" aria-hidden="true">×</span>' : '');
        const colorInput = chip.querySelector('.chip-color-picker') as HTMLInputElement | null;
        if (colorInput) {
            for (const eventName of ['pointerdown', 'mousedown', 'click', 'dblclick'] as const) {
                colorInput.addEventListener(eventName, (event) => event.stopPropagation());
            }
            colorInput.addEventListener('input', (event) => {
                const nextColor = (event.target as HTMLInputElement).value;
                _fftTraceColors[col] = nextColor;
                chip!.style.setProperty('--chip-accent', nextColor);
                const trace = _fftTraces.find((item) => item.column === col);
                if (trace) {
                    trace.color = nextColor;
                    _fftRerenderOrClear();
                }
            });
        }
    }

    bar.hidden = allCols.length === 0;
}

async function _fftFetchAndAdd(col: string): Promise<void> {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    const startIso = new Date(appState.currentStart!).toISOString();
    const endIso = new Date(appState.currentEnd!).toISOString();
    const resp = await fetchFft!(startIso, endIso, col);
    if (!resp?.results?.length) throw new Error('No results');
    const result = resp.results[0];
    _fftTraces = _fftTraces.filter(t => t.column !== col);
    const color = _fftColorFor(col, _fftColumns().indexOf(col));
    _fftTraces.push({ column: result.column, frequencies: result.frequencies, magnitudes: result.magnitudes, psd: result.psd, color });
}

async function initFftPage(): Promise<void> {
    const modeSelect = document.getElementById('fft-mode-select') as HTMLSelectElement | null;
    const logCheck = document.getElementById('fft-log-scale') as HTMLInputElement | null;
    const zoomResetBtn = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;

    _fftChart = new FftChartCtor!('fft-chart');
    await _fftChart.init();

    _fftChart.onZoomChange = (isZoomed: boolean) => _fftUpdateZoomBtn(isZoomed);

    const populateChips = () => { if (appState.metadata) _fftRenderChips(); };
    populateChips();
    window.addEventListener('edatime:page-change', populateChips);

    modeSelect?.addEventListener('change', () => { _fftMode = modeSelect.value; _fftRerenderOrClear(); });
    logCheck?.addEventListener('change', () => { _fftLogScale = logCheck.checked; _fftRerenderOrClear(); });
    zoomResetBtn?.addEventListener('click', () => _fftChart?.resetView());

    // Export buttons
    document.getElementById('fft-export-png-btn')?.addEventListener('click', () => {
        exportContainerCanvasPNG('fft-chart', 'edatime_fft.png');
    });
    document.getElementById('fft-export-svg-btn')?.addEventListener('click', () => {
        exportContainerCanvasSVG('fft-chart', 'edatime_fft.svg');
    });
    document.getElementById('fft-export-html-btn')?.addEventListener('click', () => {
        exportContainerCanvasHTML('fft-chart', 'edatime_fft.html');
    });
    document.getElementById('fft-export-csv-btn')?.addEventListener('click', () => {
        if (_fftTraces.length === 0) { toast('No FFT data to export.', 'warning'); return; }
        const csvTraces = _fftTraces.map((t: FftTrace) => ({
            column: t.column,
            xs: t.frequencies,
            ys: _fftMode === 'psd' ? t.psd : t.magnitudes,
        }));
        exportTraceCSV(csvTraces, 'frequency_hz', `edatime_fft_${_fftMode}.csv`);
    });

    _fftRerenderOrClear();
}



/* ── Correlation Heatmap page ─────────────────────────── */

let _heatmapLoaded = false;
let _heatmapCellSize = 36;

async function initHeatmapPage(): Promise<void> {
    if (_heatmapLoaded) return;
    _heatmapLoaded = true;

    const container = document.getElementById('heatmap-container');
    const statusEl = document.getElementById('heatmap-status') as HTMLElement | null;
    const metricSelect = document.getElementById('heatmap-metric') as HTMLSelectElement | null;
    const sizeInput = document.getElementById('heatmap-cell-size') as HTMLInputElement | null;
    const sizeValue = document.getElementById('heatmap-cell-size-value') as HTMLElement | null;
    if (!container) return;

    let matrixData: any = null;
    let metric = 'pearson';

    function syncHeatmapEmptyState(message: string, visible: boolean, reason = ''): void {
        const empty = document.getElementById('heatmap-empty-state') as HTMLElement | null;
        if (!empty) return;
        empty.textContent = message;
        empty.hidden = !visible;
        empty.setAttribute('data-empty-reason', visible ? (reason || 'no-data') : '');
    }

    function renderHeatmap() {
        if (!matrixData || !container) {
            syncHeatmapEmptyState('Correlation heatmap will appear here once the dataset is available.', true);
            return;
        }
        const cols: string[] = matrixData.columns;
        const data: (number | null)[][] = metric === 'spearman' ? matrixData.spearman : matrixData.pearson;
        const n = cols.length;
        if (n === 0) {
            container.innerHTML = '';
            syncHeatmapEmptyState('No numeric columns are available for the correlation heatmap.', true, 'no-columns-available');
            return;
        }
        syncHeatmapEmptyState('', false);

        const cellSize = _heatmapCellSize;
        const labelWidth = Math.max(84, Math.min(180, Math.round(cellSize * 2.5)));

        let html = `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${labelWidth}px repeat(${n},${cellSize}px);grid-template-rows:${labelWidth}px repeat(${n},${cellSize}px);gap:1px;font-size:0.65rem;">`;

        // Top-left corner
        html += `<div></div>`;
        // Column headers
        for (const col of cols) {
            html += `<div class="heatmap-header" style="writing-mode:vertical-rl;text-orientation:mixed;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;color:var(--text-dim);padding:4px 2px;" title="${col}">${col}</div>`;
        }
        // Rows
        for (let i = 0; i < n; i++) {
            html += `<div class="heatmap-row-label" style="display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${cols[i]}">${cols[i]}</div>`;
            for (let j = 0; j < n; j++) {
                const val = data[i][j];
                const displayVal = val !== null ? val.toFixed(2) : '—';
                const bg = val !== null ? correlationColor(val) : 'transparent';
                const textColor = val !== null && Math.abs(val) > 0.5 ? '#fff' : 'var(--text)';
                html += `<div class="heatmap-cell" data-row="${i}" data-col="${j}" style="display:flex;align-items:center;justify-content:center;background:${bg};color:${textColor};border-radius:2px;cursor:${i !== j ? 'pointer' : 'default'};font-variant-numeric:tabular-nums;" title="${cols[i]} × ${cols[j]}: ${displayVal}${i !== j ? ' — click to explore in Scatter' : ''}">${displayVal}</div>`;
            }
        }
        html += `</div>`;

        // Colorbar legend
        html += `<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.7rem;color:var(--text-dim);">`;
        html += `<span>-1.0</span>`;
        html += `<div style="flex:0 0 200px;height:12px;border-radius:4px;background:linear-gradient(90deg,#2166AC,#67A9CF,#F7F7F7,#EF8A62,#B2182B);"></div>`;
        html += `<span>+1.0</span>`;
        html += `</div>`;

        container.innerHTML = html;

        // Click a heatmap cell → navigate to Scatter page with those two columns pre-selected
        container.addEventListener('click', (e: MouseEvent) => {
            const cell = (e.target as HTMLElement).closest<HTMLElement>('.heatmap-cell');
            if (!cell) return;
            const ri = parseInt(cell.dataset.row || '', 10);
            const ci = parseInt(cell.dataset.col || '', 10);
            if (isNaN(ri) || isNaN(ci) || ri === ci) return;
            const xSelect = document.getElementById('scatter-x-col') as HTMLSelectElement | null;
            const ySelect = document.getElementById('scatter-y-col') as HTMLSelectElement | null;
            if (xSelect) xSelect.value = cols[ri];
            if (ySelect) ySelect.value = cols[ci];
            showPage('scatter');
        });
    }

    function correlationColor(v: number): string {
        // Diverging RdBu colormap: -1 = blue, 0 = white, +1 = red
        const clamped = Math.max(-1, Math.min(1, v));
        if (clamped >= 0) {
            const t = clamped;
            const r = Math.round(247 - t * (247 - 178));
            const g = Math.round(247 - t * (247 - 24));
            const b = Math.round(247 - t * (247 - 43));
            return `rgb(${r},${g},${b})`;
        } else {
            const t = -clamped;
            const r = Math.round(247 - t * (247 - 33));
            const g = Math.round(247 - t * (247 - 102));
            const b = Math.round(247 - t * (247 - 172));
            return `rgb(${r},${g},${b})`;
        }
    }

    async function loadMatrix() {
        if (statusEl) statusEl.textContent = 'Loading correlation matrix…';
        try {
            const { fetchCorrelationMatrix } = await import('./dataClient.js');
            matrixData = await fetchCorrelationMatrix();
            if (statusEl) statusEl.textContent = `${matrixData.columns.length} columns · ${_heatmapCellSize}px cells`;
            renderHeatmap();
        } catch (e: any) {
            const msg: string = e?.message || '';
            const isInsufficient = msg.toLowerCase().includes('two') || msg.toLowerCase().includes('numeric') || msg.toLowerCase().includes('column');
            syncHeatmapEmptyState(
                isInsufficient
                    ? 'Need at least two numeric columns to compute correlations. Upload a dataset with multiple numeric columns.'
                    : 'Correlation heatmap is unavailable for the current dataset.',
                true,
                isInsufficient ? 'no-columns-available' : 'render-failure',
            );
            if (statusEl) statusEl.textContent = isInsufficient ? 'Not enough numeric columns' : `Error: ${msg || 'failed'}`;
        }
    }

    metricSelect?.addEventListener('change', () => {
        metric = metricSelect.value;
        renderHeatmap();
    });
    sizeInput?.addEventListener('input', () => {
        _heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
        if (sizeValue) sizeValue.textContent = String(_heatmapCellSize);
        if (statusEl && matrixData) statusEl.textContent = `${matrixData.columns.length} columns · ${_heatmapCellSize}px cells`;
        renderHeatmap();
    });

    // Heatmap export buttons
    document.getElementById('heatmap-export-csv-btn')?.addEventListener('click', () => {
        if (!matrixData) { toast('No heatmap data to export.', 'warning'); return; }
        const data = metric === 'spearman' ? matrixData.spearman : matrixData.pearson;
        exportMatrixCSV(matrixData.columns, data, `edatime_correlation_${metric}.csv`);
    });
    document.getElementById('heatmap-export-png-btn')?.addEventListener('click', () => {
        exportElementPNG('heatmap-container', 'edatime_heatmap.png');
    });
    document.getElementById('heatmap-export-svg-btn')?.addEventListener('click', () => {
        exportElementSVG('heatmap-container', 'edatime_heatmap.svg');
    });
    document.getElementById('heatmap-export-html-btn')?.addEventListener('click', () => {
        void exportElementHTML('heatmap-container', 'edatime_heatmap.html');
    });

    // Reload when page becomes visible
    window.addEventListener('edatime:page-change', (e: any) => {
        if (e?.detail?.page === 'heatmap') loadMatrix();
    });

    loadMatrix();
}

/* ── Spectrogram page ─────────────────────────────────── */

let _spectrogramLoaded = false;
let _spectrogramChart: any = null;
let _spectrogramResizeObserver: ResizeObserver | null = null;
let _spectrogramResult: { column: string; times_ms: number[]; frequencies: number[]; magnitudes: number[][] } | null = null;
let _spectrogramSampleCount = 0;

async function initSpectrogramPage(): Promise<void> {
    if (_spectrogramLoaded) return;
    _spectrogramLoaded = true;

    const colSelect = document.getElementById('spectrogram-col-select') as HTMLSelectElement | null;
    const winSelect = document.getElementById('spectrogram-win-size') as HTMLSelectElement | null;
    const logCheck = document.getElementById('spectrogram-log-scale') as HTMLInputElement | null;
    const computeBtn = document.getElementById('spectrogram-compute-btn') as HTMLButtonElement | null;
    const resetZoomBtn = document.getElementById('spectrogram-zoom-reset-btn') as HTMLButtonElement | null;
    const statusEl = document.getElementById('spectrogram-status') as HTMLElement | null;
    const chartEl = document.getElementById('spectrogram-chart') as HTMLDivElement | null;

    if (!chartEl || !colSelect) return;

    const syncSpectrogramEmptyState = (message?: string) => {
        const empty = document.getElementById('spectrogram-empty-state') as HTMLElement | null;
        if (!empty) return;
        empty.textContent = message || 'Pick a numeric column and click Compute to generate the spectrogram.';
        empty.hidden = !!_spectrogramResult;
        empty.setAttribute('data-empty-reason', _spectrogramResult ? '' : 'no-columns-selected');
    };

    const ensureSpectrogramChart = async () => {
        if (_spectrogramChart) return _spectrogramChart;
        const echarts = await import('echarts');
        _spectrogramChart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
        _spectrogramResizeObserver?.disconnect();
        _spectrogramResizeObserver = new ResizeObserver(() => _spectrogramChart?.resize());
        _spectrogramResizeObserver.observe(chartEl);

        // ── Native drag-box zoom (same convention as timeseries / FFT) ──────
        // The selection box is pointer-events:none so ECharts tooltip still works.
        if (chartEl.style.position === '' || chartEl.style.position === 'static') {
            chartEl.style.position = 'relative';
        }
        const selBox = document.createElement('div');
        selBox.style.cssText =
            'position:absolute;top:0;left:0;width:0;height:0;'
            + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
            + 'pointer-events:none;display:none;z-index:5';
        chartEl.appendChild(selBox);

        let _dragStart: { x: number; y: number; pid: number } | null = null;
        let _dragEnd = { x: 0, y: 0 };

        // Grid margins must stay in sync with the setOption grid config below.
        const SPEC_GRID = { left: 72, right: 110, top: 24, bottom: 80 };

        chartEl.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) return;
            const rect = chartEl.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            // Ignore clicks outside the plot area (e.g. over the colorscale / visualMap).
            if (x > rect.width - SPEC_GRID.right || x < SPEC_GRID.left
                || y < SPEC_GRID.top || y > rect.height - SPEC_GRID.bottom) return;
            _dragStart = { x, y, pid: e.pointerId };
            _dragEnd = { x, y };
            try { chartEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        });

        chartEl.addEventListener('pointermove', (e: PointerEvent) => {
            if (!_dragStart || e.pointerId !== _dragStart.pid) return;
            const rect = chartEl.getBoundingClientRect();
            _dragEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const left = Math.min(_dragStart.x, _dragEnd.x);
            const top = Math.min(_dragStart.y, _dragEnd.y);
            selBox.style.left = `${left}px`;
            selBox.style.top = `${top}px`;
            selBox.style.width = `${Math.abs(_dragEnd.x - _dragStart.x)}px`;
            selBox.style.height = `${Math.abs(_dragEnd.y - _dragStart.y)}px`;
            selBox.style.display = 'block';
        });

        const finishDrag = (e: PointerEvent) => {
            if (!_dragStart || e.pointerId !== _dragStart.pid) return;
            const start = _dragStart;
            _dragStart = null;
            selBox.style.display = 'none';
            try { chartEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

            const dx = Math.abs(_dragEnd.x - start.x);
            const dy = Math.abs(_dragEnd.y - start.y);
            if (dx < 8 || dy < 8) return; // too small — treat as click, ignore

            const chart = _spectrogramChart;
            if (!chart || !_spectrogramResult) return;

            // Map screen pixels → category indices via ECharts coordinate system.
            const p0 = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [start.x, start.y]) as [number, number] | null;
            const p1 = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [_dragEnd.x, _dragEnd.y]) as [number, number] | null;
            if (!p0 || !p1) return;

            const xLen = _spectrogramResult.times_ms.length;
            const yLen = _spectrogramResult.frequencies.length;
            const xStartPct = Math.max(0, Math.min(100, (Math.min(p0[0], p1[0]) / (xLen - 1)) * 100));
            const xEndPct = Math.max(0, Math.min(100, (Math.max(p0[0], p1[0]) / (xLen - 1)) * 100));
            const yStartPct = Math.max(0, Math.min(100, (Math.min(p0[1], p1[1]) / (yLen - 1)) * 100));
            const yEndPct = Math.max(0, Math.min(100, (Math.max(p0[1], p1[1]) / (yLen - 1)) * 100));
            if (xEndPct <= xStartPct || yEndPct <= yStartPct) return;

            chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: xStartPct, end: xEndPct });
            chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: yStartPct, end: yEndPct });
        };
        chartEl.addEventListener('pointerup', finishDrag);
        chartEl.addEventListener('pointercancel', (e: PointerEvent) => {
            if (_dragStart?.pid === e.pointerId) {
                _dragStart = null;
                selBox.style.display = 'none';
            }
        });

        // Double-click resets zoom — same convention as every other chart.
        // Dispatch explicit 0-100% dataZoom instead of 'restore' which is
        // unreliable for inside-type dataZoom components.
        chartEl.addEventListener('dblclick', () => {
            if (!_spectrogramChart) return;
            _spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
            _spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
        });

        return _spectrogramChart;
    };

    const formatSpectrogramTime = (tsMs: number): string => {
        return new Date(tsMs).toLocaleString([], {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const formatSpectrogramFrequency = (freq: number): string => {
        if (!Number.isFinite(freq)) return '—';
        if (freq >= 1000) return `${(freq / 1000).toFixed(2)} kHz`;
        if (freq >= 1) return `${freq.toFixed(2)} Hz`;
        return `${(freq * 1000).toFixed(2)} mHz`;
    };

    const renderSpectrogramChart = async () => {
        if (!_spectrogramResult) return;
        const chart = await ensureSpectrogramChart();
        const logScale = logCheck?.checked ?? true;
        const points: [number, number, number, number, number, number][] = [];
        const timeAxis = _spectrogramResult.times_ms;
        const freqAxis = _spectrogramResult.frequencies;
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;

        for (let timeIndex = 0; timeIndex < timeAxis.length; timeIndex++) {
            const timeMs = timeAxis[timeIndex];
            const row = _spectrogramResult.magnitudes[timeIndex] || [];
            for (let freqIndex = 0; freqIndex < freqAxis.length; freqIndex++) {
                const freq = freqAxis[freqIndex];
                const rawMagnitude = Number(row[freqIndex] ?? 0);
                const displayMagnitude = logScale
                    ? Math.log10(Math.max(rawMagnitude, 1e-30))
                    : rawMagnitude;
                if (!Number.isFinite(displayMagnitude)) continue;
                minValue = Math.min(minValue, displayMagnitude);
                maxValue = Math.max(maxValue, displayMagnitude);
                points.push([timeIndex, freqIndex, displayMagnitude, timeMs, freq, rawMagnitude]);
            }
        }

        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
            minValue = 0;
            maxValue = 1;
        }

        // Show ~10 evenly-spaced ticks on each axis to avoid label crowding.
        const xTickInterval = Math.max(0, Math.floor(timeAxis.length / 10) - 1);
        const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);

        chart.setOption({
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 72, right: 110, top: 24, bottom: 80 },
            toolbox: {
                right: 12,
                feature: {
                    restore: { title: 'Reset zoom' },
                    saveAsImage: { title: 'Save image' },
                },
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(8, 12, 20, 0.94)',
                borderColor: 'rgba(126, 158, 212, 0.28)',
                textStyle: { color: '#eef4ff' },
                formatter: (params: any) => {
                    const value = params?.value || [];
                    const timeMs = Number(value[3]);
                    const freq = Number(value[4]);
                    const displayMagnitude = Number(value[2]);
                    const rawMagnitude = Number(value[5]);
                    return [
                        `<strong>${_spectrogramResult?.column || 'Spectrogram'}</strong>`,
                        `Time: ${formatSpectrogramTime(timeMs)}`,
                        `Frequency: ${formatSpectrogramFrequency(freq)}`,
                        `Intensity: ${displayMagnitude.toFixed(4)}${logScale ? ' log10' : ''}`,
                        `Raw magnitude: ${rawMagnitude.toExponential(4)}`,
                    ].join('<br>');
                },
            },
            xAxis: {
                type: 'category',
                data: timeAxis,
                name: 'Time',
                nameLocation: 'middle',
                nameGap: 48,
                axisLabel: {
                    color: '#9fb1d1',
                    rotate: 30,
                    interval: xTickInterval,
                    formatter: (value: string | number) => {
                        const date = new Date(Number(value));
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}\n${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    },
                },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'category',
                data: freqAxis,
                name: 'Frequency (Hz)',
                nameLocation: 'middle',
                nameGap: 56,
                axisLabel: {
                    color: '#9fb1d1',
                    interval: yTickInterval,
                    formatter: (value: string | number) => formatSpectrogramFrequency(Number(value)),
                },
                splitLine: { show: false },
            },
            visualMap: {
                min: minValue,
                max: maxValue,
                calculable: true,
                orient: 'vertical',
                right: 18,
                top: 'middle',
                text: [logScale ? 'High log10' : 'High', logScale ? 'Low log10' : 'Low'],
                textStyle: { color: '#9fb1d1' },
                inRange: {
                    color: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
                },
            },
            // dataZoom components are registered so dispatchAction works,
            // but all built-in mouse interactions are disabled — the native
            // pointer-drag overlay above handles zoom, dblclick resets.
            dataZoom: [
                {
                    type: 'inside', xAxisIndex: 0, filterMode: 'none',
                    zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false
                },
                {
                    type: 'inside', yAxisIndex: 0, filterMode: 'none',
                    zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false
                },
            ],
            series: [{
                name: _spectrogramResult.column,
                type: 'heatmap',
                progressive: 0,
                emphasis: { itemStyle: { borderColor: '#ffffff', borderWidth: 1 } },
                data: points,
            }],
        });

        statusEl!.textContent = `${_spectrogramResult.column} · ${_spectrogramResult.times_ms.length} windows × ${_spectrogramResult.frequencies.length} bins · ${_spectrogramSampleCount} samples`;
        syncSpectrogramEmptyState();
    };

    // Populate column select from metadata
    if (appState.metadata) {
        for (const col of appState.metadata.numeric_columns) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            colSelect.appendChild(opt);
        }
    }
    syncSpectrogramEmptyState();

    computeBtn?.addEventListener('click', async () => {
        const column = colSelect.value;
        if (!column) { if (statusEl) statusEl.textContent = 'Select a column.'; syncSpectrogramEmptyState('Pick a numeric column and click Compute to generate the spectrogram.'); return; }
        if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) {
            if (statusEl) statusEl.textContent = 'No time range available.';
            return;
        }

        const winSize = parseInt(winSelect?.value || '256', 10);
        try {
            setComputeLoading('spectrogram-compute-btn', 'spectrogram-loading', true);
            if (statusEl) statusEl.textContent = 'Fetching spectrogram…';

            const { fetchSpectrogram } = await import('./dataClient.js');
            const startIso = new Date(appState.currentStart!).toISOString();
            const endIso = new Date(appState.currentEnd!).toISOString();
            const resp = await fetchSpectrogram(startIso, endIso, column, winSize);

            _spectrogramResult = resp.result;
            _spectrogramSampleCount = resp.sample_count;
            await renderSpectrogramChart();
        } catch (e: any) {
            _spectrogramResult = null;
            syncSpectrogramEmptyState('Spectrogram generation failed. Choose a column and try again.');
            if (statusEl) statusEl.textContent = `Error: ${e?.message || 'failed'}`;
        } finally {
            setComputeLoading('spectrogram-compute-btn', 'spectrogram-loading', false);
        }
    });

    logCheck?.addEventListener('change', () => {
        if (_spectrogramResult) void renderSpectrogramChart();
    });
    resetZoomBtn?.addEventListener('click', () => {
        if (!_spectrogramChart) return;
        _spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        _spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    });

    // Export buttons
    document.getElementById('spectrogram-export-png-btn')?.addEventListener('click', () => {
        exportEChartsPNG(_spectrogramChart, 'edatime_spectrogram.png');
    });
    document.getElementById('spectrogram-export-svg-btn')?.addEventListener('click', () => {
        exportEChartsSVG(_spectrogramChart, 'edatime_spectrogram.svg');
    });
    document.getElementById('spectrogram-export-html-btn')?.addEventListener('click', () => {
        exportEChartsHTML(_spectrogramChart, 'edatime_spectrogram.html');
    });

    window.addEventListener('edatime:page-change', (e: any) => {
        if (e?.detail?.page === 'spectrogram' && appState.metadata) {
            // Refresh column list if metadata changed
            const currentOpts = new Set(Array.from(colSelect.options).map(o => o.value));
            for (const col of appState.metadata.numeric_columns) {
                if (!currentOpts.has(col)) {
                    const opt = document.createElement('option');
                    opt.value = col;
                    opt.textContent = col;
                    colSelect.appendChild(opt);
                }
            }
            _spectrogramChart?.resize?.();
        }
    });
}

async function initCausalPage(): Promise<void> {
    const { initCausalPage: init } = await import('./causal/causalPage.js');
    init({
        getMetadata: () => appState.metadata,
        chipColor: _fftColorFor,
        numericColumns: _fftColumns,
        setLoading: setComputeLoading,
    });
}

/* ── Outlier removal modal ────────────────────────────── */

function initOutlierModal(): void {
    const openBtn = document.getElementById('outlier-open-btn');
    const applyBtn = document.getElementById('outlier-apply-btn');
    const methodSelect = document.getElementById('outlier-method') as HTMLSelectElement | null;
    const thresholdInput = document.getElementById('outlier-threshold') as HTMLInputElement | null;
    const windowInput = document.getElementById('outlier-window') as HTMLInputElement | null;
    const errorEl = document.getElementById('outlier-error') as HTMLElement | null;
    const resultEl = document.getElementById('outlier-result') as HTMLElement | null;

    const close = initModalClose('outlier-modal', 'outlier-close-btn', 'outlier-cancel-btn',
        () => { if (errorEl) errorEl.textContent = ''; if (resultEl) resultEl.textContent = ''; });
    if (!close) return;

    const modal = document.getElementById('outlier-modal')!;
    openBtn?.addEventListener('click', () => { modal.hidden = false; });

    // Update default threshold when method changes
    methodSelect?.addEventListener('change', () => {
        if (thresholdInput) {
            thresholdInput.value = methodSelect.value === 'iqr' ? '1.5' : '3';
        }
    });

    applyBtn?.addEventListener('click', async () => {
        if (errorEl) errorEl.textContent = '';
        if (resultEl) resultEl.textContent = '';

        const method = methodSelect?.value || 'zscore';
        const threshold = parseFloat(thresholdInput?.value || '3');
        const windowSize = parseInt(windowInput?.value || '0', 10);
        const cols = appState.selectedCols.length > 0 ? appState.selectedCols : null;

        try {
            (applyBtn as HTMLButtonElement).disabled = true;
            applyBtn.textContent = 'Removing…';

            const { postRemoveOutliers } = await import('./dataClient.js');
            const result = await postRemoveOutliers(
                cols,
                method,
                threshold,
                windowSize > 0 ? windowSize : undefined,
            );

            if (resultEl) resultEl.textContent = `Removed ${result.rows_removed} rows (${result.rows_before} → ${result.rows_after})`;

            // Reload metadata and data
            if (fetchMetadata) {
                appState.metadata = await fetchMetadata();
                appState.numericCols = ((appState.metadata as any).numeric_columns || [])
                    .filter((col: string) => col && col.toLowerCase() !== 'ts');
                sanitizeSelectedColumns();
                buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
                buildMetaBar(appState.metadata);
                await fetchAndRender();
            }
        } catch (e: any) {
            if (errorEl) errorEl.textContent = e?.message || 'Outlier removal failed.';
        } finally {
            (applyBtn as HTMLButtonElement).disabled = false;
            applyBtn.textContent = 'Remove Outliers';
        }
    });
}

/* ── Time distribution modal ──────────────────────────── */

function initTimeDistributionModal(): void {
    const computeBtn = document.getElementById('timedist-compute-btn');
    const windowsInput = document.getElementById('timedist-windows') as HTMLInputElement | null;
    const binsInput = document.getElementById('timedist-bins') as HTMLInputElement | null;
    const canvas = document.getElementById('timedist-canvas') as HTMLCanvasElement | null;
    const statusEl = document.getElementById('timedist-status') as HTMLElement | null;

    const close = initModalClose('timedist-modal', 'timedist-close-btn', 'timedist-cancel-btn');
    if (!close || !canvas) return;

    const modal = document.getElementById('timedist-modal')!;
    const openBtn = document.getElementById('timedist-open-btn');
    openBtn?.addEventListener('click', () => { modal.hidden = false; });

    computeBtn?.addEventListener('click', async () => {
        if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
        const cols = appState.selectedCols.length > 0 ? appState.selectedCols[0] : null;
        if (!cols) { if (statusEl) statusEl.textContent = 'Select a column first.'; return; }

        const windows = parseInt(windowsInput?.value || '20', 10);
        const bins = parseInt(binsInput?.value || '24', 10);

        try {
            (computeBtn as HTMLButtonElement).disabled = true;
            computeBtn.textContent = 'Computing…';
            if (statusEl) statusEl.textContent = 'Fetching data…';

            const { fetchTimeDistributions } = await import('./dataClient.js');
            const startIso = new Date(appState.currentStart!).toISOString();
            const endIso = new Date(appState.currentEnd!).toISOString();
            const result = await fetchTimeDistributions(startIso, endIso, cols, windows, bins);

            if (result.columns.length === 0) {
                if (statusEl) statusEl.textContent = 'No data returned.';
                return;
            }

            renderTimeDistBoxPlots(canvas, result.columns[0], windows, bins);
            if (statusEl) statusEl.textContent = `${cols}: ${result.columns[0].windows.length} windows × ${bins} bins (box plot)`;
        } catch (e: any) {
            if (statusEl) statusEl.textContent = `Error: ${e?.message || 'failed'}`;
        } finally {
            (computeBtn as HTMLButtonElement).disabled = false;
            computeBtn.textContent = 'Compute';
        }
    });
}

function renderTimeDistBoxPlots(
    canvas: HTMLCanvasElement,
    data: { windows: Array<{ window_start_ms: number; window_end_ms: number; bin_edges: number[]; counts: number[] }>; global_min: number; global_max: number },
    _nWindows: number,
    _nBins: number,
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wins = data.windows;
    if (wins.length === 0) return;

    const nW = wins.length;
    const W = canvas.width;
    const H = canvas.height;
    const marginL = 60;
    const marginB = 30;
    const marginT = 10;
    const marginR = 16;
    const plotW = W - marginL - marginR;
    const plotH = H - marginT - marginB;

    // Compute box plot stats per window from histogram counts
    const stats: Array<{ q1: number; median: number; q3: number; min: number; max: number; total: number }> = [];
    for (const w of wins) {
        const edges = w.bin_edges;
        const counts = w.counts;
        let total = 0;
        for (const c of counts) total += c;

        if (total === 0) {
            stats.push({ q1: 0, median: 0, q3: 0, min: 0, max: 0, total: 0 });
            continue;
        }

        // Build CDF to compute percentiles
        const percentile = (p: number): number => {
            const target = p * total;
            let cumul = 0;
            for (let i = 0; i < counts.length; i++) {
                cumul += counts[i];
                if (cumul >= target) {
                    const lo = edges[i], hi = edges[i + 1] ?? edges[i];
                    const frac = counts[i] > 0 ? (target - (cumul - counts[i])) / counts[i] : 0.5;
                    return lo + frac * (hi - lo);
                }
            }
            return edges[edges.length - 1] ?? 0;
        };

        // Find actual min/max (first/last non-zero bin)
        let minVal = edges[0] ?? 0;
        let maxVal = edges[edges.length - 1] ?? 0;
        for (let i = 0; i < counts.length; i++) {
            if (counts[i] > 0) { minVal = edges[i]; break; }
        }
        for (let i = counts.length - 1; i >= 0; i--) {
            if (counts[i] > 0) { maxVal = edges[i + 1] ?? edges[i]; break; }
        }

        const q1 = percentile(0.25);
        const median = percentile(0.5);
        const q3 = percentile(0.75);
        const iqr = q3 - q1;
        const whiskerLo = Math.max(minVal, q1 - 1.5 * iqr);
        const whiskerHi = Math.min(maxVal, q3 + 1.5 * iqr);

        stats.push({ q1, median, q3, min: whiskerLo, max: whiskerHi, total });
    }

    const gMin = data.global_min;
    const gMax = data.global_max;
    const gRange = gMax - gMin || 1;
    const toY = (v: number) => marginT + plotH - ((v - gMin) / gRange) * plotH;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--bg').trim() || '#0b0f18';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(120, 139, 174, 0.12)';
    ctx.lineWidth = 0.5;
    const ySteps = 6;
    for (let i = 0; i <= ySteps; i++) {
        const y = marginT + (plotH / ySteps) * i;
        ctx.beginPath();
        ctx.moveTo(marginL, y);
        ctx.lineTo(W - marginR, y);
        ctx.stroke();
    }

    const boxGap = 2;
    const slotW = plotW / nW;
    const boxW = Math.max(4, slotW - boxGap * 2);

    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#00a8ff';

    for (let i = 0; i < nW; i++) {
        const s = stats[i];
        if (s.total === 0) continue;

        const cx = marginL + slotW * i + slotW / 2;
        const halfBox = boxW / 2;

        // Whisker line
        ctx.strokeStyle = 'rgba(120, 139, 174, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, toY(s.min));
        ctx.lineTo(cx, toY(s.max));
        ctx.stroke();

        // Whisker caps
        const capW = boxW * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - capW, toY(s.min));
        ctx.lineTo(cx + capW, toY(s.min));
        ctx.moveTo(cx - capW, toY(s.max));
        ctx.lineTo(cx + capW, toY(s.max));
        ctx.stroke();

        // Box (Q1 to Q3)
        const boxTop = toY(s.q3);
        const boxBot = toY(s.q1);
        ctx.fillStyle = accent + '33';
        ctx.fillRect(cx - halfBox, boxTop, boxW, boxBot - boxTop);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cx - halfBox, boxTop, boxW, boxBot - boxTop);

        // Median line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const medY = toY(s.median);
        ctx.moveTo(cx - halfBox, medY);
        ctx.lineTo(cx + halfBox, medY);
        ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#788BAE';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
        const frac = i / ySteps;
        const val = gMin + frac * gRange;
        const y = marginT + plotH - frac * plotH;
        ctx.fillText(val.toFixed(1), marginL - 4, y + 3);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    const xSteps = Math.min(5, nW);
    for (let i = 0; i <= xSteps; i++) {
        const idx = Math.round(i / xSteps * (nW - 1));
        const t = wins[idx].window_start_ms;
        const date = new Date(t);
        const label = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        ctx.fillText(label, marginL + idx * slotW + slotW / 2, H - 6);
    }
}

/* ── Theme toggle ─────────────────────────────────────── */

function initThemeToggle(): void {
    const btn = document.getElementById('theme-toggle-btn');
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (!btn) return;

    const saved = localStorage.getItem('edatime-theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (iconDark) iconDark.hidden = true;
        if (iconLight) iconLight.hidden = false;
    }

    btn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('edatime-theme', 'dark');
            if (iconDark) iconDark.hidden = false;
            if (iconLight) iconLight.hidden = true;
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('edatime-theme', 'light');
            if (iconDark) iconDark.hidden = true;
            if (iconLight) iconLight.hidden = false;
        }
    });
}

/* ── Main init ────────────────────────────────────────── */

async function init(): Promise<void> {
    initPages();
    initHashRouting();
    initThemeToggle();
    // Homepage navigation cards
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((el) => {
        el.addEventListener('click', () => {
            const target = el.dataset.homeNav;
            if (target) showPage(target);
        });
    });
    initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid);
    initColumnProfilesGrid();
    initAnalysisControls(fetchAndRender);
    initColumnFilterModal(renderCurrentData, updateAnalysisYRange);
    initChartPageFilterGesture();
    initKeyboardShortcuts();
    initCommandPalette();
    initProvenance();
    registerCommands([
        // Navigation
        { id: 'nav-upload', label: 'Go to Upload', shortcut: 'Alt+1', category: 'Navigation', action: () => showPage('upload') },
        { id: 'nav-timeseries', label: 'Go to Timeseries', shortcut: 'Alt+2', category: 'Navigation', action: () => showPage('timeseries') },
        { id: 'nav-scatter', label: 'Go to Scatter', shortcut: 'Alt+3', category: 'Navigation', action: () => showPage('scatter') },
        { id: 'nav-matrix', label: 'Go to Scatter Matrix', shortcut: 'Alt+4', category: 'Navigation', action: () => showPage('scattermatrix') },
        { id: 'nav-dist', label: 'Go to Distributions', shortcut: 'Alt+5', category: 'Navigation', action: () => showPage('distributions') },
        { id: 'nav-fft', label: 'Go to FFT / PSD', shortcut: 'Alt+6', category: 'Navigation', action: () => showPage('fft') },
        { id: 'nav-heatmap', label: 'Go to Heatmap', shortcut: 'Alt+7', category: 'Navigation', action: () => showPage('heatmap') },
        { id: 'nav-spectrogram', label: 'Go to Spectrogram', shortcut: 'Alt+8', category: 'Navigation', action: () => showPage('spectrogram') },
        { id: 'nav-causal', label: 'Go to Causal', shortcut: 'Alt+9', category: 'Navigation', action: () => showPage('causal') },
        // Chart
        { id: 'chart-reset', label: 'Reset zoom', shortcut: 'Shift+R', category: 'Chart', action: () => resetZoom(fetchAndRender) },
        { id: 'chart-zoomout', label: 'Zoom out one level', shortcut: 'Shift+Z', category: 'Chart', action: () => zoomOut(fetchAndRender) },
        { id: 'chart-clear-af', label: 'Clear adaptive filters', shortcut: 'Shift+C', category: 'Chart', action: () => document.getElementById('adaptive-clear-btn')?.click?.() },
        // Export
        { id: 'export-csv', label: 'Export chart data as CSV', shortcut: 'Shift+E', category: 'Export', action: () => (window as any).__edatime?.exportChartFilteredData?.('csv') },
        { id: 'export-json', label: 'Export chart data as JSON', category: 'Export', action: () => (window as any).__edatime?.exportChartFilteredData?.('json') },
        { id: 'export-png', label: 'Export chart as PNG', category: 'Export', action: () => appState.chart?.exportPNG?.() },
        { id: 'export-parquet', label: 'Export filtered data as Parquet', category: 'Export', action: () => document.getElementById('export-parquet-btn')?.click?.() },
        // Session
        { id: 'session-save', label: 'Export session to file', category: 'Session', action: exportSessionToFile },
        { id: 'session-load', label: 'Import session from file', category: 'Session', action: importSessionFromFile },
        // Analysis
        { id: 'provenance', label: 'Show analysis context panel', shortcut: 'Ctrl+I', category: 'Analysis', action: toggleProvenance },
        { id: 'cmd-palette', label: 'Open command palette', shortcut: 'Ctrl+K', category: 'Analysis', action: openPalette },
    ]);
    initTransformModal();
    initOutlierModal();
    initTimeDistributionModal();
    initAnalyticsListeners();

    try { await ensureChartModules(); } catch (e: any) {
        console.error('Chart/data modules failed to load:', e);
        setMetaText('Chart modules failed to load, but upload is available.');
        return;
    }

    const gpuError = await checkWebGPU();

    const initOptionalPage = async (label: string, initializer: () => Promise<void> | void): Promise<void> => {
        try {
            await initializer();
        } catch (error: any) {
            console.error(`${label} failed to initialize:`, error);
        }
    };

    try {
        appState.metadata = await fetchMetadata!();
        dbgGroup('metadata', () => dbg(appState.metadata));
        setMetaText('Loading chart…');
        await initScatterPageModule();
        await initOptionalPage('FFT page', initFftPage);
        await initOptionalPage('Heatmap page', initHeatmapPage);
        await initOptionalPage('Spectrogram page', initSpectrogramPage);
        await initOptionalPage('Causal page', async () => { initCausalPage(); });

        if (!(appState.metadata as any).time_range) { setMetaText('No valid time range found.'); return; }

        appState.numericCols = ((appState.metadata as any).numeric_columns || [])
            .filter((col: string) => col && col.toLowerCase() !== 'ts');
        appState.selectedCols = [];
        appState.adaptiveFilterColumn = null;
        sanitizeSelectedColumns();

        // Column search filter (debounced to avoid thrashing DOM on fast typing)
        const columnFilterInput = document.getElementById('column-filter-input') as HTMLInputElement | null;
        if (columnFilterInput) {
            const onFilterInput = debounce(() => {
                appState.filterText = (columnFilterInput.value || '').trim().toLowerCase();
                buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
            }, 120);
            columnFilterInput.addEventListener('input', onFilterInput);
        }

        // Profile search filter (debounced)
        const profileFilterInput = document.getElementById('profile-filter-input') as HTMLInputElement | null;
        if (profileFilterInput) {
            const onProfileFilterInput = debounce(() => {
                appState.profileFilterText = (profileFilterInput.value || '').trim().toLowerCase();
                renderColumnProfilesGrid(true);
            }, 120);
            profileFilterInput.addEventListener('input', onProfileFilterInput);
        }

        hydrateColumnProfiles(appState.metadata);
        renderColumnProfilesGrid(true);
        applyPartialTimeRangeFromMetadata(appState.metadata, false);
        setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
        setProfileMode('dataset');

        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
        buildMetaBar(appState.metadata);
        buildRangeControls();

        appState.currentStart = Number((appState.metadata as any).time_range.min);
        appState.currentEnd = Number((appState.metadata as any).time_range.max);
        updateAnalysisZoom(appState.currentStart, appState.currentEnd, 'initial');
        emitChartRangeChange('initial');

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
        const savedSession = autoRestoreSession();
        if (savedSession) {
            applySession(savedSession);
            buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
            buildRangeControls();
            renderCurrentData();
            await fetchAndRender();
        }
        initAutoSave();

        // Expose session helpers for command palette / dev console
        (window as any).__edatime.exportSession = exportSessionToFile;
        (window as any).__edatime.importSession = importSessionFromFile;
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
