import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { getCorrelationModeLabel, type CorrelationMetric } from '../../utils/correlationModes.js';

export function buildHeatmapStatus(columnCount: number, cellSize: number, clusterCount: number | null): string {
    return clusterCount !== null
        ? `${clusterCount} clusters · ${columnCount} columns · ${cellSize}px cells`
        : `${columnCount} columns · ${cellSize}px cells`;
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
