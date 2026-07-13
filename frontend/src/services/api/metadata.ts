import type { DatasetMetadata } from '../../types/api.js';
import { getBlob, getJson, assertDatasetMetadata, type ApiRequestOptions } from './http.js';

export async function fetchMetadata(options?: ApiRequestOptions): Promise<DatasetMetadata> {
    const data = await getJson<unknown>('/api/v1/metadata', 'Metadata', options);
    assertDatasetMetadata(data);
    return data;
}

export function fetchSampleDataset(filename: string, options?: ApiRequestOptions): Promise<Blob> {
    const safeName = encodeURIComponent(filename);
    return getBlob(`/api/v1/sample/${safeName}`, 'Sample dataset', {
        ...options,
        datasetScoped: false,
    });
}
