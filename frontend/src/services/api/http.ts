import { DEBUG, dbg } from '../../debug.js';
import type { ScatterPointsResponse, ScatterCorrelationsResponse } from '../../types/scatter.js';
import type { DatasetMetadata, ExecutionIdentity } from '../../types/api.js';
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
 * Request options shared by API route families.
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

/** Decode the immutable result provenance contract shared by plan-aware routes. */
function readExecutionIdentity(headers: Pick<Headers, 'get'> | null | undefined): ExecutionIdentity | undefined {
    const sourceVersionId = headers?.get('x-edatime-source-version')?.trim();
    const sourceRevision = Number(headers?.get('x-edatime-source-revision'));
    const schemaFingerprint = headers?.get('x-edatime-schema-fingerprint')?.trim();
    const planHash = headers?.get('x-edatime-plan-hash')?.trim();
    if (!sourceVersionId || !Number.isSafeInteger(sourceRevision) || sourceRevision < 0
        || !schemaFingerprint || !planHash) {
        return undefined;
    }
    return { sourceVersionId, sourceRevision, schemaFingerprint, planHash };
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

function assertJsonContainer(data: unknown, label: string): void {
    if (!isObject(data) && !Array.isArray(data)) {
        throw new Error(`${label} response does not match the contracted JSON container shape`);
    }
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

export interface ApiErrorPayload {
    error: string;
    message: string;
    kind: string;
    code: string;
    correlation_id: string;
    request_id: string;
}

const API_ERROR_FIELDS = [
    'error',
    'message',
    'kind',
    'code',
    'correlation_id',
    'request_id',
] as const;

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
    if (!isObject(value)) return false;
    return API_ERROR_FIELDS.every((field) => (
        typeof value[field] === 'string' && value[field].trim().length > 0
    ));
}

function formatErrorContractViolation(value: unknown): string {
    if (!isObject(value)) return 'error response is not a JSON object';
    const invalidFields = API_ERROR_FIELDS.filter((field) => (
        typeof value[field] !== 'string' || value[field].trim().length === 0
    ));
    return `error response violates the v1 error contract; missing or invalid: ${invalidFields.join(', ')}`;
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
    let kind: string | undefined;
    let contractViolation: string | undefined;
    const declaresV1Contract = response.headers?.get('x-edatime-contract')?.trim() === 'v1';

    try {
        if (contentType.includes('application/json')) {
            // Clone real Fetch responses before decoding so malformed JSON can
            // still retain the raw server body for diagnostics. Test doubles
            // without clone() continue to use their json() implementation.
            const jsonSource = typeof response.clone === 'function' ? response.clone() : response;
            const parsed: unknown = await jsonSource.json();
            if (declaresV1Contract && !isApiErrorPayload(parsed)) {
                contractViolation = formatErrorContractViolation(parsed);
            }
            const payload = isObject(parsed) ? parsed : {};
            const messageRaw = payload.message ?? payload.error;
            if (typeof messageRaw === 'string' && messageRaw.trim().length > 0) {
                detail = messageRaw;
            } else if (messageRaw != null) {
                detail = String(messageRaw);
            }
            if (typeof payload.code === 'string' && payload.code.trim().length > 0) {
                code = payload.code;
            }
            if (typeof payload.kind === 'string' && payload.kind.trim().length > 0) {
                kind = payload.kind;
            }
            const requestId = payload.request_id ?? payload.correlation_id;
            if (typeof requestId === 'string' && requestId.trim().length > 0) {
                correlationId = requestId;
            }
        } else {
            if (declaresV1Contract) {
                contractViolation = 'error response violates the v1 error contract; expected application/json';
            }
            const text = await response.text().catch(() => '');
            detail = text;
        }
    } catch {
        if (declaresV1Contract) {
            contractViolation = 'error response violates the v1 error contract; invalid JSON';
        }
        // Fall back to a plain-text read when JSON parsing fails.
        detail = await response.text().catch(() => '');
    }

    const suffix = detail ? ` ${detail}` : '';
    const tag = code ? `[${code}]` : '';
    const kindTag = kind ? ` {${kind}}` : '';
    const correlationTag = correlationId ? ` (request_id=${correlationId})` : '';
    const contractTag = contractViolation ? ` [${contractViolation}]` : '';
    const error = new Error(
        `${label} failed (${status})${tag ? ' ' + tag : ''}${kindTag}${correlationTag}${contractTag}${suffix}`.trim(),
    );
    (error as Error & { status?: number; code?: string; kind?: string; correlationId?: string }).status = status;
    if (code) (error as Error & { code?: string }).code = code;
    if (kind) (error as Error & { kind?: string }).kind = kind;
    if (correlationId) (error as Error & { correlationId?: string }).correlationId = correlationId;
    return error;
}

// ── Core fetch helpers ──────────────────────────────────────────────────────

function getJson<T>(
    url: string,
    label: string,
    options: ApiRequestOptions = {},
): Promise<T> {
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
        const data: unknown = await res.json();
        assertJsonContainer(data, label);
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        return data as T;
    });
}

function getBlob(
    url: string,
    label: string,
    options: ApiRequestOptions = {},
): Promise<Blob> {
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
    options: ApiRequestOptions = {},
): Promise<T> {
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
        const data: unknown = await res.json();
        assertJsonContainer(data, label);
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        const executionIdentity = readExecutionIdentity(res.headers);
        return (executionIdentity && isObject(data)
            ? { ...data, executionIdentity }
            : data) as T;
    });
}

function postBlob(
    url: string,
    body: unknown,
    label: string,
    options: ApiRequestOptions = {},
): Promise<Blob> {
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

function deleteJson<T>(
    url: string,
    label: string,
    options: ApiRequestOptions = {},
): Promise<T> {
    dbg(`DELETE (${label})`, url);
    const scope = options.datasetScoped === false ? null : captureDatasetRequestScope();
    const dedupeKey = options.datasetScoped === false
        ? `DELETE:unscoped:${url}`
        : `DELETE:${scope}:${url}`;
    return dedupe(dedupeKey, async () => {
        const res = await globalThis.fetch(url, {
            method: 'DELETE',
            cache: 'no-store',
            ...(options.signal ? { signal: options.signal } : {}),
        });
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        if (!res.ok) throw await readApiError(res, label);
        const data: unknown = await res.json();
        assertJsonContainer(data, label);
        if (scope !== null) assertDatasetRequestScopeActive(scope);
        return data as T;
    });
}

export {
    getJson,
    getBlob,
    postJson,
    postBlob,
    deleteJson,
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
    readExecutionIdentity,
    type ArrowTable,
    type ArrowColumn,
};
