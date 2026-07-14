/**
 * Scatter-page local query-context builders and DOM helpers.
 *
 * The canonical scatter state lives in `store/scatterState.ts` as `scatterState`.
 * This module owns the scatter-specific query builders and DOM helpers, and
 * re-exports `scatterState` as `state` for callers that still import through
 * `./state.js`.
 */

import { datasetState } from '../../store/datasetState.js';
import { getScatterViewSnapshot, scatterState } from '../../store/scatterState.js';
import { buildAdaptiveLineFiltersForQueryState } from '../../services/timeseries/filtering.js';
import type { WorkspaceSnapshot } from '../../contracts/workspace.js';
import { getScatterPlotMetrics } from './layout.js';
import { getDropdownValue, setDropdownOptions } from '../../ui/primitives/Dropdown.js';

// Import scatterState locally as `state` for use in helper functions defined
// in this module, and re-export it so external callers can also use it as `state`.
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
} from '../../store/scatterState.js';
import type { ScatterView } from '../../store/scatterState.js';

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
    const binSizeInput = getEl('scatter-bin-size') as HTMLInputElement | null;
    const matrixSizeInput = getEl('scatter-matrix-cell-size') as HTMLInputElement | null;

    const renderMode = getDropdownValue('scatter-render-mode') || 'density';
    const selectedColorColumn = getDropdownValue('scatter-color-column') || '';

    return {
        x: getDropdownValue('scatter-x-col') || '',
        y: getDropdownValue('scatter-y-col') || '',
        binSize: Number(binSizeInput?.value ?? 10),
        // Density colormap is no longer a per-page toolbar control;
        // it is configured globally on the settings page. The default
        // below MUST stay aligned with `COLOR_SCALES` in
        // `utils/settings.ts` so density mode and the color-by-column
        // scale start in sync.
        colormap: 'viridis',
        normalization: getDropdownValue('scatter-normalization') || 'linear',
        renderMode,
        diagonalMode: getDropdownValue('scatter-diagonal-mode') || 'histogram',
        colorColumn: renderMode === 'density' ? '' : selectedColorColumn,
        selectedColorColumn,
        colorScale: getDropdownValue('scatter-color-scale') || 'viridis',
        matrixMode: getDropdownValue('scatter-matrix-mode') || 'scatter',
        matrixCellSize: Math.max(80, Math.min(400, Number(matrixSizeInput?.value ?? 160))),
    };
}

/* ── Query context builders ───────────────────────────── */

export interface ScatterQueryContext {
    start?: number;
    end?: number;
    filters: Array<{ column: string; from: number; to: number }>;
    lineFilters: ReturnType<typeof buildAdaptiveLineFiltersForQueryState>;
}

function isNearlyEqual(left: number, right: number): boolean {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= scale * 1e-9;
}

function getColumnProfileBounds(column: string): { min: number; max: number } | null {
    const profiles = Array.isArray(datasetState.metadata?.column_profiles) ? datasetState.metadata.column_profiles : [];
    const profile = profiles.find((entry) => entry?.name === column);
    const min = Number(profile?.min);
    const max = Number(profile?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max >= min)) return null;
    return { min, max };
}

const collectColumnRangeFilters = (columnRanges: Record<string, { from: number; to: number }> = {}): Array<{ column: string; from: number; to: number }> => (
    Object.entries(columnRanges)
        .map(([column, range]) => {
            const from = Number(range?.from);
            const to = Number(range?.to);
            if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
            const profileBounds = getColumnProfileBounds(column);
            if (profileBounds && isNearlyEqual(from, profileBounds.min) && isNearlyEqual(to, profileBounds.max)) {
                return null;
            }
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
    columns: { x?: string; y?: string; colorColumn?: string; scopeToColumns?: boolean } = {},
    intent?: Pick<WorkspaceSnapshot, 'filters' | 'viewport'>,
): ScatterQueryContext {
    const activeSnapshot = intent
        ? null
        : getScatterViewSnapshot(scatterState.activeView === 'matrix' ? 'matrix' : 'plot');
    const start = Number(intent?.viewport?.xMin);
    const end = Number(intent?.viewport?.xMax);
    const hasTimeColumn = !!String(datasetState.metadata?.time_column || '').trim();
    const allFilters = collectColumnRangeFilters(
        intent?.filters.columnRanges as Record<string, { from: number; to: number }> | undefined
            ?? activeSnapshot?.columnRanges,
    );
    // Cleaning-plan filters are global row predicates. A range on a third
    // column must constrain every scatter pair/matrix cell, not disappear just
    // because that column is not currently drawn on an axis.
    const filters = columns.scopeToColumns === true
        ? scopeFiltersToColumns(allFilters, [columns.x || '', columns.y || '', columns.colorColumn || ''])
        : allFilters;

    const linkedRangeValid = hasTimeColumn
        && isLinkedBrushEnabled()
        && Number.isFinite(start)
        && Number.isFinite(end)
        && start < end;
    return {
        start: linkedRangeValid ? start : undefined,
        end: linkedRangeValid ? end : undefined,
        filters,
        lineFilters: intent
            ? buildAdaptiveLineFiltersForQueryState([...intent.filters.adaptiveLines])
            : activeSnapshot?.lineFilters.slice() ?? [],
    };
}

export function getActiveScatterFilterColumns(
    columns: { x?: string; y?: string; colorColumn?: string; scopeToColumns?: boolean } = {},
    intent?: Pick<WorkspaceSnapshot, 'filters'>,
): string[] {
    const activeSnapshot = intent
        ? null
        : getScatterViewSnapshot(scatterState.activeView === 'matrix' ? 'matrix' : 'plot');
    const allFilters = collectColumnRangeFilters(
        intent?.filters.columnRanges as Record<string, { from: number; to: number }> | undefined
            ?? activeSnapshot?.columnRanges,
    );
    const filters = columns.scopeToColumns === true
        ? scopeFiltersToColumns(allFilters, [columns.x || '', columns.y || '', columns.colorColumn || ''])
        : allFilters;
    return filters.map((f) => f.column);
}

/* ── Render-signature helpers ─────────────────────────── */

export function buildRenderSignature(controls: ScatterControls): string {
    // The signature must also reflect the current view bounds. The ChartGPU
    // density renderer does not re-bin when only `rawBounds` change (its
    // dirty-state check ignores the view), so we have to force a chart
    // re-create on zoom in density mode. Including the view in the signature
    // makes the scatter page's `renderScatter` flow detect the change and
    // dispose/recreate the chart.
    const view = scatterState.view;
    return [
        controls.x || '',
        controls.y || '',
        controls.renderMode || '',
        controls.selectedColorColumn || '',
        controls.colorScale || '',
        controls.colormap || '',
        controls.normalization || '',
        controls.diagonalMode || '',
        view.xMin, view.xMax, view.yMin, view.yMax,
    ].join('|');
}

/**
 * Build the cache key used by the scatter page-change handler to decide
 * whether the current render can be reused.
 *
 * The typed `{ page: 'scatter' }` navigation listener compares this key
 * against the value stored on the last successful render so an identity
 * dispatch (same filters, same axes, same zoom range) can short-circuit
 * the work. Including `x`, `y`, and `colorColumn` is essential: the
 * heatmap page (`heatmapPage.ts` `container.onclick`) silently mutates the
 * X/Y dropdowns before navigating to the scatter page. If those columns
 * were absent from the key, the handler would treat the navigation as a
 * no-op and leave the chart rendering the previous X/Y's cached points
 * against the new axis labels. See issue follow-up in `usage_issue.md`.
 *
 * Numeric filters and the linked time range are intentionally included —
 * they are part of the request payload that the scatter backend hashes
 * — but we deliberately exclude `view` bounds from this key: zoom
 * state lives on the chart instance and is owned by the zoom handlers.
 */
export function buildOverviewContextKey(context: Partial<ScatterQueryContext> & { x?: string; y?: string; colorColumn?: string }): string {
    return JSON.stringify({
        x: typeof context?.x === 'string' ? context.x : '',
        y: typeof context?.y === 'string' ? context.y : '',
        colorColumn: typeof context?.colorColumn === 'string' ? context.colorColumn : '',
        start: Number.isFinite(context?.start) ? context.start : null,
        end: Number.isFinite(context?.end) ? context.end : null,
        filters: Array.isArray(context?.filters) ? context.filters : [],
        lineFilters: Array.isArray(context?.lineFilters) ? context.lineFilters : [],
    });
}

/** Build the Scatter request payload and its matching overview-cache key together. */
export function buildScatterOverviewContext(
    columns: { x?: string; y?: string; colorColumn?: string; scopeToColumns?: boolean } = {},
    intent?: Pick<WorkspaceSnapshot, 'filters' | 'viewport'>,
): { queryContext: ScatterQueryContext; queryContextKey: string } {
    const queryContext = buildScatterQueryContext(columns, intent);
    return {
        queryContext,
        queryContextKey: buildOverviewContextKey({ ...queryContext, ...columns }),
    };
}

/* ── View / zoom helpers ──────────────────────────────── */

export function clampView(view: ScatterView): ScatterView {
    const f = scatterState.full;
    let xMin = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMin)));
    let xMax = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMax)));
    let yMin = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMin)));
    let yMax = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMax)));

    if (!(xMax > xMin)) { const span = Math.max(1e-9, f.xMax - f.xMin); xMin = f.xMin; xMax = f.xMin + span; }
    if (!(yMax > yMin)) { const span = Math.max(1e-9, f.yMax - f.yMin); yMin = f.yMin; yMax = f.yMin + span; }

    return { xMin, xMax, yMin, yMax };
}

export function applyScatterStateFromCache(resetView = true): void {
    scatterState.points = Array.isArray(scatterState.allPoints) ? scatterState.allPoints : [];
    // Note: colorValues / colorLabels are kept as-is here (may contain NaN/Infinity).
    // Filtering of non-finite color values happens in buildNormalScatterSeries so
    // that array indices stay aligned with the points array.
    scatterState.colorValues = Array.isArray(scatterState.allColorValues) ? scatterState.allColorValues : null;
    scatterState.colorLabels = Array.isArray(scatterState.allColorLabels) ? scatterState.allColorLabels : null;

    const colorExtent = computeColorExtent(scatterState.colorValues);
    scatterState.colorMin = colorExtent?.min ?? null;
    scatterState.colorMax = colorExtent?.max ?? null;

    const domains = computeDomains(scatterState.points);
    scatterState.full = { xMin: domains.xMin, xMax: domains.xMax, yMin: domains.yMin, yMax: domains.yMax };

    if (resetView) {
        scatterState.view = { ...scatterState.full };
        scatterState.zoomHistory = [];
    } else {
        scatterState.view = clampView(scatterState.view);
    }

    setStats({ totalPoints: fmt.format(Number(scatterState.totalPoints ?? scatterState.points.length)) });
}

/* ── Stats display ────────────────────────────────────── */

export function setStats(partial: Record<string, string | number | null | undefined>): void {
    const primaryEl = getEl('scatter-pearson');
    const secondaryEl = getEl('scatter-spearman');

    if (Object.prototype.hasOwnProperty.call(partial, 'primaryLabel') && primaryEl) {
        const label = partial.primaryLabel ?? 'Correlation';
        const value = partial.primaryValue ?? '—';
        primaryEl.textContent = `${label}: ${value}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'secondaryLabel') && secondaryEl) {
        const label = partial.secondaryLabel ?? 'Correlation';
        const value = partial.secondaryValue ?? '—';
        secondaryEl.textContent = `${label}: ${value}`;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'correlationContext')) {
        const context = String(partial.correlationContext ?? '');
        if (primaryEl) primaryEl.title = context;
        if (secondaryEl) secondaryEl.title = context;
    }
}

/* ── Plot metrics ─────────────────────────────────────── */

export function getPlotMetrics(container: HTMLElement | null) {
    const rect = container?.getBoundingClientRect?.();
    if (!rect) return null;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    return getScatterPlotMetrics(width, height);
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

export function ensureOptions(
    selectEl: HTMLElement | null,
    values: string[],
    preferredValue?: string,
    config?: { searchable?: boolean },
): string | null {
    if (!selectEl?.id) return null;
    return setDropdownOptions(
        selectEl.id,
        values.map((value) => ({ value, label: value })),
        {
            preferredValue: preferredValue || getDropdownValue(selectEl.id),
            ...(config?.searchable ? { searchable: true } : {}),
        },
    ) || null;
}
