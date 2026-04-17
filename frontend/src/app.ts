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
    formatAnalysisTime,
} from './state.js';
import { buildColumnToggles, buildRangeControls, initColumnFilterModal } from './ui/columns.js';
import { setUploadPreviewStatus, applyPartialTimeRangeFromMetadata, initUploadPanel } from './ui/upload.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid } from './ui/profile.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView, applyViewport,
    zoomOut, resetZoom,
    initAnalysisControls, bindAnalysisChartEvents,
    initChartPageFilterGesture, initPages,
} from './ui/toolbar.js';
import { registerChartType, getChartType } from './charts/registry.js';
import { FallbackChart } from './charts/fallback.js';
import type { DatasetMetadata } from './types.js';
import type { FftTrace } from './chart/FftChart.js';

/* ── Lazy-loaded modules ──────────────────────────────── */

const _appCleanups: Array<() => void> = [];

/** Remove all global event listeners registered by the app. */
export function teardownApp(): void {
    for (const fn of _appCleanups) fn();
    _appCleanups.length = 0;
    appState.chart?.destroy?.();
}

let fetchMetadata: ((signal?: AbortSignal) => Promise<DatasetMetadata>) | null = null;
let fetchData: ((...args: any[]) => Promise<any>) | null = null;
let fetchRollingBands: ((...args: any[]) => Promise<any>) | null = null;
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
    fetchRollingBands = dataClient.fetchRollingBands;
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
    if (container)
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff4a6e;font-size:1rem;padding:2rem;text-align:center;">${message}</div>`;
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
    if (!appState.chart || !appState.lastFetchedData) return;
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

    container.addEventListener('click', (event) => {
        if (!event.ctrlKey || event.button !== 0) return;
        if (!appState.chart?.cssPointToData) return;
        const activeColumn = appState.selectedCols?.includes(appState.adaptiveFilterColumn!)
            ? appState.adaptiveFilterColumn!
            : appState.selectedCols?.[0];
        if (!activeColumn) return;
        const point = appState.chart.cssPointToData(event.clientX, event.clientY);
        if (!point) return;
        event.preventDefault(); event.stopPropagation();

        const pending = appState.pendingAdaptivePoint;
        if (!pending || pending.column !== activeColumn) {
            appState.pendingAdaptivePoint = { column: activeColumn, x: point.x, y: point.y };
            appState.chart?.requestOverlayRender?.();
            return;
        }

        const filter = buildAdaptiveFilterFromPoints(activeColumn, pending, point);
        appState.pendingAdaptivePoint = { column: activeColumn, x: point.x, y: point.y };
        if (!filter) return;
        appState.adaptiveLineFilters = [...(appState.adaptiveLineFilters || []), filter];
        applyAdaptiveFiltersLocally();
    }, true);

    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') { appState.pendingAdaptivePoint = null; appState.chart?.requestOverlayRender?.(); } };
    const onCtrlUp = (e: KeyboardEvent) => { if (e.key === 'Control' && appState.pendingAdaptivePoint) { appState.pendingAdaptivePoint = null; appState.chart?.requestOverlayRender?.(); } };
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
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    if (appState.currentStart! >= appState.currentEnd!) return;

    // Cancel any in-flight data fetch
    if (dataFetchController) dataFetchController.abort();
    dataFetchController = new AbortController();
    const signal = dataFetchController.signal;

    try {
        sanitizeSelectedColumns();
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
    appState.fetchDebounceId = setTimeout(fetchAndRender, 150) as unknown as number;
}

/* ── Keyboard shortcuts ───────────────────────────────── */

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function currentPageName(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement)?.dataset?.pageName || 'timeseries';
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
    const modal = document.getElementById('transform-modal') as HTMLElement | null;
    const closeBtn = document.getElementById('transform-close-btn');
    const cancelBtn = document.getElementById('transform-cancel-btn');
    const applyBtn = document.getElementById('transform-apply-btn');
    const exprInput = document.getElementById('transform-expression') as HTMLInputElement | null;
    const nameInput = document.getElementById('transform-output-name') as HTMLInputElement | null;
    const errorEl = document.getElementById('transform-error') as HTMLElement | null;

    if (!modal) return;

    const close = () => { modal.hidden = true; if (errorEl) errorEl.textContent = ''; };
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

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

function _fftUpdateZoomBtn(isZoomed?: boolean): void {
    const btn = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;
    if (btn) btn.hidden = !(isZoomed ?? _fftChart?.getIsZoomed() ?? false);
}

function _fftRerenderOrClear(): void {
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
    const allCols: string[] = ((appState.metadata as any).numeric_columns || [])
        .filter((c: string) => c.toLowerCase() !== 'ts');

    const existing = new Map<string, HTMLElement>();
    for (const el of bar.querySelectorAll<HTMLElement>('.fft-trace-chip')) {
        const col = (el as any).dataset.col as string;
        if (allCols.includes(col)) existing.set(col, el);
        else el.remove();
    }

    const zoomBtn = bar.querySelector('#fft-zoom-reset-btn');
    for (const col of allCols) {
        const activeIdx = _fftTraces.findIndex(t => t.column === col);
        const isActive = activeIdx >= 0;
        const color = isActive ? _FFT_CHIP_COLORS[activeIdx % _FFT_CHIP_COLORS.length] : '';
        let chip = existing.get(col) as HTMLButtonElement | undefined;
        if (!chip) {
            chip = document.createElement('button') as HTMLButtonElement;
            chip.className = 'fft-trace-chip';
            chip.type = 'button';
            (chip as any).dataset.col = col;
            chip.addEventListener('click', async (e) => {
                const c = (chip as any).dataset.col as string;
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
                }
            });
            bar.insertBefore(chip, zoomBtn || null);
        }
        chip.className = `fft-trace-chip${isActive ? ' active' : ''}`;
        chip.innerHTML = `<span class="fft-chip-dot" style="${isActive ? `background:${color}` : 'border:1px solid rgba(255,255,255,0.25)'}"></span>`
            + `<span class="fft-chip-label">${col}</span>`
            + (isActive ? '<span class="fft-chip-remove" aria-hidden="true">×</span>' : '');
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
    _fftTraces.push({ column: result.column, frequencies: result.frequencies, magnitudes: result.magnitudes, psd: result.psd });
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

    _fftRerenderOrClear();
}



/* ── Main init ────────────────────────────────────────── */

async function init(): Promise<void> {
    initPages();
    initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid);
    initColumnProfilesGrid();
    initAnalysisControls(fetchAndRender);
    initColumnFilterModal(renderCurrentData, updateAnalysisYRange);
    initChartPageFilterGesture();
    initKeyboardShortcuts();
    initTransformModal();
    initAnalyticsListeners();

    try { await ensureChartModules(); } catch (e: any) {
        console.error('Chart/data modules failed to load:', e);
        setMetaText('Chart modules failed to load, but upload is available.');
        return;
    }

    const gpuError = await checkWebGPU();
    if (gpuError) { showFatalError(gpuError); return; }

    try {
        appState.metadata = await fetchMetadata!();
        dbgGroup('metadata', () => dbg(appState.metadata));
        setMetaText('Loading chart…');
        await initScatterPageModule();
        await initFftPage();

        if (!(appState.metadata as any).time_range) { setMetaText('No valid time range found.'); return; }

        appState.numericCols = ((appState.metadata as any).numeric_columns || [])
            .filter((col: string) => col && col.toLowerCase() !== 'ts');
        appState.selectedCols = appState.numericCols.length > 0 ? [appState.numericCols[0]] : ['value'];
        appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
        sanitizeSelectedColumns();

        // Column search filter
        const columnFilterInput = document.getElementById('column-filter-input') as HTMLInputElement | null;
        if (columnFilterInput) {
            columnFilterInput.addEventListener('input', () => {
                appState.filterText = (columnFilterInput.value || '').trim().toLowerCase();
                buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
            });
        }

        // Profile search filter
        const profileFilterInput = document.getElementById('profile-filter-input') as HTMLInputElement | null;
        if (profileFilterInput) {
            profileFilterInput.addEventListener('input', () => {
                appState.profileFilterText = (profileFilterInput.value || '').trim().toLowerCase();
                renderColumnProfilesGrid(true);
            });
        }

        hydrateColumnProfiles(appState.metadata);
        renderColumnProfilesGrid(true);
        applyPartialTimeRangeFromMetadata(appState.metadata, false);
        setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');

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

        await fetchAndRender();
        appState.initialView = getCurrentView();
        dbgGroup('initialView snapshot', () => dbg(appState.initialView));
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
