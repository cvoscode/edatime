/**
 * Timeseries API client - fetch wrappers for timeseries data endpoints.
 *
 * Handles:
 * - Arrow IPC fetch for time-series data (primary transport)
 * - JSON fetch for analytics (rolling bands, anomaly regions)
 * - AbortController integration
 * - Error normalization
 */
import { getJson } from '@/services/api/client';
import type { TimeseriesData } from '../domain/types';

export interface TimeseriesRequest {
    start: string;
    end: string;
    width: number;
    xCol: string;
    columns: string[];
    signal?: AbortSignal;
    colorColumn?: string | null;
}

export async function fetchTimeseriesData(req: TimeseriesRequest): Promise<TimeseriesData> {
    const { start, end, width, xCol, columns, signal, colorColumn } = req;

    const params = new URLSearchParams({
        start,
        end,
        width: String(width),
        columns: columns.join(','),
    });
    if (xCol) params.set('xCol', xCol);
    if (colorColumn) params.set('colorColumn', colorColumn);

    const url = `/api/data?${params.toString()}`;

    const { fetchArrow } = await import('@/services/api/client');
    const response = await fetchArrow(url, signal);
    const buffer = await response.arrayBuffer();

    return decodeArrowTimeseries(buffer, columns, colorColumn);
}

export async function fetchRollingBands(
    start: string,
    end: string,
    columns: string,
    window: number,
    signal?: AbortSignal
) {
    return getJson(
        `/api/aggregate?start=${start}&end=${end}&columns=${columns}&window=${window}`,
        signal
    );
}

export async function fetchAnomalies(
    start: string,
    end: string,
    columns: string,
    method: 'zscore' | 'iqr',
    threshold: number,
    signal?: AbortSignal
) {
    const params = new URLSearchParams({ start, end, columns, method, threshold: String(threshold) });
    return getJson(`/api/anomalies?${params.toString()}`, signal);
}

export async function decodeArrowTimeseries(
    buffer: ArrayBuffer,
    columns: string[],
    colorColumn: string | null | undefined
): Promise<TimeseriesData> {
    const { tableFromIPC } = await import('apache-arrow');

    const table = tableFromIPC(buffer);
    const xValues = extractFloat64Column(table, table.schema.names[0] as string);

    const series: Record<string, Float64Array> = {};
    for (const col of columns) {
        series[col] = extractFloat64Column(table, col);
    }

    const returnedRows = xValues.length;

    let colorByColumn: Record<string, Float64Array> | undefined;
    if (colorColumn) {
        colorByColumn = {};
        colorByColumn[colorColumn] = extractFloat64Column(table, colorColumn);
    }

    return { xValues, series, returnedRows, downsampled: false, colorByColumn };
}

function extractFloat64Column(table: any, name: string): Float64Array {
    const col = table.getChild(name);
    if (!col) return new Float64Array(0);

    const values: number[] = [];
    for (let i = 0; i < col.length; i++) {
        const v = col.get(i);
        values.push(typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    }
    return Float64Array.from(values);
}
