/**
 * Scatter-page local state and query-context builders.
 */

import { appState, buildAdaptiveLineFiltersForQuery } from '../state.js';
import {
    getEl,
    fmt,
    computeColorExtent,
    computeDomains,
    isTemporalColumn,
    isDistributionCompatibleColumn,
    formatValueForColumn,
    normalizeCategoryLabel,
    buildCategoricalColorGroups,
    type CategoricalColorGroups,
} from './helpers.js';

import type { ChartGPUInstance, SeriesConfig } from '../../libs/chartgpu/dist/index.js';
import type { DatasetMetadata } from '../types.js';

/* ── State shape ──────────────────────────────────────── */

export interface ScatterView {
    xMin: number; xMax: number; yMin: number; yMax: number;
}

export interface ScatterDrag {
    pointerId: number;
    startX: number; endX: number;
    startY: number; endY: number;
}

export interface DensityTooltipMeta {
    colorCenter: number;
    colorLo: number;
    colorHi: number;
}

export interface DensityTooltipCache {
    key: string;
    binSize: number;
    metrics: ReturnType<typeof getPlotMetrics>;
    binsBySeriesIndex: Map<number, Map<string, number>>;
    metaBySeriesIndex: Map<number, DensityTooltipMeta>;
}

export interface DistributionLiveEntry {
    name: string;
    histogram?: { bin_edges?: number[]; counts?: number[] };
    min?: number;
    max?: number;
    count?: number;
    mean?: number;
    std_dev?: number;
    median?: number;
    q1?: number;
    q3?: number;
}

export interface DistributionData {
    columns?: DistributionLiveEntry[];
}

interface ScatterState {
    chart: ChartGPUInstance | null;
    initialized: boolean;
    pageInitialized: boolean;
    activeView: string;
    selectedDistributionColumn: string;
    metadata: DatasetMetadata | null;
    totalPoints: number;
    allPoints: [number, number][];
    points: [number, number][];
    allColorValues: number[] | null;
    allColorLabels: unknown[] | null;
    full: ScatterView;
    view: ScatterView;
    zoomHistory: ScatterView[];
    drag: ScatterDrag | null;
    selectionBox: HTMLDivElement | null;
    colorColumn: string;
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
    colorMin: number | null;
    colorMax: number | null;
    correlationsByColumn: Map<string, { pearson?: number | null; spearman?: number | null; column?: string }>;
    lastBinnedText: string;
    lastUpdateMs: number;
    densityTooltipCache: DensityTooltipCache | null;
    lastOptionSeries: SeriesConfig[] | null;
    columnTypes: Map<string, string>;
    lastSuggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>;
    lastRenderSignature: string;
    matrixCache: Map<string, Promise<MatrixCellData>>;
    overviewRequestId: number;
    distributionData: DistributionData | null;
    distributionsFetchId: number;
}

export interface MatrixCellData {
    totalPoints: number;
    points: [number, number][];
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
}

export const state: ScatterState = {
    chart: null,
    initialized: false,
    pageInitialized: false,
    activeView: 'plot',
    selectedDistributionColumn: '',
    metadata: null,
    totalPoints: 0,
    allPoints: [],
    points: [],
    allColorValues: null,
    allColorLabels: null,
    full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    zoomHistory: [],
    drag: null,
    selectionBox: null,
    colorColumn: '',
    colorValues: null,
    colorLabels: null,
    colorMin: null,
    colorMax: null,
    correlationsByColumn: new Map(),
    lastBinnedText: '',
    lastUpdateMs: 0,
    densityTooltipCache: null,
    lastOptionSeries: null,
    columnTypes: new Map(),
    lastSuggestions: [],
    lastRenderSignature: '',
    matrixCache: new Map(),
    overviewRequestId: 0,
    distributionData: null,
    distributionsFetchId: 0,
};

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

export function isLinkedBrushEnabled(): boolean {
    return !!(getEl('scatter-link-brush') as HTMLInputElement | null)?.checked
        || !!(getEl('scatter-matrix-link-range') as HTMLInputElement | null)?.checked;
}

export function buildScatterQueryContext(): ScatterQueryContext {
    const start = Number(appState.currentStart);
    const end = Number(appState.currentEnd);
    const filters = Object.entries(appState.columnRanges || {})
        .map(([column, range]) => {
            const from = Number(range?.from);
            const to = Number(range?.to);
            if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
            return { column, from, to };
        })
        .filter((f): f is { column: string; from: number; to: number } => f !== null);

    return {
        start: isLinkedBrushEnabled() && Number.isFinite(start) ? start : undefined,
        end: isLinkedBrushEnabled() && Number.isFinite(end) ? end : undefined,
        filters,
        lineFilters: buildAdaptiveLineFiltersForQuery(),
    };
}

export function buildDistributionsContext(): ScatterQueryContext {
    const start = Number(appState.currentStart);
    const end = Number(appState.currentEnd);
    const filters = Object.entries(appState.columnRanges || {})
        .map(([column, range]) => {
            const from = Number(range?.from);
            const to = Number(range?.to);
            if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
            return { column, from, to };
        })
        .filter((f): f is { column: string; from: number; to: number } => f !== null);

    return {
        start: Number.isFinite(start) ? start : undefined,
        end: Number.isFinite(end) ? end : undefined,
        filters,
        lineFilters: buildAdaptiveLineFiltersForQuery(),
    };
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
    state.points = Array.isArray(state.allPoints) ? state.allPoints : [];
    state.colorValues = Array.isArray(state.allColorValues) ? state.allColorValues : null;
    state.colorLabels = Array.isArray(state.allColorLabels) ? state.allColorLabels : null;

    const colorExtent = computeColorExtent(state.colorValues);
    state.colorMin = colorExtent?.min ?? null;
    state.colorMax = colorExtent?.max ?? null;

    const domains = computeDomains(state.points);
    state.full = { xMin: domains.xMin, xMax: domains.xMax, yMin: domains.yMin, yMax: domains.yMax };

    if (resetView) {
        state.view = { ...state.full };
        state.zoomHistory = [];
    } else {
        state.view = clampView(state.view);
    }

    setStats({ totalPoints: fmt.format(Number(state.totalPoints ?? state.points.length)) });
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

export function getDistributionColumns(controls = currentControls()): string[] {
    const columns: string[] = [];
    const push = (c: string) => {
        if (!c || columns.includes(c) || !isDistributionCompatibleColumn(c, state.columnTypes)) return;
        columns.push(c);
    };
    push(controls.x);
    push(controls.y);
    push(controls.selectedColorColumn);
    for (const entry of (state.metadata as any)?.columns || []) push(entry?.name);
    return columns;
}

export function resolveSelectedDistributionColumn(entries = getDistributionColumns()): string {
    if (entries.includes(state.selectedDistributionColumn)) return state.selectedDistributionColumn;
    state.selectedDistributionColumn = entries[0] || '';
    return state.selectedDistributionColumn;
}

export function describeDistributionColumnKind(column: string, controls = currentControls()): string {
    const kinds: string[] = [];
    if (column === controls.x) kinds.push('x-axis');
    if (column === controls.y) kinds.push('y-axis');
    if (column === controls.selectedColorColumn) kinds.push('color');
    return kinds.join(' / ') || 'dataset';
}

export function normalizeAnalyticsView(viewName: string): string {
    if (viewName === 'matrix' || viewName === 'distributions') return viewName;
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
