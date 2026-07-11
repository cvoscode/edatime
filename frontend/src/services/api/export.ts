import { getBlob, postBlob } from './http.js';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportParquet(params: URLSearchParams): Promise<Blob> {
    return getBlob(`/api/export/parquet?${params.toString()}`, 'Parquet export');
}

export async function exportScatterParquet(payload: unknown): Promise<Blob> {
    return postBlob('/api/scatter/export/parquet', payload, 'Scatter parquet export');
}
