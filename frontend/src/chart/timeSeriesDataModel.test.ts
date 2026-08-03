import { describe, expect, it } from 'vitest';
import { buildTimeSeriesDataModel } from './timeSeriesDataModel.js';
import { getColumnSeriesColor, setActiveSeriesPalette } from '../utils/seriesColors.js';
import { setNumericCols } from '../store/datasetState.js';

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
            showMarkers: true,
            showRawData: true,
        });

        expect(model.series).toHaveLength(1);
        expect((model.series[0] as any).data).toEqual([[0, 1], [1, Number.NaN], [2, 3]]);
        expect(model.annotations).toHaveLength(2);
        expect(model.series[0]?.color).toBe(getColumnSeriesColor('temperature'));
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
            showMarkers: false,
            showRawData: true,
        });

        expect(model.hasColorCandidates).toBe(true);
        expect(model.colorScaleInfo?.isNumeric).toBe(true);
        expect(model.series.every((series: any) => series.visible === false)).toBe(true);
    });

    it('keeps the data domain while hiding raw series for smooth-only display', () => {
        const model = buildTimeSeriesDataModel({
            data: {
                ts: new Float64Array([0, 1]),
                values: { temperature: new Float64Array([1, 3]) },
            } as any,
            columns: ['temperature'],
            visibilityByName: new Map(),
            selectedColorColumn: null,
            showMarkers: true,
            showRawData: false,
        });

        expect(model.series[0]).toMatchObject({ visible: false });
        expect(model.annotations).toEqual([]);
        expect(model).toMatchObject({ dataYMin: 1, dataYMax: 3 });
    });

    it('renders every selected column with a distinct column-derived color', () => {
        setActiveSeriesPalette('ocean');
        const columns = ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL'];
        setNumericCols(columns);
        const values = Object.fromEntries(columns.map((column, index) => [
            column,
            new Float64Array([index, index + 1]),
        ]));
        const model = buildTimeSeriesDataModel({
            data: { ts: new Float64Array([0, 1]), values } as any,
            columns,
            visibilityByName: new Map(),
            selectedColorColumn: null,
            showMarkers: false,
            showRawData: true,
        });

        expect(model.series).toHaveLength(6);
        expect(new Set(model.series.map((series) => series.color)).size).toBe(6);
        setActiveSeriesPalette('default');
    });
});
