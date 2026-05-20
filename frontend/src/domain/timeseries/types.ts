/**
 * domain/timeseries/types.ts
 * Type definitions for the timeseries domain module.
 *
 * Shared types (ChartViewport, Drawing, ZoomState, RollingBandData, AnomalyRegionData,
 * AdaptiveLineFilter, PendingAdaptivePoint) are imported from types/domains.ts.
 * Local-only types (TimeseriesState, ChartCallbacks, etc.) are defined here.
 */
import type {
    ChartViewport,
    Drawing,
    RollingBandData,
    AnomalyRegionData,
    AdaptiveLineFilter,
    PendingAdaptivePoint,
} from '../../types/domains';

// =============================================================================
// State types
// =============================================================================

// TimeseriesState is extended by domain/timeseries/store.ts with additional
// UI signal state (drawTool, showAnalytics, filterModal, etc.)

// =============================================================================
// Chart callback types (used by TimeseriesChart component props)
// =============================================================================

export interface ChartCallbacks {
    onReady: (updateFn: ChartUpdateFn, chartInstance?: any) => void;
    onChartReady: (instance: any) => void;
    onEngineReady: (engineName: string) => void;
    onZoom: (start: number, end: number, yMin?: number, yMax?: number) => void;
    onZoomOut: () => void;
    onCtrlClick: (dataX: number, dataY: number, clientX: number, clientY: number) => void;
    onChartClick?: (dataX: number, dataY: number) => void;
}

/** (series, xMin, xMax, yMin, yMax) => void */
export type ChartUpdateFn = (
    series: any[],
    xMin?: number,
    xMax?: number,
    yMin?: number,
    yMax?: number
) => void;

export interface ChartRenderConfig {
    drawMode: 'pan' | 'zoom' | 'arrow' | 'box';
    drawColor: string;
    drawWidth: number;
    chartTitle: string;
    xAxisLabel: string;
    yAxisLabel: string;
}

// =============================================================================
// Data types
// =============================================================================

export interface TimeseriesDataResult {
    xValues: Float64Array;
    series: Record<string, Float64Array>;
    returnedRows: number;
    downsampled: boolean;
    colorByColumn?: Record<string, Float64Array>;
}

// =============================================================================
// Local-only types (not in domains.ts)
// =============================================================================

export interface TimeseriesState {
    // Viewport
    viewport: ChartViewport;
    zoomHistory: { zoomStack: ChartViewport[]; currentIndex: number };
    initialView: ChartViewport | null;

    // Series selection
    selectedColumns: string[];
    hiddenColumns: string[];
    colorColumn: string | null;
    seriesVisibility: Record<string, boolean>;
    colors: Record<string, string>;   // column -> custom color
    filters: Record<string, { min: number; max: number }>;  // column -> range filter

    // Drawing
    drawMode: 'pan' | 'zoom' | 'arrow' | 'box';
    drawings: Drawing[];

    // Overlays
    rollingBands: RollingBandData[];
    anomalyRegions: AnomalyRegionData[];

    // Chart meta
    chartTitle: string;
    xAxisLabel: string;
    yAxisLabel: string;

    // Status
    isLoading: boolean;
    isDownsampled: boolean;
    lastDataYMin: number | null;
    lastDataYMax: number | null;
}

export interface TimeseriesConfig {
    columns: string[];
    colorColumn: string | null;
    start: number;
    end: number;
    width: number;
}