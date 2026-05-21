/**
 * Timeseries types — domain models for the timeseries feature.
 */
import type { ChartViewport, RollingBandData, AnomalyRegionData, Drawing } from '@/types/domains';

// Re-export chart viewport for convenience
export type { ChartViewport };

export interface TimeseriesFilters {
    [column: string]: { min: number; max: number };
}

export type DrawMode = 'pan' | 'zoom' | 'select' | 'arrow' | 'box';

export interface TimeseriesData {
    xValues: Float64Array;
    series: Record<string, Float64Array>;
    returnedRows: number;
    downsampled: boolean;
    colorByColumn?: Record<string, Float64Array>;
}

export interface SeriesConfig {
    name: string;
    data: number[][]; // [[x, y], [x, y], ...]
    color: string;
    visible: boolean;
}

export interface ViewportState {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export interface ZoomHistory {
    zoomStack: ViewportState[];
    currentIndex: number;
}