import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataObject } from '../../types/api.js';
import { makeWorkspaceSnapshot, type WorkspaceSnapshot } from '../../workspace/workspaceStore.js';

const { downloadBlobMock, exportCleaningDataMock } = vi.hoisted(() => ({
    downloadBlobMock: vi.fn(),
    exportCleaningDataMock: vi.fn(),
}));

vi.mock('../../utils/dom.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/dom.js')>();
    return {
        ...actual,
        downloadBlob: downloadBlobMock,
    };
});

vi.mock('../../cleaning/api.js', () => ({
    exportCleaningData: exportCleaningDataMock,
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

function createFeature(cleaningPlanStore?: { getSnapshot: () => any }) {
    return createExportFeature({
        getData: () => currentData,
        workspace: { getSnapshot: () => workspaceSnapshot },
        cleaningPlanStore,
    });
}

describe('export feature characterization', () => {
    beforeEach(() => {
        downloadBlobMock.mockReset();
        exportCleaningDataMock.mockReset();
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

    it('exports the complete plan-derived dataset instead of the chart viewport when the plan has stages', async () => {
        const plan = {
            schemaVersion: 1,
            id: 'plan', planRevision: 1, sourceVersionId: 'source-0', datasetRevision: 0,
            datasetFingerprint: 'frame', schemaFingerprint: 'schema', timeColumn: 'ts',
            stages: [{ id: 'range', kind: 'columnRange', enabled: true }], createdAt: 'now', updatedAt: 'now',
        };
        exportCleaningDataMock.mockResolvedValue(new Blob(['parquet']));
        const feature = createFeature({ getSnapshot: () => plan });

        await expect(feature.exportFilteredParquet()).resolves.toBe(true);

        expect(exportCleaningDataMock).toHaveBeenCalledWith(plan);
        expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'edatime_cleaned.parquet');
    });

    it('exports plan-backed CSV rows in timestamp and series order without reapplying workspace filters', async () => {
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
            '1000,"1970-01-01T00:00:01.000Z","temp",10',
            '2000,"1970-01-01T00:00:02.000Z","humidity",2',
            '2000,"1970-01-01T00:00:02.000Z","temp",20',
            '3000,"1970-01-01T00:00:03.000Z","humidity",3',
            '3000,"1970-01-01T00:00:03.000Z","temp",30',
        ].join('\n'));
    });

    it('exports plan-backed rows as JSON without reapplying workspace filters', async () => {
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
                ts_ms: 1_000,
                ts_iso: '1970-01-01T00:00:01.000Z',
                series: 'temp',
                value: 10,
            },
            {
                ts_ms: 2_000,
                ts_iso: '1970-01-01T00:00:02.000Z',
                series: 'temp',
                value: 20,
            },
            {
                ts_ms: 3_000,
                ts_iso: '1970-01-01T00:00:03.000Z',
                series: 'temp',
                value: 30,
            },
        ]);
    });

    it('does not let workspace filters suppress plan-backed CSV or JSON exports', () => {
        currentData = makeData();
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: { temp: { from: 100, to: 200 } }, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toBe(true);
        expect(feature.exportFilteredJson()).toBe(true);
        expect(downloadBlobMock).toHaveBeenCalledTimes(2);
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

    it('exports parquet from the active canonical plan', async () => {
        const parquetBlob = new Blob(['parquet']);
        const plan = { id: 'canonical-plan', stages: [] };
        exportCleaningDataMock.mockResolvedValueOnce(parquetBlob);
        const feature = createFeature({ getSnapshot: () => plan });

        await expect(feature.exportFilteredParquet()).resolves.toBe(true);
        expect(exportCleaningDataMock).toHaveBeenCalledWith(plan);
        expect(downloadBlobMock).toHaveBeenCalledWith(parquetBlob, 'edatime_cleaned.parquet');
    });

    it('returns false for parquet export without a viewport or selected series', async () => {
        const feature = createFeature();

        await expect(feature.exportFilteredParquet()).resolves.toBe(false);
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
