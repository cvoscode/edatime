import { deleteJson, getJson, postJson } from './http.js';
import type { ApiRequestOptions } from './http.js';

// ── Upload ─────────────────────────────────────────────────────────────────

export async function previewUpload(formData: FormData, options?: ApiRequestOptions): Promise<Response> {
    return globalThis.fetch('/api/v1/upload/preview', { method: 'POST', body: formData, signal: options?.signal });
}

export async function uploadDataset(formData: FormData): Promise<Response> {
    return globalThis.fetch('/api/v1/upload', { method: 'POST', body: formData });
}

// ── Database ────────────────────────────────────────────────────────────────
//
// Database status / table / connect calls do NOT read the active dataset
// snapshot, so they pass `{ datasetScoped: false }` to skip the request
// scope dedupe / invalidation pipeline. The `loadDatabaseTable` call DOES
// mutate the active dataset snapshot, so it remains dataset-scoped.

export async function fetchDatabaseTables(): Promise<unknown> {
    return getJson<unknown>('/api/v1/database/tables', 'Database tables', { datasetScoped: false });
}

export async function connectDatabase(body: unknown): Promise<unknown> {
    return postJson<unknown>('/api/v1/database/connect', body, 'Database connect', { datasetScoped: false });
}

export async function loadDatabaseTable(body: unknown): Promise<unknown> {
    return postJson<unknown>('/api/v1/database/load', body, 'Database load');
}

export function deleteDatabaseConnection(): Promise<unknown> {
    return deleteJson<unknown>('/api/v1/database/connect', 'Database disconnect', { datasetScoped: false });
}

export async function fetchDatabaseStatus(): Promise<unknown> {
    return getJson<unknown>('/api/v1/database/status', 'Database status', { datasetScoped: false });
}

// ── Drift ──────────────────────────────────────────────────────────────────

export async function fetchDriftStats<T>(payload: unknown, options?: ApiRequestOptions): Promise<T> {
    return postJson<T>('/api/v1/drift/stats', payload, 'Drift stats', options);
}

export async function fetchDriftInvestigation<T>(payload: unknown, options?: ApiRequestOptions): Promise<T> {
    return postJson<T>('/api/v1/drift/investigate', payload, 'Drift investigation', options);
}
