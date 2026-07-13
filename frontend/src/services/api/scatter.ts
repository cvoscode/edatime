import type {
    ScatterFetchOptions,
    ScatterMatrixPair,
    ScatterMatrixResponse,
    ScatterPointsResponse,
    ScatterCorrelationsResponse,
} from '../../types.js';
import type { CorrelationMetric } from '../../utils/correlationModes.js';
import {
    assertDatasetRequestScopeActive,
    getJson,
    captureDatasetRequestScope,
    ensureArrowParser,
    assertScatterPoints,
    assertScatterCorrelations,
    dbg,
    readApiError,
    type ArrowColumn,
    type ApiRequestOptions,
} from './http.js';

function normalizeScatterLineFilters(lineFilters: unknown[]): Array<{
    column: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    keepAbove: boolean;
}> {
    return lineFilters
        .map((filter) => ({
            column: String((filter as Record<string, unknown>)?.column ?? ''),
            x1: Number((filter as Record<string, unknown>)?.x1),
            y1: Number((filter as Record<string, unknown>)?.y1),
            x2: Number((filter as Record<string, unknown>)?.x2),
            y2: Number((filter as Record<string, unknown>)?.y2),
            keepAbove: !!(filter as Record<string, unknown>)?.keepAbove,
        }))
        .filter((filter) =>
            !!filter.column
            && Number.isFinite(filter.x1)
            && Number.isFinite(filter.y1)
            && Number.isFinite(filter.x2)
            && Number.isFinite(filter.y2)
            && filter.x1 !== filter.x2,
        );
}

export async function fetchScatterPoints(
    x: string,
    y: string,
    limit = 1_000_000,
    color: string | null = null,
    options: ScatterFetchOptions | null = null,
    requestOptions?: ApiRequestOptions,
): Promise<ScatterPointsResponse> {
    const requestScope = captureDatasetRequestScope();
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
        payload.line_filters = JSON.stringify(normalizeScatterLineFilters(options!.lineFilters));
    }

    const url = '/api/v1/scatter/points';
    dbg('POST (Scatter points)', { url, body: payload });

    const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: requestOptions?.signal,
    });
    assertDatasetRequestScopeActive(requestScope);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Scatter points failed (${res.status}) ${text}`);
    }

    const ct = res.headers.get('Content-Type') ?? '';
    if (ct.includes('apache-arrow') || ct.includes('arrow.stream')) {
        // Arrow IPC response: x, y, color columns → ScatterPointsResponse
        const buffer = await res.arrayBuffer();
        assertDatasetRequestScopeActive(requestScope);
        const tableFromIPC = await ensureArrowParser();
        const table = tableFromIPC(buffer);

        const xHeader = res.headers.get('x-edatime-scatter-x');
        const yHeader = res.headers.get('x-edatime-scatter-y');
        const colorHeader = res.headers.get('x-edatime-scatter-color');
        const xCol = table.getChild('x') ?? (xHeader ? table.getChild(xHeader) : null);
        const yCol = table.getChild('y') ?? (yHeader ? table.getChild(yHeader) : null);
        const colorValueCol = table.getChild('color_value') ?? (colorHeader ? table.getChild(colorHeader) : null);
        const colorLabelCol = table.getChild('color_label');

        const n = table.numRows;
        const points: [number, number][] = new Array(n);
        const color_values: number[] | null = colorValueCol ? [] : null;
        const color_labels: (string | null)[] | null = colorLabelCol ? [] : null;

        for (let i = 0; i < n; i++) {
            points[i] = [xCol?.get(i) as number, yCol?.get(i) as number];
            if (color_values) color_values.push((colorValueCol as ArrowColumn).get(i) as number);
            if (color_labels) color_labels.push((colorLabelCol as ArrowColumn).get(i) as string | null);
        }

        const total = Number(res.headers.get('x-edatime-scatter-total') ?? n);
        const returned = Number(res.headers.get('x-edatime-scatter-returned') ?? n);
        const color_min = res.headers.get('x-edatime-color-min');
        const color_max = res.headers.get('x-edatime-color-max');
        // Audit issue 2.2: surface the cardinality summary on the
        // response. Headers take priority over a hypothetical body
        // field for the Arrow path; both are kept in sync by the
        // backend so the JSON path's `data.color_cardinality` is
        // the authoritative source there.
        const cardReq = res.headers.get('x-edatime-color-cardinality-requested');
        const cardUsed = res.headers.get('x-edatime-color-cardinality-used');
        const cardBucketed = res.headers.get('x-edatime-color-cardinality-bucketed');
        const color_cardinality =
            cardReq !== null && cardUsed !== null && cardBucketed !== null
                ? {
                    requested: Number(cardReq),
                    used: Number(cardUsed),
                    bucketed: Number(cardBucketed),
                }
                : null;

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
            color_cardinality,
        };
    }

    // Fallback: JSON
    const data = await res.json();
    assertDatasetRequestScopeActive(requestScope);
    assertScatterPoints(data);
    return data;
}

interface ScatterMatrixCellHeader {
    cell_id: string;
    x: string;
    y: string;
    total_points: number;
    returned_points: number;
    color_min: number | null;
    color_max: number | null;
    color_kind?: 'continuous' | 'categorical' | null;
}

function decodeMatrixCellHeaders(value: string | null): ScatterMatrixCellHeader[] {
    if (!value) return [];
    const encoded = String(value).trim();
    if (!encoded) return [];

    let decoded = '';
    try {
        decoded = globalThis.atob(encoded);
    } catch {
        throw new Error('Scatter matrix response metadata is not valid base64');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(decoded);
    } catch {
        throw new Error('Scatter matrix response metadata is not valid JSON');
    }
    if (!Array.isArray(parsed)) {
        throw new Error('Scatter matrix response metadata must be an array');
    }

    return parsed.map((entry) => ({
        cell_id: String((entry as Record<string, unknown>)?.cell_id ?? ''),
        x: String((entry as Record<string, unknown>)?.x ?? ''),
        y: String((entry as Record<string, unknown>)?.y ?? ''),
        total_points: Number((entry as Record<string, unknown>)?.total_points ?? 0),
        returned_points: Number((entry as Record<string, unknown>)?.returned_points ?? 0),
        color_min: (entry as Record<string, unknown>)?.color_min == null
            ? null
            : Number((entry as Record<string, unknown>)?.color_min),
        color_max: (entry as Record<string, unknown>)?.color_max == null
            ? null
            : Number((entry as Record<string, unknown>)?.color_max),
        color_kind: ((entry as Record<string, unknown>)?.color_kind === 'continuous'
            || (entry as Record<string, unknown>)?.color_kind === 'categorical')
            ? (entry as Record<string, unknown>)?.color_kind as 'continuous' | 'categorical'
            : null,
    })).filter((entry) => entry.cell_id.length > 0);
}

export async function fetchScatterMatrix(
    pairs: ScatterMatrixPair[],
    color: string | null = null,
    options: ScatterFetchOptions | null = null,
    limit = 1_000_000,
    requestOptions?: ApiRequestOptions,
): Promise<ScatterMatrixResponse> {
    const requestScope = captureDatasetRequestScope();
    const payload: Record<string, unknown> = {
        pairs: pairs.map((pair) => ({
            x: String(pair?.x ?? ''),
            y: String(pair?.y ?? ''),
        })).filter((pair) => pair.x && pair.y),
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
    if (Array.isArray(options?.filters) && options.filters.length > 0) {
        payload.filters = JSON.stringify(options.filters);
    }
    if (Array.isArray(options?.lineFilters) && options.lineFilters.length > 0) {
        payload.line_filters = JSON.stringify(normalizeScatterLineFilters(options.lineFilters));
    }

    const url = '/api/v1/scatter/matrix';
    dbg('POST (Scatter matrix)', { url, body: payload });

    const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: requestOptions?.signal,
    });
    assertDatasetRequestScopeActive(requestScope);
    if (!res.ok) {
        throw await readApiError(res, 'Scatter matrix');
    }

    const ct = res.headers.get('Content-Type') ?? '';
    if (!(ct.includes('apache-arrow') || ct.includes('arrow.stream'))) {
        throw new Error('Scatter matrix response must be Arrow IPC');
    }

    const buffer = await res.arrayBuffer();
    assertDatasetRequestScopeActive(requestScope);
    const tableFromIPC = await ensureArrowParser();
    const table = tableFromIPC(buffer);

    const metadata = decodeMatrixCellHeaders(res.headers.get('x-edatime-matrix-cells'));
    const cells = new Map<string, {
        totalPoints: number;
        points: [number, number][];
        colorValues: number[] | null;
        colorLabels: (string | null)[] | null;
    }>();
    for (const cell of metadata) {
        cells.set(cell.cell_id, {
            totalPoints: Number.isFinite(cell.total_points) ? cell.total_points : 0,
            points: [],
            colorValues: cell.color_kind === 'continuous' ? [] : null,
            colorLabels: cell.color_kind === 'categorical' ? [] : null,
        });
    }

    const cellIdCol = table.getChild('cell_id');
    const xCol = table.getChild('x');
    const yCol = table.getChild('y');
    const colorValueCol = table.getChild('color_value');
    const colorLabelCol = table.getChild('color_label');

    for (let i = 0; i < table.numRows; i++) {
        const cellId = String(cellIdCol?.get(i) ?? '');
        if (!cellId) continue;
        const current = cells.get(cellId) ?? {
            totalPoints: 0,
            points: [],
            colorValues: colorValueCol ? [] : null,
            colorLabels: colorLabelCol ? [] : null,
        };
        current.points.push([
            Number(xCol?.get(i) ?? Number.NaN),
            Number(yCol?.get(i) ?? Number.NaN),
        ]);
        const rawColorValue = Number((colorValueCol as ArrowColumn | null)?.get(i) ?? Number.NaN);
        if (!current.colorValues && Number.isFinite(rawColorValue)) {
            current.colorValues = Array.from({ length: current.points.length - 1 }, () => Number.NaN);
        }
        if (current.colorValues) {
            current.colorValues.push(rawColorValue);
        }
        const rawLabel = (colorLabelCol as ArrowColumn | null)?.get(i);
        const normalizedLabel = rawLabel == null ? null : String(rawLabel);
        if (!current.colorLabels && normalizedLabel !== null && normalizedLabel !== '') {
            current.colorLabels = Array.from({ length: current.points.length - 1 }, () => null);
        }
        if (current.colorLabels) {
            current.colorLabels.push(normalizedLabel);
        }
        cells.set(cellId, current);
    }

    return { cells };
}

export async function fetchScatterCorrelations(
    base: string | null,
    threshold = 0.7,
    mode: CorrelationMetric = 'pearson_raw',
): Promise<ScatterCorrelationsResponse> {
    const params = new URLSearchParams({ threshold: String(threshold) });
    if (base !== null && base !== undefined && String(base).trim() !== '') {
        params.set('base', String(base));
    }
    params.set('mode', mode);
    const url = `/api/v1/scatter/correlations?${params.toString()}`;
    const data = await getJson<unknown>(url, 'Scatter correlations');
    assertScatterCorrelations(data);
    return data;
}
