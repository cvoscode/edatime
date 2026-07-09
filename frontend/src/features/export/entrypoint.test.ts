import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataObject } from '../../types.js';
import { appState } from '../../store/appStateCompat.js';

const { downloadBlobMock, exportParquetMock } = vi.hoisted(() => ({
    downloadBlobMock: vi.fn(),
    exportParquetMock: vi.fn(),
}));

vi.mock('../../utils/dom.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/dom.js')>();
    return {
        ...actual,
        downloadBlob: downloadBlobMock,
    };
});

vi.mock('../../services/api/index.js', () => ({
    exportParquet: exportParquetMock,
}));

import { createExportFeature } from './entrypoint.js';

function makeData(): DataObject {
    return {
        ts: Float64Array.from([1_000, 2_000, 3_000]),
        values: {
            temp: Float64Array.from([10, 20, 30]),
            humidity: Float64Array.from([1, 2, 3]),
        },
        color: null,
        color_column: null,
        _meta: {
            downsampled: false,
            downsampleKnown: true,
            returnedRows: 3,
            targetPoints: 6,
        },
    };
}

describe('export feature characterization', () => {
    const initialState = {
        lastFetchedData: appState.lastFetchedData,
        selectedCols: [...(appState.selectedCols || [])],
        columnRanges: { ...(appState.columnRanges || {}) },
        adaptiveLineFilters: [...(appState.adaptiveLineFilters || [])],
        currentStart: appState.currentStart,
        currentEnd: appState.currentEnd,
    };

    beforeEach(() => {
        downloadBlobMock.mockReset();
        exportParquetMock.mockReset();
        appState.lastFetchedData = null;
        appState.selectedCols = [];
        appState.columnRanges = {};
        appState.adaptiveLineFilters = [];
        appState.currentStart = null;
        appState.currentEnd = null;
    });

    afterEach(() => {
        appState.lastFetchedData = initialState.lastFetchedData;
        appState.selectedCols = [...initialState.selectedCols];
        appState.columnRanges = { ...initialState.columnRanges };
        appState.adaptiveLineFilters = [...initialState.adaptiveLineFilters];
        appState.currentStart = initialState.currentStart;
        appState.currentEnd = initialState.currentEnd;
        vi.restoreAllMocks();
    });

    it('returns false for CSV and JSON export when there is no filtered dataset to export', () => {
        const feature = createExportFeature();

        expect(feature.exportFilteredCsv()).toBe(false);
        expect(feature.exportFilteredJson()).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('exports filtered CSV rows in timestamp and series order', async () => {
        const feature = createExportFeature();
        appState.lastFetchedData = makeData();
        appState.selectedCols = ['temp', 'humidity'];
        appState.columnRanges = {
            temp: { from: 15, to: 30 },
        };

        expect(feature.exportFilteredCsv()).toBe(true);
        expect(downloadBlobMock).toHaveBeenCalledTimes(1);
        expect(downloadBlobMock.mock.calls[0]?.[1]).toBe('edatime_filtered_series.csv');

        const csvBlob = downloadBlobMock.mock.calls[0]?.[0] as Blob;
        const csv = await csvBlob.text();
        expect(csv).toBe([
            'ts_ms,ts_iso,series,value',
            '1000,"1970-01-01T00:00:01.000Z","humidity",1',
            '2000,"1970-01-01T00:00:02.000Z","humidity",2',
            '2000,"1970-01-01T00:00:02.000Z","temp",20',
            '3000,"1970-01-01T00:00:03.000Z","humidity",3',
            '3000,"1970-01-01T00:00:03.000Z","temp",30',
        ].join('\n'));
    });

    it('exports the same filtered rows as JSON', async () => {
        const feature = createExportFeature();
        appState.lastFetchedData = makeData();
        appState.selectedCols = ['temp'];
        appState.columnRanges = {
            temp: { from: 15, to: 25 },
        };

        expect(feature.exportFilteredJson()).toBe(true);
        expect(downloadBlobMock).toHaveBeenCalledTimes(1);
        expect(downloadBlobMock.mock.calls[0]?.[1]).toBe('edatime_filtered_series.json');

        const jsonBlob = downloadBlobMock.mock.calls[0]?.[0] as Blob;
        const rows = JSON.parse(await jsonBlob.text());
        expect(rows).toEqual([
            {
                ts_ms: 2_000,
                ts_iso: '1970-01-01T00:00:02.000Z',
                series: 'temp',
                value: 20,
            },
        ]);
    });

    it('exports parquet with the current viewport, range filters, and adaptive line filters', async () => {
        const feature = createExportFeature();
        const parquetBlob = new Blob(['parquet']);
        exportParquetMock.mockResolvedValueOnce(parquetBlob);

        appState.selectedCols = ['temp'];
        appState.columnRanges = {
            temp: { from: 15, to: 30 },
        };
        appState.adaptiveLineFilters = [{
            id: 'line-1',
            column: 'temp',
            x1: 1_000,
            y1: 12,
            x2: 3_000,
            y2: 28,
            keepAbove: true,
        }];
        appState.currentStart = 1_000;
        appState.currentEnd = 3_000;

        await expect(feature.exportFilteredParquet()).resolves.toBe(true);

        const params = exportParquetMock.mock.calls[0]?.[0] as URLSearchParams;
        expect(params.get('start')).toBe('1970-01-01T00:00:01.000Z');
        expect(params.get('end')).toBe('1970-01-01T00:00:03.000Z');
        expect(params.get('columns')).toBe('temp');
        expect(JSON.parse(String(params.get('filters')))).toEqual([
            { column: 'temp', from: 15, to: 30 },
        ]);
        expect(JSON.parse(String(params.get('line_filters')))).toEqual([
            {
                column: 'temp',
                x1: 1_000,
                y1: 12,
                x2: 3_000,
                y2: 28,
                keepAbove: true,
            },
        ]);
        expect(downloadBlobMock).toHaveBeenCalledWith(parquetBlob, 'edatime_filtered_series.parquet');
    });

    it('returns false for parquet export without a viewport or selected series', async () => {
        const feature = createExportFeature();

        await expect(feature.exportFilteredParquet()).resolves.toBe(false);
        expect(exportParquetMock).not.toHaveBeenCalled();
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });
});
