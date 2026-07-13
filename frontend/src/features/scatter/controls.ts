/**
 * Scatter control wiring — all event listeners bound to scatter page controls.
 *
 * Responsibilities:
 * - X/Y column selects, bin size, normalization, render mode
 * - Density/scatter toggle, diagonal mode, color column/scale
 * - Suggestion threshold, linked brush
 * - Matrix mode toggle and cell size
 * - Export buttons
 * - Page-change listener and canonical workspace filter observation
 *
 * The density colormap is no longer a per-page toolbar control — it is
 * configured globally on the settings page and consumed via the
 * shared `COLOR_SCALES` helper in `utils/settings.ts`.
 *
 * This module does NOT import from scatterPage.ts to avoid circular deps.
 * All scatter rendering functions are passed as callbacks.
 */

let activeControlsCleanup: (() => void) | null = null;

import { datasetState } from '../../store/datasetState.js';
import { scatterState } from '../../store/scatterState.js';
import type { DatasetMetadata } from '../../types/api.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { onFeatureEvent } from '../../platform/featureEvents.js';
import { onNavigationChange } from '../../platform/navigationEvents.js';
import { getEl, normalizeScatterSuggestionThreshold } from './helpers.js';
import {
    currentControls,
    buildScatterOverviewContext,
    isLinkedBrushEnabled,
    normalizeAnalyticsView,
} from './state.js';
import {
    buildOption,
    updateColorbarUI,
    updateBinnedReadout,
    updateCorrelationStats,
    updateMarginalPlots,
    syncModeUI,
} from './rendering.js';
import {
    exportScatterPNG,
    exportScatterSVG,
    exportScatterHTML,
    exportScatterData,
    exportScatterParquet,
} from './rendering.js';

export interface ScatterRenderCallbacks {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    renderScatter: () => Promise<void>;
    refreshCorrelationsAndSuggestions: () => Promise<void>;
    refreshActiveScatterView: () => Promise<void>;
    setScatterView: (viewName: string, options?: { render?: boolean }) => Promise<void>;
    handleErr: (err: unknown) => void;
    rerenderScatterFromCache: (resetViewFlag?: boolean) => Promise<void>;
    renderScatterDebounced: () => void;
    syncScatterFilterBadge: () => void;
    refreshToolbarOverflow?: () => void;
    exportScatterParquet?: () => Promise<boolean>;
    workspace?: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'subscribe'>;
    shouldIgnoreWorkspaceChange?: () => boolean;
}

function filterSignature(filters: ReturnType<WorkspaceStore['getSnapshot']>['filters']): string {
    const ranges = Object.entries(filters.columnRanges)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([column, range]) => [column, range.from, range.to]);
    const adaptiveLines = filters.adaptiveLines.map((filter) => [
        filter.id,
        filter.column,
        filter.x1,
        filter.y1,
        filter.x2,
        filter.y2,
        filter.keepAbove,
    ]);
    return JSON.stringify([ranges, adaptiveLines]);
}

function viewportSignature(viewport: ReturnType<WorkspaceStore['getSnapshot']>['viewport']): string {
    if (!viewport) return '';
    return [viewport.xMin, viewport.xMax, viewport.yMin, viewport.yMax].join('|');
}

/**
 * Update the `--range-fill` custom property on a range input so the
 * accent-filled portion of the track reflects the current value.
 * The CSS in `frontend/css/modules/toolbar.css` uses this to draw a
 * filled progress on the slider track.
 */
function updateRangeFill(input: HTMLInputElement | null): void {
    if (!input) return;
    const min = Number(input.min || '0');
    const max = Number(input.max || '100');
    const value = Number(input.value || '0');
    const span = Math.max(max - min, 1);
    const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
    input.style.setProperty('--range-fill', `${pct.toFixed(2)}%`);
}

/** Bind all scatter control event listeners and return their disposer. */
export function bindScatterControls(cb: ScatterRenderCallbacks): () => void {
    disposeScatterControls();
    const controller = new AbortController();
    const listenerOptions = { signal: controller.signal };
    const dispose = () => {
        controller.abort();
        if (activeControlsCleanup === dispose) {
            activeControlsCleanup = null;
        }
    };
    activeControlsCleanup = dispose;
    const listen = (
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions,
    ): void => target.addEventListener(type, listener, { ...options, ...listenerOptions });

    const xSelect = getEl('scatter-x-col') as HTMLElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLElement | null;
    const binSizeInput = getEl('scatter-bin-size') as HTMLInputElement | null;
    const binSizeValue = getEl('scatter-bin-size-value');
    const normalizationSelect = getEl('scatter-normalization') as HTMLElement | null;
    const renderModeSelect = getEl('scatter-render-mode') as HTMLElement | null;
    const diagonalModeSelect = getEl('scatter-diagonal-mode') as HTMLElement | null;
    const colorColumnSelect = getEl('scatter-color-column') as HTMLElement | null;
    const colorScaleSelect = getEl('scatter-color-scale') as HTMLElement | null;
    const linkBrushInput = getEl('scatter-link-brush') as HTMLInputElement | null;
    const suggestionThresholdInput = getEl('scatter-suggestion-threshold') as HTMLInputElement | null;
    const suggestionThresholdValue = getEl('scatter-suggestion-threshold-value');
    const suggestionThresholdLabel = getEl('scatter-suggestions-label');

    if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !normalizationSelect || !renderModeSelect) return dispose;

    binSizeValue.textContent = binSizeInput.value;
    updateRangeFill(binSizeInput);
    if (suggestionThresholdInput) {
        scatterState.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
        suggestionThresholdInput.value = scatterState.suggestionThreshold.toFixed(2);
    }
    if (suggestionThresholdValue) suggestionThresholdValue.textContent = scatterState.suggestionThreshold.toFixed(2);
    if (suggestionThresholdLabel) suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${scatterState.suggestionThreshold.toFixed(2)})`;
    syncModeUI(cb.refreshToolbarOverflow);
    void cb.setScatterView(scatterState.activeView, { render: false });

    const scatterViewButtons = document.querySelectorAll<HTMLButtonElement>('[data-scatter-view]');
    scatterViewButtons.forEach((btn) => {
        listen(btn, 'click', () => {
            const nextView = normalizeAnalyticsView(btn.dataset.scatterView || 'plot');
            void cb.setScatterView(nextView);
        });
    });

    const rerender = () => {
        const container = getEl('scatter-chart');
        if (!scatterState.chart) return;
        scatterState.chart.setOption(buildOption(scatterState.points, container));
        updateColorbarUI();
        updateBinnedReadout();
        updateMarginalPlots();
    };

    listen(binSizeInput, 'input', () => { binSizeValue!.textContent = binSizeInput.value; updateRangeFill(binSizeInput); rerender(); });
    listen(normalizationSelect, 'change', rerender);
    listen(renderModeSelect, 'change', () => { syncModeUI(cb.refreshToolbarOverflow); rerender(); });
    if (diagonalModeSelect) listen(diagonalModeSelect, 'change', () => {
        if (scatterState.activeView === 'matrix') {
            void cb.refreshActiveScatterView();
            return;
        }
        rerender();
    });
    if (colorColumnSelect) listen(colorColumnSelect, 'change', () => { void cb.renderScatter(); });
    if (colorScaleSelect) listen(colorScaleSelect, 'change', () => { rerender(); updateColorbarUI(); });
    if (suggestionThresholdInput) listen(suggestionThresholdInput, 'input', () => {
        scatterState.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
        suggestionThresholdInput.value = scatterState.suggestionThreshold.toFixed(2);
        if (suggestionThresholdValue) suggestionThresholdValue.textContent = scatterState.suggestionThreshold.toFixed(2);
        if (suggestionThresholdLabel) {
            suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${scatterState.suggestionThreshold.toFixed(2)})`;
        }
    });
    if (suggestionThresholdInput) listen(suggestionThresholdInput, 'change', async () => {
        try {
            await cb.refreshCorrelationsAndSuggestions();
        } catch (err: any) {
            cb.handleErr(err);
        }
    });
    if (linkBrushInput) listen(linkBrushInput, 'change', async () => {
        try { await cb.renderScatter(); } catch (err: any) { cb.handleErr(err); }
    });

    // Matrix mode toggle buttons (replaces <select>)
    const matrixModeHidden = getEl('scatter-matrix-mode') as HTMLInputElement | null;
    const matrixSizeInput = getEl('scatter-matrix-cell-size') as HTMLInputElement | null;
    const matrixSizeValue = getEl('scatter-matrix-cell-size-value');
    document.querySelectorAll<HTMLButtonElement>('[data-matrix-mode]').forEach((btn) => {
        listen(btn, 'click', () => {
            const mode = btn.dataset.matrixMode || 'scatter';
            if (matrixModeHidden) matrixModeHidden.value = mode;
            document.querySelectorAll<HTMLButtonElement>('[data-matrix-mode]').forEach((b) => {
                b.classList.toggle('active', b.dataset.matrixMode === mode);
                b.setAttribute('aria-pressed', b.dataset.matrixMode === mode ? 'true' : 'false');
            });
            void cb.refreshActiveScatterView();
        });
    });
    if (matrixSizeInput) listen(matrixSizeInput, 'input', () => {
        if (matrixSizeValue) matrixSizeValue.textContent = matrixSizeInput.value;
        updateRangeFill(matrixSizeInput);
        if (scatterState.activeView === 'matrix') void cb.refreshActiveScatterView();
    });

    // Export buttons
    const exportPng = getEl('scatter-export-png-btn');
    const exportSvg = getEl('scatter-export-svg-btn');
    const exportHtml = getEl('scatter-export-html-btn');
    const exportCsv = getEl('scatter-export-csv-btn');
    const exportJson = getEl('scatter-export-json-btn');
    const exportParquet = getEl('scatter-export-parquet-btn');
    if (exportPng) listen(exportPng, 'click', () => exportScatterPNG());
    if (exportSvg) listen(exportSvg, 'click', () => exportScatterSVG());
    if (exportHtml) listen(exportHtml, 'click', () => exportScatterHTML());
    if (exportCsv) listen(exportCsv, 'click', () => exportScatterData('csv'));
    if (exportJson) listen(exportJson, 'click', () => exportScatterData('json'));
    if (exportParquet) listen(exportParquet, 'click', async () => {
        try { await (cb.exportScatterParquet?.() ?? exportScatterParquet()); } catch (error: any) { cb.handleErr(error); }
    });

    listen(ySelect, 'change', async () => { updateCorrelationStats(); await cb.renderScatter(); });
    listen(xSelect, 'change', async () => { await cb.refreshCorrelationsAndSuggestions(); await cb.renderScatter(); });
    listen(window, 'resize', () => { scatterState.chart?.resize?.(); });

    const handleFilterEvent = async (requireLinkedBrush: boolean) => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            cb.syncScatterFilterBadge();
            if (!requireLinkedBrush || isLinkedBrushEnabled()) cb.renderScatterDebounced();
        } catch (err: any) { cb.handleErr(err); }
    };

    if (cb.workspace) {
        let previousFilters = filterSignature(cb.workspace.getSnapshot().filters);
        let previousViewport = viewportSignature(cb.workspace.getSnapshot().viewport);
        const unsubscribeWorkspace = cb.workspace.subscribe((snapshot) => {
            const nextFilters = filterSignature(snapshot.filters);
            const nextViewport = viewportSignature(snapshot.viewport);
            const filtersChanged = nextFilters !== previousFilters;
            const viewportChanged = nextViewport !== previousViewport;
            previousFilters = nextFilters;
            previousViewport = nextViewport;
            if (cb.shouldIgnoreWorkspaceChange?.()) return;

            if (filtersChanged) {
                void handleFilterEvent(false);
            } else if (viewportChanged) {
                void handleFilterEvent(true);
            }
        });
        controller.signal.addEventListener('abort', unsubscribeWorkspace, { once: true });
    }
    controller.signal.addEventListener('abort', onFeatureEvent('filters:clear', async () => {
        const filters = cb.workspace?.getSnapshot().filters;
        if (filters) {
            cb.workspace?.setFilters({ ...filters, columnRanges: {}, adaptiveLines: [] });
        }
        try {
            cb.syncScatterFilterBadge();
            await cb.refreshActiveScatterView();
        } catch (err: any) {
            cb.handleErr(err);
        }
    }), { once: true });

    // The page-change fast path compares the freshly-computed query-context
    // key against `scatterState.lastQueryContextKey`, which `renderScatter`
    // updates after every successful render. The `inFlight` guard drops
    // re-entrant dispatches fired while a
    // previous invocation is still awaiting. Scatter itself does not
    // dispatch a navigation event from within the handler chain, so
    // this is purely defensive: synchronous `setScatterView` calls
    // re-enter the same page-change from `showPage` (which queues the
    // event inside a `requestAnimationFrame`), and we don't want those
    // queued events to fire while the first invocation is still
    // mid-render. Unlike a one-shot `dormant` flag, `inFlight` resets
    // when the work completes so legitimate repeat navigations
    // (heatmap → scatter → heatmap → scatter, home-correlations → scatter,
    // etc.) still run.
    let inFlight = false;

    const unsubscribeNavigation = onNavigationChange(async (change) => {
        if (change.page !== 'scatter') return;
        if (inFlight) return;
        inFlight = true;
        try {
            // The scatter page now treats itself as the authoritative owner of
            // `scatterState.metadata`: initScatterPage is the single place
            // where it gets written. If a page-change fires before init ran (for
            // example when the user navigates to scatter on a cold dataset), we
            // bounce via a single dedicated init call rather than reading from
            // `datasetState.metadata` here. That keeps the page-change handler
            // strictly an effect, not a side-channel metadata source.
            if (!scatterState.metadata && datasetState.metadata) {
                await cb.initScatterPage(datasetState.metadata as DatasetMetadata);
            }

            const nextView = normalizeAnalyticsView(change.analyticsView ?? 'plot');
            const ctl = currentControls();
            // The overview context key includes X, Y, and the color-column
            // selection (in addition to the filter payload) so a navigation
            // that mutates only the axes — e.g. clicking a cell in the
            // Correlations heatmap or a "Top pair" pill on the home page —
            // still invalidates the cache and re-runs the pipeline. Without
            // those fields the fast path swallowed the navigation and the
            // scatter kept showing the previous X/Y's cached points against
            // the new axis labels.
            const { queryContextKey } = buildScatterOverviewContext({
                x: ctl.x,
                y: ctl.y,
                colorColumn: ctl.selectedColorColumn || undefined,
            });
            if (
                scatterState.pageInitialized
                && scatterState.activeView === nextView
                && scatterState.lastQueryContextKey === queryContextKey
            ) {
                return;
            }
            scatterState.lastQueryContextKey = queryContextKey;
            scatterState.activeView = nextView;
            await cb.setScatterView(scatterState.activeView, { render: false });
            if (!scatterState.pageInitialized) {
                cb.refreshCorrelationsAndSuggestions()
                    .then(() => (nextView === 'matrix' ? cb.refreshActiveScatterView() : cb.renderScatter()))
                    .then(() => { scatterState.pageInitialized = true; })
                    .catch((err: any) => { cb.handleErr(err); });
            } else {
                try {
                    const activeFilters = cb.workspace?.getSnapshot().filters;
                    if (
                        isLinkedBrushEnabled()
                        || Object.keys(activeFilters?.columnRanges ?? {}).length > 0
                        || (activeFilters?.adaptiveLines.length ?? 0) > 0
                    ) {
                        await cb.renderScatter();
                    } else {
                        await cb.rerenderScatterFromCache(true);
                    }
                } catch (err: any) { cb.handleErr(err); }
            }
        } finally {
            inFlight = false;
        }
    });
    controller.signal.addEventListener('abort', unsubscribeNavigation, { once: true });

    return dispose;
}

/** Dispose the currently bound Scatter control listeners, if any. */
export function disposeScatterControls(): void {
    activeControlsCleanup?.();
}
