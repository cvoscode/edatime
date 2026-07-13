import { getBlob, postBlob } from './http.js';
import type { ApiRequestOptions } from './http.js';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportParquet(
    params: URLSearchParams,
    options?: ApiRequestOptions,
): Promise<Blob> {
    return getBlob(`/api/v1/export/parquet?${params.toString()}`, 'Parquet export', options);
}

export async function exportScatterParquet(
    payload: unknown,
    options?: ApiRequestOptions,
): Promise<Blob> {
    return postBlob('/api/v1/scatter/export/parquet', payload, 'Scatter parquet export', options);
}
