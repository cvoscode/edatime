import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { getCorrelationModeLabel, type CorrelationMetric } from '../../utils/correlationModes.js';

export function buildHeatmapStatus(columnCount: number, cellSize: number, clusterCount: number | null): string {
    return clusterCount !== null
        ? `${clusterCount} clusters · ${columnCount} columns · ${cellSize}px cells`
        : `${columnCount} columns · ${cellSize}px cells`;
}

export function getUnsupportedMetricMessage(metric: CorrelationMetric): string {
    return `${getCorrelationModeLabel(metric)} requires the updated server payload. Restart the server to use Kendall tau and first-difference correlation modes.`;
}

export function getSelectedCorrelationMatrix(
    data: CorrelationMatrixResponse,
    metric: CorrelationMetric,
): (number | null)[][] | null {
    const selected = data[metric];
    if (selected) return selected;
    if (metric === 'pearson_raw') return data.pearson ?? null;
    if (metric === 'spearman_raw') return data.spearman ?? null;
    return null;
}
