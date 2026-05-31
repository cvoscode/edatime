import type { DatasetMetadata } from '../../types.js';
import { getJson, assertDatasetMetadata } from './http.js';

export async function fetchMetadata(): Promise<DatasetMetadata> {
    const data = await getJson<unknown>('/api/metadata', 'Metadata');
    assertDatasetMetadata(data);
    return data;
}

export async function fetchSampleDataset(filename: string): Promise<Blob> {
    const safeName = encodeURIComponent(filename);
    const res = await globalThis.fetch(`/api/sample/${safeName}`);
    if (!res.ok) throw new Error(`Sample dataset fetch failed (${res.status})`);
    return res.blob();
}
