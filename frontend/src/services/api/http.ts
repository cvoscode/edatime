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

// ── Core fetch helpers ──────────────────────────────────────────────────────

function getJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
    dbg(`GET (${label})`, url);
    const scope = captureDatasetRequestScope();
    return dedupe(`GET:${scope}:${url}`, async () => {
        const res = await globalThis.fetch(url, signal ? { signal, cache: 'no-store' } : { cache: 'no-store' });
        assertDatasetRequestScopeActive(scope);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`${label} failed (${res.status}) ${text}`);
        }
        const data = await res.json() as T;
        assertDatasetRequestScopeActive(scope);
        return data;
    });
}

function postJson<T>(url: string, body: unknown, label: string, signal?: AbortSignal): Promise<T> {
    dbg(`POST (${label})`, { url, body });
    const key = `POST:${url}:${JSON.stringify(body)}`;
    return dedupe(key, async () => {
        const res = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`${label} failed (${res.status}) ${text}`);
        }
        return res.json() as T;
    });
}

// Aliases for backward compatibility with files that import from http.ts
const getJsonForApi = getJson;
const postJsonForApi = postJson;

// Re-exported under stable names so facade files (http.ts, metadata.ts, etc.) keep working
export { getJson, postJson, getJsonForApi, postJsonForApi };

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
