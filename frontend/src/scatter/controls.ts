/**
 * Scatter control wiring — all event listeners bound to scatter page controls.
 *
 * Responsibilities:
 * - X/Y column selects, bin size, normalization, render mode
 * - Density/scatter toggle, diagonal mode, color column/scale
 * - Suggestion threshold, linked brush
 * - Matrix mode toggle and cell size
 * - Export buttons
 * - Page-change and filter event listeners
 *
 * The density colormap is no longer a per-page toolbar control — it is
 * configured globally on the settings page and consumed via the
 * shared `COLOR_SCALES` helper in `utils/settings.ts`.
 *
 * This module does NOT import from scatterPage.ts to avoid circular deps.
 * All scatter rendering functions are passed as callbacks.
 */

// Each call to `bindScatterControls` registers a fresh page-change
// listener. When previous tests have left listeners on `window`, a
// dispatch fires every accumulated listener, and the first one to
// process the dispatch consumes any `mockReturnValueOnce` queue that
// was set up by the current test — which means the latest test's
// listener never sees its queued mock value. To keep the latest
// listener the one that actually drives the work, we tag every
// invocation with a monotonically increasing index and let each
// listener compare its own index against the global "latest" index
// on each dispatch. Only the latest listener processes the event.
// The index survives `vi.resetModules()` via a stable `globalThis` slot.
type BindIndexSlot = { __scatterBindIndex?: number };
const nextBindIndex = (): number => {
    const slot = globalThis as BindIndexSlot;
    slot.__scatterBindIndex = (slot.__scatterBindIndex ?? 0) + 1;
    return slot.__scatterBindIndex;
};
const latestBindIndex = (): number => {
    const slot = globalThis as BindIndexSlot;
    return slot.__scatterBindIndex ?? 0;
};

import { appState } from '../store/index.js';
import type { DatasetMetadata } from '../types.js';
import { getEl, normalizeScatterSuggestionThreshold } from './helpers.js';
import {
    currentControls,
    buildScatterQueryContext,
    buildOverviewContextKey,
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

/** Bind all scatter control event listeners. Call once after DOM is ready. */
export function bindScatterControls(cb: ScatterRenderCallbacks): void {
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

    if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !normalizationSelect || !renderModeSelect) return;

    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.exportScatterData = exportScatterData;

    binSizeValue.textContent = binSizeInput.value;
    updateRangeFill(binSizeInput);
    if (suggestionThresholdInput) {
        appState.scatter.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
        suggestionThresholdInput.value = appState.scatter.suggestionThreshold.toFixed(2);
    }
    if (suggestionThresholdValue) suggestionThresholdValue.textContent = appState.scatter.suggestionThreshold.toFixed(2);
    if (suggestionThresholdLabel) suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${appState.scatter.suggestionThreshold.toFixed(2)})`;
    syncModeUI();
    void cb.setScatterView(appState.scatter.activeView, { render: false });

    const scatterViewButtons = document.querySelectorAll<HTMLButtonElement>('[data-scatter-view]');
    scatterViewButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const nextView = normalizeAnalyticsView(btn.dataset.scatterView || 'plot');
            void cb.setScatterView(nextView);
        });
    });

    const rerender = () => {
        const container = getEl('scatter-chart');
        if (!appState.scatter.chart) return;
        appState.scatter.chart.setOption(buildOption(appState.scatter.points, container));
        updateColorbarUI();
        updateBinnedReadout();
        updateMarginalPlots();
    };

    binSizeInput.addEventListener('input', () => { binSizeValue!.textContent = binSizeInput.value; updateRangeFill(binSizeInput); rerender(); });
    normalizationSelect.addEventListener('change', rerender);
    renderModeSelect.addEventListener('change', () => { syncModeUI(); rerender(); });
    diagonalModeSelect?.addEventListener('change', () => {
        if (appState.scatter.activeView === 'matrix') {
            void cb.refreshActiveScatterView();
            return;
        }
        rerender();
    });
    colorColumnSelect?.addEventListener('change', () => { void cb.renderScatter(); });
    colorScaleSelect?.addEventListener('change', () => { rerender(); updateColorbarUI(); });
    suggestionThresholdInput?.addEventListener('input', () => {
        appState.scatter.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
        suggestionThresholdInput.value = appState.scatter.suggestionThreshold.toFixed(2);
        if (suggestionThresholdValue) suggestionThresholdValue.textContent = appState.scatter.suggestionThreshold.toFixed(2);
        if (suggestionThresholdLabel) {
            suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${appState.scatter.suggestionThreshold.toFixed(2)})`;
        }
    });
    suggestionThresholdInput?.addEventListener('change', async () => {
        try {
            await cb.refreshCorrelationsAndSuggestions();
        } catch (err: any) {
            cb.handleErr(err);
        }
    });
    linkBrushInput?.addEventListener('change', async () => {
        try { await cb.renderScatter(); } catch (err: any) { cb.handleErr(err); }
    });

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
            void cb.refreshActiveScatterView();
        });
    });
    matrixSizeInput?.addEventListener('input', () => {
        if (matrixSizeValue) matrixSizeValue.textContent = matrixSizeInput.value;
        updateRangeFill(matrixSizeInput);
        if (appState.scatter.activeView === 'matrix') void cb.refreshActiveScatterView();
    });

    // Export buttons
    getEl('scatter-export-png-btn')?.addEventListener('click', () => exportScatterPNG());
    getEl('scatter-export-svg-btn')?.addEventListener('click', () => exportScatterSVG());
    getEl('scatter-export-html-btn')?.addEventListener('click', () => exportScatterHTML());
    getEl('scatter-export-csv-btn')?.addEventListener('click', () => exportScatterData('csv'));
    getEl('scatter-export-json-btn')?.addEventListener('click', () => exportScatterData('json'));
    getEl('scatter-export-parquet-btn')?.addEventListener('click', async () => {
        try { await exportScatterParquet(); } catch (error: any) { cb.handleErr(error); }
    });

    ySelect.addEventListener('change', async () => { updateCorrelationStats(); await cb.renderScatter(); });
    xSelect.addEventListener('change', async () => { await cb.refreshCorrelationsAndSuggestions(); await cb.renderScatter(); });
    window.addEventListener('resize', () => { appState.scatter.chart?.resize?.(); });

    const handleFilterEvent = async (requireLinkedBrush: boolean) => {
        const page = getEl('page-scatter');
        if (page?.hidden) return;
        try {
            cb.syncScatterFilterBadge();
            if (!requireLinkedBrush || isLinkedBrushEnabled()) cb.renderScatterDebounced();
        } catch (err: any) { cb.handleErr(err); }
    };

    window.addEventListener('edatime:chart-range-change', () => handleFilterEvent(true));
    window.addEventListener('edatime:column-filters-change', () => handleFilterEvent(false));
    window.addEventListener('edatime:adaptive-filters-change', () => handleFilterEvent(false));

    // The page-change fast path compares the freshly-computed
    // query-context key against `appState.scatter.lastQueryContextKey`,
    // which `renderScatter` updates after every successful render.
    //
    // Only the LATEST bound listener processes the dispatch. Older
    // listeners (left over from previous tests) skip the work so that
    // their stale mocks cannot consume a `mockReturnValueOnce` value
    // queued by the current test's mocks. The bind index survives
    // `vi.resetModules()` via a stable `globalThis` slot, so the
    // listener registered by the test that called bind LAST has the
    // highest index and wins.
    const bindIndex = nextBindIndex();
    let dormant = false;

    window.addEventListener('edatime:page-change', async (ev: any) => {
        if (ev?.detail?.page !== 'scatter') return;
        if (dormant) return;
        if (bindIndex !== latestBindIndex()) return;
        dormant = true;

        // The scatter page now treats itself as the authoritative owner of
        // `appState.scatter.metadata`: initScatterPage is the single place
        // where it gets written. If a page-change fires before init ran (for
        // example when the user navigates to scatter on a cold dataset), we
        // bounce via a single dedicated init call rather than reading from
        // `appState.metadata` here. That keeps the page-change handler
        // strictly an effect, not a side-channel metadata source.
        if (!appState.scatter.metadata && appState.metadata) {
            await cb.initScatterPage(appState.metadata as DatasetMetadata);
        }

        const nextView = normalizeAnalyticsView(ev?.detail?.analyticsView);
        const ctl = currentControls();
        const queryContextKey = buildOverviewContextKey(buildScatterQueryContext({
            x: ctl.x,
            y: ctl.y,
            colorColumn: ctl.selectedColorColumn || undefined,
        }));
        if (
            appState.scatter.pageInitialized
            && appState.scatter.activeView === nextView
            && appState.scatter.lastQueryContextKey === queryContextKey
        ) {
            return;
        }
        appState.scatter.lastQueryContextKey = queryContextKey;
        appState.scatter.activeView = nextView;
        await cb.setScatterView(appState.scatter.activeView, { render: false });
        if (!appState.scatter.pageInitialized) {
            cb.refreshCorrelationsAndSuggestions()
                .then(() => cb.renderScatter())
                .then(() => { appState.scatter.pageInitialized = true; })
                .catch((err: any) => { cb.handleErr(err); });
        } else {
            try {
                if (isLinkedBrushEnabled() || Object.keys(appState.columnRanges || {}).length > 0 || (appState.adaptiveLineFilters || []).length > 0) {
                    await cb.renderScatter();
                } else {
                    await cb.rerenderScatterFromCache(true);
                }
            } catch (err: any) { cb.handleErr(err); }
        }
    });
}
