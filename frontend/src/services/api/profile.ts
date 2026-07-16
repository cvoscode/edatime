import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import type { DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import { getJson, postJson, type ApiRequestOptions } from './http.js';

/** Start or reuse the version-keyed exact profile for the active source. */
export function startDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    return postJson(apiV1Routes.profile, {}, 'Dataset profile', options);
}

/** Read the current exact-profile cache and session-job state. */
export function fetchDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    return getJson(apiV1Routes.profile, 'Dataset profile', options);
}
