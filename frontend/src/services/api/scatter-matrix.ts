import type { CorrelationMatrixResponse } from './analytics.js';
import { getJson } from './http.js';
import type { CorrelationMetric } from '../../utils/correlationModes.js';

export async function fetchCorrelationMatrix(
    mode: CorrelationMetric = 'pearson_raw',
): Promise<CorrelationMatrixResponse> {
    const params = new URLSearchParams({ mode });
    return getJson<CorrelationMatrixResponse>(`/api/scatter/correlations/matrix?${params.toString()}`, 'Correlation matrix');
}
