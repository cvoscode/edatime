import type { DataObject } from '../../types/api.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    ensureArrowParser,
    resolveTimestampColumnName,
    toEpochMs,
    readExecutionIdentity,
    readApiError,
    dbg,
    DEBUG,
} from './http.js';
import type { ApiRequestOptions } from './http.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';

export async function fetchData(
    start: string,
    end: string,
    width: number,
    columns = 'value',
    colorColumn: string | null = null,
    lookaroundMs = 0,
    options?: ApiRequestOptions,
): Promise<DataObject> {
    const requestScope = captureDatasetRequestScope();
    const requestedCols = columns
        .split(',')
        .map((col) => col.trim())
        .filter(Boolean);
    // Audit issue 2.2: enforce a sensible minimum width so the
    // backend never receives `width=1`, which the LTTB downsampler
    // treats as "keep every row" (effectively a raw-data escape
    // hatch). The backend allows widths up to 20,000; below 50 px
    // the chart has nothing meaningful to render anyway.
    const safeWidth = Math.max(50, Math.floor(width));
    const tableFromIPC = await ensureArrowParser();
    const activePlan = cleaningPlanStore.getSnapshot();
    if (!activePlan) {
        throw new Error('Timeseries data requires an active cleaning plan');
    }

    const requestInit: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start,
            end,
            width: safeWidth,
            columns,
            color_column: colorColumn || undefined,
            lookaround_ms: Number.isFinite(lookaroundMs) && lookaroundMs > 0 ? Math.round(lookaroundMs) : undefined,
            cleaning_plan: buildPlanRequestSnapshot(activePlan),
        }),
        signal: options?.signal,
        cache: 'no-store',
    };

    dbg('POST', apiV1Routes.data);
    const res = await globalThis.fetch(apiV1Routes.data, requestInit);
    assertDatasetRequestScopeActive(requestScope);

    if (DEBUG) {
        dbg('status', res.status, res.statusText);
        dbg('content-type', res.headers.get('content-type'));
        dbg('content-length', res.headers.get('content-length'));
    }

    const downsampledHeader = res.headers.get('x-edatime-downsampled');
    const returnedRowsHeader = res.headers.get('x-edatime-returned-rows');
    const targetPointsHeader = res.headers.get('x-edatime-target-points');
    const samplingAlgorithmHeader = res.headers.get('x-edatime-sampling-algorithm');
    const approximateHeader = res.headers.get('x-edatime-approximate');
    const filteredRowsHeader = res.headers.get('x-edatime-filtered-rows');
    const candidateRowsHeader = res.headers.get('x-edatime-candidate-rows');
    const droppedRowsHeader = res.headers.get('x-edatime-dropped-rows');
    const timeColumnHeader = res.headers.get('x-edatime-time-column');
    const executionIdentity = readExecutionIdentity(res.headers);

    const hasDownsampleHeader = downsampledHeader === '0' || downsampledHeader === '1';
    let isDownsampled = downsampledHeader === '1';
    const returnedRows = Number.parseInt(returnedRowsHeader ?? '', 10);
    const targetPoints = Number.parseInt(targetPointsHeader ?? '', 10);
    const filteredRows = Number.parseInt(filteredRowsHeader ?? '', 10);
    const candidateRows = Number.parseInt(candidateRowsHeader ?? '', 10);
    const droppedRows = Number.parseInt(droppedRowsHeader ?? '', 10);

    if (DEBUG) {
        dbg('x-edatime-downsampled', downsampledHeader);
        dbg('x-edatime-returned-rows', returnedRowsHeader);
        dbg('x-edatime-target-points', targetPointsHeader);
        dbg('x-edatime-sampling-algorithm', samplingAlgorithmHeader);
        dbg('x-edatime-approximate', approximateHeader);
    }

    if (!res.ok) {
        throw await readApiError(res, 'Data fetch');
    }

    const buffer = await res.arrayBuffer();
    assertDatasetRequestScopeActive(requestScope);

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

    const timestampColumnName = resolveTimestampColumnName(
        table,
        requestedCols,
        colorColumn,
        timeColumnHeader,
    );
    const tsCol = timestampColumnName ? table.getChild(timestampColumnName) : null;
    if (!tsCol) throw new Error('No timestamp column found');

    const len = table.numRows;
    const tsArray = new Float64Array(len);
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
            samplingAlgorithm: samplingAlgorithmHeader || undefined,
            approximate: approximateHeader === '1',
            filteredRows: Number.isFinite(filteredRows) ? filteredRows : undefined,
            candidateRows: Number.isFinite(candidateRows) ? candidateRows : undefined,
            droppedRows: Number.isFinite(droppedRows) ? droppedRows : undefined,
            executionIdentity,
        },
    };

    if (DEBUG) {
        dbg('downsample meta', dataObj._meta);
    }

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

    assertDatasetRequestScopeActive(requestScope);
    return dataObj;
}
