/**
 * scatterState — scatter analytics page state.
 *
 * Extracted from the inline `scatter` slice of AppStateType and the now-orphaned
 * frontend/src/scatter/state.ts. Import from here; do not duplicate.
 */

import type { ChartGPUInstance, SeriesConfig } from '../../libs/chartgpu/dist/index.js';
import type { DatasetMetadata, ScatterFilterSpec, ScatterLineFilterSpec } from '../types.js';
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
    correlationsByColumn: Map<string, { value?: number | null; count?: number; column?: string }>;
    suggestionThreshold: number;
    lastBinnedText: string;
    lastUpdateMs: number;
    densityTooltipCache: DensityTooltipCache | null;
    lastOptionSeries: SeriesConfig[] | null;
    columnTypes: Map<string, string>;
    lastSuggestions: Array<{ x: string; y: string; correlation: number }>;
    lastRenderSignature: string;
    lastQueryContextKey: string;
    matrixCache: Map<string, Promise<MatrixCellData>>;
    matrixColumnOrder: string[];
    overviewRequestId: number;
    scatterRequestId: number;
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
    correlationsByColumn: new Map(),
    suggestionThreshold: 0.7,
    lastBinnedText: '',
    lastUpdateMs: 0,
    densityTooltipCache: null,
    lastOptionSeries: null,
    columnTypes: new Map(),
    lastSuggestions: [],
    lastRenderSignature: '',
    lastQueryContextKey: '',
    matrixCache: new Map(),
    matrixColumnOrder: [],
    overviewRequestId: 0,
    scatterRequestId: 0,
};

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
