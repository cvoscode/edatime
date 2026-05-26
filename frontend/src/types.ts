/** Shared type definitions for the EdaTime frontend. */

import type { ChartGPUInstance, SeriesConfig } from '../libs/chartgpu/dist/index.js';

// ── API response types ─────────────────────────────────────────────────────

export interface ColumnMetadata {
    name: string;
    dtype: string;
}

export interface TimeRange {
    min: number;
    max: number;
}

export interface Histogram {
    bin_edges: number[];
    counts: number[];
}

export interface ColumnProfile {
    name: string;
    dtype: string;
    count: number;
    non_null_count: number;
    null_count: number;
    min: number | string | null;
    max: number | string | null;
    mean: number | null;
    median: number | null;
    std: number | null;
    unique: number | null;
    top: string | null;
    freq: number | null;
    histogram: Histogram | null;
}

export interface DatasetMetadata {
    revision?: number;
    total_rows: number;
    columns: ColumnMetadata[];
    numeric_columns: string[];
    time_column: string | null;
    time_range: TimeRange | null;
    column_profiles: ColumnProfile[];
}

export interface DataFetchMeta {
    downsampled: boolean;
    downsampleKnown: boolean;
    returnedRows: number;
    targetPoints: number;
}

export interface DataObject {
    ts: Float64Array;
    values: Record<string, Float64Array>;
    color: (number | string | null)[] | null;
    color_column: string | null;
    _meta: DataFetchMeta;
}

export interface FilteredDataObject {
    ts?: Float64Array;
    values?: Record<string, Float64Array>;
    color?: (number | string | null)[] | null;
    color_column?: string | null;
    _meta?: DataFetchMeta;
    series: Record<string, SeriesData>;
    colorByColumn: Record<string, (number | string | null)[]>;
}

export interface SeriesData {
    x: Float64Array;
    y: Float64Array;
}

export interface ScatterPointsResponse {
    x: string;
    y: string;
    color: string | null;
    total_points: number;
    returned_points: number;
    points: [number, number][];
    color_values: number[] | null;
    color_labels: (string | null)[] | null;
    color_min: number | null;
    color_max: number | null;
}

export interface CorrelationItem {
    column: string;
    count: number;
    pearson: number | null;
    spearman: number | null;
}

export interface ScatterCorrelationsResponse {
    base_column: string;
    threshold: number;
    numeric_columns: string[];
    correlations: CorrelationItem[];
    suggestions: CorrelationItem[];
}

// ── State types ────────────────────────────────────────────────────────────

/** Hydrated column profile as stored in app state (differs from raw API ColumnProfile). */
export interface ProfileRow {
    name: string;
    dtype: string;
    nonNullCount: number;
    nullCount: number;
    min: number | null;
    max: number | null;
    histCounts: number[];
    [key: string]: unknown;
}

export interface ColumnRange {
    from: number;
    to: number;
}

export interface AdaptiveLineFilter {
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

export interface PendingAdaptivePoint {
    column: string;
    x: number;
    y: number;
    /** Second endpoint — when set, a preview line is drawn instead of a dot. */
    x2?: number;
    y2?: number;
}

export interface ChartTextOverlays {
    title: string;
    xLabel: string;
    yLabel: string;
}

export interface ZoomEntry {
    start: number;
    end: number;
}

export interface ViewSnapshot {
    xMin: number | null;
    xMax: number | null;
    yMin: number | null;
    yMax: number | null;
}

export type YMode = 'fit' | 'lock' | 'restore';

export interface ProfileGridSort {
    key: string | null;
    dir: 'asc' | 'desc';
}

export interface ProfileColumnDef {
    key: string;
    label: string;
    minWidth: number;
    defaultWidth: number;
    sortable: boolean;
}

export interface AppStateType {
    metadata: DatasetMetadata | null;
    numericCols: string[];
    seriesColors: Record<string, string>;
    columnProfiles: ProfileRow[];
    previewSelectedColumns: string[];
    previewTimeColumn: string | null;
    profileFilterText: string;
    filterText: string;
    selectedCols: string[];
    adaptiveFilterColumn: string | null;
    columnRanges: Record<string, ColumnRange>;
    adaptiveLineFilters: AdaptiveLineFilter[];
    pendingAdaptivePoint: PendingAdaptivePoint | null;
    lastFetchedData: DataObject | null;
    currentStart: number | null;
    currentEnd: number | null;
    chart: ChartInstance | null;
    fetchDebounceId: ReturnType<typeof setTimeout> | null;
    selectedColorColumn: string | null;
    analysisBound: boolean;
    refetchOnZoom: boolean;
    initialView: ViewSnapshot | null;
    zoomHistory: ViewSnapshot[];
    pendingYMode: YMode | null;
    pendingRestoreY: { min: number; max: number } | null;
    profileGridBound: boolean;
    profileGridHeaderBound: boolean;
    profileGridSort: ProfileGridSort;
    profileGridColWidths: number[];
    chartText: ChartTextOverlays;

    // Analytics overlays
    rollingEnabled: boolean;
    rollingWindow: number;
    rollingBands: RollingBandData[] | null;
    anomalyEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    anomalyRegions: AnomalyRegionData[] | null;
    /** Preview of a spectral-filtered signal for the timeseries chart overlay */
    spectralFilterPreview?: SpectralFilterPreview | null;
    /** Dataset revision counter (incremented on upload) */
    datasetRevision?: number;

    // Scatter slice (merged from scatter/state.ts to fix color-by-column sync)
    scatter: ScatterState;
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

export interface AnomalyResponse {
    method: string;
    threshold: number;
    regions: AnomalyRegionData[];
}

export interface TransformResponse {
    status: string;
    column: string;
    expression: string;
}

export interface SpectralFilterPreview {
    column: string;
    ts: number[];
    values: number[];
    filterType: string;
    lowHz?: number;
    highHz?: number;
}


export interface ChartInstance {
    init(): Promise<void>;
    updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void;
    setXRange(min: number, max: number): void;
    setYRange(min: number, max: number): void;
    setChartText(title: string, xLabel: string, yLabel: string): void;
    onCrosshairMove(callback: (data: CrosshairData) => void): void;
    onClick(callback: (data: unknown) => void): void;
    supportsZoomControls(): boolean;
    getXDomain(): { min: number; max: number } | null;
    getYRange(): { min: number; max: number } | null;
    fitYToData(): void;
    setDrawMode(mode: string, color: string, width: number): void;
    clearDrawings(): void;
    exportPNG(): void;
    exportSVG(): void;
    exportHTML(): void;
    requestOverlayRender?(): void;
    cssPointToData?(clientX: number, clientY: number): { x: number; y: number } | null;
    destroy?(): void;
}

export interface ChartAdapter {
    label?: string;
    create(containerId: string, callbacks?: Record<string, unknown>): ChartInstance;
}

export interface CrosshairData {
    x: number | null;
    y?: number;
    seriesValues?: Record<string, number>;
}

export interface ClickData {
    x: number;
    y: number;
    seriesValues?: Record<string, number>;
}

// ── Scatter filter types ───────────────────────────────────────────────────

export interface ScatterFilterSpec {
    column: string;
    from: number;
    to: number;
}

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
    metrics: {
        width: number; height: number; grid: { left: number; right: number; top: number; bottom: number };
        plotLeft: number; plotRight: number; plotTop: number; plotBottom: number;
        plotWidth: number; plotHeight: number;
    };
    binsBySeriesIndex: Map<number, Map<string, number>>;
    metaBySeriesIndex: Map<number, DensityTooltipMeta>;
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

export interface MatrixCellData {
    totalPoints: number;
    points: [number, number][];
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
}

export interface ScatterLineFilterSpec {
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}

export interface ScatterFetchOptions {
    start?: number;
    end?: number;
    filters?: ScatterFilterSpec[];
    lineFilters?: ScatterLineFilterSpec[];
}

// ── Augment window for debug namespace ─────────────────────────────────────

declare global {
    interface Window {
        __edatime: {
            state?: AppStateType;
            DEBUG?: boolean;
            debugYSnapshot?: unknown;
            keyboardShortcutsBound?: boolean;
            exportChartFilteredData?: (format?: 'csv' | 'json') => boolean;
            exportScatterData?: (format: string) => void;
            ensureDatasetReady?: (page?: string) => Promise<void>;
            [key: string]: unknown;
        };
    }
    interface Navigator {
        gpu?: {
            requestAdapter(): Promise<any | null>;
        };
    }
}
