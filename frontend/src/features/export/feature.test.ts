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

    it('returns a no_data result for CSV and JSON export when there is no filtered dataset to export', () => {
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toEqual({ ok: false, reason: 'no_data' });
        expect(feature.exportFilteredJson()).toEqual({ ok: false, reason: 'no_data' });
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

        await expect(feature.exportFilteredParquet()).resolves.toEqual({
            ok: true,
            rowCount: -1,
            filename: 'edatime_cleaned.parquet',
        });

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

        const csvResult = feature.exportFilteredCsv();
        expect(csvResult.ok).toBe(true);
        if (csvResult.ok) expect(csvResult.rowCount).toBe(6);
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

        const jsonResult = feature.exportFilteredJson();
        expect(jsonResult.ok).toBe(true);
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

        expect(feature.exportFilteredCsv().ok).toBe(true);
        expect(feature.exportFilteredJson().ok).toBe(true);
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

        expect(feature.exportFilteredCsv().ok).toBe(true);
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

        await expect(feature.exportFilteredParquet()).resolves.toEqual({
            ok: true,
            rowCount: -1,
            filename: 'edatime_cleaned.parquet',
        });
        expect(exportCleaningDataMock).toHaveBeenCalledWith(plan);
        expect(downloadBlobMock).toHaveBeenCalledWith(parquetBlob, 'edatime_cleaned.parquet');
    });

    it('returns a no_plan result for parquet export without a viewport or selected series', async () => {
        const feature = createFeature();

        await expect(feature.exportFilteredParquet()).resolves.toEqual({ ok: false, reason: 'no_plan' });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns an export_failed result instead of throwing for a finite viewport outside the JavaScript Date range', async () => {
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
            viewport: { xMin: 1e30, xMax: 2e30, yMin: null, yMax: null },
        });
        const plan = { id: 'plan', stages: [] };
        exportCleaningDataMock.mockRejectedValueOnce(new RangeError('Invalid time value'));
        const feature = createFeature({ getSnapshot: () => plan });

        await expect(feature.exportFilteredParquet()).resolves.toMatchObject({ ok: false, reason: 'export_failed' });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns false for CSV export when the filtered row set exceeds the export cap', () => {
        currentData = makeLargeData(100_001);
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredCsv()).toEqual({
            ok: false,
            reason: 'row_limit_exceeded',
            limit: 100_000,
        });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('returns a row_limit_exceeded result for JSON export when the filtered row set exceeds the cap', () => {
        currentData = makeLargeData(100_001);
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        expect(feature.exportFilteredJson()).toEqual({
            ok: false,
            reason: 'row_limit_exceeded',
            limit: 100_000,
        });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('surfaces an explicit row-limit result instead of a silent false when the filtered row set exceeds the cap', () => {
        currentData = makeLargeData(100_001);
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        const csvResult = feature.exportFilteredCsv();
        const jsonResult = feature.exportFilteredJson();
        expect(csvResult).toMatchObject({ ok: false, reason: 'row_limit_exceeded', limit: 100_000 });
        expect(jsonResult).toMatchObject({ ok: false, reason: 'row_limit_exceeded', limit: 100_000 });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('reports success with the exact exported row count when within the cap', () => {
        currentData = makeData();
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp', 'humidity'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createFeature();

        const csvResult = feature.exportFilteredCsv();
        expect(csvResult).toMatchObject({ ok: true, rowCount: 6 });
        expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    });

    it('rejects parquet export with an explicit row-limit result when the backend returns a row count above the parquet cap', async () => {
        exportCleaningDataMock.mockRejectedValueOnce(Object.assign(new Error('too many rows'), {
            code: 'export_row_limit_exceeded',
            limit: 1_000_000,
        }));
        const plan = { id: 'plan', stages: [] };
        const feature = createFeature({ getSnapshot: () => plan });

        const result = await feature.exportFilteredParquet();
        expect(result).toMatchObject({ ok: false, reason: 'row_limit_exceeded', limit: 1_000_000 });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('uses the provided inline row limit instead of the module default', () => {
        currentData = makeLargeData(101);
        workspaceSnapshot = makeWorkspaceSnapshot({
            selection: { columns: ['temp'] },
            filters: { columnRanges: {}, adaptiveLines: [] },
        });
        const feature = createExportFeature({
            getData: () => currentData,
            workspace: { getSnapshot: () => workspaceSnapshot },
            limits: { inline: 100, parquet: 1_000_000 },
        });

        const csvResult = feature.exportFilteredCsv();
        expect(csvResult).toEqual({ ok: false, reason: 'row_limit_exceeded', limit: 100 });
        expect(downloadBlobMock).not.toHaveBeenCalled();
    });

    it('uses the provided parquet row limit when forwarding to the backend', async () => {
        exportCleaningDataMock.mockResolvedValueOnce(new Blob(['parquet']));
        const plan = {
            schemaVersion: 1 as const,
            id: 'plan',
            planRevision: 1,
            sourceVersionId: 'source-0',
            datasetRevision: 0,
            datasetFingerprint: 'frame',
            schemaFingerprint: 'schema',
            timeColumn: 'ts',
            stages: [],
            createdAt: 'now',
            updatedAt: 'now',
        };
        const feature = createExportFeature({
            getData: () => makeData(),
            workspace: { getSnapshot: () => workspaceSnapshot },
            cleaningPlanStore: { getSnapshot: () => plan },
            limits: { inline: 100_000, parquet: 5_000_000 },
        });

        await expect(feature.exportFilteredParquet()).resolves.toEqual({
            ok: true,
            rowCount: -1,
            filename: 'edatime_cleaned.parquet',
        });
        expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'edatime_cleaned.parquet');
    });
});
