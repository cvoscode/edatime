import type { DatasetMetadata } from '../../types.js';
import { getJson, assertDatasetMetadata, type ApiRequestOptions } from './http.js';

export async function fetchMetadata(options?: ApiRequestOptions): Promise<DatasetMetadata> {
    const data = await getJson<unknown>('/api/v1/metadata', 'Metadata', options);
    assertDatasetMetadata(data);
    return data;
}

export async function fetchSampleDataset(filename: string): Promise<Blob> {
    const safeName = encodeURIComponent(filename);
    const res = await globalThis.fetch(`/api/v1/sample/${safeName}`);
    if (!res.ok) throw new Error(`Sample dataset fetch failed (${res.status})`);
    return res.blob();
}
