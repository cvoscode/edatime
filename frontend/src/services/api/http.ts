import { DEBUG, dbg } from '../../debug.js';
import type { DatasetMetadata, ScatterPointsResponse, ScatterCorrelationsResponse } from '../../types.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    dedupeInflight as dedupe,
} from './datasetRequestScope.js';

// Re-export the dataset request-scope surface so existing imports from
// `./http.js` keep working. New consumers should import directly from
// `./datasetRequestScope.js`.
export {
    captureDatasetRequestScope,
    assertDatasetRequestScopeActive,
    invalidateDatasetRequestScope,
    __resetDatasetRequestScopeForTests as __resetApiRequestStateForTests,
} from './datasetRequestScope.js';

// ── Request options ──────────────────────────────────────────────────────────

/**
 * Options accepted by the API request helpers.
 *
 * Backwards-compatible with the previous signature that accepted a bare
 * `AbortSignal`: callers can pass either an `AbortSignal` directly or an
 * `ApiRequestOptions` object.
 */
export interface ApiRequestOptions {
    /** Optional abort signal to cancel the underlying fetch. */
    signal?: AbortSignal;
    /**
     * When true (default), the request participates in the dataset
     * request-scope dedupe + invalidation pipeline. Database status / table
     * / connect calls do not read the active dataset snapshot and should
     * pass `{ datasetScoped: false }`.
     */
    datasetScoped?: boolean;
}

function normalizeOptions(
    signalOrOptions: AbortSignal | ApiRequestOptions | undefined,
): ApiRequestOptions {
    if (!signalOrOptions) return {};
    if (signalOrOptions instanceof AbortSignal) return { signal: signalOrOptions };
    return signalOrOptions;
}

// ── Arrow helpers (shared between timeseries and scatter) ──────────────────

type TableFromIPCFn = (buffer: ArrayBuffer) => ArrowTable;

interface ArrowTable {
    schema?: { fields?: Array<{ name?: string; type?: unknown }> };
    numRows: number;
    getChild(name: string): ArrowColumn | null;
}

interface ArrowColumn {
    get(index: number): unknown;
}

let tableFromIPCFn: TableFromIPCFn | null = null;

async function ensureArrowParser(): Promise<TableFromIPCFn> {
    if (tableFromIPCFn) return tableFromIPCFn;
    try {
        const arrow = await import('apache-arrow');
        if (!arrow?.tableFromIPC) {
            throw new Error('Apache Arrow module loaded but tableFromIPC is missing.');
        }
        tableFromIPCFn = arrow.tableFromIPC as TableFromIPCFn;
        return tableFromIPCFn;
    } catch (e) {
        throw new Error(`Failed to load Apache Arrow parser: ${(e as Error).message}`);
    }
}

function resolveTimestampColumnName(
    table: ArrowTable,
    requestedCols: string[],
    colorColumn: string | null,
    headerName: string | null,
): string | null {
    if (headerName && table.getChild(headerName)) return headerName;

    const fieldNames = (table.schema?.fields ?? [])
        .map((field) => field?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
    const excluded = new Set(requestedCols);
    if (colorColumn) excluded.add(colorColumn);

    const nonValueFields = fieldNames.filter((name) => !excluded.has(name) && table.getChild(name));
    if (nonValueFields.length === 1) return nonValueFields[0];

    const temporalFields = fieldNames.filter((name) => /(^ts$|time|date|timestamp)/i.test(name) && table.getChild(name));
    if (temporalFields.length === 1) return temporalFields[0];

    if (fieldNames.length > 0 && table.getChild(fieldNames[0])) return fieldNames[0];
    return null;
}

function toEpochMs(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    const numericValue = typeof value === 'bigint' ? Number(value) : Number(value);
    const abs = Math.abs(numericValue);
    // Thresholds aligned with backend (ingest.rs):
    //   < 1e11  → seconds  → × 1000
    //   1e11–1e14 → milliseconds (passthrough)
    //   1e14–1e17 → microseconds → ÷ 1000
    //   >= 1e17 → nanoseconds → ÷ 1e6
    if (abs >= 1e17) return numericValue / 1e6;
    if (abs >= 1e14) return numericValue / 1e3;
    if (abs >= 1e11) return numericValue;
    return numericValue * 1e3;
}

// ── Runtime response guards ────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertDatasetMetadata(data: unknown): asserts data is DatasetMetadata {
    if (!isObject(data)) throw new Error('Metadata response is not an object');
    if (typeof data.total_rows !== 'number') throw new Error('Metadata missing total_rows');
    if (!Array.isArray(data.columns)) throw new Error('Metadata missing columns array');
    if (!Array.isArray(data.numeric_columns)) throw new Error('Metadata missing numeric_columns');
}

function assertScatterPoints(data: unknown): asserts data is ScatterPointsResponse {
    if (!isObject(data)) throw new Error('Scatter points response is not an object');
    // x/y may be missing when the response is Arrow (columns in body, metadata in headers)
    if (!Array.isArray(data.points)) throw new Error('Scatter response missing points array');
}

function assertScatterCorrelations(data: unknown): asserts data is ScatterCorrelationsResponse {
    if (!isObject(data)) throw new Error('Correlations response is not an object');
    if (!Array.isArray(data.correlations)) throw new Error('Correlations response missing correlations array');
}

// ── Structured API error parsing ───────────────────────────────────────────

interface ApiErrorPayload {
    error?: unknown;
    message?: unknown;
    code?: unknown;
    correlation_id?: unknown;
}

/**
 * Read a structured Error from a non-2xx fetch response.
 *
 * Tries to parse JSON first, then falls back to plain text. Includes
 * `code` and `correlation_id` when the backend provides them so consumers
 * (toasts, telemetry) can render actionable diagnostics.
 */
export async function readApiError(response: Response, label: string): Promise<Error> {
    const status = response.status;
    let contentType = '';
    try {
        contentType = response.headers?.get('content-type') ?? '';
    } catch {
        // Some test fixtures omit `headers`; treat as no content-type.
        contentType = '';
    }
    let detail = '';
    let code: string | undefined;
    let correlationId: string | undefined;

    try {
        if (contentType.includes('application/json')) {
            const parsed = (await response.json()) as ApiErrorPayload;
            const messageRaw = parsed?.message ?? parsed?.error;
            if (typeof messageRaw === 'string' && messageRaw.trim().length > 0) {
                detail = messageRaw;
            } else if (messageRaw != null) {
                detail = String(messageRaw);
            }
            if (typeof parsed?.code === 'string' && parsed.code.trim().length > 0) {
                code = parsed.code;
            }
            if (typeof parsed?.correlation_id === 'string' && parsed.correlation_id.trim().length > 0) {
                correlationId = parsed.correlation_id;
            }
        } else {
            const text = await response.text().catch(() => '');
            detail = text;
        }
    } catch {
        // Fall back to a plain-text read when JSON parsing fails.
        detail = await response.text().catch(() => '');
    }

    const suffix = detail ? ` ${detail}` : '';
    const tag = code ? `[${code}]` : '';
    const correlationTag = correlationId ? ` (correlation_id=${correlationId})` : '';
    const error = new Error(
        `${label} failed (${status})${tag ? ' ' + tag : ''}${correlationTag}${suffix}`.trim(),
    );
    (error as Error & { status?: number; code?: string; correlationId?: string }).status = status;
    if (code) (error as Error & { code?: string }).code = code;
    if (correlationId) (error as Error & { correlationId?: string }).correlationId = correlationId;
    return error;
}

// ── Core fetch helpers ──────────────────────────────────────────────────────

function getJson<T>(
    url: string,
    label: string,
    signalOrOptions?: AbortSignal | ApiRequestOptions,
): Promise<T> {
    const options = normalizeOptions(signalOrOptions);
    dbg(`GET (${label})`, url);
    const scope = options.datasetScoped === false ? null : captureDatasetRequestScope();
    const dedupeKey = options.datasetScoped === false
        ? `GET:unscoped:${url}`
        : `GET:${scope}:${url}`;
    return dedupe(dedupeKey, async () => {
        const res = await globalThis.fetch(
            url,
            options.signal ? { signal: options.signal, cache: 'no-store' } : { cache: 'no-store' },
        );
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        if (!res.ok) {
            throw await readApiError(res, label);
        }
        const data = await res.json() as T;
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        return data;
    });
}

function getBlob(
    url: string,
    label: string,
    signalOrOptions?: AbortSignal | ApiRequestOptions,
): Promise<Blob> {
    const options = normalizeOptions(signalOrOptions);
    dbg(`GET (${label})`, url);
    const scope = options.datasetScoped === false ? null : captureDatasetRequestScope();
    const dedupeKey = options.datasetScoped === false
        ? `GET_BLOB:unscoped:${url}`
        : `GET_BLOB:${scope}:${url}`;
    return dedupe(dedupeKey, async () => {
        const res = await globalThis.fetch(
            url,
            options.signal ? { signal: options.signal, cache: 'no-store' } : { cache: 'no-store' },
        );
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        if (!res.ok) {
            throw await readApiError(res, label);
        }
        const blob = await res.blob();
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        return blob;
    });
}

function postJson<T>(
    url: string,
    body: unknown,
    label: string,
    signalOrOptions?: AbortSignal | ApiRequestOptions,
): Promise<T> {
    const options = normalizeOptions(signalOrOptions);
    dbg(`POST (${label})`, { url, body });
    const scope = options.datasetScoped === false ? null : captureDatasetRequestScope();
    const dedupeKey = options.datasetScoped === false
        ? `POST:unscoped:${url}:${JSON.stringify(body)}`
        : `POST:${scope}:${url}:${JSON.stringify(body)}`;
    return dedupe(dedupeKey, async () => {
        const res = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            ...(options.signal ? { signal: options.signal } : {}),
        });
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        if (!res.ok) {
            throw await readApiError(res, label);
        }
        const data = await res.json() as T;
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        return data;
    });
}

function postBlob(
    url: string,
    body: unknown,
    label: string,
    signalOrOptions?: AbortSignal | ApiRequestOptions,
): Promise<Blob> {
    const options = normalizeOptions(signalOrOptions);
    dbg(`POST (${label})`, { url, body });
    const scope = options.datasetScoped === false ? null : captureDatasetRequestScope();
    const dedupeKey = options.datasetScoped === false
        ? `POST_BLOB:unscoped:${url}:${JSON.stringify(body)}`
        : `POST_BLOB:${scope}:${url}:${JSON.stringify(body)}`;
    return dedupe(dedupeKey, async () => {
        const res = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            ...(options.signal ? { signal: options.signal } : {}),
        });
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        if (!res.ok) {
            throw await readApiError(res, label);
        }
        const blob = await res.blob();
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        return blob;
    });
}

// Aliases for backward compatibility with files that import from http.ts
const getJsonForApi = getJson;
const getBlobForApi = getBlob;
const postJsonForApi = postJson;
const postBlobForApi = postBlob;

// Re-exported under stable names so facade files (http.ts, metadata.ts, etc.) keep working
export {
    getJson,
    getBlob,
    postJson,
    postBlob,
    getJsonForApi,
    getBlobForApi,
    postJsonForApi,
    postBlobForApi,
};

// Also export dbg and DEBUG for route-family modules
export { dbg, DEBUG };

// Re-export helpers needed by route-family modules
export {
    dedupe,
    ensureArrowParser,
    isObject,
    assertDatasetMetadata,
    assertScatterPoints,
    assertScatterCorrelations,
    resolveTimestampColumnName,
    toEpochMs,
    type ArrowTable,
    type ArrowColumn,
};
