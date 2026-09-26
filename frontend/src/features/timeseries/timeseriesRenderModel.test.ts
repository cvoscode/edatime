import { describe, expect, it } from 'vitest';
import type { DataObject } from '../../types/api.js';
import { buildTimeseriesRenderModel } from './timeseriesRenderModel.js';
import { getSeriesDisplayData } from '../../chart/seriesNormalization.js';
import { createCleaningPlanStore } from '../../cleaning/store.js';
import { hashCleaningPlan } from '../../cleaning/planHash.js';
import type { CleaningPlan } from '../../cleaning/types.js';

function planStore() {
    const store = createCleaningPlanStore();
    store.resetForDataset({
        sourceVersionId: 'source', datasetRevision: 1, datasetFingerprint: null,
        schemaFingerprint: 'schema', timeColumn: 'ts',
    });
    return store;
}

function responseForPlan(values: number[], plan: CleaningPlan): DataObject {
    const result = data(Float64Array.from(values));
    return {
        ...result,
        _meta: {
            ...result._meta,
            executionIdentity: {
                sourceVersionId: plan.sourceVersionId,
                sourceRevision: plan.datasetRevision,
                schemaFingerprint: plan.schemaFingerprint,
                planHash: hashCleaningPlan(plan),
            },
        },
    };
}

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

    it('does not reapply a saved range after the matching plan transforms its values', () => {
        const plan = planStore();
        plan.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep source values', column: 'value',
            from: 0, to: 5, mode: 'keepInside',
        });
        plan.addStage({
            kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
            sourcePage: 'manual', label: 'Scale values', outputColumn: 'value', expression: 'value * 10',
        });
        const activePlan = plan.getSnapshot()!;

        const model = buildTimeseriesRenderModel({
            data: responseForPlan([20, 30, 40], activePlan),
            selectedColumns: ['value'],
            viewport: { start: 0, end: 20 },
            columnRanges: { value: { from: 0, to: 5 } },
            adaptiveLineFilters: [],
            datasetRange: { min: 0, max: 20 },
            spectralPreview: null,
            cleaningPlan: activePlan,
        });

        expect(model.kind).toBe('data');
        if (model.kind !== 'data') return;
        expect([...model.data.series.value.y]).toEqual([20, 30, 40]);
    });

    it('keeps a local range preview when the response was produced by another plan', () => {
        const plan = planStore();
        plan.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep current range', column: 'value',
            from: 0, to: 5, mode: 'keepInside',
        });
        const activePlan = plan.getSnapshot()!;
        const staleResponse = data(Float64Array.from([2, 8, 3]));
        staleResponse._meta.executionIdentity = {
            sourceVersionId: activePlan.sourceVersionId,
            sourceRevision: activePlan.datasetRevision,
            schemaFingerprint: activePlan.schemaFingerprint,
            planHash: 'previous-plan',
        };

        const model = buildTimeseriesRenderModel({
            data: staleResponse,
            selectedColumns: ['value'],
            viewport: { start: 0, end: 20 },
            columnRanges: { value: { from: 0, to: 5 } },
            adaptiveLineFilters: [],
            datasetRange: { min: 0, max: 20 },
            spectralPreview: null,
            cleaningPlan: activePlan,
        });

        expect(model.kind).toBe('data');
        if (model.kind !== 'data') return;
        expect([...model.data.series.value.y]).toEqual([2, Number.NaN, 3]);
    });

    it('does not reapply a saved adaptive filter after a matching resample plan', () => {
        const plan = planStore();
        plan.addStage({
            kind: 'adaptiveLine', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep above trend', column: 'value',
            x1Ms: 0, y1: 0, x2Ms: 20, y2: 10, keepAbove: true, applyWithinSegmentOnly: true,
        });
        plan.addStage({
            kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Resample', every: '10m',
            aggregations: [{ column: 'value', method: 'mean' }],
        });
        const activePlan = plan.getSnapshot()!;

        const model = buildTimeseriesRenderModel({
            data: responseForPlan([5, 5, 5], activePlan),
            selectedColumns: ['value'],
            viewport: { start: 0, end: 20 },
            columnRanges: {},
            adaptiveLineFilters: [{
                id: 'saved-line', column: 'value', x1: 0, y1: 0, x2: 20, y2: 10, keepAbove: true,
            }],
            datasetRange: { min: 0, max: 20 },
            spectralPreview: null,
            cleaningPlan: activePlan,
        });

        expect(model.kind).toBe('data');
        if (model.kind !== 'data') return;
        expect([...model.data.series.value.y]).toEqual([5, 5, 5]);
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

    it('excludes viewport padding and local-filter gaps from the normalization scale', () => {
        const model = buildTimeseriesRenderModel({
            data: { ...data(), ts: Float64Array.from([0, 10, 20, 30, 40]),
                values: { value: Float64Array.from([-1000, 20, 1000, 30, 5000]) } },
            selectedColumns: ['value'], viewport: { start: 10, end: 30 },
            columnRanges: { value: { from: 15, to: 35 } }, adaptiveLineFilters: [],
            datasetRange: { min: 0, max: 40 }, spectralPreview: null,
        });
        expect(model.kind).toBe('data');
        if (model.kind !== 'data') return;
        const normalized = getSeriesDisplayData(model.data, 'value', true)!;
        expect([...normalized.x]).toEqual([10, 20, 30]);
        expect([...normalized.y]).toEqual([0, NaN, 1]);
        expect(normalized.normalization).toEqual({ min: 20, max: 30 });
    });
});
