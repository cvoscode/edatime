/**
 * app.js — Slim orchestrator.
 *
 * All domain logic lives in focused modules:
 *   state.js        — centralised appState, format helpers, column-range filtering
 *   debug.js        — DEBUG flag, dbg(), dbgGroup()
 *   ui/columns.js   — column toggle chips, range chips, filter modal
 *   ui/upload.js    — upload panel (drag-drop, preview, partial load)
 *   ui/profile.js   — virtualised column-profile grid
 *   ui/toolbar.js   — analysis status, zoom/draw/export/label controls, pages
 *   charts/registry.js — pluggable chart-type registry
 *   charts/fallback.js — Canvas 2D fallback chart
 *   chart.js        — DataChart (ChartGPU WebGPU adapter)
 *   dataClient.js   — Arrow IPC fetch + aggregate fetch
 *   scatterPage.js  — full scatter page with plot/distributions/matrix views
 */

// ─── Imports ───────────────────────────────────────────────────────

import { DEBUG, dbg, dbgGroup } from './debug.js';
import {
    appState, SERIES_COLORS,
    setMetaText, buildMetaBar, sanitizeSelectedColumns,
    ensureRangeStateFromData, applyColumnRanges,
    formatAnalysisTime,
} from './state.js?v=2';

import { buildColumnToggles, buildRangeControls, initColumnFilterModal } from './ui/columns.js?v=7';
import { setUploadPreviewStatus, applyPartialTimeRangeFromMetadata, initUploadPanel } from './ui/upload.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid, initColumnProfilesGrid } from './ui/profile.js';
import {
    updateAnalysisZoom, updateAnalysisYRange,
    refreshZoomControlsState, getCurrentView, applyViewport,
    zoomOut, resetZoom,
    initAnalysisControls, bindAnalysisChartEvents,
    initChartPageFilterGesture, initPages,
} from './ui/toolbar.js?v=4';

import { registerChartType, getChartType } from './charts/registry.js';
import { FallbackChart } from './charts/fallback.js';

// ─── Lazy-loaded modules ────────────────────────────────────────────

let fetchMetadata = null;
let fetchData = null;
let DataChart = null;

async function ensureChartModules() {
    if (fetchMetadata && fetchData && DataChart) return;
    const [dataClient, chartModule] = await Promise.all([
        import('./dataClient.js?v=14'),
        import('./chart.js?v=48'),
    ]);
    fetchMetadata = dataClient.fetchMetadata;
    fetchData = dataClient.fetchData;
    DataChart = chartModule.DataChart;

    // Register built-in chart types
    registerChartType('line', {
        label: 'Line',
        create: (containerId, callbacks) => new DataChart(
            containerId,
            callbacks.onZoom,
            callbacks.onYRange,
            callbacks.onZoomOut,
        ),
    });
    registerChartType('fallback', {
        label: 'Fallback (Canvas 2D)',
        create: (containerId) => new FallbackChart(containerId),
    });
}

// ─── WebGPU guard ───────────────────────────────────────────────────────────

async function checkWebGPU() {
    if (!navigator.gpu)
        return 'WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.';
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('requestAdapter timed out')), 5000)
        );
        const adapter = await Promise.race([navigator.gpu.requestAdapter(), timeoutPromise]);
        if (!adapter)
            return 'No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.';
    } catch (e) {
        return `WebGPU adapter request failed: ${e.message}`;
    }
    return null;
}

function showFatalError(message) {
    const container = document.getElementById('main-chart');
    if (container)
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff4a6e;font-size:1rem;padding:2rem;text-align:center;">${message}</div>`;
    setMetaText('Error — rendering unavailable');
}

// ─── Debug snapshot (Y-axis) ────────────────────────────────────────────────

function computeRenderedYDebugSnapshot() {
    if (!appState.lastFetchedData) return null;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;
    const perSeries = [];

    for (const col of appState.selectedCols || []) {
        const seriesData = filtered.series?.[col];
        const yValues = seriesData ? seriesData.y : filtered.values?.[col];
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

        if (count > 0) {
            if (min < globalMin) globalMin = min;
            if (max > globalMax) globalMax = max;
        }

        perSeries.push({
            name: col,
            points: count,
            yMin: count > 0 ? min : null,
            yMax: count > 0 ? max : null,
        });
    }

    return {
        selectedCols: [...(appState.selectedCols || [])],
        globalYMin: Number.isFinite(globalMin) ? globalMin : null,
        globalYMax: Number.isFinite(globalMax) ? globalMax : null,
        perSeries,
    };
}

// ─── Core data pipeline ────────────────────────────────────────────────

function renderCurrentData() {
    if (!appState.chart || !appState.lastFetchedData) return;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    appState.chart.updateDataMulti(filtered, appState.selectedCols);
}

function emitAdaptiveFiltersChange() {
    window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change', {
        detail: {
            count: (appState.adaptiveLineFilters || []).length,
        },
    }));
}

function buildAdaptiveFilterFromPoints(column, firstPoint, secondPoint) {
    if (!column || !firstPoint || !secondPoint) return null;
    if (!appState.lastFetchedData) return null;

    const filtered = applyColumnRanges(appState.lastFetchedData);
    const series = filtered.series?.[column];
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
    const slope = (y2 - y1) / (x2 - x1);
    let above = 0;
    let below = 0;

    for (let idx = 0; idx < xs.length; idx++) {
        const x = Number(xs[idx]);
        const y = Number(ys[idx]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
        const lineY = y1 + (x - x1) * slope;
        if (!Number.isFinite(lineY)) continue;
        if (y >= lineY) above += 1;
        else below += 1;
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

function applyAdaptiveFiltersLocally(sourceKind = 'adaptive') {
    buildRangeControls();
    renderCurrentData();
    appState.chart?.requestOverlayRender?.();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, sourceKind);
    emitAdaptiveFiltersChange();
}

function initAdaptiveFilterGesture() {
    const container = document.getElementById('main-chart');
    if (!container || container.dataset.adaptiveBound) return;

    container.addEventListener('click', (event) => {
        if (!event.ctrlKey || event.button !== 0) return;
        if (!appState.chart?.cssPointToData) return;
        const activeColumn = appState.selectedCols?.includes(appState.adaptiveFilterColumn)
            ? appState.adaptiveFilterColumn
            : appState.selectedCols?.[0];
        if (!activeColumn) return;

        const point = appState.chart.cssPointToData(event.clientX, event.clientY);
        if (!point) return;

        event.preventDefault();
        event.stopPropagation();

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

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            appState.pendingAdaptivePoint = null;
            appState.chart?.requestOverlayRender?.();
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Control' && appState.pendingAdaptivePoint) {
            appState.pendingAdaptivePoint = null;
            appState.chart?.requestOverlayRender?.();
        }
    });

    window.addEventListener('edatime:adaptive-filters-change', () => {
        if (!appState.lastFetchedData) return;
        buildRangeControls();
        renderCurrentData();
        appState.chart?.requestOverlayRender?.();
        appState.chart?.fitYToData?.();
        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'adaptive');
    });

    container.dataset.adaptiveBound = '1';
}

function emitChartRangeChange(sourceKind = 'data') {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    window.dispatchEvent(new CustomEvent('edatime:chart-range-change', {
        detail: {
            start: appState.currentStart,
            end: appState.currentEnd,
            source: sourceKind,
        },
    }));
}

async function fetchAndRender() {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    if (appState.currentStart >= appState.currentEnd) return;
    try {
        sanitizeSelectedColumns();
        const startIso = new Date(appState.currentStart).toISOString();
        const endIso   = new Date(appState.currentEnd).toISOString();
        const width    = document.getElementById('main-chart').clientWidth || 1200;
        const cols     = appState.selectedCols.join(',');

        dbgGroup('fetchAndRender', () => {
            dbg('request', { startIso, endIso, width, cols });
            dbg('selectedCols', appState.selectedCols);
        });

        const data = await fetchData(startIso, endIso, width, cols);
        appState.lastFetchedData = data;

        if (DEBUG) {
            const n = data?.ts?.length ?? 0;
            let tsMin = null;
            let tsMax = null;
            if (n > 0) { tsMin = data.ts[0]; tsMax = data.ts[n - 1]; }
            dbg('response points', n, 'tsMin/tsMax', tsMin, tsMax);
            if (!data?.ts || data.ts.length === 0) {
                console.warn('[edatime] fetchAndRender: empty result for range', { startIso, endIso, width, cols });
            }
        }

        ensureRangeStateFromData(data);
        buildRangeControls();
        appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
        renderCurrentData();
        emitChartRangeChange('data');

        if (DEBUG) {
            const snapshot = computeRenderedYDebugSnapshot();
            window.__edatime.debugYSnapshot = snapshot;
            dbg('post-render renderedSnapshot', snapshot);
        }

        const yr = appState.chart?.getYRange?.();
        if (yr) updateAnalysisYRange(yr.min, yr.max, 'data');

        if (DEBUG) dbg('post-render yRange', yr);

        appState.pendingYMode = null;
        appState.pendingRestoreY = null;
    } catch (err) {
        console.error('Failed to fetch data:', err);
        setMetaText('Error: ' + err.message);
    }
}

// ─── Zoom handler (called from drag-select in chart.js) ─────────────────────

function onZoomRangeChange(newStart, newEnd, sourceKind = 'user') {
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
    appState.currentEnd   = newEnd;
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
    appState.pendingYMode = 'fit';
    appState.pendingRestoreY = null;

    updateAnalysisZoom(newStart, newEnd, sourceKind);
    emitChartRangeChange(sourceKind);
    if (!appState.refetchOnZoom) return;
    appState.fetchDebounceId = setTimeout(fetchAndRender, 150);
}

function isTypingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tagName = String(target.tagName || '').toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function currentPageName() {
    return document.querySelector('.page[data-page-name]:not([hidden])')?.dataset?.pageName || 'timeseries';
}

function showPage(pageName) {
    document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`)?.click?.();
}

function initKeyboardShortcuts() {
    if (window.__edatime?.keyboardShortcutsBound) return;
    window.__edatime = window.__edatime || {};

    window.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;

        const key = String(event.key || '').toLowerCase();
        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            if (key === '1') {
                event.preventDefault();
                showPage('upload');
                return;
            }
            if (key === '2') {
                event.preventDefault();
                showPage('timeseries');
                return;
            }
            if (key === '3') {
                event.preventDefault();
                showPage('scatter');
                return;
            }
            if (key === '4') {
                event.preventDefault();
                showPage('scattermatrix');
                return;
            }
            if (key === '5') {
                event.preventDefault();
                showPage('distributions');
                return;
            }
        }

        if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

        if (key === 'r' && currentPageName() === 'timeseries') {
            event.preventDefault();
            resetZoom(fetchAndRender);
            return;
        }
        if (key === 'z' && currentPageName() === 'timeseries') {
            event.preventDefault();
            zoomOut(fetchAndRender);
            return;
        }
        if (key === 'c' && currentPageName() === 'timeseries') {
            event.preventDefault();
            document.getElementById('adaptive-clear-btn')?.click?.();
            return;
        }
        if (key === 'e') {
            event.preventDefault();
            if (currentPageName() === 'scatter') {
                document.getElementById('scatter-export-csv-btn')?.click?.();
            } else {
                window.__edatime?.exportChartFilteredData?.('csv');
            }
        }
    });

    window.__edatime.keyboardShortcutsBound = true;
}

// ─── Scatter page init ────────────────────────────────────────────────────────

async function initScatterPageModule() {
    const scatterPage = document.getElementById('page-scatter');
    if (!scatterPage) return null;

    const scatterPageModule = await import('./scatterPage.js?v=24');
    const { initScatterPage } = scatterPageModule;

    const metadata = appState.metadata;
    return initScatterPage(metadata);
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
    // UI init (works regardless of WebGPU)
    initPages();
    initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid);
    initColumnProfilesGrid();
    initAnalysisControls(fetchAndRender);
    initColumnFilterModal(renderCurrentData, updateAnalysisYRange);
    initChartPageFilterGesture();
    initKeyboardShortcuts();

    try {
        await ensureChartModules();
    } catch (e) {
        console.error('Chart/data modules failed to load:', e);
        setMetaText('Chart modules failed to load, but upload is available.');
        return;
    }

    const gpuError = await checkWebGPU();
    if (gpuError) { showFatalError(gpuError); return; }

    try {
        appState.metadata = await fetchMetadata();
        dbgGroup('metadata', () => dbg(appState.metadata));
        setMetaText('Loading chart…');

        await initScatterPageModule();

        if (!appState.metadata.time_range) {
            setMetaText('No valid time range found.');
            return;
        }

        appState.numericCols = (appState.metadata.numeric_columns || [])
            .filter((col) => col && col.toLowerCase() !== 'ts');
        appState.selectedCols = appState.numericCols.length > 0 ? [appState.numericCols[0]] : ['value'];
        appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
        sanitizeSelectedColumns();

        // Column search filter
        const columnFilterInput = document.getElementById('column-filter-input');
        if (columnFilterInput) {
            columnFilterInput.addEventListener('input', (e) => {
                appState.filterText = (e.target.value || '').trim().toLowerCase();
                buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
            });
        }

        // Profile search filter
        const profileFilterInput = document.getElementById('profile-filter-input');
        if (profileFilterInput) {
            profileFilterInput.addEventListener('input', (e) => {
                appState.profileFilterText = (e.target.value || '').trim().toLowerCase();
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

        appState.currentStart = Number(appState.metadata.time_range.min);
        appState.currentEnd   = Number(appState.metadata.time_range.max);
        updateAnalysisZoom(appState.currentStart, appState.currentEnd, 'initial');
        emitChartRangeChange('initial');

        dbg('initial X range (ms)', { start: appState.currentStart, end: appState.currentEnd });

        // Create chart instance via registry (or direct constructor)
        const lineType = getChartType('line');
        if (lineType) {
            appState.chart = lineType.create('main-chart', {
                onZoom: onZoomRangeChange,
                onYRange: updateAnalysisYRange,
                onZoomOut: () => zoomOut(fetchAndRender),
            });
        } else {
            appState.chart = new DataChart('main-chart', onZoomRangeChange, updateAnalysisYRange, () => zoomOut(fetchAndRender));
        }

        await Promise.race([
            appState.chart.init(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000)),
        ]);

        appState.analysisBound = false;
        bindAnalysisChartEvents();
        initAdaptiveFilterGesture();
        refreshZoomControlsState();
        appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
        appState.chart?.setChartText?.(
            appState.chartText?.title || '',
            appState.chartText?.xLabel || '',
            appState.chartText?.yLabel || '',
        );

        await fetchAndRender();
        appState.initialView = getCurrentView();
        dbgGroup('initialView snapshot', () => dbg(appState.initialView));

    } catch (e) {
        console.error('Primary chart failed, switching to fallback:', e);
        try {
            const fallbackType = getChartType('fallback');
            appState.chart = fallbackType
                ? fallbackType.create('main-chart', {})
                : new FallbackChart('main-chart');
            await appState.chart.init();
            appState.analysisBound = false;
            bindAnalysisChartEvents();
            refreshZoomControlsState();
            await fetchAndRender();
            setMetaText('Fallback renderer active');
        } catch (fallbackErr) {
            console.error('Fallback chart also failed:', fallbackErr);
            setMetaText('Error: ' + fallbackErr.message);
        }
    }
}

init();