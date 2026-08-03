import type {
    ScatterFetchOptions,
    ScatterMatrixResponse,
} from '../../types/scatter.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import type {
    CorrelationMetric,
    ScatterCorrelationsResponse,
    ScatterMatrixPair,
    ScatterPointsResponse,
} from '../../contracts/api/v1/scatter.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    ensureArrowParser,
    assertScatterPoints,
    assertScatterCorrelations,
    dbg,
    readApiError,
    type ArrowColumn,
    type ApiRequestOptions,
    readExecutionIdentity,
} from './http.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';
import type { CleaningPlan, CleaningStage } from '../../cleaning/types.js';

function appendWorkspaceFilterStages(
    plan: CleaningPlan,
    options: ScatterFetchOptions | null,
): CleaningPlan {
    if (!options) return plan;
    const stages: CleaningStage[] = [...plan.stages];
    const ids = new Set(stages.map((stage) => stage.id));
    const nextId = (base: string): string => {
        let id = base;
        let suffix = 1;
        while (ids.has(id)) id = `${base}-${suffix++}`;
        ids.add(id);
        return id;
    };
    const timestamp = plan.updatedAt || plan.createdAt;
    const start = Number(options.start);
    const end = Number(options.end);
    if (Number.isFinite(start) && Number.isFinite(end) && start !== end) {
        stages.push({
            id: nextId('workspace-scatter-time-range'),
            kind: 'timeRange',
            executionClass: 'polarsExpression',
            scope: 'row',
            enabled: true,
            sourcePage: 'scatter',
            label: 'Linked chart range',
            createdAt: timestamp,
            updatedAt: timestamp,
            startMs: Math.min(start, end),
            endMs: Math.max(start, end),
            mode: 'keepInside',
        });
    }
    const planRangeKeys = new Set(stages.flatMap((stage) => (
        stage.enabled && stage.kind === 'columnRange' && stage.mode === 'keepInside'
            ? [[stage.column.trim(), stage.from, stage.to].join('|')]
            : []
    )));

    for (const [index, filter] of (options.filters ?? []).entries()) {
        const column = String(filter?.column ?? '').trim();
        const from = Number(filter?.from);
        const to = Number(filter?.to);
        const normalizedFrom = Math.min(from, to);
        const normalizedTo = Math.max(from, to);
        const key = [column, normalizedFrom, normalizedTo].join('|');
        // Timeseries renders the canonical plan and workspace/view filters as
        // an intersection. Scatter must preserve that same composition. Only
        // suppress an exact duplicate already present in the plan.
        if (!column || !Number.isFinite(from) || !Number.isFinite(to) || planRangeKeys.has(key)) continue;
        stages.push({
            id: nextId(`workspace-scatter-range-${index}`),
            kind: 'columnRange',
            executionClass: 'polarsExpression',
            scope: 'row',
            enabled: true,
            sourcePage: 'scatter',
            label: `Linked range for ${column}`,
            createdAt: timestamp,
            updatedAt: timestamp,
            column,
            from: normalizedFrom,
            to: normalizedTo,
            mode: 'keepInside',
        });
        planRangeKeys.add(key);
    }

    const planLineKeys = new Set(stages.flatMap((stage) => (
        stage.enabled && stage.kind === 'adaptiveLine'
            ? [[stage.column, stage.x1Ms, stage.y1, stage.x2Ms, stage.y2, stage.keepAbove].join('|')]
            : []
    )));
    for (const [index, filter] of (options.lineFilters ?? []).entries()) {
        const column = String(filter?.column ?? '').trim();
        const x1 = Number(filter?.x1);
        const y1 = Number(filter?.y1);
        const x2 = Number(filter?.x2);
        const y2 = Number(filter?.y2);
        if (!column || ![x1, y1, x2, y2].every(Number.isFinite) || x1 === x2) continue;
        const key = [column, x1, y1, x2, y2, !!filter.keepAbove].join('|');
        if (planLineKeys.has(key)) continue;
        stages.push({
            id: nextId(`workspace-scatter-line-${index}`),
            kind: 'adaptiveLine',
            executionClass: 'polarsExpression',
            scope: 'row',
            enabled: true,
            sourcePage: 'scatter',
            label: `Linked adaptive filter for ${column}`,
            createdAt: timestamp,
            updatedAt: timestamp,
            column,
            x1Ms: x1,
            y1,
            x2Ms: x2,
            y2,
            keepAbove: !!filter.keepAbove,
            applyWithinSegmentOnly: true,
        });
        planLineKeys.add(key);
    }

    return stages.length === plan.stages.length ? plan : { ...plan, stages };
}

export function buildActiveScatterPlanRequest(options: ScatterFetchOptions | null = null): ReturnType<typeof buildPlanRequestSnapshot> {
    const plan = cleaningPlanStore.getSnapshot();
    if (!plan) throw new Error('Scatter requests require an active cleaning plan');
    return buildPlanRequestSnapshot(appendWorkspaceFilterStages(plan, options));
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
    payload.cleaning_plan = buildActiveScatterPlanRequest(options);

    const url = apiV1Routes.scatter.points;
    dbg('POST (Scatter points)', { url, body: payload });

    const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: requestOptions?.signal,
    });
    assertDatasetRequestScopeActive(requestScope);
    if (!res.ok) {
        throw await readApiError(res, 'Scatter points');
    }

    const ct = res.headers.get('Content-Type') ?? '';
    const executionIdentity = readExecutionIdentity(res.headers);
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
        const sizeValueCol = table.getChild('size_value');

        const n = table.numRows;
        const points: [number, number][] = new Array(n);
        const color_values: number[] | null = colorValueCol ? [] : null;
        const color_labels: (string | null)[] | null = colorLabelCol ? [] : null;
        const size_values: number[] | null = sizeValueCol ? [] : null;

        for (let i = 0; i < n; i++) {
            points[i] = [xCol?.get(i) as number, yCol?.get(i) as number];
            if (color_values) color_values.push((colorValueCol as ArrowColumn).get(i) as number);
            if (color_labels) color_labels.push((colorLabelCol as ArrowColumn).get(i) as string | null);
            if (size_values) size_values.push((sizeValueCol as ArrowColumn).get(i) as number);
        }

        const total = Number(res.headers.get('x-edatime-scatter-total') ?? n);
        const returned = Number(res.headers.get('x-edatime-scatter-returned') ?? n);
        const color_min = res.headers.get('x-edatime-color-min');
        const color_max = res.headers.get('x-edatime-color-max');
        const size_min = res.headers.get('x-edatime-size-min');
        const size_max = res.headers.get('x-edatime-size-max');
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
            size_values,
            size_min: size_min !== null ? Number(size_min) : null,
            size_max: size_max !== null ? Number(size_max) : null,
            color_cardinality,
            executionIdentity,
        };
    }

    // Fallback: JSON
    const data = await res.json();
    assertDatasetRequestScopeActive(requestScope);
    assertScatterPoints(data);
    return { ...data, executionIdentity };
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
    payload.cleaning_plan = buildActiveScatterPlanRequest(options);

    const url = apiV1Routes.scatter.matrix;
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
    const executionIdentity = readExecutionIdentity(res.headers);
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

    return { cells, executionIdentity };
}

export async function fetchScatterCorrelations(
    base: string | null,
    threshold = 0.7,
    mode: CorrelationMetric = 'pearson_raw',
    options: ScatterFetchOptions | null = null,
): Promise<ScatterCorrelationsResponse> {
    const activePlan = buildActiveScatterPlanRequest(options);
    const requestScope = captureDatasetRequestScope();
    const res = await globalThis.fetch(apiV1Routes.scatter.correlations, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            base: base?.trim() || undefined, threshold, mode, cleaning_plan: activePlan,
        }), cache: 'no-store',
    });
    assertDatasetRequestScopeActive(requestScope);
    if (!res.ok) throw await readApiError(res, 'Scatter correlations');
    const executionIdentity = readExecutionIdentity(res.headers);
    const data = await res.json();
    assertDatasetRequestScopeActive(requestScope);
    assertScatterCorrelations(data);
    return { ...data, executionIdentity };
}
