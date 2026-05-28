import { describe, expect, it } from 'vitest';
import {
    applyColumnRangesToData,
    buildAdaptiveLineFiltersForQueryState,
    buildAdaptiveLineY,
    computeBounds,
} from './filtering.js';

describe('timeseries filtering helpers', () => {
    it('computes finite bounds from typed arrays', () => {
        expect(computeBounds(Float64Array.from([NaN, 4, 2, 8]))).toEqual({ min: 2, max: 8 });
    });

    it('normalizes adaptive line filters for query payloads', () => {
        const filters = buildAdaptiveLineFiltersForQueryState([
            { column: 'value', x1: '0' as any, y1: 1, x2: 10, y2: 5, keepAbove: true },
            { column: '', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: false },
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
            [{ column: 'guard', x1: 0, y1: 5, x2: 10, y2: 5, keepAbove: true }],
        );

        expect(Array.from(filtered.series.value.x)).toEqual([0, 10]);
        expect(Array.from(filtered.series.value.y)).toEqual([1, 9]);
        expect(filtered.colorByColumn.value).toEqual(['a', 'c']);
        expect(buildAdaptiveLineY({ column: 'x', x1: 0, y1: 0, x2: 10, y2: 20, keepAbove: true }, 5)).toBe(10);
    });
});
