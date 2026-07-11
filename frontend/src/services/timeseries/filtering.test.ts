import { describe, expect, it } from 'vitest';
import { createWorkspaceStore, makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';
import { appState } from '../../store/appStateCompat.js';
import {
    applyFilterIntentToData,
    applyColumnRangesToData,
    buildAdaptiveLineFiltersForQueryState,
    buildAdaptiveLineY,
    clipDataToViewport,
    computeBounds,
    ensureRangeStateFromData,
    sanitizeSelectedColumns,
} from './filtering.js';

describe('timeseries filtering helpers', () => {
    it('computes finite bounds from typed arrays', () => {
        expect(computeBounds(Float64Array.from([NaN, 4, 2, 8]))).toEqual({ min: 2, max: 8 });
    });

    it('publishes missing selected-column bounds to the workspace', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['value']);

        ensureRangeStateFromData({
            ts: Float64Array.from([0, 1, 2]),
            values: { value: Float64Array.from([4, 2, 8]) },
        } as any, workspace);

        expect(workspace.getSnapshot().filters.columnRanges).toEqual({ value: { from: 2, to: 8 } });
    });

    it('publishes sanitized selections to the workspace', () => {
        const workspace = createWorkspaceStore();
        appState.metadata = {
            columns: [{ name: 'timestamp', dtype: 'datetime[ms]' }, { name: 'value', dtype: 'float64' }],
        } as any;
        workspace.setSelection(['timestamp', 'value'], 'bucket');

        sanitizeSelectedColumns(workspace);

        expect(workspace.getSnapshot().selection).toEqual({ columns: ['value'], colorColumn: 'bucket' });
    });

    it('normalizes adaptive line filters for query payloads', () => {
        const filters = buildAdaptiveLineFiltersForQueryState([
            { id: 'f1', column: 'value', x1: '0' as any, y1: 1, x2: 10, y2: 5, keepAbove: true },
            { id: 'f2', column: '', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: false },
        ]);

        expect(filters).toEqual([
            { column: 'value', x1: 0, y1: 1, x2: 10, y2: 5, keepAbove: true },
        ]);
    });

    it('applies range and adaptive filters without reading global state', () => {
        const filtered = applyColumnRangesToData(
            {
                ts: Float64Array.from([0, 5, 10]),
                values: {
                    value: Float64Array.from([1, 5, 9]),
                    guard: Float64Array.from([10, 1, 10]),
                },
                color: ['a', 'b', 'c'],
                color_column: 'label',
                _meta: {
                    downsampled: false,
                    downsampleKnown: true,
                    returnedRows: 3,
                    targetPoints: 10,
                },
            },
            ['value'],
            { value: { from: 0, to: 10 } },
            [{ id: 'g1', column: 'guard', x1: 0, y1: 5, x2: 10, y2: 5, keepAbove: true }],
        );

        expect(Array.from(filtered.series.value.x)).toEqual([0, 10]);
        expect(Array.from(filtered.series.value.y)).toEqual([1, 9]);
        expect(filtered.colorByColumn.value).toEqual(['a', 'c']);
        expect(buildAdaptiveLineY({ id: 'x1', column: 'x', x1: 0, y1: 0, x2: 10, y2: 20, keepAbove: true }, 5)).toBe(10);
    });

    it('applies workspace filter intent without consulting global ui state', () => {
        const filtered = applyFilterIntentToData(
            {
                ts: Float64Array.from([0, 5, 10]),
                values: {
                    value: Float64Array.from([1, 5, 9]),
                    guard: Float64Array.from([10, 1, 10]),
                },
                color: ['a', 'b', 'c'],
                color_column: 'label',
                _meta: {
                    downsampled: false,
                    downsampleKnown: true,
                    returnedRows: 3,
                    targetPoints: 10,
                },
            },
            makeWorkspaceSnapshot({
                selection: { columns: ['value'] },
                filters: {
                    columnRanges: { value: { from: 0, to: 10 } },
                    adaptiveLines: [{ id: 'g1', column: 'guard', x1: 0, y1: 5, x2: 10, y2: 5, keepAbove: true }],
                },
            }),
        );

        expect(Array.from(filtered.series.value.x)).toEqual([0, 10]);
        expect(Array.from(filtered.series.value.y)).toEqual([1, 9]);
        expect(filtered.colorByColumn.value).toEqual(['a', 'c']);
    });

    it('clips buffered data to the visible x viewport before downstream rendering', () => {
        const clipped = clipDataToViewport(
            {
                ts: Float64Array.from([0, 5, 10, 15]),
                values: {
                    value: Float64Array.from([1, 2, 3, 4]),
                    other: Float64Array.from([10, 20, 30, 40]),
                },
                color: ['a', 'b', 'c', 'd'],
                color_column: 'label',
                _meta: {
                    downsampled: false,
                    downsampleKnown: true,
                    returnedRows: 4,
                    targetPoints: 10,
                },
            },
            5,
            10,
        );

        expect(Array.from(clipped.ts)).toEqual([5, 10]);
        expect(Array.from(clipped.values.value)).toEqual([2, 3]);
        expect(Array.from(clipped.values.other)).toEqual([20, 30]);
        expect(clipped.color).toEqual(['b', 'c']);
    });
});
