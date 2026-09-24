import { describe, expect, it } from 'vitest';
import { applyColumnRangesToData } from '../services/timeseries/filtering.js';
import { buildTimeSeriesDataModel } from './timeSeriesDataModel.js';
import { getSeriesDisplayData, toSourceSeriesValue } from './seriesNormalization.js';

const source = {
    ts: Float64Array.from([0, 1, 2, 3, 4]),
    values: {
        signal: Float64Array.from([10, 20, 1000, 30, 40]),
        peer: Float64Array.from([100, 110, 120, 130, 140]),
    },
} as any;

function display(ranges = {}, lines: any[] = [], normalize = true) {
    const data = applyColumnRangesToData(source, ['signal', 'peer'], ranges, lines);
    return buildTimeSeriesDataModel({
        data, columns: ['signal', 'peer'], visibilityByName: new Map(),
        selectedColorColumn: null, showMarkers: true, showRawData: true, normalizeEachSeries: normalize,
    });
}

describe('filtered series normalization', () => {
    it('scales only the remaining samples independently and preserves gaps and source values', () => {
        const model = display({ signal: { from: 15, to: 45 } });
        expect(model.series[0].data).toEqual([[0, NaN], [1, 0], [2, NaN], [3, 0.5], [4, 1]]);
        expect(model.series[1].data).toEqual([[0, 0], [1, 0.25], [2, 0.5], [3, 0.75], [4, 1]]);
        expect(model.normalizationByColumn.get('signal')).toEqual({ min: 20, max: 40 });
        expect(model.annotations).toHaveLength(8);
        expect([...source.values.signal]).toEqual([10, 20, 1000, 30, 40]);
    });

    it('recomputes bounds on filter edits and clearing, and restores filtered source units when disabled', () => {
        expect(display({ signal: { from: 15, to: 35 } }).series[0].data)
            .toEqual([[0, NaN], [1, 0], [2, NaN], [3, 1], [4, NaN]]);
        expect(display().normalizationByColumn.get('signal')).toEqual({ min: 10, max: 1000 });
        const raw = display({ signal: { from: 15, to: 45 } }, [], false);
        expect(raw.series[0].data).toEqual([[0, NaN], [1, 20], [2, NaN], [3, 30], [4, 40]]);
        expect(raw.normalizationByColumn.size).toBe(0);
    });

    it('combines range and adaptive filters before finding normalization bounds', () => {
        const model = display({ signal: { from: 15, to: 1000 } }, [
            { id: 'line', column: 'signal', x1: 0, x2: 4, y1: 35, y2: 35, keepAbove: false },
        ]);
        expect(model.series[0].data).toEqual([[0, NaN], [1, 0], [2, NaN], [3, 1], [4, NaN]]);
        expect(toSourceSeriesValue(0.5, model.normalizationByColumn.get('signal'))).toBe(25);
        expect(model.series[1].data).toEqual(display().series[1].data);
    });

    it('centers constant traces and leaves fully excluded traces empty', () => {
        const constant = display({ signal: { from: 30, to: 30 } });
        expect(constant.series[0].data).toEqual([[0, NaN], [1, NaN], [2, NaN], [3, 0.5], [4, NaN]]);
        const empty = display({ signal: { from: 50, to: 60 } });
        expect(empty.series[0].data).toEqual([[0, NaN], [1, NaN], [2, NaN], [3, NaN], [4, NaN]]);
        expect(empty.series[1].data).toEqual(display().series[1].data);
    });

    it('excludes values without a valid paired timestamp from the scale', () => {
        const data = {
            series: { signal: { x: Float64Array.from([0, NaN, 2, 3]), y: Float64Array.from([10, -1000, 20, NaN, 1000]) } },
            colorByColumn: {},
        };
        const result = getSeriesDisplayData(data, 'signal', true)!;
        expect([...result.y]).toEqual([0, NaN, 1, NaN]);
        expect(result.normalization).toEqual({ min: 10, max: 20 });
    });

    it('handles large traces without spreading samples onto the call stack', () => {
        const count = 200_000;
        const data = { series: { signal: {
            x: Float64Array.from({ length: count }, (_, i) => i),
            y: Float64Array.from({ length: count }, (_, i) => i),
        } }, colorByColumn: {} };
        const result = getSeriesDisplayData(data, 'signal', true)!;
        expect(result.y[0]).toBe(0);
        expect(result.y[count - 1]).toBe(1);
    });
});
