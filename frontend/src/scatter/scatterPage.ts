/**
 * Scatter analytics page — main entry, controls binding, and orchestration.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { defaultGpuPowerPreference, requestGpuAdapter } from '../utils/platform.js';
import { fetchScatterCorrelations, fetchScatterPoints } from '../dataClient.js';
import { appState } from '../state.js';
import { createEmptyStateController, isRangeOutsideDataset } from '../ui/emptyState.js';
import {
    getEl,
    fmt,
    showError,
    normalizeScatterSuggestionThreshold,
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
    getActiveScatterFilterColumns,
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
    renderScatterMatrixView,
    selectMatrixPair,
} from './matrix.js';

import type { DatasetMetadata } from '../types.js';

let scatterEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

function getScatterEmptyStateController() {
    if (!scatterEmptyStateController) {
        scatterEmptyStateController = createEmptyStateController({
            rootId: 'scatter-empty-state',
            titleId: 'scatter-empty-title',
            messageId: 'scatter-empty-message',
            resetButtonId: 'scatter-reset-range-btn',
            clearButtonId: 'scatter-clear-filters-btn',
            resetEventName: 'edatime:request-chart-range-reset',
            clearEventName: 'edatime:clear-all-filters',
            eventSource: 'scatter-empty-state',
        });
    }
    return scatterEmptyStateController;
}

function syncScatterEmptyState(message?: string): void {
    const emptyState = getScatterEmptyStateController();
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const hasAxes = !!xSelect?.value && !!ySelect?.value;
    syncScatterFilterBadge();

    const linkedRangeOutside = isLinkedBrushEnabled()
        && isRangeOutsideDataset(appState.metadata?.time_range, appState.currentStart, appState.currentEnd);

    // Determine the reason for the empty state so tests / users can distinguish
    let reason: string;
    if (_gpuUnavailable && !state.chart) {
        reason = 'gpu-unavailable';
    } else if (!hasAxes) {
        reason = 'no-columns-selected';
    } else if (state.totalPoints === 0) {
        reason = linkedRangeOutside ? 'linked-range-outside-dataset' : 'no-data-after-filters';
    } else {
        reason = '';
    }

    const controls = currentControls();
    const activeColumns = getActiveScatterFilterColumns({
        x: controls.x,
        y: controls.y,
        colorColumn: controls.selectedColorColumn,
    });
    const scopedFilterCount = new Set(activeColumns).size;
    const adaptiveFilterCount = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters.length : 0;

    const text = message
        || (_gpuUnavailable && !state.chart
            ? 'WebGPU is not available. Scatter rendering requires a WebGPU-capable browser (Chrome 113+, Edge 113+, Safari 18+).'
            : !hasAxes
                ? 'Choose X and Y numeric columns to render the scatter plot.'
                : linkedRangeOutside
                    ? 'Linked time range is outside the current dataset. Reset range to recover points.'
                    : (scopedFilterCount > 0 || adaptiveFilterCount > 0)
                        ? `No points match active filters (${scopedFilterCount} column, ${adaptiveFilterCount} adaptive).`
                        : 'No points match the current query.');

    emptyState.update({
        visible: !(hasAxes && state.totalPoints > 0 && !(_gpuUnavailable && !state.chart)),
        reason,
        title: _gpuUnavailable && !state.chart
            ? 'WebGPU unavailable'
            : !hasAxes
                ? 'Choose scatter axes'
                : linkedRangeOutside
                    ? 'Linked range outside dataset'
                    : 'No scatter points found',
        message: text,
        showResetAction: reason === 'linked-range-outside-dataset',
        showClearAction: reason === 'no-data-after-filters',
        fallbackText: text,
    });
}

function syncScatterFilterBadge(): void {
    const badge = getEl('scatter-active-filter-badge');
    if (!badge) return;
    const controls = currentControls();
    const cols = getActiveScatterFilterColumns({
        x: controls.x,
        y: controls.y,
        colorColumn: controls.selectedColorColumn,
    });
    const unique = Array.from(new Set(cols));
    if (unique.length === 0) {
        badge.hidden = true;
        badge.textContent = '';
        badge.removeAttribute('title');
        return;
    }
    badge.hidden = false;
    badge.textContent = `${unique.length} filter${unique.length === 1 ? '' : 's'} active`;
    badge.setAttribute('title', `Active scatter filters: ${unique.join(', ')}`);
}

/** Probe WebGPU once; cache result. */
async function isGPUAvailable(): Promise<boolean> {
    if (_gpuUnavailable !== null) return !_gpuUnavailable;
    if (!navigator.gpu) { _gpuUnavailable = true; return false; }
    try {
        const adapter = await Promise.race([
            requestGpuAdapter(),
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
    const navPage = viewName === 'matrix' ? 'scattermatrix' : 'scatter';
    for (const button of document.querySelectorAll('.sidebar .nav-item[data-page]')) {
        const page = (button as HTMLElement).dataset.page;
        const active = page === navPage;
        if (page === 'scatter' || page === 'scattermatrix') {
            button.classList.toggle('active', active);
        }
    }
}

function syncScatterViewButtons(viewName: string): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scatter-view]')) {
        const active = button.dataset.scatterView === viewName;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
}

async function setScatterView(viewName: string, options: { render?: boolean } = {}): Promise<void> {
    const nextView = viewName || 'plot';
    const shouldRender = options.render !== false;
    state.activeView = nextView;
    setSidebarAnalyticsSelection(nextView);
    syncScatterViewButtons(nextView);
    syncModeUI();

    for (const panel of document.querySelectorAll<HTMLElement>('[data-scatter-view-panel]')) {
        panel.hidden = panel.dataset.scatterViewPanel !== nextView;
    }

    if (!shouldRender) return;
    if (nextView === 'matrix') { await renderScatterMatrixView(onMatrixCellClick); return; }
    requestAnimationFrame(() => state.chart?.resize?.());
}

function refreshActiveScatterView(): Promise<void> {
    return setScatterView(state.activeView, { render: true });
}

/* ── Correlation / suggestion management ──────────────── */

function renderSuggestions(suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>): void {
    const box = getEl('scatter-suggestions');
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const contextEl = getEl('scatter-active-pair-label');
    if (!box) return;

    state.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
    box.innerHTML = '';

    if (contextEl) {
        const x = xSelect?.value || 'X';
        const y = ySelect?.value || 'Y';
        contextEl.textContent = `Inspecting ${x} vs ${y}`;
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'scatter-suggestion-empty';
        empty.textContent = `No suggestions above |corr| ≥ ${state.suggestionThreshold.toFixed(2)}.`;
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

    const response = await fetchScatterCorrelations(xSelect.value || null, state.suggestionThreshold);

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

function openScatterPairInCausal(): void {
    const xCol = (getEl('scatter-x-col') as HTMLSelectElement | null)?.value;
    const yCol = (getEl('scatter-y-col') as HTMLSelectElement | null)?.value;
    if (!xCol || !yCol) return;
    window.dispatchEvent(new CustomEvent('edatime:causal-preselect', {
        detail: { columns: [xCol, yCol] },
    }));
    document.querySelector<HTMLElement>('.sidebar .nav-item[data-page="causal"]')?.click?.();
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
            colorColumn,
            buildScatterQueryContext({ x: xSelect.value, y: ySelect.value, colorColumn: colorColumn || undefined }),
            _scatterAbort.signal,
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
            const chartOptions: Record<string, unknown> = { ...nextOption };
            const powerPreference = defaultGpuPowerPreference();
            if (powerPreference) chartOptions.powerPreference = powerPreference;
            state.chart = await createChart(container!, chartOptions as any);
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
    const suggestionThresholdInput = getEl('scatter-suggestion-threshold') as HTMLInputElement | null;
    const suggestionThresholdValue = getEl('scatter-suggestion-threshold-value');
    const suggestionThresholdLabel = getEl('scatter-suggestions-label');
    const openCausalBtn = getEl('scatter-open-causal-btn') as HTMLButtonElement | null;

    if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !colormapSelect || !normalizationSelect || !renderModeSelect) return;

    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.exportScatterData = exportScatterData;

    binSizeValue.textContent = binSizeInput.value;
    if (suggestionThresholdInput) {
        state.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
        suggestionThresholdInput.value = state.suggestionThreshold.toFixed(2);
    }
    if (suggestionThresholdValue) suggestionThresholdValue.textContent = state.suggestionThreshold.toFixed(2);
    if (suggestionThresholdLabel) suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${state.suggestionThreshold.toFixed(2)})`;
    syncModeUI();
    void setScatterView(state.activeView, { render: false });

    document.querySelectorAll<HTMLButtonElement>('[data-scatter-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const nextView = normalizeAnalyticsView(btn.dataset.scatterView || 'plot');
            void setScatterView(nextView);
        });
    });

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
    suggestionThresholdInput?.addEventListener('input', () => {
        state.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
        suggestionThresholdInput.value = state.suggestionThreshold.toFixed(2);
        if (suggestionThresholdValue) suggestionThresholdValue.textContent = state.suggestionThreshold.toFixed(2);
        if (suggestionThresholdLabel) {
            suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${state.suggestionThreshold.toFixed(2)})`;
        }
    });
    suggestionThresholdInput?.addEventListener('change', async () => {
        try {
            await refreshCorrelationsAndSuggestions();
        } catch (err: any) {
            handleErr(err);
        }
    });
    linkBrushInput?.addEventListener('change', async () => {
        try { await renderScatter(); } catch (err: any) { handleErr(err); }
    });
    openCausalBtn?.addEventListener('click', openScatterPairInCausal);

    getScatterEmptyStateController();

    // Matrix mode toggle buttons (replaces <select>)
    const matrixModeHidden = getEl('scatter-matrix-mode') as HTMLInputElement | null;
    const matrixSizeInput = getEl('scatter-matrix-cell-size') as HTMLInputElement | null;
    const matrixSizeValue = getEl('scatter-matrix-cell-size-value');
    document.querySelectorAll<HTMLButtonElement>('[data-matrix-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.matrixMode || 'scatter';
            if (matrixModeHidden) matrixModeHidden.value = mode;
            document.querySelectorAll<HTMLButtonElement>('[data-matrix-mode]').forEach((b) => {
                b.classList.toggle('active', b.dataset.matrixMode === mode);
                b.setAttribute('aria-pressed', b.dataset.matrixMode === mode ? 'true' : 'false');
            });
            void refreshActiveScatterView();
        });
    });
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
            syncScatterFilterBadge();
            if (!requireLinkedBrush || isLinkedBrushEnabled()) renderScatterDebounced();
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
    syncScatterFilterBadge();

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
