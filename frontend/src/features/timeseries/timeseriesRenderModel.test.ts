import { describe, expect, it } from 'vitest';
import type { DataObject } from '../../types/api.js';
import { buildTimeseriesRenderModel } from './timeseriesRenderModel.js';

function data(values = new Float64Array([1, 2, 3])): DataObject {
    return {
        ts: new Float64Array([0, 10, 20]),
        values: { value: values },
        color: null,
        color_column: null,
        _meta: { downsampled: false, downsampleKnown: true, returnedRows: 3, targetPoints: 3 },
    };
}

describe('timeseries render model', () => {
    it('describes the selected-series prompt without requiring data', () => {
        const model = buildTimeseriesRenderModel({
            data: null,
            selectedColumns: [],
            viewport: { start: 0, end: 20 },
            columnRanges: {},
            adaptiveLineFilters: [],
            datasetRange: null,
            spectralPreview: null,
        });

        expect(model).toMatchObject({ kind: 'no-selection', emptyState: { visible: true, reason: 'no-columns-selected' } });
    });

    it('reports an empty filtered series rather than sending an empty trace to the chart', () => {
        const model = buildTimeseriesRenderModel({
            data: data(),
            selectedColumns: ['value'],
            viewport: { start: 0, end: 20 },
            columnRanges: { value: { from: 10, to: 20 } },
            adaptiveLineFilters: [],
            datasetRange: { min: 0, max: 20 },
            spectralPreview: null,
        });

        expect(model).toMatchObject({ kind: 'empty', emptyState: { reason: 'no-data-after-filters', visible: true } });
    });

    it('adds a spectral preview without mutating the filtered chart data', () => {
        const model = buildTimeseriesRenderModel({
            data: data(),
            selectedColumns: ['value'],
            viewport: { start: 0, end: 20 },
            columnRanges: {},
            adaptiveLineFilters: [],
            datasetRange: { min: 0, max: 20 },
            spectralPreview: { column: 'value', ts: [0, 10], values: [2, 4], filterType: 'lowpass' },
        });

        expect(model.kind).toBe('data');
        if (model.kind !== 'data') return;
        expect(model.displayColumns).toEqual(['value', 'value [filtered]']);
        expect(model.data.series.value).toEqual({ x: new Float64Array([0, 10, 20]), y: new Float64Array([1, 2, 3]) });
        expect(model.data.series['value [filtered]']).toEqual({ x: new Float64Array([0, 10]), y: new Float64Array([2, 4]) });
    });
});
