import type { DataObject } from '../../types/api.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    ensureArrowParser,
    resolveTimestampColumnName,
    toEpochMs,
    dbg,
    DEBUG,
} from './http.js';
import type { ApiRequestOptions } from './http.js';

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
    const params = new URLSearchParams({
        start,
        end,
        width: String(safeWidth),
        columns,
    });
    if (colorColumn) params.set('color_column', colorColumn);
    if (Number.isFinite(lookaroundMs) && lookaroundMs > 0) params.set('lookaround_ms', String(Math.round(lookaroundMs)));

    const tableFromIPC = await ensureArrowParser();
    const url = `/api/v1/data?${params.toString()}`;

    dbg('GET', url);
    const res = await globalThis.fetch(url, options?.signal ? { signal: options.signal, cache: 'no-store' } : { cache: 'no-store' });
    assertDatasetRequestScopeActive(requestScope);

    if (DEBUG) {
        dbg('status', res.status, res.statusText);
        dbg('content-type', res.headers.get('content-type'));
        dbg('content-length', res.headers.get('content-length'));
    }

    const downsampledHeader = res.headers.get('x-edatime-downsampled');
    const returnedRowsHeader = res.headers.get('x-edatime-returned-rows');
    const targetPointsHeader = res.headers.get('x-edatime-target-points');
    const timeColumnHeader = res.headers.get('x-edatime-time-column');

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
