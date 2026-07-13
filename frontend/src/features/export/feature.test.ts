import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataObject } from '../../types.js';
import { makeWorkspaceSnapshot, type WorkspaceSnapshot } from '../../workspace/workspaceStore.js';

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

import { createExportFeature } from './feature.js';

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

function makeLargeData(rowCount: number): DataObject {
    return {
        ts: Float64Array.from({ length: rowCount }, (_, index) => index + 1),
        values: {
            temp: Float64Array.from({ length: rowCount }, (_, index) => index),
        },
        color: null,
        color_column: null,
        _meta: {
            downsampled: false,
            downsampleKnown: true,
            returnedRows: rowCount,
            targetPoints: rowCount,
        },
    };
}

let currentData: DataObject | null = null;
let workspaceSnapshot: WorkspaceSnapshot = makeWorkspaceSnapshot();

function createFeature() {
    return createExportFeature({
        getData: () => currentData,
        workspace: { getSnapshot: () => workspaceSnapshot },
    });
}

describe('export feature characterization', () => {
    beforeEach(() => {
        downloadBlobMock.mockReset();
        exportParquetMock.mockReset();
        currentData = null;
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: [] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false for CSV and JSON export when there is no filtered dataset to export', () => {
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toBe(false);
        expect(feature.exportFilteredJson()).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('exports filtered CSV rows in timestamp and series order', async () => {
        currentData = makeData();
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp', 'humidity'] },
            filters: { columnRanges: { temp: { from: 15, to: 30 } }, adaptiveLines: [] },
        });
        const feature = createFeature();

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
        currentData = makeData();
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: { temp: { from: 15, to: 25 } }, adaptiveLines: [] },
        });
        const feature = createFeature();

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

    it('returns false for CSV and JSON exports when filters remove every row', () => {
        currentData = makeData();
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: { temp: { from: 100, to: 200 } }, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toBe(false);
        expect(feature.exportFilteredJson()).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('escapes commas, quotes, and newlines in CSV series names through the shared csv helper', async () => {
        currentData = {
            ts: Float64Array.from([1_000]),
            values: {
                'temp,"indoor"\nzone': Float64Array.from([10]),
            },
            color: null,
            color_column: null,
            _meta: {
                downsampled: false,
                downsampleKnown: true,
                returnedRows: 1,
                targetPoints: 1,
            },
        } as DataObject;
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp,"indoor"\nzone'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toBe(true);
        const csvBlob = downloadBlobMock.mock.calls[0]?.[0] as Blob;
        const csv = await csvBlob.text();

        expect(csv).toBe([
            'ts_ms,ts_iso,series,value',
            '1000,"1970-01-01T00:00:01.000Z","temp,""indoor""\nzone",10',
        ].join('\n'));
    });

    it('exports parquet with the current viewport, range filters, and adaptive line filters', async () => {
        const parquetBlob = new Blob(['parquet']);
        exportParquetMock.mockResolvedValueOnce(parquetBlob);

        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: {
                columnRanges: { temp: { from: 15, to: 30 } },
                adaptiveLines: [{
                    id: 'line-1', column: 'temp', x1: 1_000, y1: 12,
                    x2: 3_000, y2: 28, keepAbove: true,
                }],
            },
            viewport: { xMin: 1_000, xMax: 3_000, yMin: null, yMax: null },
        });
        const feature = createFeature();

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
        const feature = createFeature();

        await expect(feature.exportFilteredParquet()).resolves.toBe(false);
        expect(exportParquetMock).not.toHaveBeenCalled();
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns false instead of throwing for a finite viewport outside the JavaScript Date range', async () => {
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
            viewport: { xMin: 1e30, xMax: 2e30, yMin: null, yMax: null },
        });
        const feature = createFeature();

        await expect(feature.exportFilteredParquet()).resolves.toBe(false);
        expect(exportParquetMock).not.toHaveBeenCalled();
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns false for CSV export when the filtered row set exceeds the export cap', () => {
        currentData = makeLargeData(100_001);
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns false for JSON export when the filtered row set exceeds the export cap', () => {
        currentData = makeLargeData(100_001);
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredJson()).toBe(false);
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });
});
