import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import type { DatasetMetadata } from '../../contracts/api/v1/dataset.js';
import { getBlob, getJson, assertDatasetMetadata, type ApiRequestOptions } from './http.js';

export async function fetchMetadata(options?: ApiRequestOptions): Promise<DatasetMetadata> {
    const data = await getJson<unknown>(apiV1Routes.metadata, 'Metadata', options);
    assertDatasetMetadata(data);
    return data;
}

export function fetchSampleDataset(filename: string, options?: ApiRequestOptions): Promise<Blob> {
    return getBlob(apiV1Routes.sample(filename), 'Sample dataset', {
        ...options,
        datasetScoped: false,
    });
}
