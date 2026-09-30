import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { getCorrelationModeLabel, type CorrelationMetric } from '../../utils/correlationModes.js';

export function buildHeatmapStatus(columnCount: number, cellSize: number): string {
    return `${columnCount} columns · ${cellSize}px cells`;
}

export function getUnavailableMatrixMessage(metric: CorrelationMetric): string {
    return `${getCorrelationModeLabel(metric)} is unavailable in the correlation response.`;
}

export function getSelectedCorrelationMatrix(
    data: CorrelationMatrixResponse,
    metric: CorrelationMetric,
): (number | null)[][] | null {
    return data[metric] ?? null;
}

/**
 * Long-format CSV (one row per cell) of the selected metric, with the pairwise
 * valid n, excluded rows, and working range needed to interpret each coefficient.
 * Returns null when the metric is missing from the response.
 */
export function buildCorrelationMatrixCsv(
    data: CorrelationMatrixResponse,
    metric: CorrelationMetric,
): string | null {
    const matrix = getSelectedCorrelationMatrix(data, metric);
    if (!matrix) return null;
    const isDiff = metric.endsWith('_diff');
    const counts = isDiff ? data.diff_counts : data.counts;
    const eligible = data.input_rows == null ? null : Math.max(0, data.input_rows - (isDiff ? 1 : 0));
    const [start, end] = data.time_range_ms
        ? data.time_range_ms.map((ms) => new Date(ms).toISOString())
        : ['', ''];
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows: unknown[][] = [['row', 'column', 'metric', 'coefficient', 'valid_n', 'excluded', 'eligible', 'working_start_utc', 'working_end_utc']];
    data.columns.forEach((row, i) => data.columns.forEach((column, j) => {
        const n = counts?.[i]?.[j];
        rows.push([row, column, metric, matrix[i]?.[j], n, n == null || eligible == null ? '' : eligible - n, eligible, start, end]);
    }));
    return rows.map((row) => row.map(quote).join(',')).join('\n');
}
