import type { ScatterFetchOptions, ScatterPointsResponse, ScatterCorrelationsResponse } from '../../types.js';
import {
    assertDatasetRequestScopeActive,
    getJson,
    captureDatasetRequestScope,
    ensureArrowParser,
    assertScatterPoints,
    assertScatterCorrelations,
    dbg,
    type ArrowColumn,
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
    signal?: AbortSignal,
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

    const url = '/api/scatter/points';
    dbg('POST (Scatter points)', { url, body: payload });

    const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
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
    assertDatasetRequestScopeActive(requestScope);
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
