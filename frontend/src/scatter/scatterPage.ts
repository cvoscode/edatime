/**
 * Scatter analytics page — main entry, controls binding, and orchestration.
 *
 * Delegates to:
 *   viewController.ts — active view management
 *   controls.ts        — event listeners and control wiring
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { defaultGpuPowerPreference, requestGpuAdapter } from '../utils/platform.js';
import { fetchScatterCorrelations, fetchScatterPoints } from '../services/api/index.js';
import { appState } from '../store/appStateCompat.js';
import { createEmptyStateController, isRangeOutsideDataset } from '../ui/emptyState.js';
import {
    getEl,
    fmt,
    showError,
    normalizeScatterSuggestionThreshold,
} from './helpers.js';
import {
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
import { createAnalysisPageRuntime } from '../pages/shared/analysisPageRuntime.js';

import type { DatasetMetadata } from '../types.js';

/** Module-level runtime handle for the scatter page lifecycle. */
let scatterRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;

/** Whether we've detected WebGPU is unavailable and should use fallback. */
let _gpuUnavailable: boolean | null = null;

/** Log + display an error. */
function handleErr(err: unknown): void {
    console.error(err);
    showError(String((err as any)?.message ?? err));
}

// Export render pipeline functions for use by viewController.ts and controls.ts
export { handleErr };
export { refreshCorrelationsAndSuggestions, renderScatter, renderScatterDebounced, rerenderScatterFromCache };
export { syncScatterFilterBadge };

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
    const isLoading = appState.scatter.loading && hasAxes && !(_gpuUnavailable && !appState.scatter.chart);
    syncScatterFilterBadge();

    const linkedRangeOutside = isLinkedBrushEnabled()
        && isRangeOutsideDataset(appState.metadata?.time_range, appState.currentStart, appState.currentEnd);

    // Determine the reason for the empty state so tests / users can distinguish
    let reason: string;
    if (_gpuUnavailable && !appState.scatter.chart) {
        reason = 'gpu-unavailable';
    } else if (!hasAxes) {
        reason = 'no-columns-selected';
    } else if (isLoading) {
        reason = 'loading';
    } else if (appState.scatter.totalPoints === 0) {
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
        || (_gpuUnavailable && !appState.scatter.chart
            ? 'WebGPU is not available. Scatter rendering requires a WebGPU-capable browser (Chrome 113+, Edge 113+, Safari 18+).'
            : !hasAxes
                ? 'Choose X and Y numeric columns to render the scatter plot.'
                : isLoading
                    ? 'Loading scatter points…'
                    : linkedRangeOutside
                        ? 'Linked time range is outside the current dataset. Reset range to recover points.'
                        : (scopedFilterCount > 0 || adaptiveFilterCount > 0)
                            ? `No points match active filters (${scopedFilterCount} column, ${adaptiveFilterCount} adaptive).`
                            : 'No points match the current query.');

    emptyState.update({
        visible: !isLoading && !(hasAxes && appState.scatter.totalPoints > 0 && !(_gpuUnavailable && !appState.scatter.chart)),
        reason,
        title: _gpuUnavailable && !appState.scatter.chart
            ? 'WebGPU unavailable'
            : !hasAxes
                ? 'Choose scatter axes'
                : isLoading
                    ? 'Loading scatter plot'
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
    appState.scatter.activeView = nextView;
    setSidebarAnalyticsSelection(nextView);
    syncScatterViewButtons(nextView);
    syncModeUI();

    for (const panel of document.querySelectorAll<HTMLElement>('[data-scatter-view-panel]')) {
        panel.hidden = panel.dataset.scatterViewPanel !== nextView;
    }

    if (!shouldRender) return;
    if (nextView === 'matrix') { await renderScatterMatrixView(onMatrixCellClick); return; }
    requestAnimationFrame(() => appState.scatter.chart?.resize?.());
}

function refreshActiveScatterView(): Promise<void> {
    return setScatterView(appState.scatter.activeView, { render: true });
}

/* ── Correlation / suggestion management ──────────────── */

function renderSuggestions(suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>): void {
    const box = getEl('scatter-suggestions');
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const contextEl = getEl('scatter-active-pair-label');
    if (!box) return;

    appState.scatter.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
    box.innerHTML = '';

    if (contextEl) {
        const x = xSelect?.value || 'X';
        const y = ySelect?.value || 'Y';
        contextEl.textContent = `Inspecting ${x} vs ${y}`;
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'scatter-suggestion-empty';
        empty.textContent = `No suggestions above |corr| ≥ ${appState.scatter.suggestionThreshold.toFixed(2)}.`;
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
            renderSuggestions(appState.scatter.lastSuggestions);
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

    // Guard: only fetch correlations if metadata is loaded with numeric columns
    const meta = appState.scatter.metadata as any;
    const numericCols = Array.isArray(meta?.numeric_columns) ? meta.numeric_columns : [];
    if (numericCols.length < 2) return;

    const response = await fetchScatterCorrelations(xSelect.value || null, appState.scatter.suggestionThreshold);

    const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
    if (numeric.length < 2) throw new Error('Need at least two numeric columns for scatter plotting.');

    ensureOptions(xSelect, numeric, xSelect.value || response.base_column || numeric[0]);
    const yCandidates = numeric.filter((c: string) => c !== xSelect.value);
    const selectedY = ensureOptions(ySelect, yCandidates, ySelect.value);

    if (colorSelect) {
        const colorOptions = [''].concat(
            ((appState.scatter.metadata as any)?.columns || [])
                .map((col: any) => String(col?.name || ''))
                .filter(Boolean),
        );
        const preferredColor = appState.scatter.colorColumn || colorSelect.value;
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

    appState.scatter.correlationsByColumn = new Map();
    for (const row of response.correlations || []) {
        appState.scatter.correlationsByColumn.set(row.column, row);
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
        appState.scatter.loading = false;
        appState.scatter.totalPoints = 0;
        syncScatterEmptyState();
        return;
    }

    // Cancel any in-flight request
    if (_scatterAbort) { _scatterAbort.abort(); _scatterAbort = null; }

    showError('');
    const scatterLoading = getEl('scatter-chart-loading');
    const requestId = ++appState.scatter.scatterRequestId;
    appState.scatter.loading = true;
    syncScatterEmptyState();
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
        if (requestId !== appState.scatter.scatterRequestId) return;
        _scatterAbort = null;

        const points: [number, number][] = Array.isArray(response.points) ? response.points : [];

        appState.scatter.totalPoints = Number(response.total_points ?? points.length);
        appState.scatter.allPoints = points;
        appState.scatter.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
        appState.scatter.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
        appState.scatter.colorColumn = response.color || '';
        applyScatterStateFromCache(true);

        if (appState.scatter.chart && appState.scatter.lastRenderSignature !== renderSignature) {
            disposeScatterChart();
            container = resetScatterContainer() || getEl('scatter-chart');
        }

        const nextOption = buildOption(appState.scatter.points, container);

        if (!appState.scatter.chart) {
            if (!(await isGPUAvailable())) {
                appState.scatter.totalPoints = points.length;
                syncScatterEmptyState();
                return;
            }
            const chartOptions: Record<string, unknown> = { ...nextOption };
            const powerPreference = defaultGpuPowerPreference();
            if (powerPreference) chartOptions.powerPreference = powerPreference;
            appState.scatter.chart = await createChart(container!, chartOptions as any);
            appState.scatter.lastRenderSignature = renderSignature;
            initSelectionZoom(container!);
            appState.scatter.chart.onPerformanceUpdate?.(() => {
                const now = performance.now();
                if (now - appState.scatter.lastUpdateMs < 100) return;
                appState.scatter.lastUpdateMs = now;
                updateBinnedReadout();
            });
        } else {
            appState.scatter.chart.setOption(nextOption);
            appState.scatter.lastRenderSignature = renderSignature;
            requestAnimationFrame(() => appState.scatter.chart?.resize?.());
        }

        updateColorbarUI();
        updateBinnedReadout();
        updateCorrelationStats();
        renderSuggestions(appState.scatter.lastSuggestions);
        updateMarginalPlots();
        await refreshActiveScatterView();
    } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (requestId !== appState.scatter.scatterRequestId) return;
        appState.scatter.totalPoints = 0;
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
        if (requestId === appState.scatter.scatterRequestId) {
            appState.scatter.loading = false;
            syncScatterEmptyState();
            if (scatterLoading) scatterLoading.hidden = true;
        }
    }
}

async function rerenderScatterFromCache(resetViewFlag = true): Promise<void> {
    if (Array.isArray(appState.scatter.allPoints) && appState.scatter.allPoints.length > 0) {
        applyScatterStateFromCache(resetViewFlag);
        if (appState.scatter.chart) renderCurrentOption();
        updateCorrelationStats();
        renderSuggestions(appState.scatter.lastSuggestions);
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

function bindControls(): Promise<void> {
    return import('./controls.js').then(({ bindScatterControls }) =>
        bindScatterControls({
            renderScatter,
            refreshCorrelationsAndSuggestions,
            refreshActiveScatterView,
            setScatterView,
            handleErr,
            rerenderScatterFromCache,
            renderScatterDebounced,
            syncScatterFilterBadge,
        }),
    );
}

/* ── Public init ──────────────────────────────────────── */

export async function initScatterPage(metadata: DatasetMetadata): Promise<void> {
    const page = getEl('page-scatter');
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    if (!page || !xSelect || !ySelect) return;

    const numeric: string[] = ((metadata as any)?.numeric_columns || []).filter((c: any) => c);
    appState.scatter.metadata = metadata;
    appState.scatter.columnTypes = new Map(
        ((metadata as any)?.columns || []).map((col: any) => [
            String(col?.name || '').toLowerCase(),
            String(col?.dtype || ''),
        ]),
    );

    if (numeric.length > 0) {
        ensureOptions(xSelect, numeric, xSelect.value || numeric[0]);
        ensureOptions(ySelect, numeric.filter((c) => c !== xSelect.value), ySelect.value || numeric[1] || numeric[0]);
    }

    appState.scatter.loading = !appState.scatter.pageInitialized && !page.hidden && !!xSelect.value && !!ySelect.value;
    syncScatterEmptyState();
    syncScatterFilterBadge();

    if (!appState.scatter.initialized) { await bindControls(); appState.scatter.initialized = true; }
    if (appState.scatter.pageInitialized) return;

    const isVisible = !page.hidden;
    if (!isVisible) return;

    try {
        await refreshCorrelationsAndSuggestions();
        await renderScatter();
        appState.scatter.pageInitialized = true;
    } catch (err: any) {
        handleErr(err);
    }
}

/** Wraps scatter page setup with the shared analysis page runtime. */
function initScatterPageRuntime(): void {
    scatterRuntime = createAnalysisPageRuntime({
        page: 'scatter',
        emptyStateRootId: 'scatter-empty-state',
        statusElId: 'scatter-status',
        bindExportsOnInit: false,
        exportConfig: {
            key: 'scatter',
            png: { fn: exportScatterPNG, filename: 'edatime_scatter.png' },
            svg: { fn: exportScatterSVG, filename: 'edatime_scatter.svg' },
            html: { fn: exportScatterHTML, filename: 'edatime_scatter.html' },
            csv: { fn: exportScatterData, filename: 'edatime_scatter.csv', dataCheck: () => appState.scatter.totalPoints > 0 },
        },
        init() {
            syncScatterEmptyState();
            syncScatterFilterBadge();
            // Deferred export binding — must happen after page state is established
            // so that the csv dataCheck captures live appState.scatter.totalPoints.
            scatterRuntime?.bindExports();
        },
        onEveryPageChange() {
            syncScatterEmptyState();
        },
    });
}

/** Bootstrap call — must happen BEFORE the first edatime:page-change 'scatter' event
 *  so that the runtime's event listener is registered before any page-change handlers
 *  that call initScatterPage. */
initScatterPageRuntime();
