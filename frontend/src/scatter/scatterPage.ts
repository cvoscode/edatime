/**
 * Scatter analytics page — main entry, controls binding, and orchestration.
 *
 * Delegates to:
 *   runtime.ts          — page runtime, empty-state, filter badge, GPU probe
 *   correlationsPanel.ts — suggestion rendering and correlation refresh
 *   controls.ts         — event listeners and control wiring
 *   viewController.ts   — active view management
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { defaultGpuPowerPreference } from '../utils/platform.js';
import { getDropdownValue } from '../ui/primitives/Dropdown.js';
import { EchartsScatterChart } from '../chart/EchartsScatterChart.js';
import { fetchScatterPoints } from '../services/api/index.js';
import { appState } from '../store/appStateCompat.js';
import {
    getEl,
    fmt,
    showError,
    normalizeScatterSuggestionThreshold,
} from './helpers.js';
import {
    currentControls,
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
    renderScatterMatrixView,
    selectMatrixPair,
} from './matrix.js';
import { createRequestTask } from '../pages/shared/requestTask.js';
import {
    initScatterPageRuntime,
    syncScatterEmptyState,
    syncScatterFilterBadge,
    isGPUAvailable,
    getGpuUnavailable,
    setGpuUnavailable,
} from './runtime.js';
import {
    renderSuggestions,
    refreshCorrelationsAndSuggestions,
} from './correlationsPanel.js';

import type { DatasetMetadata } from '../types.js';

/** Request task for scatter data fetching with abort-before-new semantics. */
const scatterTask = createRequestTask({
    setLoading: (loading: boolean) => {
        appState.scatter.loading = loading;
        const scatterLoading = getEl('scatter-chart-loading');
        if (scatterLoading) scatterLoading.hidden = !loading;
    },
    onError: (message: string) => {
        showError(message);
    },
});

/** Log + display an error. */
export function handleErr(err: unknown): void {
    console.error(err);
    showError(String((err as any)?.message ?? err));
}

// Re-export for use by controls.ts and viewController.ts
export { syncScatterFilterBadge };

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

/* ── Main render pipeline ─────────────────────────────── */

let _scatterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function renderScatterDebounced(): void {
    if (_scatterDebounceTimer) clearTimeout(_scatterDebounceTimer);
    _scatterDebounceTimer = setTimeout(() => { _scatterDebounceTimer = null; renderScatter(); }, 32);
}

async function renderScatter(): Promise<void> {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    let container = getEl('scatter-chart');
    const xValue = getDropdownValue('scatter-x-col');
    const yValue = getDropdownValue('scatter-y-col');

    if (!container || !xSelect || !ySelect || !xValue || !yValue) {
        appState.scatter.loading = false;
        appState.scatter.totalPoints = 0;
        syncScatterEmptyState();
        return;
    }

    showError('');
    const requestId = ++appState.scatter.scatterRequestId;
    syncScatterEmptyState();

    await scatterTask.run(async (signal) => {
        const ctl = currentControls();
        const renderSignature = buildRenderSignature(ctl);
        const colorColumn = ctl.selectedColorColumn || null;

        const response = await fetchScatterPoints(
            xValue, yValue, 1_000_000,
            colorColumn,
            buildScatterQueryContext({ x: xValue, y: yValue, colorColumn: colorColumn || undefined }),
            signal,
        );
        if (requestId !== appState.scatter.scatterRequestId) return;

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
            const gpuAvailable = await isGPUAvailable();
            if (!gpuAvailable) {
                setGpuUnavailable(true);
                const fallbackChart = new EchartsScatterChart('scatter-chart');
                await fallbackChart.init();
                appState.scatter.chart = fallbackChart as any;
            } else {
                setGpuUnavailable(false);
                const chartOptions: Record<string, unknown> = { ...nextOption };
                const powerPreference = defaultGpuPowerPreference();
                if (powerPreference) chartOptions.powerPreference = powerPreference;
                appState.scatter.chart = await createChart(container!, chartOptions as any);
            }
            const chart = appState.scatter.chart;
            if (!chart) return;
            appState.scatter.lastRenderSignature = renderSignature;
            chart.setOption(nextOption);
            initSelectionZoom(container!);
            chart.onPerformanceUpdate?.(() => {
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
    });
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

// Export for controls.ts and viewController.ts
export { renderScatter, rerenderScatterFromCache, refreshActiveScatterView, setScatterView, refreshCorrelationsAndSuggestions };

/* ── Matrix cell click handler ────────────────────────── */

async function onMatrixCellClick(x: string, y: string): Promise<void> {
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
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
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
        const selectedX = ensureOptions(xSelect, numeric, getDropdownValue('scatter-x-col') || numeric[0]);
        ensureOptions(ySelect, numeric.filter((c) => c !== selectedX), getDropdownValue('scatter-y-col') || numeric[1] || numeric[0]);
    }

    appState.scatter.loading = !appState.scatter.pageInitialized
        && !page.hidden
        && !!getDropdownValue('scatter-x-col')
        && !!getDropdownValue('scatter-y-col');
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

/** Bootstrap call — must happen BEFORE the first edatime:page-change 'scatter' event
 *  so that the runtime's event listener is registered before any page-change handlers
 *  that call initScatterPage. */
initScatterPageRuntime();
