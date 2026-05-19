/**
 * Scatter-page local query-context builders and DOM helpers.
 *
 * The canonical scatter state lives in `store/scatterState.ts` as `scatterState`.
 * This module re-exports it for backward compatibility so that existing imports
 * from `./state.js` (e.g. `import { state }`) continue to work.
 *
 * Helper functions here (controls readers, query builders, view utilities) are
 * still owned by this module as they are scatter-page specific.
 */

import { appState, buildAdaptiveLineFiltersForQuery } from '../state.js';
export { appState } from '../state.js';

// Import scatterState locally as `state` for use in helper functions defined
// in this module, and re-export it so external callers can also use it as `state`.
import { scatterState } from '../store/index.js';
export const state = scatterState;

// Also export scatterState by its own name for new code
export { scatterState };

// Re-export shared types so external modules can import from './state.js'
export type {
    ScatterView,
    ScatterDrag,
    DensityTooltipMeta,
    DensityTooltipCache,
    MatrixCellData,
} from '../store/scatterState.js';
import type { ScatterView } from '../store/scatterState.js';

// Re-export helpers that the helpers module provides (used in this file's functions)
export { getEl, fmt, computeColorExtent, computeDomains } from './helpers.js';
export { normalizeCategoryLabel, normalizeColorValues, buildCategoricalColorGroups, type CategoricalColorGroups } from './helpers.js';
import { getEl, fmt, computeColorExtent, computeDomains, normalizeCategoryLabel, normalizeColorValues, buildCategoricalColorGroups, type CategoricalColorGroups } from './helpers.js';

/* ── Controls read helpers ────────────────────────────── */

export interface ScatterControls {
    x: string;
    y: string;
    binSize: number;
    colormap: string;
    normalization: string;
    renderMode: string;
    diagonalMode: string;
    colorColumn: string;
    selectedColorColumn: string;
    colorScale: string;
    matrixMode: string;
    matrixCellSize: number;
}

export function currentControls(): ScatterControls {
    const xSelect = getEl('scatter-x-col') as HTMLSelectElement | null;
    const ySelect = getEl('scatter-y-col') as HTMLSelectElement | null;
    const binSizeInput = getEl('scatter-bin-size') as HTMLInputElement | null;
    const colormapSelect = getEl('scatter-colormap') as HTMLSelectElement | null;
    const normalizationSelect = getEl('scatter-normalization') as HTMLSelectElement | null;
    const renderModeSelect = getEl('scatter-render-mode') as HTMLSelectElement | null;
    const diagonalModeSelect = getEl('scatter-diagonal-mode') as HTMLSelectElement | null;
    const colorColumnSelect = getEl('scatter-color-column') as HTMLSelectElement | null;
    const colorScaleSelect = getEl('scatter-color-scale') as HTMLSelectElement | null;
    const matrixModeSelect = getEl('scatter-matrix-mode') as HTMLSelectElement | null;
    const matrixSizeInput = getEl('scatter-matrix-cell-size') as HTMLInputElement | null;

    const renderMode = renderModeSelect?.value || 'density';
    const selectedColorColumn = colorColumnSelect?.value || '';

    return {
        x: xSelect?.value || '',
        y: ySelect?.value || '',
        binSize: Number(binSizeInput?.value ?? 10),
        colormap: colormapSelect?.value ?? 'viridis',
        normalization: normalizationSelect?.value ?? 'linear',
        renderMode,
        diagonalMode: diagonalModeSelect?.value || 'histogram',
        colorColumn: renderMode === 'density' ? '' : selectedColorColumn,
        selectedColorColumn,
        colorScale: colorScaleSelect?.value || 'viridis',
        matrixMode: matrixModeSelect?.value || 'scatter',
        matrixCellSize: Math.max(80, Math.min(400, Number(matrixSizeInput?.value ?? 160))),
    };
}

/* ── Query context builders ───────────────────────────── */

export interface ScatterQueryContext {
    start?: number;
    end?: number;
    filters: Array<{ column: string; from: number; to: number }>;
    lineFilters: ReturnType<typeof buildAdaptiveLineFiltersForQuery>;
}

const collectColumnRangeFilters = (): Array<{ column: string; from: number; to: number }> => (
    Object.entries(appState.columnRanges || {})
        .map(([column, range]) => {
            const from = Number(range?.from);
            const to = Number(range?.to);
            if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
            return { column, from, to };
        })
        .filter((f): f is { column: string; from: number; to: number } => f !== null)
);

const scopeFiltersToColumns = (
    filters: Array<{ column: string; from: number; to: number }>,
    columns: Array<string>,
): Array<{ column: string; from: number; to: number }> => {
    const allowed = new Set(columns.filter(Boolean));
    if (allowed.size === 0) return [];
    return filters.filter((f) => allowed.has(f.column));
};

export function isLinkedBrushEnabled(): boolean {
    return !!(getEl('scatter-link-brush') as HTMLInputElement | null)?.checked
        || !!(getEl('scatter-matrix-link-range') as HTMLInputElement | null)?.checked;
}

export function buildScatterQueryContext(
    columns: { x?: string; y?: string; colorColumn?: string } = {},
): ScatterQueryContext {
    const start = Number(appState.currentStart);
    const end = Number(appState.currentEnd);
    const allFilters = collectColumnRangeFilters();
    const filters = scopeFiltersToColumns(allFilters, [columns.x || '', columns.y || '', columns.colorColumn || '']);

    const linkedRangeValid = isLinkedBrushEnabled() && Number.isFinite(start) && Number.isFinite(end) && start < end;
    return {
        start: linkedRangeValid ? start : undefined,
        end: linkedRangeValid ? end : undefined,
        filters,
        lineFilters: buildAdaptiveLineFiltersForQuery(),
    };
}

export function getActiveScatterFilterColumns(
    columns: { x?: string; y?: string; colorColumn?: string } = {},
): string[] {
    const allFilters = collectColumnRangeFilters();
    const scoped = scopeFiltersToColumns(allFilters, [columns.x || '', columns.y || '', columns.colorColumn || '']);
    return scoped.map((f) => f.column);
}

/* ── Render-signature helpers ─────────────────────────── */

export function buildRenderSignature(controls: ScatterControls): string {
    return [
        controls.x || '',
        controls.y || '',
        controls.renderMode || '',
        controls.selectedColorColumn || '',
        controls.colorScale || '',
        controls.colormap || '',
        controls.normalization || '',
        controls.diagonalMode || '',
    ].join('|');
}

export function buildOverviewContextKey(context: Partial<ScatterQueryContext>): string {
    return JSON.stringify({
        start: Number.isFinite(context?.start) ? context.start : null,
        end: Number.isFinite(context?.end) ? context.end : null,
        filters: Array.isArray(context?.filters) ? context.filters : [],
        lineFilters: Array.isArray(context?.lineFilters) ? context.lineFilters : [],
    });
}

/* ── View / zoom helpers ──────────────────────────────── */

export function clampView(view: ScatterView): ScatterView {
    const f = state.full;
    let xMin = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMin)));
    let xMax = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMax)));
    let yMin = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMin)));
    let yMax = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMax)));

    if (!(xMax > xMin)) { const span = Math.max(1e-9, f.xMax - f.xMin); xMin = f.xMin; xMax = f.xMin + span; }
    if (!(yMax > yMin)) { const span = Math.max(1e-9, f.yMax - f.yMin); yMin = f.yMin; yMax = f.yMin + span; }

    return { xMin, xMax, yMin, yMax };
}

export function applyScatterStateFromCache(resetView = true): void {
    appState.scatter.points = Array.isArray(appState.scatter.allPoints) ? appState.scatter.allPoints : [];
    // Note: colorValues / colorLabels are kept as-is here (may contain NaN/Infinity).
    // Filtering of non-finite color values happens in buildNormalScatterSeries so
    // that array indices stay aligned with the points array.
    appState.scatter.colorValues = Array.isArray(appState.scatter.allColorValues) ? appState.scatter.allColorValues : null;
    appState.scatter.colorLabels = Array.isArray(appState.scatter.allColorLabels) ? appState.scatter.allColorLabels : null;

    const colorExtent = computeColorExtent(appState.scatter.colorValues);
    appState.scatter.colorMin = colorExtent?.min ?? null;
    appState.scatter.colorMax = colorExtent?.max ?? null;

    const domains = computeDomains(appState.scatter.points);
    appState.scatter.full = { xMin: domains.xMin, xMax: domains.xMax, yMin: domains.yMin, yMax: domains.yMax };

    if (resetView) {
        appState.scatter.view = { ...appState.scatter.full };
        appState.scatter.zoomHistory = [];
    } else {
        appState.scatter.view = clampView(appState.scatter.view);
    }

    setStats({ totalPoints: fmt.format(Number(appState.scatter.totalPoints ?? appState.scatter.points.length)) });
}

/* ── Stats display ────────────────────────────────────── */

export function setStats(partial: Record<string, string | number | null | undefined>): void {
    const totalEl = getEl('scatter-total-points');
    const visibleEl = getEl('scatter-binned-points');
    const pearsonEl = getEl('scatter-pearson');
    const spearmanEl = getEl('scatter-spearman');

    if (Object.prototype.hasOwnProperty.call(partial, 'totalPoints') && totalEl) {
        totalEl.textContent = `Total points: ${partial.totalPoints ?? '—'}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'visiblePoints') && visibleEl) {
        visibleEl.textContent = `Visible points: ${partial.visiblePoints ?? '—'}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'pearson') && pearsonEl) {
        pearsonEl.textContent = `Pearson: ${partial.pearson ?? '—'}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'spearman') && spearmanEl) {
        spearmanEl.textContent = `Spearman: ${partial.spearman ?? '—'}`;
    }
}

/* ── Plot metrics ─────────────────────────────────────── */

export function getPlotMetrics(container: HTMLElement | null) {
    const rect = container?.getBoundingClientRect?.();
    if (!rect) return null;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const grid = { left: 72, right: 32, top: 24, bottom: 50 };
    const plotLeft = grid.left;
    const plotRight = Math.max(plotLeft + 1, width - grid.right);
    const plotTop = grid.top;
    const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
    return {
        width, height, grid,
        plotLeft, plotRight, plotTop, plotBottom,
        plotWidth: Math.max(1, plotRight - plotLeft),
        plotHeight: Math.max(1, plotBottom - plotTop),
    };
}

/* ── Misc shared accessors ────────────────────────────── */

export function getProfileForColumn(column: string) {
    return (state.metadata as any)?.column_profiles?.find((e: any) => e?.name === column) || null;
}

export function getProfileHistogram(column: string) {
    const profile = getProfileForColumn(column);
    const counts = Array.isArray(profile?.histogram?.counts)
        ? profile.histogram.counts.map((v: unknown) => Math.max(0, Number(v) || 0))
        : [];
    const edges = Array.isArray(profile?.histogram?.bin_edges)
        ? profile.histogram.bin_edges.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
        : [];
    if (counts.length === 0 || edges.length !== counts.length + 1) return null;
    return { min: Number(edges[0]), max: Number(edges[edges.length - 1]), counts, edges };
}

export function getCurrentScatterValues(column: string): number[] {
    const controls = currentControls();
    if (column === controls.x) {
        return state.points.map((p) => Number(p?.[0])).filter((v) => Number.isFinite(v));
    }
    if (column === controls.y) {
        return state.points.map((p) => Number(p?.[1])).filter((v) => Number.isFinite(v));
    }
    if (column === controls.selectedColorColumn && Array.isArray(state.colorValues)) {
        return state.colorValues.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    }
    return [];
}

export function normalizeAnalyticsView(viewName: string): string {
    if (viewName === 'matrix') return viewName;
    return 'plot';
}

export function disposeScatterChart(resetSignature = false): void {
    state.chart?.dispose?.();
    state.chart = null;
    state.selectionBox = null;
    state.drag = null;
    state.densityTooltipCache = null;
    if (resetSignature) state.lastRenderSignature = '';
}

export function resetScatterContainer(): HTMLElement | null {
    const existing = getEl('scatter-chart');
    if (!existing) return null;
    const replacement = existing.cloneNode(false) as HTMLElement;
    existing.replaceWith(replacement);
    return replacement;
}

export function ensureOptions(selectEl: HTMLSelectElement | null, values: string[], preferredValue?: string): string | null {
    if (!selectEl) return null;
    const current = preferredValue || selectEl.value;
    selectEl.innerHTML = '';
    for (const v of values) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    }
    if (values.includes(current)) selectEl.value = current;
    else if (values.length > 0) selectEl.value = values[0];
    return selectEl.value;
}
