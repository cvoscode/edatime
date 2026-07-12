import { beforeEach, describe, expect, it, vi } from 'vitest';

import { scatterState } from '../../store/scatterState.js';

const { downloadBlobMock, exportScatterParquetMock, formatValueForColumnMock } = vi.hoisted(() => ({
    downloadBlobMock: vi.fn(),
    exportScatterParquetMock: vi.fn(),
    formatValueForColumnMock: vi.fn((column: string, value: number) => `${column},"${value}"\nlabel`),
}));

vi.mock('./helpers.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers.js')>();
    return {
        ...actual,
        downloadBlob: downloadBlobMock,
        formatValueForColumn: formatValueForColumnMock,
    };
});

vi.mock('./state.js', () => ({
    currentControls: vi.fn(() => ({
        x: 'x',
        y: 'y',
        binSize: 10,
        colormap: 'viridis',
        normalization: 'linear',
        renderMode: 'scatter',
        diagonalMode: 'histogram',
        colorColumn: '',
        selectedColorColumn: 'group',
        colorScale: 'viridis',
        matrixMode: 'scatter',
        matrixCellSize: 160,
    })),
    buildScatterQueryContext: vi.fn(() => ({ start: undefined, end: undefined, filters: [], lineFilters: [] })),
}));

vi.mock('../../services/api/index.js', () => ({
    exportScatterParquet: exportScatterParquetMock,
}));

import { buildVisibleScatterRows, exportScatterData } from './export.js';

describe('scatter export', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        scatterState.points = [];
        scatterState.view = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
        scatterState.colorLabels = null;
        scatterState.colorValues = null;
        scatterState.colorColumn = '';
        scatterState.colorMin = null;
        scatterState.colorMax = null;
        scatterState.columnTypes = new Map();
    });

    it('builds rows only for points inside the visible scatter viewport', () => {
        scatterState.points = [
            [1, 2],
            [20, 30],
            [5, 6],
        ];
        scatterState.colorLabels = ['inside-a', 'outside', 'inside-b'];

        expect(buildVisibleScatterRows()).toEqual([
            {
                x: 1,
                y: 2,
                x_label: 'x,"1"\nlabel',
                y_label: 'y,"2"\nlabel',
                color: 'inside-a',
            },
            {
                x: 5,
                y: 6,
                x_label: 'x,"5"\nlabel',
                y_label: 'y,"6"\nlabel',
                color: 'inside-b',
            },
        ]);
    });

    it('returns false when no visible points remain after viewport filtering', () => {
        scatterState.points = [[20, 30]];

        expect(exportScatterData('csv')).toBe(false);
        expect(exportScatterData('json')).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('escapes textual CSV fields, including categorical color labels, with the shared csv helper', async () => {
        scatterState.points = [[1, 2]];
        scatterState.colorLabels = ['group,"a"\nzone'];

        expect(exportScatterData('csv')).toBe(true);

        const csvBlob = downloadBlobMock.mock.calls[0]?.[0] as Blob;
        const csv = await csvBlob.text();
        expect(csv).toBe([
            'x,y,x_label,y_label,color',
            '1,2,"x,""1""\nlabel","y,""2""\nlabel","group,""a""\nzone"',
        ].join('\n'));
    });

    it('returns false for CSV export when the visible row set exceeds the export cap', () => {
        scatterState.points = Array.from({ length: 100_001 }, (_, index) => [index, index]);
        scatterState.view = { xMin: 0, xMax: 100_001, yMin: 0, yMax: 100_001 };

        expect(exportScatterData('csv')).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns false for JSON export when the visible row set exceeds the export cap', () => {
        scatterState.points = Array.from({ length: 100_001 }, (_, index) => [index, index]);
        scatterState.view = { xMin: 0, xMax: 100_001, yMin: 0, yMax: 100_001 };

        expect(exportScatterData('json')).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });
});
