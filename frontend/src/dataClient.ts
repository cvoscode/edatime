import { DEBUG, dbg } from './debug.js';
import type {
    DataObject,
    DatasetMetadata,
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

// Inflight request deduplication: prevents concurrent duplicate requests.
const inflight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    const promise = factory().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

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

// ── Runtime response guards ──────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertDatasetMetadata(data: unknown): asserts data is DatasetMetadata {
    if (!isObject(data)) throw new Error('Metadata response is not an object');
    // After isObject check, TypeScript knows data is Record<string, unknown>
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
    // After isObject check, TypeScript knows data is Record<string, unknown>
    if (!Array.isArray(data.correlations)) throw new Error('Correlations response missing correlations array');
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function getJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
    dbg(`GET (${label})`, url);
    return dedupe(`GET:${url}`, async () => {
        const res = await globalThis.fetch(url, signal ? { signal, cache: 'no-store' } : { cache: 'no-store' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`${label} failed (${res.status}) ${text}`);
        }
        return res.json() as T;
    });
}

async function postJson<T>(url: string, body: unknown, label: string, signal?: AbortSignal): Promise<T> {
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

export async function fetchMetadata(): Promise<DatasetMetadata> {
    const data = await getJson<unknown>('/api/metadata', 'Metadata');
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
    const res = await globalThis.fetch(url, signal ? { signal, cache: 'no-store' } : { cache: 'no-store' });

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

export async function fetchScatterPoints(
    x: string,
    y: string,
    limit = 1_000_000,
    color: string | null = null,
    options: ScatterFetchOptions | null = null,
    signal?: AbortSignal,
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
    dbg('POST (Scatter points)', { url, body: payload });

    const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Scatter points failed (${res.status}) ${text}`);
    }

    const ct = res.headers.get('Content-Type') ?? '';
    if (ct.includes('apache-arrow') || ct.includes('arrow.stream')) {
        // Arrow IPC response: x, y, color columns → ScatterPointsResponse
        const buffer = await res.arrayBuffer();
        const tableFromIPC = await ensureArrowParser();
        const table = tableFromIPC(buffer);

        const xCol = table.getChild('x');
        const yCol = table.getChild('y');
        const colorCol = table.getChild('color_value') ?? table.getChild('color_label');

        const n = table.numRows;
        const points: [number, number][] = new Array(n);
        const color_values: number[] | null = colorCol && table.getChild('color_value') ? [] : null;
        const color_labels: (string | null)[] | null =
            table.getChild('color_label') ? [] : null;

        for (let i = 0; i < n; i++) {
            points[i] = [xCol?.get(i) as number, yCol?.get(i) as number];
            if (color_values) color_values.push((colorCol as ArrowColumn).get(i) as number);
            if (color_labels) color_labels.push((colorCol as ArrowColumn).get(i) as string | null);
        }

        const total = Number(res.headers.get('x-edatime-scatter-total') ?? n);
        const returned = Number(res.headers.get('x-edatime-scatter-returned') ?? n);
        const color_min = res.headers.get('x-edatime-color-min');
        const color_max = res.headers.get('x-edatime-color-max');

        return {
            x,
            y,
            color: color ?? null,
            total_points: total,
            returned_points: returned,
            points,
            color_values,
            color_labels,
            color_min: color_min !== null ? Number(color_min) : null,
            color_max: color_max !== null ? Number(color_max) : null,
        };
    }

    // Fallback: JSON
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
    const data = await getJson<unknown>(url, 'Scatter correlations');
    assertScatterCorrelations(data);
    return data;
}

// ── Analytics endpoints ─────────────────────────────────────────────────────

export interface RollingBand {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

export interface RollingResponse {
    bands: RollingBand[];
}

export async function fetchRollingBands(
    start: string,
    end: string,
    columns: string,
    window = 50,
    signal?: AbortSignal,
): Promise<RollingResponse> {
    const params = new URLSearchParams({ start, end, columns, window: String(window) });
    const url = `/api/analytics/rolling?${params.toString()}`;
    return getJson<RollingResponse>(url, 'Rolling bands', signal);
}

export interface AnomalyRegion {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}

export interface AnomalyResponse {
    method: string;
    threshold: number;
    regions: AnomalyRegion[];
}

export async function fetchAnomalies(
    start: string,
    end: string,
    columns: string,
    method = 'zscore',
    threshold?: number,
    signal?: AbortSignal,
): Promise<AnomalyResponse> {
    const params = new URLSearchParams({ start, end, columns, method });
    if (threshold !== undefined) params.set('threshold', String(threshold));
    const url = `/api/analytics/anomalies?${params.toString()}`;
    return getJson<AnomalyResponse>(url, 'Anomaly detection', signal);
}

export interface FftResult {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
}

export interface FftResponse {
    sample_count: number;
    results: FftResult[];
}

export async function fetchFft(
    start: string,
    end: string,
    columns: string,
    maxPoints = 8192,
    signal?: AbortSignal,
): Promise<FftResponse> {
    const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
    const url = `/api/analytics/fft?${params.toString()}`;
    return getJson<FftResponse>(url, 'FFT', signal);
}

// ── Spectrogram (STFT) ────────────────────────────────────────────────────

export interface SpectrogramResult {
    column: string;
    times_ms: number[];
    frequencies: number[];
    magnitudes: number[][];
}

export interface SpectrogramResponse {
    sample_count: number;
    result: SpectrogramResult;
}

export async function fetchSpectrogram(
    start: string,
    end: string,
    column: string,
    windowSize = 256,
    hopSize?: number,
    maxPoints = 32768,
    signal?: AbortSignal,
): Promise<SpectrogramResponse> {
    const params = new URLSearchParams({
        start, end, column,
        window_size: String(windowSize),
        max_points: String(maxPoints),
    });
    if (hopSize != null) params.set('hop_size', String(hopSize));
    const url = `/api/analytics/spectrogram?${params.toString()}`;
    return getJson<SpectrogramResponse>(url, 'Spectrogram', signal);
}

// ── Causal Graph (Tigramite) ──────────────────────────────────────────────

export interface CausalLink {
    source: string;
    target: string;
    lag: number;
    type: string;
    value: number;
    pvalue: number;
}

export interface CausalGraphResponse {
    columns: string[];
    tau_max: number;
    links: CausalLink[];
    graph: string[][][];
    val_matrix: number[][][];
    p_matrix: number[][][];
}

export async function fetchCausalGraph(
    columns: string[],
    tauMax = 3,
    alpha = 0.05,
    method = 'pcmci',
    maxPoints = 5000,
    signal?: AbortSignal,
    pcAlpha = 0.2,
    test = 'par_corr',
    maxCondsDim?: number,
    fdrMethod = 'none',
): Promise<CausalGraphResponse> {
    const url = '/api/analytics/causal';
    const body: Record<string, unknown> = {
        columns: columns.join(','),
        tau_max: tauMax,
        alpha,
        method,
        max_points: maxPoints,
        pc_alpha: pcAlpha,
        test,
        fdr_method: fdrMethod,
    };
    if (maxCondsDim != null) body.max_conds_dim = maxCondsDim;
    return postJson<CausalGraphResponse>(url, body, 'Causal graph', signal);
}

export interface TransformResponse {
    status: string;
    column: string;
    expression: string;
}

export async function postTransform(
    expression: string,
    outputName: string,
): Promise<TransformResponse> {
    const url = '/api/transform';
    return postJson<TransformResponse>(url, { expression, output_name: outputName }, 'Transform');
}

// ── Correlation Matrix ─────────────────────────────────────────────────────

export interface CorrelationMatrixResponse {
    columns: string[];
    pearson: (number | null)[][];
    spearman: (number | null)[][];
}

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
    return getJson<CorrelationMatrixResponse>('/api/scatter/correlations/matrix', 'Correlation matrix');
}

// ── Outlier Removal ────────────────────────────────────────────────────────

export interface OutlierRemovalResult {
    method: string;
    columns: string[];
    rows_before: number;
    rows_after: number;
    rows_removed: number;
}

export async function postRemoveOutliers(
    columns: string[] | null,
    method = 'zscore',
    threshold?: number,
    window?: number,
): Promise<OutlierRemovalResult> {
    const body: Record<string, unknown> = { method };
    if (columns) body.columns = columns.join(',');
    if (threshold !== undefined) body.threshold = threshold;
    if (window !== undefined) body.window = window;

    const url = '/api/analytics/remove_outliers';
    return postJson<OutlierRemovalResult>(url, body, 'Outlier removal');
}

