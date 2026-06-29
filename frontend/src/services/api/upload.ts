import { getJson, postJson } from './http.js';

// ── Upload ─────────────────────────────────────────────────────────────────

export async function previewUpload(formData: FormData, signal?: AbortSignal): Promise<Response> {
    return globalThis.fetch('/api/upload/preview', { method: 'POST', body: formData, signal });
}

export async function uploadDataset(formData: FormData): Promise<Response> {
    return globalThis.fetch('/api/upload', { method: 'POST', body: formData });
}

// ── Database ────────────────────────────────────────────────────────────────
//
// Database status / table / connect calls do NOT read the active dataset
// snapshot, so they pass `{ datasetScoped: false }` to skip the request
// scope dedupe / invalidation pipeline. The `loadDatabaseTable` call DOES
// mutate the active dataset snapshot, so it remains dataset-scoped.

export async function fetchDatabaseTables(): Promise<unknown> {
    return getJson<unknown>('/api/database/tables', 'Database tables', { datasetScoped: false });
}

export async function connectDatabase(body: unknown): Promise<unknown> {
    return postJson<unknown>('/api/database/connect', body, 'Database connect', { datasetScoped: false });
}

export async function loadDatabaseTable(body: unknown): Promise<unknown> {
    return postJson<unknown>('/api/database/load', body, 'Database load');
}

export async function deleteDatabaseConnection(): Promise<Response> {
    return globalThis.fetch('/api/database/connect', { method: 'DELETE' });
}

export async function fetchDatabaseStatus(): Promise<unknown> {
    return getJson<unknown>('/api/database/status', 'Database status', { datasetScoped: false });
}

// ── Drift ──────────────────────────────────────────────────────────────────

export async function fetchDriftStats<T>(payload: unknown, signal?: AbortSignal): Promise<T> {
    return postJson<T>('/api/drift/stats', payload, 'Drift stats', signal);
}

export async function fetchDriftInvestigation<T>(payload: unknown, signal?: AbortSignal): Promise<T> {
    return postJson<T>('/api/drift/investigate', payload, 'Drift investigation', signal);
}
