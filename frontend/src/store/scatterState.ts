/**
 * scatterState — scatter analytics page state.
 *
 * Extracted from the inline `scatter` slice of AppStateType and the now-orphaned
 * frontend/src/scatter/state.ts. Import from here; do not duplicate.
 */

import type { ChartGPUInstance, SeriesConfig } from '../../libs/chartgpu/dist/index.js';
import type { DatasetMetadata, ScatterFilterSpec, ScatterLineFilterSpec } from '../types.js';

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
    metrics: { plotWidth: number; plotHeight: number } | null;
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
    correlationsByColumn: Map<string, { pearson?: number | null; spearman?: number | null; column?: string }>;
    suggestionThreshold: number;
    lastBinnedText: string;
    lastUpdateMs: number;
    densityTooltipCache: DensityTooltipCache | null;
    lastOptionSeries: SeriesConfig[] | null;
    columnTypes: Map<string, string>;
    lastSuggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>;
    lastRenderSignature: string;
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
    matrixCache: new Map(),
    matrixColumnOrder: [],
    overviewRequestId: 0,
    scatterRequestId: 0,
};

/* ── Mutations ──────────────────────────────────────────── */

export function setScatterChart(chart: ChartGPUInstance | null): void {
    scatterState.chart = chart;
}

export function setScatterInitialized(v: boolean): void {
    scatterState.initialized = v;
}

export function setScatterPageInitialized(v: boolean): void {
    scatterState.pageInitialized = v;
}

export function setScatterView(view: ScatterView): void {
    scatterState.view = view;
}

export function setScatterActiveView(view: string): void {
    scatterState.activeView = view;
}

export function setScatterPoints(allPoints: [number, number][], points: [number, number][]): void {
    scatterState.allPoints = allPoints;
    scatterState.points = points;
}

export function setScatterColorState(
    column: string,
    colorValues: number[] | null,
    colorLabels: unknown[] | null,
    colorMin: number | null,
    colorMax: number | null,
): void {
    scatterState.colorColumn = column;
    scatterState.colorValues = colorValues;
    scatterState.colorLabels = colorLabels;
    scatterState.colorMin = colorMin;
    scatterState.colorMax = colorMax;
}

export function setScatterMetadata(metadata: DatasetMetadata | null): void {
    scatterState.metadata = metadata;
}

export function setScatterLoading(v: boolean): void {
    scatterState.loading = v;
}

export function setScatterTotalPoints(n: number): void {
    scatterState.totalPoints = n;
}