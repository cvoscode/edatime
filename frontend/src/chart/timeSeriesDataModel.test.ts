import { describe, expect, it } from 'vitest';
import { buildTimeSeriesDataModel } from './timeSeriesDataModel.js';

describe('buildTimeSeriesDataModel', () => {
    it('builds finite points, bounds, and visible marker annotations', () => {
        const model = buildTimeSeriesDataModel({
            data: {
                ts: new Float64Array([0, 1, 2]),
                values: { temperature: new Float64Array([1, Number.NaN, 3]) },
            } as any,
            columns: ['ts', 'temperature'],
            visibilityByName: new Map(),
            selectedColorColumn: null,
            numericColumns: ['temperature'],
            showMarkers: true,
        });

        expect(model.series).toHaveLength(1);
        expect((model.series[0] as any).data).toEqual([[0, 1], [2, 3]]);
        expect(model.annotations).toHaveLength(2);
        expect(model).toMatchObject({ dataYMin: 1, dataYMax: 3, xDomainMin: 0, xDomainMax: 2 });
    });

    it('preserves visibility and creates colorized segments only with aligned color values', () => {
        const model = buildTimeSeriesDataModel({
            data: {
                ts: new Float64Array([0, 1]),
                values: { temperature: new Float64Array([1, 2]) },
                colorByColumn: { temperature: [10, 20] },
            } as any,
            columns: ['temperature'],
            visibilityByName: new Map([['temperature', false]]),
            selectedColorColumn: 'severity',
            numericColumns: ['temperature'],
            showMarkers: false,
        });

        expect(model.hasColorCandidates).toBe(true);
        expect(model.colorScaleInfo?.isNumeric).toBe(true);
        expect(model.series.every((series: any) => series.visible === false)).toBe(true);
    });
});
