import type { CorrelationMatrixResponse } from './analytics.js';
import { getJson } from './http.js';

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
    return getJson<CorrelationMatrixResponse>('/api/scatter/correlations/matrix', 'Correlation matrix');
}