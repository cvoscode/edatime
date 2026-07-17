import type {
    AdaptiveLineFilter,
    ColumnRange,
} from '../../types/store.js';
import type { DataObject } from '../../types/api.js';
import type { FilteredDataObject } from '../../types/chart.js';
import type { ScatterLineFilterSpec } from '../../types/scatter.js';
import type { WorkspaceSnapshot, WorkspaceStore } from '../../contracts/workspace.js';

export type TimeseriesFilterIntent = Pick<WorkspaceSnapshot, 'selection' | 'filters'>;

/**
 * Ensure column ranges are populated from data for any selected column
 * that doesn't already have a range.
 */
export function ensureRangeStateFromData(
    dataObj: DataObject,
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>,
): void {
    const intent = workspace.getSnapshot();
    const next = ensureRangeStateFromDataState(
        dataObj,
        [...intent.selection.columns],
        intent.filters.columnRanges,
    );
    const currentRanges = intent.filters.columnRanges;
    if (next === currentRanges) return;
    workspace.setFilters({ ...intent.filters, columnRanges: next });
}

export function computeBounds(values: ArrayLike<number>): { min: number; max: number } | null {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
}

export function ensureRangeStateFromDataState(
    dataObj: DataObject,
    selectedCols: string[],
    columnRanges: Record<string, ColumnRange>,
): Record<string, ColumnRange> {
    let next = columnRanges;
    for (const col of selectedCols) {
        const values = dataObj.values?.[col];
        if (!values || values.length === 0 || next[col]) continue;
        const bounds = computeBounds(values);
        if (!bounds) continue;
        next = { ...next, [col]: { from: bounds.min, to: bounds.max } };
    }
    return next;
}

export function buildAdaptiveLineY(filter: AdaptiveLineFilter, tsMs: number): number | null {
    const x1 = Number(filter?.x1);
    const x2 = Number(filter?.x2);
    const y1 = Number(filter?.y1);
    const y2 = Number(filter?.y2);
    const x = Number(tsMs);
    if (
        !Number.isFinite(x1) || !Number.isFinite(x2) ||
        !Number.isFinite(y1) || !Number.isFinite(y2) ||
        !Number.isFinite(x) || x1 === x2
    ) {
        return null;
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    if (x < minX || x > maxX) return null;
    const slope = (y2 - y1) / (x2 - x1);
    return y1 + (x - x1) * slope;
}

function passesAdaptiveLineFilter(tsMs: number, y: number, filter: AdaptiveLineFilter): boolean {
    if (!Number.isFinite(y)) return false;
    const lineY = buildAdaptiveLineY(filter, tsMs);
    if (lineY === null || !Number.isFinite(lineY)) return true;
    return filter.keepAbove ? y >= lineY : y <= lineY;
}

export function buildAdaptiveLineFiltersForQueryState(filters: AdaptiveLineFilter[]): ScatterLineFilterSpec[] {
    return (filters || [])
        .map((filter) => ({
            column: filter.column,
            x1: Number(filter.x1),
            y1: Number(filter.y1),
            x2: Number(filter.x2),
            y2: Number(filter.y2),
            keepAbove: !!filter.keepAbove,
        }))
        .filter(
            (filter): filter is ScatterLineFilterSpec =>
                !!filter.column &&
                Number.isFinite(filter.x1) &&
                Number.isFinite(filter.y1) &&
                Number.isFinite(filter.x2) &&
                Number.isFinite(filter.y2) &&
                filter.x1 !== filter.x2,
        );
}

export function clipDataToViewport(
    dataObj: DataObject,
    startMs: number,
    endMs: number,
): DataObject {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !dataObj?.ts?.length) {
        return dataObj;
    }

    const keptIndices: number[] = [];
    for (let i = 0; i < dataObj.ts.length; i++) {
        const ts = Number(dataObj.ts[i]);
        if (!Number.isFinite(ts)) continue;
        if (ts < startMs || ts > endMs) continue;
        keptIndices.push(i);
    }

    const ts = Float64Array.from(keptIndices.map((index) => Number(dataObj.ts[index])));
    const values = Object.fromEntries(
        Object.entries(dataObj.values || {}).map(([column, series]) => [
            column,
            Float64Array.from(keptIndices.map((index) => Number(series[index]))),
        ]),
    );
    const color = Array.isArray(dataObj.color)
        ? keptIndices.map((index) => dataObj.color![index] ?? null)
        : dataObj.color;

    return {
        ...dataObj,
        ts,
        values,
        color,
    };
}

export function applyColumnRangesToData(
    dataObj: DataObject,
    selectedCols: string[],
    columnRanges: Record<string, ColumnRange>,
    adaptiveLineFilters: readonly AdaptiveLineFilter[],
): FilteredDataObject {
    const filtered: FilteredDataObject = { ...dataObj, series: {}, colorByColumn: {} };
    const lineFilters = Array.isArray(adaptiveLineFilters) ? adaptiveLineFilters : [];

    for (const col of selectedCols) {
        const yValues = dataObj.values?.[col];
        if (!yValues) continue;

        const range = columnRanges[col];
        const filtersForColumn = lineFilters.filter((filter) => filter.column === col);
        const pointCount = Math.min(dataObj.ts?.length ?? 0, yValues.length);
        const xs = new Float64Array(pointCount);
        const ys = new Float64Array(pointCount);
        const colorValues: (number | string | null)[] = [];

        for (let i = 0; i < pointCount; i++) {
            const y = Number(yValues[i]);
            const ts = Number(dataObj.ts?.[i]);
            xs[i] = ts;
            const outsideRange = !!range && (y < range.from || y > range.to);
            const failsLineFilter = filtersForColumn.some((filter) => !passesAdaptiveLineFilter(ts, y, filter));
            // Keep every timestamp so selected series remain aligned. A
            // filtered value becomes a chart gap instead of removing its row
            // or shifting colors/tooltips relative to neighbouring traces.
            ys[i] = Number.isFinite(ts) && Number.isFinite(y) && !outsideRange && !failsLineFilter
                ? y
                : Number.NaN;
            if (Array.isArray(dataObj.color)) {
                colorValues.push(dataObj.color[i]);
            }
        }

        filtered.series[col] = {
            x: xs,
            y: ys,
        };
        if (Array.isArray(dataObj.color)) {
            filtered.colorByColumn[col] = colorValues;
        }
    }
    return filtered;
}

export function applyFilterIntentToData(
    dataObj: DataObject,
    intent: TimeseriesFilterIntent,
): FilteredDataObject {
    return applyColumnRangesToData(
        dataObj,
        [...intent.selection.columns],
        { ...intent.filters.columnRanges },
        [...intent.filters.adaptiveLines],
    );
}
