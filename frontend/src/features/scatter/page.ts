/**
 * Scatter analytics page — main entry, controls binding, and orchestration.
 *
 * Delegates to:
 *   runtime.ts          — page runtime, empty-state, filter badge, GPU probe
 *   correlationsPanel.ts — suggestion rendering and correlation refresh
 *   controls.ts         — event listeners and control wiring
 *   viewController.ts   — active view management
 */

import { createChart } from '../../../libs/chartgpu/dist/index.js';
import { defaultGpuPowerPreference } from '../../utils/platform.js';
import { toast, dismissAllToasts } from '../../utils/toast.js';
import { getDropdownValue } from '../../ui/primitives/Dropdown.js';
import { EchartsScatterChart } from '../../chart/EchartsScatterChart.js';
import { fetchScatterPoints } from '../../services/api/index.js';
import { getScatterViewSnapshot, scatterState, setScatterViewSnapshot } from '../../store/scatterState.js';
import { setAdaptiveLineFilters, setColumnRanges, uiState } from '../../store/uiState.js';
import { initScatterHelp } from './help.js';
import { buildAdaptiveLineFiltersForQueryState } from '../../services/timeseries/filtering.js';
import {
    getEl,
    fmt,
    showError,
    normalizeScatterSuggestionThreshold,
} from './helpers.js';
import {
    currentControls,
    buildScatterQueryContext,
    buildOverviewContextKey,
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
import { initSelectionZoom } from './selectionZoom.js';
import {
    renderScatterMatrixView,
    selectMatrixPair,
} from './matrix.js';
import { createRequestTask } from '../../platform/requestTask.js';
import {
    initScatterToolbarOverflow,
    refreshScatterToolbarOverflow,
} from './toolbarOverflow.js';
import {
    initScatterPageRuntime,
    configureScatterRuntime,
    syncScatterEmptyState,
    syncScatterFilterBadge,
    isGPUAvailable,
    getGpuUnavailable,
    setGpuUnavailable,
} from './runtime.js';
import {
    renderSuggestions,
    refreshCorrelationsAndSuggestions,
    setSuggestionApplyHandler,
} from './correlationsPanel.js';
import { computeInteractiveScatterLimit } from './renderLimit.js';
import { setScatterRenderScheduler } from './renderScheduler.js';

import type { DatasetMetadata } from '../../types.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

let workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'> | null = null;

/** Request task for scatter data fetching with abort-before-new semantics. */
const scatterTask = createRequestTask({
    setLoading: (loading: boolean) => {
        scatterState.loading = loading;
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
    if (_scatterDebounceTimer) {
        clearTimeout(_scatterDebounceTimer);
        _scatterDebounceTimer = null;
    }
    // Dismiss any stale intra-page toast before switching views. The
    // empty-plot warning ("Active matrix filters hide all scatter
    // points…") is only relevant for the view it appeared on, and it
    // would otherwise follow the user between Plot ↔ Matrix.
    dismissAllToasts();

    // Independent filter scopes per view. Snapshot the current global
    // filters into the leaving view's slot, then restore the entering
    // view's snapshot into global state so each view keeps its own
    // filters when the user toggles back and forth. Globals are the
    // shared source for the scatter query context; the snapshot exists
    // only to remember what filters were staged while on the other view.
    const previousView = (scatterState.activeView === 'matrix' ? 'matrix' : 'plot') as 'plot' | 'matrix';
    const nextViewName: 'plot' | 'matrix' = nextView === 'matrix' ? 'matrix' : 'plot';
    if (previousView !== nextViewName) {
        const liveLineFilters = buildAdaptiveLineFiltersForQueryState(uiState.adaptiveLineFilters || []);
        setScatterViewSnapshot(previousView, {
            columnRanges: { ...(uiState.columnRanges || {}) },
            lineFilters: liveLineFilters,
        });
        const enteringSnapshot = getScatterViewSnapshot(nextViewName);
        // Adaptive line filters round-trip back through the Adaptive shape,
        // because that is what `uiState` and the controller storage expect.
        const storedAdaptive = (enteringSnapshot.lineFilters || []).map((spec) => {
            return {
                target: spec.column,
                x1: spec.x1,
                y1: spec.y1,
                x2: spec.x2,
                y2: spec.y2,
                keepAbove: spec.keepAbove,
            };
        });
        const filters = workspace?.getSnapshot().filters;
        if (filters) {
            workspace?.setFilters({
                ...filters,
                columnRanges: enteringSnapshot.columnRanges,
                adaptiveLines: storedAdaptive as any,
            });
        }
        setColumnRanges(enteringSnapshot.columnRanges as Record<string, { from: number; to: number }>);
        setAdaptiveLineFilters(storedAdaptive as any);
    }

    // When the user switches back to the plot from the matrix, the cached
    // `view` bounds usually come from a stale zoom/pan state that was
    // captured before they entered the matrix. Without a reset, the plot
    // appears empty because the cached view box covers zero in-range
    // points. We drop any saved view history and force the next
    // `renderScatter` to reset to the full extent.
    if (scatterState.activeView === 'matrix' && nextView === 'plot') {
        scatterState.view = { ...scatterState.full };
        scatterState.zoomHistory = [];
        _preserveViewOnNextRender = false;
        _warnOnEmptyPlotAfterMatrix = true;
    }
    scatterState.activeView = nextView;
    setSidebarAnalyticsSelection(nextView);
    syncScatterViewButtons(nextView);
    syncModeUI();

    for (const panel of document.querySelectorAll<HTMLElement>('[data-scatter-view-panel]')) {
        panel.hidden = panel.dataset.scatterViewPanel !== nextView;
    }

    if (!shouldRender) return;
    if (nextView === 'matrix') {
        const intent = workspace?.getSnapshot();
        if (intent) await renderScatterMatrixView(onMatrixCellClick, intent);
        else await renderScatterMatrixView(onMatrixCellClick);
        return;
    }
    // Re-render the plot so the reset view is reflected immediately, even
    // if a fresh data fetch is not required. This is what fixes the
    // "empty plot after Matrix" complaint: switching back no longer leaves
    // the previous zoom/pan state lingering over an unrelated point set.
    await renderScatter();
    syncScatterEmptyState();
    requestAnimationFrame(() => scatterState.chart?.resize?.());
}

function refreshActiveScatterView(): Promise<void> {
    return setScatterView(scatterState.activeView, { render: true });
}

/* ── Main render pipeline ─────────────────────────────── */

let _scatterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _warnOnEmptyPlotAfterMatrix = false;

/**
 * When set, the next `renderScatter()` invocation will preserve the current
 * `scatterState.view` instead of resetting it to the full extent.
 *
 * The density-mode zoom path in `rendering.ts` schedules a re-render after
 * `applyView` has already updated the view. The default render would clobber the full
 * extent via `applyScatterStateFromCache(true)`, so the zoom would not stick.
 * Setting this flag tells the next render to keep the view as-is.
 */
let _preserveViewOnNextRender = false;

export function renderScatterDebounced(): void {
    if (_scatterDebounceTimer) clearTimeout(_scatterDebounceTimer);
    _scatterDebounceTimer = setTimeout(() => { _scatterDebounceTimer = null; renderScatter(); }, 32);
}

// Rendering cannot import `renderScatter` directly because this page already
// imports view interactions from rendering. Register the page-owned scheduler
// with the narrow bridge module instead of publishing it on `globalThis`.
setScatterRenderScheduler((opts) => {
    if (opts?.preserveView) _preserveViewOnNextRender = true;
    if (opts?.immediate) {
        void renderScatter();
        return;
    }
    renderScatterDebounced();
});

async function renderScatter(): Promise<void> {
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    let container = getEl('scatter-chart');
    const xValue = getDropdownValue('scatter-x-col');
    const yValue = getDropdownValue('scatter-y-col');

    if (!container || !xSelect || !ySelect || !xValue || !yValue) {
        scatterState.loading = false;
        scatterState.totalPoints = 0;
        syncScatterEmptyState();
        return;
    }

    showError('');
    const requestId = ++scatterState.scatterRequestId;
    syncScatterEmptyState();

    await scatterTask.run(async (signal) => {
        const ctl = currentControls();
        const colorColumn = ctl.selectedColorColumn || null;
        const queryContext = buildScatterQueryContext(
            { x: xValue, y: yValue, colorColumn: colorColumn || undefined },
            workspace?.getSnapshot(),
        );
        // The overview context key now also folds in x/y/colorColumn so a
        // navigation that mutates only the axes (heatmap cell click, home
        // top-pair row click) invalidates the scatter fast-path cache.
        // Mirroring the same shape in `renderScatter` keeps the key written
        // here in lockstep with what the page-change handler computes.
        const queryContextKey = buildOverviewContextKey({
            ...queryContext,
            x: xValue,
            y: yValue,
            colorColumn: colorColumn || undefined,
        });

        // Consume the one-shot preserveView flag the density-zoom path set
        // before scheduling this render. We must read it BEFORE awaiting
        // `fetchScatterPoints` so a slow request doesn't get its flag stolen
        // by a subsequent render.
        const preserveView = _preserveViewOnNextRender;
        _preserveViewOnNextRender = false;

        const response = await fetchScatterPoints(
            xValue, yValue, computeInteractiveScatterLimit(container),
            colorColumn,
            queryContext,
            signal,
        );
        if (requestId !== scatterState.scatterRequestId) return;

        scatterState.lastQueryContextKey = queryContextKey;
        const points: [number, number][] = Array.isArray(response.points) ? response.points : [];

        scatterState.totalPoints = Number(response.total_points ?? points.length);
        scatterState.allPoints = points;
        scatterState.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
        scatterState.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
        scatterState.colorColumn = response.color || '';
        // Audit issue 2.2: surface the cardinality summary so the
        // colorbar can show a "X other categories collapsed" hint
        // when the categorical color column has a long tail.
        scatterState.colorCardinality = response.color_cardinality ?? null;
        const carriedFilterCount = queryContext.filters.length + queryContext.lineFilters.length;
        if (_warnOnEmptyPlotAfterMatrix && scatterState.totalPoints === 0 && carriedFilterCount > 0) {
            toast(
                'Active matrix filters hide all scatter points. Clear them to repopulate the plot.',
                'warning',
                {
                    action: {
                        label: 'Clear',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('edatime:clear-all-filters'));
                        },
                    },
                    dedupeKey: 'scatter:matrix-empty-plot-warning',
                },
            );
        }
        if (_warnOnEmptyPlotAfterMatrix) {
            _warnOnEmptyPlotAfterMatrix = false;
        }
        // When this render was triggered by a density-mode zoom, the caller
        // has already updated `scatterState.view` to the new bounds.
        // Resetting the view here would clobber the zoom and the user would
        // see the heatmap snap back to the full extent. In every other case
        // (initial load, column change, color change, …) we keep the
        // default "reset to full extent" semantics so the chart always
        // starts in a sane state.
        applyScatterStateFromCache(!preserveView);
        const renderSignature = buildRenderSignature(ctl);

        if (scatterState.chart && scatterState.lastRenderSignature !== renderSignature) {
            disposeScatterChart();
            container = resetScatterContainer() || getEl('scatter-chart');
        }

        const nextOption = buildOption(scatterState.points, container);

        if (!scatterState.chart) {
            const gpuAvailable = await isGPUAvailable();
            if (!gpuAvailable) {
                setGpuUnavailable(true);
                const fallbackChart = new EchartsScatterChart('scatter-chart');
                await fallbackChart.init();
                scatterState.chart = fallbackChart as any;
            } else {
                setGpuUnavailable(false);
                const chartOptions: Record<string, unknown> = { ...nextOption };
                const powerPreference = defaultGpuPowerPreference();
                if (powerPreference) chartOptions.powerPreference = powerPreference;
                scatterState.chart = await createChart(container!, chartOptions as any);
            }
            const chart = scatterState.chart;
            if (!chart) return;
            scatterState.lastRenderSignature = renderSignature;
            chart.setOption(nextOption);
            initSelectionZoom(container!);
            chart.onPerformanceUpdate?.(() => {
                const now = performance.now();
                if (now - scatterState.lastUpdateMs < 100) return;
                scatterState.lastUpdateMs = now;
                updateBinnedReadout();
            });
        } else {
            scatterState.chart.setOption(nextOption);
            scatterState.lastRenderSignature = renderSignature;
            requestAnimationFrame(() => scatterState.chart?.resize?.());
        }

        updateColorbarUI();
        updateBinnedReadout();
        updateCorrelationStats();
        renderSuggestions(scatterState.lastSuggestions);
        updateMarginalPlots();
    });
}

async function rerenderScatterFromCache(resetViewFlag = true): Promise<void> {
    if (Array.isArray(scatterState.allPoints) && scatterState.allPoints.length > 0) {
        applyScatterStateFromCache(resetViewFlag);
        if (scatterState.chart) renderCurrentOption();
        updateCorrelationStats();
        renderSuggestions(scatterState.lastSuggestions);
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
            initScatterPage,
            renderScatter,
            refreshCorrelationsAndSuggestions,
            refreshActiveScatterView,
            setScatterView,
            handleErr,
            rerenderScatterFromCache,
            renderScatterDebounced,
            syncScatterFilterBadge,
            workspace: workspace ?? undefined,
            exportScatterParquet: () => exportScatterParquet(workspace?.getSnapshot()),
        }),
    ).then(() => {
        // Register the click handler for correlation pills. After a pill
        // is clicked the X and Y dropdowns are already updated, so we only
        // need to refresh the correlation list for the new X and re-render
        // the scatter. This reuses the same plumbing as a manual X change
        // and keeps the scatter chart in sync with the chosen pair.
        setSuggestionApplyHandler(async () => {
            try {
                await refreshCorrelationsAndSuggestions();
                await renderScatter();
            } catch (err) {
                handleErr(err);
            }
        });
    });
}

/* ── Public init ──────────────────────────────────────── */

export async function initScatterPage(
    metadata: DatasetMetadata,
    deps: { workspace?: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'> } = {},
): Promise<void> {
    workspace = deps.workspace ?? null;
    configureScatterRuntime(workspace);
    const page = getEl('page-scatter');
    const xSelect = getEl('scatter-x-col');
    const ySelect = getEl('scatter-y-col');
    if (!page || !xSelect || !ySelect) return;

    const numeric: string[] = ((metadata as any)?.numeric_columns || []).filter((c: any) => c);
    const hadRestoredPair = !!(getDropdownValue('scatter-x-col') && getDropdownValue('scatter-y-col'));
    scatterState.metadata = metadata;
    scatterState.columnTypes = new Map(
        ((metadata as any)?.columns || []).map((col: any) => [
            String(col?.name || '').toLowerCase(),
            String(col?.dtype || ''),
        ]),
    );

    // Always populate the dropdowns, even when no numeric columns are available
    // yet: the controls layer relies on the selects being initialized so
    // later metadata refreshes can deterministically pick a default. With zero
    // numeric columns, the selects are simply empty and the page stays in
    // the empty state until columns arrive.
    if (numeric.length > 0) {
        const selectedX = ensureOptions(xSelect, numeric, getDropdownValue('scatter-x-col') || numeric[0], { searchable: true });
        ensureOptions(
            ySelect,
            numeric.filter((c) => c !== selectedX),
            getDropdownValue('scatter-y-col') || numeric[1] || numeric[0],
            { searchable: true },
        );
    } else {
        xSelect.innerHTML = '';
        ySelect.innerHTML = '';
    }

    scatterState.loading = !scatterState.pageInitialized
        && !page.hidden
        && !!getDropdownValue('scatter-x-col')
        && !!getDropdownValue('scatter-y-col');
    syncScatterEmptyState();
    syncScatterFilterBadge();

    if (!scatterState.initialized) {
        await bindControls();
        // Wire the per-segment overflow popout now that the toolbar
        // segments exist in their final shape. The overflow logic
        // is purely presentational, so a failure here must not
        // prevent the scatter page from rendering.
        const toolbar = getEl('page-scatter')?.querySelector<HTMLElement>('.scatter-toolbar');
        if (toolbar) {
            try { initScatterToolbarOverflow(toolbar); } catch { /* noop */ }
        }
        // Page-level "?" help button. The helper is idempotent so
        // calling it on every first init is safe.
        initScatterHelp();
        scatterState.initialized = true;
    }
    if (scatterState.pageInitialized) return;

    const isVisible = !page.hidden;
    if (!isVisible) return;

    // No usable columns: skip the fetch path entirely. Subsequent metadata
    // refreshes will rerun initScatterPage and pick up the work then.
    if (numeric.length === 0) return;

    try {
        await refreshCorrelationsAndSuggestions({
            preferTopPairOnFirstLoad: !hadRestoredPair,
        });
        await renderScatter();
        scatterState.pageInitialized = true;
    } catch (err: any) {
        handleErr(err);
    }
}

/** Bootstrap call — must happen BEFORE the first edatime:page-change 'scatter' event
 *  so that the runtime's event listener is registered before any page-change handlers
 *  that call initScatterPage. */
initScatterPageRuntime();
