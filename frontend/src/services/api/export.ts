import { getJson, postJson } from './http.js';

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportParquet(params: URLSearchParams): Promise<Blob> {
    const res = await globalThis.fetch(`/api/export/parquet?${params.toString()}`);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Parquet export failed (${res.status}) ${text}`);
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
        const text = await res.text().catch(() => '');
        throw new Error(`Scatter parquet export failed (${res.status}) ${text}`);
    }
    return res.blob();
}
