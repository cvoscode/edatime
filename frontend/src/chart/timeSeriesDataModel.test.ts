import { describe, expect, it } from 'vitest';
import { buildTimeSeriesDataModel } from './timeSeriesDataModel.js';
import { getColumnSeriesColor, setActiveSeriesPalette } from '../utils/seriesColors.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';
import { configureSeriesColorWorkspace } from '../utils/seriesColors.js';
function setNumericCols(columns: string[]) {
    const workspace = createWorkspaceStore();
    workspace.commitDataset(workspace.beginDatasetSession(), { numeric_columns: columns } as any, 0);
    configureSeriesColorWorkspace(workspace);
}

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

    it('emphasizes the color-source trace while retaining value-based segment colors', () => {
        const model = buildTimeSeriesDataModel({
            data: {
                ts: new Float64Array([0, 1, 2]),
                values: { temperature: new Float64Array([1, 2, 3]), humidity: new Float64Array([3, 2, 1]) },
                colorByColumn: { temperature: [1, 2, 3], humidity: [1, 2, 3] },
            } as any,
            columns: ['temperature', 'humidity'],
            visibilityByName: new Map(),
            selectedColorColumn: 'temperature',
            showMarkers: false,
            showRawData: true,
        });
        const source = model.series.filter((series) => String(series.name).includes('temperature')) as any[];
        const peer = model.series.filter((series) => String(series.name).includes('humidity')) as any[];

        expect(source.every((series) => series.lineStyle.width === 2.8)).toBe(true);
        expect(peer.every((series) => series.lineStyle.width === 1.4)).toBe(true);
        expect(new Set(source.map((series) => series.color)).size).toBeGreaterThan(1);
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
