import { deleteJson, getJson, postJson, readApiError } from './http.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';
import type { ApiRequestOptions } from './http.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';

// ── Upload ─────────────────────────────────────────────────────────────────

export async function previewUpload(formData: FormData, options?: ApiRequestOptions): Promise<Response> {
    const response = await globalThis.fetch(apiV1Routes.uploadPreview, { method: 'POST', body: formData, signal: options?.signal });
    if (!response.ok) throw await readApiError(response, 'Upload preview');
    return response;
}

export async function uploadDataset(formData: FormData): Promise<Response> {
    const response = await globalThis.fetch(apiV1Routes.upload, { method: 'POST', body: formData });
    if (!response.ok) throw await readApiError(response, 'Dataset upload');
    return response;
}

// ── Database ────────────────────────────────────────────────────────────────
//
// Database status / table / connect calls do NOT read the active dataset
// snapshot, so they pass `{ datasetScoped: false }` to skip the request
// scope dedupe / invalidation pipeline. The `loadDatabaseTable` call DOES
// mutate the active dataset snapshot, so it remains dataset-scoped.

export interface DatabaseConnectRequest {
    connection_string: string;
    schema?: string;
    table?: string;
    time_column?: string | null;
    load_snapshot?: boolean;
    snapshot_limit?: number;
}

export interface DatabaseConnectResponse {
    status: 'ok';
    schema: string;
    table: string | null;
    time_column: string | null;
    rows_loaded: number | null;
    message: string;
}

export interface DatabaseStatus {
    connected: boolean;
    schema: string | null;
    table: string | null;
    time_column: string | null;
}

export interface DatabaseTable {
    schema: string;
    name: string;
    kind: 'hypertable' | 'table' | 'view';
    row_estimate: number | null;
}

export interface DatabaseColumn {
    name: string;
    pg_type: string;
    polars_dtype: string;
    is_nullable: boolean;
}

export interface DatabaseLoadRequest {
    schema?: string;
    table: string;
    time_column?: string | null;
    columns?: string[];
    limit?: number;
    start_ms?: number;
    end_ms?: number;
}

export interface DatabaseLoadResponse {
    status: 'ok';
    rows: number;
    numeric_columns: string[];
    timestamp_column: string | null;
    revision: number;
    table: string;
    schema: string;
}

export async function fetchDatabaseTables(): Promise<{ tables: DatabaseTable[] }> {
    return getJson(apiV1Routes.database.tables, 'Database tables', { datasetScoped: false });
}

export async function fetchDatabaseColumns(schema: string, table: string): Promise<{ columns: DatabaseColumn[] }> {
    const query = new URLSearchParams({ schema, table });
    return getJson(`${apiV1Routes.database.columns}?${query}`, 'Database columns', { datasetScoped: false });
}

export async function connectDatabase(body: DatabaseConnectRequest): Promise<DatabaseConnectResponse> {
    return postJson(apiV1Routes.database.connect, body, 'Database connect', { datasetScoped: false });
}

export async function loadDatabaseTable(body: DatabaseLoadRequest): Promise<DatabaseLoadResponse> {
    return postJson(apiV1Routes.database.load, body, 'Database load');
}

export function deleteDatabaseConnection(): Promise<{ status: 'ok'; message: string }> {
    return deleteJson(apiV1Routes.database.connect, 'Database disconnect', { datasetScoped: false });
}

export async function fetchDatabaseStatus(): Promise<DatabaseStatus> {
    return getJson(apiV1Routes.database.status, 'Database status', { datasetScoped: false });
}

// ── Drift ──────────────────────────────────────────────────────────────────

export async function fetchDriftStats<T>(payload: unknown, options?: ApiRequestOptions): Promise<T> {
    return postJson<T>(apiV1Routes.drift.stats, withCleaningPlan(payload), 'Drift stats', options);
}

export async function fetchDriftInvestigation<T>(payload: unknown, options?: ApiRequestOptions): Promise<T> {
    return postJson<T>(apiV1Routes.drift.investigate, withCleaningPlan(payload), 'Drift investigation', options);
}

function withCleaningPlan(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    const plan = cleaningPlanStore.getSnapshot();
    if (!plan) throw new Error('Drift requests require an active cleaning plan');
    return { ...(payload as Record<string, unknown>), cleaningPlan: buildPlanRequestSnapshot(plan) };
}
