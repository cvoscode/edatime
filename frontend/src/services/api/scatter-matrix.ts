import type { CorrelationMatrixResponse } from './analytics.js';
import { postJson } from './http.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import type { CorrelationMetric } from '../../contracts/api/v1/scatter.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';

export async function fetchCorrelationMatrix(
    mode: CorrelationMetric = 'pearson_raw',
): Promise<CorrelationMatrixResponse> {
    const plan = cleaningPlanStore.getSnapshot();
    if (!plan) throw new Error('Correlation matrix requests require an active cleaning plan');
    return postJson<CorrelationMatrixResponse>(
        apiV1Routes.scatter.correlationMatrix,
        { mode, cleaning_plan: buildPlanRequestSnapshot(plan) },
        'Correlation matrix',
    );
}
