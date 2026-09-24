import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import type { DatasetProfileResponse } from '../../contracts/api/v1/dataset.js';
import { getJson, postJson, type ApiRequestOptions } from './http.js';
import { datasetProfiles } from '../profile/datasetProfiles.js';

async function shareProfile(request: Promise<DatasetProfileResponse>, options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    const response = await request;
    if (!options?.signal?.aborted) datasetProfiles.publish(response);
    return response;
}

/** Start or reuse the version-keyed exact profile for the active source. */
export function startDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    return shareProfile(postJson(apiV1Routes.profile, {}, 'Dataset profile', options), options);
}

/** Read the current exact-profile cache and session-job state. */
export function fetchDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    return shareProfile(getJson(apiV1Routes.profile, 'Dataset profile', options), options);
}

/** Start or reuse the bounded `sample-v1` profile for the active source. */
export function startSampledDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    return shareProfile(postJson(apiV1Routes.profileSample, {}, 'Sampled dataset profile', options), options);
}

/** Read the bounded sampled profile cache and session-job state. */
export function fetchSampledDatasetProfile(options?: ApiRequestOptions): Promise<DatasetProfileResponse> {
    return shareProfile(getJson(apiV1Routes.profileSample, 'Sampled dataset profile', options), options);
}
