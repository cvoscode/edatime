import type {
    AdaptiveLineFilter,
    ColumnRange,
    DataObject,
    FilteredDataObject,
    ScatterLineFilterSpec,
} from '../../types.js';
import { datasetState } from '../../store/datasetState.js';
import { uiState } from '../../store/uiState.js';
import { setColumnRanges, setSelectedCols } from '../../store/uiState.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

/**
 * Ensure column ranges are populated from data for any selected column
 * that doesn't already have a range.
 */
export function ensureRangeStateFromData(
    dataObj: DataObject,
    workspace?: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>,
): void {
    const intent = workspace?.getSnapshot();
    const next = ensureRangeStateFromDataState(
        dataObj,
        intent ? [...intent.selection.columns] : (uiState.selectedCols || []),
        intent ? intent.filters.columnRanges : (uiState.columnRanges || {}),
    );
    const currentRanges = intent?.filters.columnRanges ?? uiState.columnRanges;
    if (next === currentRanges) return;
    if (intent) workspace?.setFilters({ ...intent.filters, columnRanges: next });
    setColumnRanges(next);
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

function passesAdaptiveLineFilters(
    tsMs: number,
    valuesByColumn: Record<string, number | undefined>,
    filters: readonly AdaptiveLineFilter[],
): boolean {
    for (const filter of filters) {
        const column = String(filter?.column || '');
        if (!column) continue;
        const y = Number(valuesByColumn?.[column]);
        if (!Number.isFinite(y)) return false;

        const lineY = buildAdaptiveLineY(filter, tsMs);
        if (!Number.isFinite(lineY)) continue;

        if (filter.keepAbove) {
            if (y < lineY!) return false;
        } else if (y > lineY!) {
            return false;
        }
    }
    return true;
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
    const neededColumns: string[] = lineFilters.length > 0
        ? [...new Set([...(selectedCols || []), ...lineFilters.map((filter) => filter.column)])]
        : [];

    for (const col of selectedCols) {
        const yValues = dataObj.values?.[col];
        if (!yValues) continue;

        const range = columnRanges[col];
        const xs: number[] = [];
        const ys: number[] = [];
        const colorValues: (number | string | null)[] = [];

        for (let i = 0; i < yValues.length; i++) {
            const y = yValues[i];
            const ts = dataObj.ts?.[i];
            if (!Number.isFinite(y)) continue;
            if (!Number.isFinite(ts)) continue;
            if (range && (y < range.from || y > range.to)) continue;

            if (lineFilters.length > 0) {
                const valuesByColumn: Record<string, number | undefined> = {};
                for (const name of neededColumns) {
                    valuesByColumn[name] = dataObj.values?.[name]?.[i];
                }
                if (!passesAdaptiveLineFilters(ts, valuesByColumn, lineFilters)) continue;
            }

            xs.push(ts);
            ys.push(y);
            if (Array.isArray(dataObj.color)) {
                colorValues.push(dataObj.color[i]);
            }
        }

        filtered.series[col] = {
            x: Float64Array.from(xs),
            y: Float64Array.from(ys),
        };
        if (Array.isArray(dataObj.color)) {
            filtered.colorByColumn[col] = colorValues;
        }
    }
    return filtered;
}

/**
 * Returns adaptive line filters with non-finite values stripped.
 * Reads from uiState.adaptiveLineFilters.
 */
export function buildAdaptiveLineFiltersForQuery(): ScatterLineFilterSpec[] {
    return buildAdaptiveLineFiltersForQueryState(uiState.adaptiveLineFilters || []);
}

/**
 * Apply column ranges and adaptive line filters to a data object.
 * Reads selected columns and ranges from appState.
 */
export function applyColumnRanges(dataObj: DataObject): FilteredDataObject {
    return applyColumnRangesToData(
        dataObj,
        uiState.selectedCols || [],
        uiState.columnRanges || {},
        uiState.adaptiveLineFilters || [],
    );
}

/**
 * Remove selected columns that are time/dataset columns or don't exist
 * in the current metadata.
 */
export function sanitizeSelectedColumns(
    workspace?: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection'>,
): void {
    const blockedNames = new Set(['ts', 'timestamp', 'time']);
    const datetimeCols = new Set(
        (datasetState.metadata?.columns || [])
            .filter((col) => /date|time/i.test(String(col?.dtype || '')))
            .map((col) => String(col?.name || '').toLowerCase()),
    );

    const validColNames = new Set(
        (datasetState.metadata?.columns || []).map((c) => String(c?.name || '').trim()),
    );

    const intent = workspace?.getSnapshot();
    const selectedColumns = intent ? intent.selection.columns : (uiState.selectedCols || []);
    const filtered = selectedColumns.filter((col) => {
        const name = String(col || '').trim();
        if (!name) return false;
        const lower = name.toLowerCase();
        if (blockedNames.has(lower)) return false;
        if (datetimeCols.has(lower)) return false;
        // Only keep columns that exist in the current dataset
        if (!validColNames.has(name)) return false;
        return true;
    });
    if (intent) workspace?.setSelection(filtered, intent.selection.colorColumn);
    setSelectedCols(filtered);
}
