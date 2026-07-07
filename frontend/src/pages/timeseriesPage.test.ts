import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTimeseriesPageController } from './timeseriesPage.js';
import { appState } from '../store/appStateCompat.js';
import {
    setChartInstance,
    setFetchDebounceId,
    setMetadata,
    setPendingRestoreY,
    setPendingYMode,
    setViewport,
    setZoomHistory,
} from '../store/index.js';
import { setRefetchOnZoom } from '../store/runtimeState.js';

describe('createTimeseriesPageController', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setChartInstance(null);
        setViewport(0, 100);
        setZoomHistory([]);
        setPendingYMode(null);
        setPendingRestoreY(null);
        setFetchDebounceId(null);
        setRefetchOnZoom(false);
    });

    it('preserves x and y ranges when zooming into a boxed viewport', () => {
        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 10, max: 90 })),
        };
        setChartInstance(chart as any);

        const deps = {
            fetchData: vi.fn(),
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: 10, yMax: 90 })),
            fetchAndRenderAnalytics: vi.fn(),
        };

        const controller = createTimeseriesPageController(deps as any);
        controller.onZoomRangeChange({
            xMin: 20,
            xMax: 80,
            yMin: 30,
            yMax: 70,
        } as any, 'user' as any);

        expect(appState.zoomHistory).toEqual([{ xMin: 0, xMax: 100, yMin: 10, yMax: 90 }]);
        expect(appState.currentStart).toBe(20);
        expect(appState.currentEnd).toBe(80);
        expect(appState.pendingYMode).toBe('restore');
        expect(appState.pendingRestoreY).toEqual({ min: 30, max: 70 });
        expect(chart.setXRange).toHaveBeenCalledWith(20, 80);
    });

    it('refreshes metadata and retries once when zoom refetch hits column_not_found', async () => {
        document.body.innerHTML = '<div id="main-chart-loading" hidden></div>';
        setMetadata({
            revision: 1,
            total_rows: 10,
            columns: [
                { name: 'timestamp', dtype: 'datetime' } as any,
                { name: 'temperature', dtype: 'float64' } as any,
            ],
            numeric_columns: ['temperature'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 100 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['temperature'];

        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 10, max: 20 })),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const fetchData = vi
            .fn()
            .mockRejectedValueOnce(new Error(`Data fetch failed (400) {"code":"column_not_found","message":"Unknown column 'temperature'"}`))
            .mockResolvedValueOnce({
                ts: new Float64Array([10, 20, 30]),
                values: {
                    value: new Float64Array([1, 2, 3]),
                },
                series: {},
                colorByColumn: {},
            });

        const recoverFromColumnMismatch = vi.fn(async () => {
            setMetadata({
                revision: 2,
                total_rows: 10,
                columns: [
                    { name: 'timestamp', dtype: 'datetime' } as any,
                    { name: 'value', dtype: 'float64' } as any,
                ],
                numeric_columns: ['value'],
                time_column: 'timestamp',
                time_range: { min: 0, max: 100 },
                column_profiles: [],
            } as any);
            appState.selectedCols = ['value'];
            return true;
        });

        const controller = createTimeseriesPageController({
            fetchData,
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: 10, yMax: 20 })),
            fetchAndRenderAnalytics: vi.fn(),
            recoverFromColumnMismatch,
        } as any);

        await controller.fetchAndRender();

        expect(recoverFromColumnMismatch).toHaveBeenCalledTimes(1);
        expect(fetchData).toHaveBeenCalledTimes(2);
        expect(fetchData.mock.calls[0]?.[3]).toBe('temperature');
        expect(fetchData.mock.calls[1]?.[3]).toBe('value');
        expect(chart.updateDataMulti).toHaveBeenCalled();
    });

    it('pins the /api/data fetch contract: fetchData(startIso, endIso, width, cols, colorCol, lookaroundMs, signal)', async () => {
        // Guard against drift in the wire contract the page controller sends
        // to the timeseries fetch service. The service layer in
        // `frontend/src/services/api/timeseries.ts` builds the URL from these
        // positional args; if any of them gets renamed, dropped, or reordered
        // here, the backend will silently receive the wrong shape.
        document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:1234px;"></div>';
        setMetadata({
            revision: 1,
            total_rows: 5,
            columns: [
                { name: 'timestamp', dtype: 'datetime' } as any,
                { name: 'value', dtype: 'float64' } as any,
            ],
            numeric_columns: ['value'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['value'];
        appState.selectedColorColumn = 'value';
        setViewport(100, 900);

        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 0, max: 1 })),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const fetchData = vi.fn().mockResolvedValue({
            ts: new Float64Array([100, 200, 300]),
            values: { value: new Float64Array([1, 2, 3]) },
            series: {},
            colorByColumn: {},
        });

        const controller = createTimeseriesPageController({
            fetchData,
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: 0, yMax: 1 })),
            fetchAndRenderAnalytics: vi.fn(),
        } as any);

        await controller.fetchAndRender();

        expect(fetchData).toHaveBeenCalledTimes(1);
        const call = fetchData.mock.calls[0] ?? [];
        // 7 positional args, in this exact order:
        //   startIso, endIso, width, cols, colorCol, lookaroundMs, signal
        expect(call).toHaveLength(7);
        expect(call[0]).toBe(new Date(100).toISOString());
        expect(call[1]).toBe(new Date(900).toISOString());
        // happy-dom does not lay out a <div> so clientWidth is 0 and the
        // page controller falls back to the documented 1200 default. The
        // contract we are pinning is "a positive integer" and the order
        // of args, not the exact number.
        expect(call[2]).toBeGreaterThan(0);
        expect(Number.isInteger(call[2])).toBe(true);
        expect(call[3]).toBe('value'); // selectedCols joined
        expect(call[4]).toBe('value'); // color column
        expect(call[5]).toBeGreaterThan(0);
        expect(call[6]).toBeInstanceOf(AbortSignal);
    });

    it('forwards a null colorCol when no color column is selected', async () => {
        document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:600px;"></div>';
        setMetadata({
            revision: 1,
            total_rows: 5,
            columns: [
                { name: 'timestamp', dtype: 'datetime' } as any,
                { name: 'value', dtype: 'float64' } as any,
            ],
            numeric_columns: ['value'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['value'];
        appState.selectedColorColumn = null;
        setViewport(0, 1000);

        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 0, max: 1 })),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const fetchData = vi.fn().mockResolvedValue({
            ts: new Float64Array([0, 1]),
            values: { value: new Float64Array([0, 1]) },
            series: {},
            colorByColumn: {},
        });

        const controller = createTimeseriesPageController({
            fetchData,
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: 0, yMax: 1 })),
            fetchAndRenderAnalytics: vi.fn(),
        } as any);

        await controller.fetchAndRender();

        const call = fetchData.mock.calls[0] ?? [];
        expect(call[4]).toBeNull();
        expect(call[5]).toBeGreaterThan(0);
    });

    it('passes fetched OT values through to the rendered series unchanged so spike handling stays evidence-based', async () => {
        document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:600px;"></div>';
        setMetadata({
            revision: 1,
            total_rows: 5,
            columns: [
                { name: 'timestamp', dtype: 'datetime' } as any,
                { name: 'HUFL', dtype: 'float64' } as any,
                { name: 'OT', dtype: 'float64' } as any,
            ],
            numeric_columns: ['HUFL', 'OT'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 4_000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['HUFL', 'OT'];
        appState.selectedColorColumn = null;
        setViewport(0, 4_000);

        const fetchedOt = new Float64Array([12.1, 12.1, 12.2, 12.2, 113.76]);
        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 0, max: 1 })),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const fetchData = vi.fn().mockResolvedValue({
            ts: new Float64Array([0, 1_000, 2_000, 3_000, 4_000]),
            values: {
                HUFL: new Float64Array([8, 8.5, 9, 9.5, 10]),
                OT: fetchedOt,
            },
            series: {
                OT: {
                    x: new Float64Array([0, 1_000, 2_000, 3_000, 4_000]),
                    y: fetchedOt,
                },
            },
            colorByColumn: {},
        });

        const controller = createTimeseriesPageController({
            fetchData,
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 4_000, yMin: 0, yMax: 1 })),
            fetchAndRenderAnalytics: vi.fn(),
        } as any);

        await controller.fetchAndRender();

        expect(chart.updateDataMulti).toHaveBeenCalledOnce();
        const rendered = chart.updateDataMulti.mock.calls[0]?.[0];
        expect(Array.from(rendered.values.OT)).toEqual(Array.from(fetchedOt));
        expect(Array.from(rendered.series.OT.y)).toEqual(Array.from(fetchedOt));
    });
});
