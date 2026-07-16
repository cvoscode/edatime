import { postBlob } from './http.js';
import type { ApiRequestOptions } from './http.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportScatterParquet(
    payload: unknown,
    options?: ApiRequestOptions,
): Promise<Blob> {
    return postBlob(apiV1Routes.scatter.exportParquet, payload, 'Scatter parquet export', options);
}
