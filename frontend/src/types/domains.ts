/**
 * Phase 7.1: Domain Types
 *
 * Refined discriminated union types for each analytics domain.
 * Each domain is tagged with a `kind` field for exhaustive matching.
 *
 * PREFERRED IMPORTS:
 *   import type { Domain } from '../types';           // union type
 *   import type { TimeseriesDomain } from '../types'; // specific domain
 */

// =============================================================================
// Shared Types (used across all domains)
// =============================================================================

export interface ToastMessage {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    duration?: number;
}

export interface RollingBandData {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

export interface AnomalyRegionData {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}

export interface ChartViewport {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export interface TimeRange {
    min: number;
    max: number;
}

export interface ColumnFilters {
    [column: string]: { min: number; max: number };
}

export interface AdaptiveLineFilter {
    id: string;
    column: string;
    op: 'above' | 'below';
    value: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

export interface PendingAdaptivePoint {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    screenX: number;
    screenY: number;
    column: string;
}

export interface ZoomState {
    zoomStack: ChartViewport[];
    currentIndex: number;
}

export interface Annotation {
    id: string;
    text: string;
    x: number;
    y: number;
}

export interface ChartInstance {
    // ChartGPU/Fallback chart instance — intentionally opaque
    [key: string]: unknown;
}

export interface Drawing {
    id: string;
    kind: 'arrow' | 'box';
    color: string;
    lineWidth: number;
    points: [number, number][]; // [x,y] in data coordinates
}

export interface SeriesData {
    name: string;
    color: string;
    visible: boolean;
    data: { x: number; y: number }[];
}

export interface FilteredDataObject {
    xValues: Float64Array;
    series: Record<string, Float64Array>;
    returnedRows: number;
    downsampled: boolean;
    colorByColumn?: Record<string, Float64Array>;
}

export interface DataObject {
    xValues: Float64Array;
    series: Record<string, Float64Array>;
    returnedRows: number;
    downsampled: boolean;
}

export interface DragState {
    active: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    mode: 'pan' | 'zoom' | 'select' | 'draw' | 'none';
}

// =============================================================================
// Timeseries Domain
// =============================================================================

export interface TimeseriesConfig {
    viewport: ChartViewport;
    selectedColumns: string[];
    colorColumn: string | null;
}

export interface TimeseriesData {
    xValues: Float64Array;
    series: Record<string, Float64Array>;
    returnedRows: number;
    downsampled: boolean;
    colorByColumn?: Record<string, Float64Array>;
}

export interface TimeseriesFilterParams {
    start: number;
    end: number;
    columns?: string[];
    colorColumn?: string | null;
}

export interface TimeseriesDomain {
    kind: 'timeseries';
    config: TimeseriesConfig;
    data: TimeseriesData | null;
    filterParams: TimeseriesFilterParams | null;
}

// =============================================================================
// Scatter Domain
// =============================================================================

export interface ScatterConfig {
    xCol: string;
    yCol: string;
    colorCol: string;
    sizeCol: string;
    limit: number;
    renderMode: 'scatter' | 'density';
    densityNormalization: 'linear' | 'sqrt' | 'log';
    binSize: number;
}

export interface ScatterData {
    points: [number, number][];
    totalPoints: number;
    returnedPoints: number;
    colorValues: number[] | null;
    colorLabels: (string | null)[] | null;
    colorMin: number | null;
    colorMax: number | null;
    sizeValues: number[] | null;
    sizeMin: number | null;
    sizeMax: number | null;
}

export interface ScatterFilterParams {
    xCol: string;
    yCol: string;
    start?: number;
    end?: number;
    limit: number;
    color?: string | null;
    size?: string | null;
    filters?: Array<{ column: string; min: number; max: number }>;
    line_filters?: Array<{ column: string; op: string; value: number }>;
}

export interface ScatterDomain {
    kind: 'scatter';
    config: ScatterConfig;
    data: ScatterData | null;
    filterParams: ScatterFilterParams | null;
}

// =============================================================================
// FFT Domain
// =============================================================================

export interface FftConfig {
    mode: 'magnitude' | 'psd';
    logScale: boolean;
    windowSize: number;
}

export interface FftResult {
    frequencies: Float64Array;
    magnitude: Float64Array;
}

export interface FftData {
    results: FftResult[];
    sampleCount: number;
}

export interface FftTrace {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
    color: string;
}

export interface FftFilterParams {
    start: string;
    end: string;
    columns: string;
    maxPoints?: number;
}

export interface FftDomain {
    kind: 'fft';
    config: FftConfig;
    data: FftData | null;
    filterParams: FftFilterParams | null;
}

// =============================================================================
// Spectrogram Domain
// =============================================================================

export interface SpectrogramResult {
    frequencies: Float64Array;
    times: Float64Array;
    power: Float64Array; // row-major: [timeIdx * freqCount + freqIdx]
}

export interface SpectrogramDomain {
    kind: 'spectrogram';
    config: {
        windowSize: number;
        hopSize: number;
        column: string;
    };
    data: SpectrogramResult | null;
    filterParams: {
        start: string;
        end: string;
        column: string;
        windowSize: number;
        hopSize?: number;
        maxPoints?: number;
    } | null;
}

// =============================================================================
// Heatmap Domain
// =============================================================================

export interface HeatmapConfig {
    columns: string[];
    windowSize: number;
    method: 'correlation' | 'covariance';
}

export interface HeatmapData {
    matrix: number[][];
    columns: string[];
}

export interface HeatmapFilterParams {
    start?: string;
    end?: string;
    columns: string[];
    windowSize: number;
}

export interface HeatmapDomain {
    kind: 'heatmap';
    config: HeatmapConfig;
    data: HeatmapData | null;
    filterParams: HeatmapFilterParams | null;
}

// =============================================================================
// Drift Domain
// =============================================================================

export interface DriftConfig {
    referenceWindow: [number, number];
    testWindow: [number, number];
    method: 'kl' | 'wasserstein' | 'psi';
}

export interface DriftDomain {
    kind: 'drift';
    config: DriftConfig;
    data: {
        referenceStats: Record<string, { mean: number; std: number }>;
        testStats: Record<string, { mean: number; std: number }>;
        driftScores: Record<string, number>;
    } | null;
    filterParams: {
        referenceWindow: [number, number];
        testWindow: [number, number];
        method: 'kl' | 'wasserstein' | 'psi';
    } | null;
}

// =============================================================================
// Causal Domain
// =============================================================================

export interface CausalConfig {
    columns: string[];
    maxLags: number;
    significanceThreshold: number;
}

export interface CausalGraph {
    nodes: string[];
    edges: Array<[string, string]>;
}

export interface CausalDomain {
    kind: 'causal';
    config: CausalConfig;
    data: CausalGraph | null;
    filterParams: {
        columns: string[];
        maxLags: number;
        significanceThreshold: number;
    } | null;
}

// =============================================================================
// Union type
// =============================================================================

export type Domain =
    | TimeseriesDomain
    | ScatterDomain
    | FftDomain
    | SpectrogramDomain
    | HeatmapDomain
    | DriftDomain
    | CausalDomain;

// =============================================================================
// Domain helpers
// =============================================================================

export type DomainKind = Domain['kind'];

export function isTimeseries(d: Domain): d is TimeseriesDomain {
    return d.kind === 'timeseries';
}

export function isScatter(d: Domain): d is ScatterDomain {
    return d.kind === 'scatter';
}

export function isFft(d: Domain): d is FftDomain {
    return d.kind === 'fft';
}

export function isSpectrogram(d: Domain): d is SpectrogramDomain {
    return d.kind === 'spectrogram';
}

export function isHeatmap(d: Domain): d is HeatmapDomain {
    return d.kind === 'heatmap';
}

export function isDrift(d: Domain): d is DriftDomain {
    return d.kind === 'drift';
}

export function isCausal(d: Domain): d is CausalDomain {
    return d.kind === 'causal';
}
