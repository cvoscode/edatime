import type { CorrelationMatrixResponse } from './analytics.js';
import { postJson } from './http.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import type { CorrelationMetric } from '../../contracts/api/v1/scatter.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import type { ScatterFetchOptions } from '../../types/scatter.js';
import { buildActiveScatterPlanRequest } from './scatter.js';

export async function fetchCorrelationMatrix(
    mode: CorrelationMetric = 'pearson_raw',
    options: ScatterFetchOptions | null = null,
): Promise<CorrelationMatrixResponse> {
    if (!cleaningPlanStore.getSnapshot()) throw new Error('Correlation matrix requests require an active cleaning plan');
    return postJson<CorrelationMatrixResponse>(
        apiV1Routes.scatter.correlationMatrix,
        { mode, cleaning_plan: buildActiveScatterPlanRequest(options) },
        'Correlation matrix',
    );
}
