import { getBlob, postBlob } from './http.js';
import type { ApiRequestOptions } from './http.js';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportParquet(
    params: URLSearchParams,
    signalOrOptions?: AbortSignal | ApiRequestOptions,
): Promise<Blob> {
    return getBlob(`/api/export/parquet?${params.toString()}`, 'Parquet export', signalOrOptions);
}

export async function exportScatterParquet(
    payload: unknown,
    signalOrOptions?: AbortSignal | ApiRequestOptions,
): Promise<Blob> {
    return postBlob('/api/scatter/export/parquet', payload, 'Scatter parquet export', signalOrOptions);
}
