import type { AdaptiveLineFilter } from '../../types';

export interface ColumnFilters {
    [column: string]: { min: number; max: number };
}

export interface ProcessedTimeSeries {
    xValues: Float64Array;
    series: Record<string, Float64Array>;
    returnedRows: number;
    downsampled: boolean;
}

export interface BuildTimeSeriesOptions {
    downsampleThreshold?: number;
}

/**
 * Apply column range filters to xValues + all series arrays.
 */
function applyColumnRanges(
    xValues: Float64Array,
    series: Record<string, Float64Array>,
    filters: ColumnFilters
): { xValues: Float64Array; series: Record<string, Float64Array> } {
    if (Object.keys(filters).length === 0) {
        return { xValues, series };
    }

    const filteredTmpX: number[] = [];
    const filteredTmpSeries: Record<string, number[]> = {};

    for (const col of Object.keys(series)) {
        filteredTmpSeries[col] = [];
    }

    const maxLen = Math.min(xValues.length, ...Object.values(series).map(v => v.length));
    for (let i = 0; i < maxLen; i++) {
        let include = true;
        for (const [col, filter] of Object.entries(filters)) {
            const y = series[col]?.[i];
            if (y !== undefined && (y < filter.min || y > filter.max)) {
                include = false;
                break;
            }
        }
        if (include) {
            filteredTmpX.push(xValues[i]);
            for (const col of Object.keys(series)) {
                filteredTmpSeries[col].push(series[col][i]);
            }
        }
    }

    return {
        xValues: Float64Array.from(filteredTmpX),
        series: Object.fromEntries(
            Object.entries(filteredTmpSeries).map(([k, v]) => [k, Float64Array.from(v)])
        ),
    };
}

/**
 * Apply adaptive line filters — these filter by checking if points fall
 * ABOVE/BELOW/WITHIN the filter line segment.
 */
function applyAdaptiveLineFilters(
    xValues: Float64Array,
    series: Record<string, Float64Array>,
    adaptiveFilters: AdaptiveLineFilter[]
): { xValues: Float64Array; series: Record<string, Float64Array> } {
    if (!adaptiveFilters || adaptiveFilters.length === 0) {
        return { xValues, series };
    }

    const adaptiveFilteredX: number[] = [];
    const adaptiveFilteredSeries: Record<string, number[]> = {};
    for (const col of Object.keys(series)) {
        adaptiveFilteredSeries[col] = [];
    }

    for (let i = 0; i < xValues.length; i++) {
        let passAdaptive = true;
        for (const f of adaptiveFilters) {
            const colSeries = series[f.column];
            if (!colSeries) continue;
            const y = colSeries[i];
            if (y === undefined) continue;
            // Calculate expected y on the line at this timestamp
            const dx = f.x2 - f.x1;
            if (dx === 0) continue;
            const expectedY = f.y1 + (f.y2 - f.y1) * (xValues[i] - f.x1) / dx;
            if (f.keepAbove && y <= expectedY) { passAdaptive = false; break; }
            if (!f.keepAbove && y >= expectedY) { passAdaptive = false; break; }
        }
        if (passAdaptive) {
            adaptiveFilteredX.push(xValues[i]);
            for (const col of Object.keys(series)) {
                adaptiveFilteredSeries[col].push(series[col][i]);
            }
        }
    }

    return {
        xValues: Float64Array.from(adaptiveFilteredX),
        series: Object.fromEntries(
            Object.entries(adaptiveFilteredSeries).map(([k, v]) => [k, Float64Array.from(v)])
        ),
    };
}

/**
 * Build processed time series data by applying column range filters
 * and adaptive line filters.
 */
export function buildTimeSeriesData(
    xValues: Float64Array,
    series: Record<string, Float64Array>,
    filters: ColumnFilters,
    adaptiveFilters: AdaptiveLineFilter[],
    options?: BuildTimeSeriesOptions
): ProcessedTimeSeries {
    const { xValues: filteredX, series: filteredSeries } = applyColumnRanges(
        xValues,
        series,
        filters
    );

    const { xValues: adaptiveX, series: adaptiveSeries } = applyAdaptiveLineFilters(
        filteredX,
        filteredSeries,
        adaptiveFilters
    );

    return {
        xValues: adaptiveX,
        series: adaptiveSeries,
        returnedRows: adaptiveX.length,
        downsampled: false,
    };
}