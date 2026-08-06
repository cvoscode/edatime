import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import { getJson, type ApiRequestOptions } from './http.js';

export interface ApiCapabilities {
    budgets?: {
        analytics_points?: number;
    };
}

/** Read server limits that shape client-side analysis requests. */
export function fetchCapabilities(options?: ApiRequestOptions): Promise<ApiCapabilities> {
    return getJson<ApiCapabilities>(apiV1Routes.capabilities, 'Capabilities', {
        ...options,
        datasetScoped: false,
    });
}
