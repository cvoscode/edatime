import { DEBUG, dbg } from './debug.js';
import type {
    DataObject,
    DatasetMetadata,
    DistributionFetchContext,
    DistributionsResponse,
    ScatterCorrelationsResponse,
    ScatterFetchOptions,
    ScatterPointsResponse,
} from './types.js';

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
        const arrow = await import('https://esm.sh/apache-arrow@16.0.0?bundle' as string);
        if (!arrow?.tableFromIPC) {
            throw new Error('Apache Arrow module loaded but tableFromIPC is missing.');
        }
        tableFromIPCFn = arrow.tableFromIPC as TableFromIPCFn;
        return tableFromIPCFn;
    } catch (e) {
        throw new Error(`Failed to load Apache Arrow parser: ${(e as Error).message}`);
    }
}

// ── Runtime response guards ──────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertDatasetMetadata(data: unknown): asserts data is DatasetMetadata {
    if (!isObject(data)) throw new Error('Metadata response is not an object');
    if (typeof (data as any).total_rows !== 'number') throw new Error('Metadata missing total_rows');
    if (!Array.isArray((data as any).columns)) throw new Error('Metadata missing columns array');
    if (!Array.isArray((data as any).numeric_columns)) throw new Error('Metadata missing numeric_columns');
}

function assertScatterPoints(data: unknown): asserts data is ScatterPointsResponse {
    if (!isObject(data)) throw new Error('Scatter points response is not an object');
    if (typeof (data as any).x !== 'string') throw new Error('Scatter response missing x column name');
    if (typeof (data as any).y !== 'string') throw new Error('Scatter response missing y column name');
    if (!Array.isArray((data as any).points)) throw new Error('Scatter response missing points array');
}

function assertScatterCorrelations(data: unknown): asserts data is ScatterCorrelationsResponse {
    if (!isObject(data)) throw new Error('Correlations response is not an object');
    if (!Array.isArray((data as any).correlations)) throw new Error('Correlations response missing correlations array');
}

function assertDistributions(data: unknown): asserts data is DistributionsResponse {
    if (!isObject(data)) throw new Error('Distributions response is not an object');
    if (!Array.isArray((data as any).columns)) throw new Error('Distributions response missing columns array');
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchMetadata(): Promise<DatasetMetadata> {
    const res = await fetch('/api/metadata');
    if (!res.ok) throw new Error('Metadata check failed');
    const data = await res.json();
    assertDatasetMetadata(data);
    return data;
}

export async function fetchData(
    start: string,
    end: string,
    width: number,
    columns = 'value',
    colorColumn: string | null = null,
    signal?: AbortSignal,
): Promise<DataObject> {
    const params = new URLSearchParams({
        start,
        end,
        width: String(width),
        columns,
    });
    if (colorColumn) params.set('color_column', colorColumn);

    const tableFromIPC = await ensureArrowParser();
    const url = `/api/data?${params.toString()}`;

    dbg('GET', url);
    const res = await fetch(url, signal ? { signal } : undefined);

    if (DEBUG) {
        dbg('status', res.status, res.statusText);
        dbg('content-type', res.headers.get('content-type'));
        dbg('content-length', res.headers.get('content-length'));
    }

    const downsampledHeader = res.headers.get('x-edatime-downsampled');
    const returnedRowsHeader = res.headers.get('x-edatime-returned-rows');
    const targetPointsHeader = res.headers.get('x-edatime-target-points');

    const hasDownsampleHeader = downsampledHeader === '0' || downsampledHeader === '1';
    let isDownsampled = downsampledHeader === '1';
    const returnedRows = Number.parseInt(returnedRowsHeader ?? '', 10);
    const targetPoints = Number.parseInt(targetPointsHeader ?? '', 10);

    if (DEBUG) {
        dbg('x-edatime-downsampled', downsampledHeader);
        dbg('x-edatime-returned-rows', returnedRowsHeader);
        dbg('x-edatime-target-points', targetPointsHeader);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Data fetch failed (${res.status}) ${text}`);
    }

    const buffer = await res.arrayBuffer();

    if (DEBUG) {
        dbg('arrow bytes', buffer.byteLength);
    }

    const table = tableFromIPC(buffer);

    if (DEBUG) {
        try {
            const fields = table.schema?.fields?.map((f) => `${f?.name}:${String(f?.type)}`) ?? [];
            dbg('arrow schema', fields);
            dbg('rows', table.numRows);
        } catch {
            // ignore
        }
    }

    const tsCol = table.getChild('ts');
    if (!tsCol) throw new Error('No timestamp column found');

    const len = table.numRows;
    const tsArray = new Float64Array(len);

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

    for (let i = 0; i < len; i++) {
        tsArray[i] = toEpochMs(tsCol.get(i));
    }

    if (DEBUG && len > 0) {
        dbg('ts epoch-ms first/last', tsArray[0], tsArray[len - 1]);
    }

    if (!hasDownsampleHeader) {
        isDownsampled = len >= width * 2;
    }

    const dataObj: DataObject = {
        ts: tsArray,
        values: {},
        color: null,
        color_column: null,
        _meta: {
            downsampled: isDownsampled,
            downsampleKnown: hasDownsampleHeader,
            returnedRows: Number.isFinite(returnedRows) ? returnedRows : len,
            targetPoints: Number.isFinite(targetPoints) ? targetPoints : width * 2,
        },
    };

    if (DEBUG) {
        dbg('downsample meta', dataObj._meta);
    }

    const requestedCols = columns.split(',');
    for (const colName of requestedCols) {
        const valCol = table.getChild(colName);
        if (valCol) {
            const valArray = new Float64Array(len);
            for (let i = 0; i < len; i++) {
                valArray[i] = Number(valCol.get(i));
            }
            dataObj.values[colName] = valArray;
        }
    }

    if (colorColumn) {
        const colorCol = table.getChild(colorColumn);
        if (colorCol) {
            dataObj.color_column = colorColumn;
            const colorArray = new Array<number | string | null>(len);
            for (let i = 0; i < len; i++) {
                colorArray[i] = colorCol.get(i) as number | string | null;
            }
            dataObj.color = colorArray;
        }
    }

    return dataObj;
}

export async function fetchAggregate(
    start: string,
    end: string,
    columns = 'value',
    buckets = 50,
    agg = 'mean',
    format: 'arrow' | 'json' = 'json',
): Promise<unknown> {
    const params = new URLSearchParams({ start, end, columns, buckets: String(buckets), agg, format });
    const url = `/api/aggregate?${params.toString()}`;
    dbg('GET (aggregate)', url);

    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Aggregate fetch failed (${res.status}) ${text}`);
    }

    if (format === 'arrow') {
        const tableFromIPC = await ensureArrowParser();
        const buffer = await res.arrayBuffer();
        return tableFromIPC(buffer);
    }

    return res.json();
}

export async function fetchScatterPoints(
    x: string,
    y: string,
    limit = 1_000_000,
    color: string | null = null,
    options: ScatterFetchOptions | null = null,
): Promise<ScatterPointsResponse> {
    const payload: Record<string, unknown> = {
        x: String(x),
        y: String(y),
        limit: Number(limit),
    };
    if (color !== null && color !== undefined && String(color).trim() !== '') {
        payload.color = String(color);
    }
    const start = Number(options?.start);
    const end = Number(options?.end);
    if (Number.isFinite(start) && Number.isFinite(end)) {
        payload.start = start;
        payload.end = end;
    }
    if (Array.isArray(options?.filters) && options!.filters!.length > 0) {
        payload.filters = JSON.stringify(options!.filters);
    }
    if (Array.isArray(options?.lineFilters) && options!.lineFilters!.length > 0) {
        payload.line_filters = JSON.stringify(options!.lineFilters);
    }

    const url = '/api/scatter/points';
    dbg('POST (scatter points)', { url, payload });

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Scatter points fetch failed (${res.status}) ${text}`);
    }
    const data = await res.json();
    assertScatterPoints(data);
    return data;
}

export async function fetchScatterCorrelations(
    base: string | null,
    threshold = 0.7,
): Promise<ScatterCorrelationsResponse> {
    const params = new URLSearchParams({ threshold: String(threshold) });
    if (base !== null && base !== undefined && String(base).trim() !== '') {
        params.set('base', String(base));
    }
    const url = `/api/scatter/correlations?${params.toString()}`;
    dbg('GET (scatter correlations)', url);

    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Scatter correlations fetch failed (${res.status}) ${text}`);
    }
    const data = await res.json();
    assertScatterCorrelations(data);
    return data;
}

export async function fetchDistributions(
    columns: string[] | string,
    context: DistributionFetchContext = {},
): Promise<DistributionsResponse> {
    const body: Record<string, unknown> = {
        columns: Array.isArray(columns) ? columns : [columns],
    };
    if (Number.isFinite(context?.start)) body.start = context.start;
    if (Number.isFinite(context?.end)) body.end = context.end;
    if (Array.isArray(context?.filters) && context.filters!.length > 0) body.filters = context.filters;
    if (Array.isArray(context?.lineFilters) && context.lineFilters!.length > 0) body.line_filters = context.lineFilters;

    const url = '/api/scatter/distributions';
    dbg('POST (distributions)', { url, columns: (body.columns as string[]).length });

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Distributions fetch failed (${res.status}) ${text}`);
    }
    const data = await res.json();
    assertDistributions(data);
    return data;
}
