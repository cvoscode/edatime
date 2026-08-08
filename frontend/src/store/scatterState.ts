/**
 * scatterState — scatter analytics page state.
 *
 * Extracted from the inline `scatter` slice of AppStateType and the now-orphaned
 * frontend/src/features/scatter/state.ts. Import from here; do not duplicate.
 */

import type { ChartGPUInstance, SeriesConfig } from 'chartgpu';
import type { DatasetMetadata } from '../types/api.js';
import type { ScatterFilterSpec, ScatterLineFilterSpec, ScatterPairStats, TopPairItem } from '../types/scatter.js';
import { emitStoreEvent } from './events.js';

/* ── Types (mirror of ScatterState in types.ts) ─────────── */

export interface ScatterView {
    xMin: number; xMax: number; yMin: number; yMax: number;
}
export interface ScatterDrag {
    pointerId: number;
    startX: number; endX: number;
    startY: number; endY: number;
}
export interface DensityTooltipMeta {
    colorCenter: number; colorLo: number; colorHi: number;
}
export interface DensityTooltipCache {
    key: string;
    binSize: number;
    metrics: {
        plotWidth: number;
        plotHeight: number;
        devicePixelRatio: number;
        plotLeftPx: number;
        plotTopPx: number;
        plotRightPx: number;
        plotBottomPx: number;
        exactLeftPx: number;
        exactTopPx: number;
        exactRightPx: number;
        exactBottomPx: number;
        binSizePx: number;
        binSizeCss: number;
        binCountX: number;
        binCountY: number;
    } | null;
    binsBySeriesIndex: Map<number, Map<string, number>>;
    metaBySeriesIndex: Map<number, DensityTooltipMeta>;
    /**
     * Per-axis marginal density counts derived from `binsBySeriesIndex`
     * for series index 0. `null` when the cache has no bins yet.
     *
     * Length matches `metrics.binCountX` / `metrics.binCountY`. Populated
     * alongside the bin map so `updateMarginalPlots` can read the counts
     * straight off the cache instead of re-binning on every redraw.
     */
    marginalCountsX: number[] | null;
    marginalCountsY: number[] | null;
}
export interface MatrixCellData {
    totalPoints: number;
    points: [number, number][];
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
}
export interface ScatterFetchOptions {
    start?: number;
    end?: number;
    filters?: ScatterFilterSpec[];
    lineFilters?: ScatterLineFilterSpec[];
}

export interface ScatterState {
    chart: ChartGPUInstance | null;
    initialized: boolean;
    pageInitialized: boolean;
    activeView: string;
    loading: boolean;
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
    /**
     * Audit issue 2.2: cardinality summary for the categorical
     * color pipeline. `null` when no color column is selected or
     * when the column is continuous. Populated from the
     * `/api/scatter/points` response so the rendering layer can
     * show a "X other categories collapsed" hint under the colorbar.
     */
    colorCardinality: { requested: number; used: number; bucketed: number } | null;
    correlationsByColumn: Map<string, { value?: number | null; count?: number; column?: string }>;
    /**
     * Per-mode correlation maps keyed first by metric mode (e.g.
     * "pearson_raw", "spearman_raw") and then by column. Populated
     * for every family-mode request (raw Pearson, raw Spearman,
     * diff Pearson, diff Spearman) so the chip renderer can read
     * the current Y directly from the appropriate map without
     * falling back to a stale `correlationsByColumn` entry.
     *
     * `correlationsByColumn` is kept as the active-mode convenience
     * view (mirrors `correlationsByMode.get(activeMode)`) and remains
     * the source of truth for `top_pairs`/`suggestions` consumers.
     */
    correlationsByMode: Map<string, Map<string, { value?: number | null; count?: number; column?: string }>>;
    currentPairStats: ScatterPairStats | null;
    suggestionThreshold: number;
    lastBinnedText: string;
    lastUpdateMs: number;
    densityTooltipCache: DensityTooltipCache | null;
    lastOptionSeries: SeriesConfig[] | null;
    columnTypes: Map<string, string>;
    lastSuggestions: Array<{ x: string; y: string; correlation: number }>;
    lastTopPairs: TopPairItem[];
    lastRenderSignature: string;
    lastQueryContextKey: string;
    matrixCache: Map<string, Promise<MatrixCellData>>;
    matrixBatchCache: Map<string, Promise<Map<string, MatrixCellData>>>;
    matrixColumnOrder: string[];
    overviewRequestId: number;
    scatterRequestId: number;
    /**
     * Per-view filter snapshots so the Plot view and the Matrix view can
     * hold independent filter sets. The active view's snapshot is what
     * `buildScatterQueryContext` reads when a scatter fetch runs; the
     * inactive view keeps its last snapshot so the user can switch
     * between them without losing prior work. See
     * `frontend/src/features/scatter/page.ts setScatterView` for the
     * snapshot/restore logic.
     */
    plotFilters: Record<string, { from: number; to: number }>;
    plotLineFilters: ScatterLineFilterSpec[];
    matrixFilters: Record<string, { from: number; to: number }>;
    matrixLineFilters: ScatterLineFilterSpec[];
}

export const scatterState: ScatterState = {
    chart: null,
    initialized: false,
    pageInitialized: false,
    activeView: 'plot',
    loading: false,
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
    colorCardinality: null,
    correlationsByColumn: new Map(),
    correlationsByMode: new Map(),
    currentPairStats: null,
    suggestionThreshold: 0.7,
    lastBinnedText: '',
    lastUpdateMs: 0,
    densityTooltipCache: null,
    lastOptionSeries: null,
    columnTypes: new Map(),
    lastSuggestions: [],
    lastTopPairs: [],
    lastRenderSignature: '',
    lastQueryContextKey: '',
    matrixCache: new Map(),
    matrixBatchCache: new Map(),
    matrixColumnOrder: [],
    overviewRequestId: 0,
    scatterRequestId: 0,
    plotFilters: {},
    plotLineFilters: [],
    matrixFilters: {},
    matrixLineFilters: [],
};

/**
 * Per-view scatter filter snapshots. The scatter page snapshots the active
 * WorkspaceStore filter intent here on view switches so Plot and Matrix can
 * hold different filter sets without leaking into each other.
 */
export interface ScatterFilterSnapshot {
    columnRanges: Record<string, { from: number; to: number }>;
    lineFilters: ScatterLineFilterSpec[];
}

/**
 * Return the filter snapshot for the named scatter view.
 */
export function getScatterViewSnapshot(view: 'plot' | 'matrix'): ScatterFilterSnapshot {
    if (view === 'matrix') {
        return {
            columnRanges: { ...scatterState.matrixFilters },
            lineFilters: scatterState.matrixLineFilters.slice(),
        };
    }
    return {
        columnRanges: { ...scatterState.plotFilters },
        lineFilters: scatterState.plotLineFilters.slice(),
    };
}

/**
 * Replace the filter snapshot for the named scatter view. Used by the
 * scatter page to save filters when leaving a view and to restore them
 * when entering.
 */
export function setScatterViewSnapshot(view: 'plot' | 'matrix', snapshot: ScatterFilterSnapshot): void {
    const previous = { ...scatterState };
    if (view === 'matrix') {
        scatterState.matrixFilters = { ...snapshot.columnRanges };
        scatterState.matrixLineFilters = snapshot.lineFilters.slice();
    } else {
        scatterState.plotFilters = { ...snapshot.columnRanges };
        scatterState.plotLineFilters = snapshot.lineFilters.slice();
    }
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function clearScatterViewSnapshots(): void {
    const previous = { ...scatterState };
    scatterState.plotFilters = {};
    scatterState.plotLineFilters = [];
    scatterState.matrixFilters = {};
    scatterState.matrixLineFilters = [];
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

/* ── Mutations ──────────────────────────────────────────── */

export function setScatterChart(chart: ChartGPUInstance | null): void {
    const previous = { ...scatterState };
    scatterState.chart = chart;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterInitialized(v: boolean): void {
    const previous = { ...scatterState };
    scatterState.initialized = v;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterPageInitialized(v: boolean): void {
    const previous = { ...scatterState };
    scatterState.pageInitialized = v;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterView(view: ScatterView): void {
    const previous = { ...scatterState };
    scatterState.view = { ...view };
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterActiveView(view: string): void {
    const previous = { ...scatterState };
    scatterState.activeView = view;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterPoints(allPoints: [number, number][], points: [number, number][]): void {
    const previous = { ...scatterState };
    scatterState.allPoints = allPoints.map((point) => [point[0], point[1]]);
    scatterState.points = points.map((point) => [point[0], point[1]]);
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterColorState(
    column: string,
    colorValues: number[] | null,
    colorLabels: unknown[] | null,
    colorMin: number | null,
    colorMax: number | null,
): void {
    const previous = { ...scatterState };
    scatterState.colorColumn = column;
    scatterState.colorValues = colorValues ? [...colorValues] : null;
    scatterState.colorLabels = colorLabels ? [...colorLabels] : null;
    scatterState.colorMin = colorMin;
    scatterState.colorMax = colorMax;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterMetadata(metadata: DatasetMetadata | null): void {
    const previous = { ...scatterState };
    scatterState.metadata = metadata;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterLoading(v: boolean): void {
    const previous = { ...scatterState };
    scatterState.loading = v;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function setScatterTotalPoints(n: number): void {
    const previous = { ...scatterState };
    scatterState.totalPoints = n;
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}

export function replaceScatterState(next: Partial<ScatterState>): void {
    const previous = { ...scatterState };
    Object.assign(scatterState, next);
    emitStoreEvent('scatter:state', { previous, next: scatterState });
}
