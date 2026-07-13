import type { CorrelationMatrixResponse } from './analytics.js';
import { getJson } from './http.js';
import { apiV1Routes, withApiQuery } from '../../contracts/api/v1/routes.js';
import type { CorrelationMetric } from '../../contracts/api/v1/scatter.js';

export async function fetchCorrelationMatrix(
    mode: CorrelationMetric = 'pearson_raw',
): Promise<CorrelationMatrixResponse> {
    const params = new URLSearchParams({ mode });
    return getJson<CorrelationMatrixResponse>(withApiQuery(apiV1Routes.scatter.correlationMatrix, params), 'Correlation matrix');
}
