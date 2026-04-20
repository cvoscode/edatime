/**
 * Scatter analytics page — main entry, controls binding, and orchestration.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { fetchScatterCorrelations, fetchScatterPoints } from '../dataClient.js';
import { appState } from '../state.js';
import {
    getEl,
    fmt,
    showError,
} from './helpers.js';

/** Whether we've detected WebGPU is unavailable and should use fallback. */
let _gpuUnavailable: boolean | null = null;

/** Log + display an error. */
function handleErr(err: unknown): void {
    console.error(err);
    showError(String((err as any)?.message ?? err));
}
import {
    state,
    currentControls,
    isLinkedBrushEnabled,
    buildScatterQueryContext,
    buildRenderSignature,
    applyScatterStateFromCache,
    disposeScatterChart,
    resetScatterContainer,
    normalizeAnalyticsView,
    ensureOptions,
    type ScatterControls,
} from './state.js';
import {
    buildOption,
    renderCurrentOption,
    updateColorbarUI,
    updateBinnedReadout,
    updateCorrelationStats,
    updateMarginalPlots,
    initSelectionZoom,
    syncModeUI,
    applyView,
    resetView,
    exportScatterPNG,
    exportScatterSVG,
    exportScatterHTML,
    exportScatterData,
    exportScatterParquet,
    setCorrelationOverlayText,
} from './rendering.js';
import {
    fetchAndRenderDistributions,
    renderDistributionCards,
} from './distributions.js';
import {
    renderScatterMatrixView,
    selectMatrixPair,
} from './matrix.js';

import type { DatasetMetadata } from '../types.js';

function syncScatterEmptyState(message?: string): void {
    const empty = getEl('scatter-empty-state');
    if (!empty) return;
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const hasAxes = !!xSelect?.value && !!ySelect?.value;

    // Determine the reason for the empty state so tests / users can distinguish
    let reason: string;
    if (_gpuUnavailable && !state.chart) {
        reason = 'gpu-unavailable';
    } else if (!hasAxes) {
        reason = 'no-columns-selected';
    } else if (state.totalPoints === 0) {
        reason = 'no-data-after-filters';
    } else {
        reason = '';
    }

    const text = message
        || (_gpuUnavailable && !state.chart
            ? 'WebGPU is not available. Scatter rendering requires a WebGPU-capable browser (Chrome 113+, Edge 113+, Safari 18+).'
            : !hasAxes
                ? 'Choose X and Y numeric columns to render the scatter plot.'
                : 'No points match the current filters or linked time range.');

    empty.textContent = text;
    empty.setAttribute('data-empty-reason', reason);
    empty.hidden = hasAxes && state.totalPoints > 0 && !(_gpuUnavailable && !state.chart);
}

/** Probe WebGPU once; cache result. */
async function isGPUAvailable(): Promise<boolean> {
    if (_gpuUnavailable !== null) return !_gpuUnavailable;
    if (!navigator.gpu) { _gpuUnavailable = true; return false; }
    try {
        const adapter = await Promise.race([
            navigator.gpu.requestAdapter(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        _gpuUnavailable = !adapter;
    } catch {
        _gpuUnavailable = true;
    }
    return !_gpuUnavailable;
}

/* ── Sidebar / view management ────────────────────────── */

function setSidebarAnalyticsSelection(viewName: string): void {
    const navPage = viewName === 'matrix' ? 'scattermatrix'
        : (viewName === 'distributions' ? 'distributions' : 'scatter');
    for (const button of document.querySelectorAll('.sidebar .nav-item[data-page]')) {
        const page = (button as HTMLElement).dataset.page;
        const active = page === navPage;
        if (page === 'scatter' || page === 'scattermatrix' || page === 'distributions') {
            button.classList.toggle('active', active);
        }
    }
}

async function setScatterView(viewName: string, options: { render?: boolean } = {}): Promise<void> {
    const nextView = viewName || 'plot';
    const shouldRender = options.render !== false;
    state.activeView = nextView;
    setSidebarAnalyticsSelection(nextView);
    syncModeUI();

    for (const panel of document.querySelectorAll<HTMLElement>('[data-scatter-view-panel]')) {
        panel.hidden = panel.dataset.scatterViewPanel !== nextView;
    }

    if (!shouldRender) return;
    if (nextView === 'matrix') { await renderScatterMatrixView(onMatrixCellClick); return; }
    if (nextView === 'distributions') { await fetchAndRenderDistributions(); return; }
    requestAnimationFrame(() => state.chart?.resize?.());
}

function refreshActiveScatterView(): Promise<void> {
    return setScatterView(state.activeView, { render: true });
}

/* ── Correlation / suggestion management ──────────────── */

function renderSuggestions(suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>): void {
    const box = getEl('scatter-suggestions');
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    if (!box) return;

    state.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
    box.innerHTML = '';

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'scatter-suggestion-empty';
        empty.textContent = 'No strong correlations above threshold.';
        box.appendChild(empty);
        return;
    }

    for (const item of suggestions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scatter-suggestion-btn';
        if (ySelect?.value === item.column) btn.classList.add('active');
        const r = Number.isFinite(item.pearson) ? item.pearson!.toFixed(2) : '—';
        const rho = Number.isFinite(item.spearman) ? item.spearman!.toFixed(2) : '—';
        btn.textContent = `${item.column}  Pearson ${r}  Spearman ${rho}`;
        btn.addEventListener('click', async () => {
            if (!ySelect || ySelect.value === item.column) return;
            ySelect.value = item.column;
            updateCorrelationStats();
            renderSuggestions(state.lastSuggestions);
            try { await renderScatter(); } catch (err: any) { handleErr(err); }
        });
        box.appendChild(btn);
    }
}

async function refreshCorrelationsAndSuggestions(): Promise<void> {
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const colorSelect = getEl('scatter-color-column') as HTMLSelectElement | null;
    if (!xSelect || !ySelect) return;

    const response = await fetchScatterCorrelations(xSelect.value || null, 0.7);

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) throw new Error('Need at least two numeric columns for scatter plotting.');

    ensureOptions(xSelect, numeric, xSelect.value || response.base_column || numeric[0]);
    const yCandidates = numeric.filter((c: string) => c !== xSelect.value);
    const selectedY = ensureOptions(ySelect, yCandidates, ySelect.value);

    if (colorSelect) {
        const colorOptions = [''].concat(
            ((state.metadata as any)?.columns || [])
                .map((col: any) => String(col?.name || ''))
                .filter(Boolean),
        );
        const preferredColor = state.colorColumn || colorSelect.value;
        colorSelect.innerHTML = '';
        for (const col of colorOptions) {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col || 'None';
            colorSelect.appendChild(opt);
        }
        if (colorOptions.includes(preferredColor)) colorSelect.value = preferredColor;
        else colorSelect.value = '';
    }

    state.correlationsByColumn = new Map();
    for (const row of response.correlations || []) {
        state.correlationsByColumn.set(row.column, row);
    }

    if (!selectedY && yCandidates.length > 0) ySelect.value = yCandidates[0];

    renderSuggestions(response.suggestions || []);
    updateCorrelationStats();
    updateColorbarUI();
}

/* ── Main render pipeline ─────────────────────────────── */

let _scatterAbort: AbortController | null = null;
let _scatterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function renderScatterDebounced(): void {
    if (_scatterDebounceTimer) clearTimeout(_scatterDebounceTimer);
    _scatterDebounceTimer = setTimeout(() => { _scatterDebounceTimer = null; renderScatter(); }, 32);
}

async function renderScatter(): Promise<void> {
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    let container = getEl('scatter-chart');

    if (!container || !xSelect || !ySelect || !xSelect.value || !ySelect.value) {
        state.totalPoints = 0;
        syncScatterEmptyState();
        return;
    }

    // Cancel any in-flight request
    if (_scatterAbort) { _scatterAbort.abort(); _scatterAbort = null; }

    showError('');
    const scatterLoading = getEl('scatter-chart-loading');
    if (scatterLoading) scatterLoading.hidden = false;
    try {
        const ctl = currentControls();
        const renderSignature = buildRenderSignature(ctl);
        const colorColumn = ctl.selectedColorColumn || null;

        _scatterAbort = new AbortController();
        const response = await fetchScatterPoints(
            xSelect.value, ySelect.value, 1_000_000,
            colorColumn, buildScatterQueryContext(), _scatterAbort.signal,
        );
        _scatterAbort = null;

        const points: [number, number][] = Array.isArray(response.points) ? response.points : [];

        state.totalPoints = Number(response.total_points ?? points.length);
        state.allPoints = points;
        state.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
        state.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
        state.colorColumn = response.color || '';
        applyScatterStateFromCache(true);
        syncScatterEmptyState();

        if (state.chart && state.lastRenderSignature !== renderSignature) {
            disposeScatterChart();
            container = resetScatterContainer() || getEl('scatter-chart');
        }

        const nextOption = buildOption(state.points, container);

        if (!state.chart) {
            if (!(await isGPUAvailable())) {
                state.totalPoints = points.length;
                syncScatterEmptyState();
                return;
            }
            state.chart = await createChart(container!, nextOption);
            state.lastRenderSignature = renderSignature;
            initSelectionZoom(container!);
            state.chart.onPerformanceUpdate?.(() => {
                const now = performance.now();
                if (now - state.lastUpdateMs < 100) return;
                state.lastUpdateMs = now;
                updateBinnedReadout();
            });
        } else {
            state.chart.setOption(nextOption);
            state.lastRenderSignature = renderSignature;
            requestAnimationFrame(() => state.chart?.resize?.());
        }

        updateColorbarUI();
        updateBinnedReadout();
        updateCorrelationStats();
        renderSuggestions(state.lastSuggestions);
        updateMarginalPlots();
        await refreshActiveScatterView();
    } catch (err: any) {
        if (err?.name === 'AbortError') return;
        state.totalPoints = 0;
        // Distinguish GPU init failure from data/filter issues
        const isGpuErr = /gpu|webgpu|adapter|device/i.test(String(err?.message || ''));
        if (isGpuErr) _gpuUnavailable = true;
        syncScatterEmptyState(
            isGpuErr
                ? 'WebGPU rendering failed. Scatter requires a GPU-capable browser.'
                : 'Scatter rendering is unavailable for the current query.',
        );
        throw err;
    } finally {
        if (scatterLoading) scatterLoading.hidden = true;
    }
}

async function rerenderScatterFromCache(resetViewFlag = true): Promise<void> {
    if (Array.isArray(state.allPoints) && state.allPoints.length > 0) {
        applyScatterStateFromCache(resetViewFlag);
        if (state.chart) renderCurrentOption();
        updateCorrelationStats();
        renderSuggestions(state.lastSuggestions);
    }
    syncScatterEmptyState();
    await refreshActiveScatterView();
}

/* ── Matrix cell click handler ────────────────────────── */

async function onMatrixCellClick(x: string, y: string): Promise<void> {
    // Show the spinner on the matrix panel (which is still visible at click time).
    const matrixLoading = getEl('scatter-matrix-loading');
    if (matrixLoading) matrixLoading.hidden = false;
    try {
        await selectMatrixPair(x, y, refreshCorrelationsAndSuggestions, renderScatter, setScatterView);
    } catch (error: any) {
        handleErr(error);
    } finally {
        if (matrixLoading) matrixLoading.hidden = true;
    }
}

/* ── Control binding ──────────────────────────────────── */

function bindControls(): void {
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const binSizeInput = getEl('scatter-bin-size') as HTMLInputElement | null;
    const binSizeValue = getEl('scatter-bin-size-value');
    const colormapSelect = getEl('scatter-colormap') as HTMLSelectElement | null;
    const normalizationSelect = getEl('scatter-normalization') as HTMLSelectElement | null;
    const renderModeSelect = getEl('scatter-render-mode') as HTMLSelectElement | null;
    const diagonalModeSelect = getEl('scatter-diagonal-mode') as HTMLSelectElement | null;
    const colorColumnSelect = getEl('scatter-color-column') as HTMLSelectElement | null;
    const colorScaleSelect = getEl('scatter-color-scale') as HTMLSelectElement | null;
    const linkBrushInput = getEl('scatter-link-brush') as HTMLInputElement | null;

    if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !colormapSelect || !normalizationSelect || !renderModeSelect) return;

    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.exportScatterData = exportScatterData;

    binSizeValue.textContent = binSizeInput.value;
    syncModeUI();
    void setScatterView(state.activeView, { render: false });

    const rerender = () => {
        const container = getEl('scatter-chart');
        if (!state.chart) return;
        state.chart.setOption(buildOption(state.points, container));
        updateColorbarUI();
        updateBinnedReadout();
    };

    binSizeInput.addEventListener('input', () => { binSizeValue!.textContent = binSizeInput.value; rerender(); });
    colormapSelect.addEventListener('change', rerender);
    normalizationSelect.addEventListener('change', rerender);
    renderModeSelect.addEventListener('change', () => { syncModeUI(); rerender(); });
    diagonalModeSelect?.addEventListener('change', () => { void refreshActiveScatterView(); });
    colorColumnSelect?.addEventListener('change', () => { void renderScatter(); });
    colorScaleSelect?.addEventListener('change', () => { rerender(); updateColorbarUI(); });
    linkBrushInput?.addEventListener('change', async () => {
        try { await renderScatter(); } catch (err: any) { handleErr(err); }
    });

    // Matrix mode and cell size controls
    const matrixModeSelect = getEl('scatter-matrix-mode') as HTMLSelectElement | null;
    const matrixSizeInput = getEl('scatter-matrix-cell-size') as HTMLInputElement | null;
    const matrixSizeValue = getEl('scatter-matrix-cell-size-value');
    matrixModeSelect?.addEventListener('change', () => { void refreshActiveScatterView(); });
    matrixSizeInput?.addEventListener('input', () => {
        if (matrixSizeValue) matrixSizeValue.textContent = matrixSizeInput.value;
        if (state.activeView === 'matrix') void refreshActiveScatterView();
    });

    // Export buttons
    getEl('scatter-export-png-btn')?.addEventListener('click', () => exportScatterPNG());
    getEl('scatter-export-svg-btn')?.addEventListener('click', () => exportScatterSVG());
    getEl('scatter-export-html-btn')?.addEventListener('click', () => exportScatterHTML());
    getEl('scatter-export-csv-btn')?.addEventListener('click', () => exportScatterData('csv'));
    getEl('scatter-export-json-btn')?.addEventListener('click', () => exportScatterData('json'));
    getEl('scatter-export-parquet-btn')?.addEventListener('click', async () => {
        try { await exportScatterParquet(); } catch (error: any) { handleErr(error); }
    });

    ySelect.addEventListener('change', async () => { updateCorrelationStats(); await renderScatter(); });
    xSelect.addEventListener('change', async () => { await refreshCorrelationsAndSuggestions(); await renderScatter(); });
    window.addEventListener('resize', () => { state.chart?.resize?.(); });

    const handleFilterEvent = async (requireLinkedBrush: boolean) => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            if (state.activeView === 'distributions') await fetchAndRenderDistributions();
            else if (!requireLinkedBrush || isLinkedBrushEnabled()) renderScatterDebounced();
        } catch (err: any) { handleErr(err); }
    };

    window.addEventListener('edatime:chart-range-change', () => handleFilterEvent(true));
    window.addEventListener('edatime:column-filters-change', () => handleFilterEvent(false));
    window.addEventListener('edatime:adaptive-filters-change', () => handleFilterEvent(false));

    window.addEventListener('edatime:page-change', async (ev: any) => {
        if (ev?.detail?.page !== 'scatter') return;
        state.activeView = normalizeAnalyticsView(ev?.detail?.analyticsView);
        await setScatterView(state.activeView, { render: false });
        if (!state.pageInitialized) {
            refreshCorrelationsAndSuggestions()
                .then(() => renderScatter())
                .then(() => { state.pageInitialized = true; })
                .catch((err: any) => { handleErr(err); });
        } else {
            try {
                if (isLinkedBrushEnabled() || Object.keys(appState.columnRanges || {}).length > 0 || (appState.adaptiveLineFilters || []).length > 0) {
                    await renderScatter();
                } else {
                    await rerenderScatterFromCache(true);
                }
            } catch (err: any) { handleErr(err); }
        }
        void refreshActiveScatterView();
    });
}

/* ── Public init ──────────────────────────────────────── */

export async function initScatterPage(metadata: DatasetMetadata): Promise<void> {
    const page = getEl('page-scatter');
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    if (!page || !xSelect || !ySelect) return;

    const numeric: string[] = ((metadata as any)?.numeric_columns || []).filter((c: any) => c);
    state.metadata = metadata;
    state.selectedDistributionColumn = '';
    state.columnTypes = new Map(
        ((metadata as any)?.columns || []).map((col: any) => [
            String(col?.name || '').toLowerCase(),
            String(col?.dtype || ''),
        ]),
    );

    if (numeric.length > 0) {
        ensureOptions(xSelect, numeric, xSelect.value || numeric[0]);
        ensureOptions(ySelect, numeric.filter((c) => c !== xSelect.value), ySelect.value || numeric[1] || numeric[0]);
    }

    syncScatterEmptyState();

    if (!state.initialized) { bindControls(); state.initialized = true; }
    if (state.pageInitialized) return;

    const isVisible = !page.hidden;
    if (!isVisible) return;

    try {
        await refreshCorrelationsAndSuggestions();
        await renderScatter();
        state.pageInitialized = true;
    } catch (err: any) {
        handleErr(err);
    }
}
