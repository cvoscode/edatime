import { readApiError } from './http.js';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportParquet(params: URLSearchParams): Promise<Blob> {
    const res = await globalThis.fetch(`/api/export/parquet?${params.toString()}`);
    if (!res.ok) {
        throw await readApiError(res, 'Parquet export');
    }
    return res.blob();
}

export async function exportScatterParquet(payload: unknown): Promise<Blob> {
    const res = await globalThis.fetch('/api/scatter/export/parquet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw await readApiError(res, 'Scatter parquet export');
    }
    return res.blob();
}
