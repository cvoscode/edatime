import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTimeseriesPageController } from './timeseriesPage.js';
import { appState } from '../store/appStateCompat.js';
import {
    setChartInstance,
    setFetchDebounceId,
    setFetchedWindow,
    setInitialView,
    setLastFetchedData,
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
        setInitialView(null);
        setPendingYMode(null);
        setPendingRestoreY(null);
        setFetchDebounceId(null);
        setRefetchOnZoom(false);
        setLastFetchedData(null);
        setFetchedWindow(null);
        appState.columnRanges = {};
        appState.adaptiveLineFilters = [];
        appState.selectedCols = [];
        appState.selectedColorColumn = null;
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

    it('stores the exact rendered viewport in zoom history instead of recomputing it from a live helper', async () => {
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
            time_range: { min: 0, max: 4_000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['value'];
        setViewport(1_000, 3_000);

        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 20, max: 40 })),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const getCurrentView = vi.fn(() => ({ xMin: 0, xMax: 4_000, yMin: 0, yMax: 100 }));
        const controller = createTimeseriesPageController({
            fetchData: vi.fn().mockResolvedValue({
                ts: new Float64Array([0, 1_000, 2_000, 3_000, 4_000]),
                values: {
                    value: new Float64Array([10, 20, 30, 40, 50]),
                },
                series: {},
                colorByColumn: {},
                _meta: {
                    downsampled: false,
                },
            }),
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView,
            fetchAndRenderAnalytics: vi.fn(),
        } as any);

        await controller.fetchAndRender();
        controller.onZoomRangeChange({
            xMin: 1_500,
            xMax: 2_500,
            yMin: 25,
            yMax: 35,
        } as any, 'user' as any);

        expect(appState.zoomHistory).toEqual([{ xMin: 1_000, xMax: 3_000, yMin: 20, yMax: 40 }]);
        expect(getCurrentView).not.toHaveBeenCalled();
    });

    it('fetches immediately after a boxed zoom instead of waiting on a fixed debounce', () => {
        vi.useFakeTimers();
        try {
            setRefetchOnZoom(true);
            const chart = {
                setXRange: vi.fn(),
                setYRange: vi.fn(),
                getYRange: vi.fn(() => ({ min: 10, max: 90 })),
            };
            setChartInstance(chart as any);

            const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
            const controller = createTimeseriesPageController({
                fetchData: vi.fn(),
                buildRangeControls: vi.fn(),
                updateAnalysisYRange: vi.fn(),
                updateAnalysisZoom: vi.fn(),
                getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 100, yMin: 10, yMax: 90 })),
                fetchAndRenderAnalytics: vi.fn(),
            } as any);

            controller.onZoomRangeChange({
                xMin: 20,
                xMax: 80,
                yMin: 30,
                yMax: 70,
            } as any, 'user' as any);

            expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 0);
        } finally {
            vi.useRealTimers();
        }
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

    it('clips buffered data to the visible viewport before rendering the chart', async () => {
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
            time_range: { min: 0, max: 4_000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['value'];
        appState.selectedColorColumn = null;
        setViewport(1_000, 3_000);

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
                value: new Float64Array([10, 20, 30, 40, 50]),
            },
            color: ['a', 'b', 'c', 'd', 'e'],
            color_column: 'label',
            series: {},
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
        expect(Array.from(rendered.ts)).toEqual([1_000, 2_000, 3_000]);
        expect(Array.from(rendered.values.value)).toEqual([20, 30, 40]);
        expect(Array.from(rendered.series.value.x)).toEqual([1_000, 2_000, 3_000]);
        expect(Array.from(rendered.series.value.y)).toEqual([20, 30, 40]);
    });

    it('refetches on zoom when the buffered window was already downsampled', async () => {
        document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:600px;"></div>';
        setMetadata({
            revision: 1,
            total_rows: 10_000,
            columns: [
                { name: 'timestamp', dtype: 'datetime' } as any,
                { name: 'value', dtype: 'float64' } as any,
            ],
            numeric_columns: ['value'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 4_000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['value'];
        appState.selectedColorColumn = null;
        setViewport(0, 4_000);

        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn(),
            getYRange: vi.fn(() => ({ min: 0, max: 1 })),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const fetchData = vi.fn()
            .mockResolvedValueOnce({
                ts: new Float64Array([0, 2_000, 4_000]),
                values: { value: new Float64Array([10, 30, 50]) },
                color: null,
                color_column: null,
                _meta: {
                    downsampled: true,
                    downsampleKnown: true,
                    returnedRows: 3,
                    targetPoints: 1200,
                },
            })
            .mockResolvedValueOnce({
                ts: new Float64Array([1_000, 1_500, 2_000, 2_500, 3_000]),
                values: { value: new Float64Array([20, 25, 30, 35, 40]) },
                color: null,
                color_column: null,
                _meta: {
                    downsampled: false,
                    downsampleKnown: true,
                    returnedRows: 5,
                    targetPoints: 1200,
                },
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
        expect(fetchData).toHaveBeenCalledTimes(1);

        chart.updateDataMulti.mockClear();
        setViewport(1_000, 3_000);

        await controller.fetchAndRender();

        expect(fetchData).toHaveBeenCalledTimes(2);
        const zoomCall = fetchData.mock.calls[1] ?? [];
        expect(zoomCall[0]).toBe(new Date(1_000).toISOString());
        expect(zoomCall[1]).toBe(new Date(3_000).toISOString());
        const rendered = chart.updateDataMulti.mock.calls[0]?.[0];
        expect(Array.from(rendered.ts)).toEqual([1_000, 1_500, 2_000, 2_500, 3_000]);
    });

    it('records each boxed zoom step even when the user zooms again before the prior render finishes', async () => {
        vi.useFakeTimers();
        try {
            document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:600px;"></div>';
            setMetadata({
                revision: 1,
                total_rows: 10_000,
                columns: [
                    { name: 'timestamp', dtype: 'datetime' } as any,
                    { name: 'value', dtype: 'float64' } as any,
                ],
                numeric_columns: ['value'],
                time_column: 'timestamp',
                time_range: { min: 0, max: 4_000 },
                column_profiles: [],
            } as any);
            appState.selectedCols = ['value'];
            appState.selectedColorColumn = null;
            setViewport(0, 4_000);
            setRefetchOnZoom(true);

            const chart = {
                setXRange: vi.fn(),
                setYRange: vi.fn(),
                getYRange: vi.fn(() => ({ min: 10, max: 50 })),
                updateDataMulti: vi.fn(),
                requestOverlayRender: vi.fn(),
            };
            setChartInstance(chart as any);

            const fetchData = vi.fn().mockResolvedValue({
                ts: new Float64Array([0, 1_000, 2_000, 3_000, 4_000]),
                values: { value: new Float64Array([10, 20, 30, 40, 50]) },
                series: {},
                colorByColumn: {},
                _meta: { downsampled: false },
            });

            const controller = createTimeseriesPageController({
                fetchData,
                buildRangeControls: vi.fn(),
                updateAnalysisYRange: vi.fn(),
                updateAnalysisZoom: vi.fn(),
                getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 4_000, yMin: 10, yMax: 50 })),
                fetchAndRenderAnalytics: vi.fn(),
            } as any);

            await controller.fetchAndRender();

            controller.onZoomRangeChange({
                xMin: 1_000,
                xMax: 3_000,
                yMin: 20,
                yMax: 40,
            } as any, 'user' as any);

            controller.onZoomRangeChange({
                xMin: 1_500,
                xMax: 2_500,
                yMin: 25,
                yMax: 35,
            } as any, 'user' as any);
            expect(appState.zoomHistory).toEqual([
                { xMin: 0, xMax: 4_000, yMin: 10, yMax: 50 },
                { xMin: 1_000, xMax: 3_000, yMin: 20, yMax: 40 },
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('double-click zoom-out restores the last zoomed view from the stored buffer immediately', async () => {
        document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:600px;"></div>';
        setMetadata({
            revision: 1,
            total_rows: 10_000,
            columns: [
                { name: 'timestamp', dtype: 'datetime' } as any,
                { name: 'value', dtype: 'float64' } as any,
            ],
            numeric_columns: ['value'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 4_000 },
            column_profiles: [],
        } as any);
        appState.selectedCols = ['value'];
        appState.selectedColorColumn = null;
        setViewport(0, 4_000);

        let currentY = { min: 10, max: 50 };
        const chart = {
            setXRange: vi.fn(),
            setYRange: vi.fn((min: number, max: number) => {
                currentY = { min, max };
            }),
            resetYRange: vi.fn(),
            getYRange: vi.fn(() => currentY),
            updateDataMulti: vi.fn(),
            requestOverlayRender: vi.fn(),
        };
        setChartInstance(chart as any);

        const fetchData = vi.fn()
            .mockResolvedValueOnce({
                ts: new Float64Array([0, 1_000, 2_000, 3_000, 4_000]),
                values: { value: new Float64Array([10, 20, 30, 40, 50]) },
                series: {},
                colorByColumn: {},
                _meta: { downsampled: false },
            })
            .mockResolvedValueOnce({
                ts: new Float64Array([1_500, 1_750, 2_000, 2_250, 2_500]),
                values: { value: new Float64Array([25, 27, 30, 33, 35]) },
                series: {},
                colorByColumn: {},
                _meta: { downsampled: false },
            });

        const controller = createTimeseriesPageController({
            fetchData,
            buildRangeControls: vi.fn(),
            updateAnalysisYRange: vi.fn(),
            updateAnalysisZoom: vi.fn(),
            getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 4_000, yMin: 10, yMax: 50 })),
            fetchAndRenderAnalytics: vi.fn(),
        } as any);

        await controller.fetchAndRender();

        controller.onZoomRangeChange({
            xMin: 1_500,
            xMax: 2_500,
            yMin: 25,
            yMax: 35,
        } as any, 'user' as any);
        await controller.fetchAndRender();

        chart.updateDataMulti.mockClear();
        controller.zoomOut();

        expect(appState.currentStart).toBe(0);
        expect(appState.currentEnd).toBe(4_000);
        expect(currentY).toEqual({ min: 10, max: 50 });
        expect(chart.updateDataMulti).toHaveBeenCalledOnce();
        const rendered = chart.updateDataMulti.mock.calls[0]?.[0];
        expect(Array.from(rendered.ts)).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
        expect(fetchData).toHaveBeenCalledTimes(1);
    });

    it('keeps the restored y range after refetching a downsampled zoom-out buffer', async () => {
        vi.useFakeTimers();
        try {
            document.body.innerHTML = '<div id="main-chart-loading" hidden></div><div id="main-chart" style="width:600px;"></div>';
            setMetadata({
                revision: 1,
                total_rows: 10_000,
                columns: [
                    { name: 'timestamp', dtype: 'datetime' } as any,
                    { name: 'value', dtype: 'float64' } as any,
                ],
                numeric_columns: ['value'],
                time_column: 'timestamp',
                time_range: { min: 0, max: 4_000 },
                column_profiles: [],
            } as any);
            appState.selectedCols = ['value'];
            appState.selectedColorColumn = null;
            setViewport(0, 4_000);

            let dataY = { min: 0, max: 100 };
            let currentY = { min: 0, max: 100 };
            const chart = {
                setXRange: vi.fn(),
                setYRange: vi.fn((min: number, max: number) => {
                    currentY = { min, max };
                }),
                resetYRange: vi.fn(() => {
                    currentY = { ...dataY };
                }),
                getYRange: vi.fn(() => currentY),
                updateDataMulti: vi.fn((data: any) => {
                    const values = Array.from(data?.values?.value ?? []) as number[];
                    dataY = {
                        min: Math.min(...values),
                        max: Math.max(...values),
                    };
                    updateAnalysisYRange(dataY.min, dataY.max, 'data');
                }),
                requestOverlayRender: vi.fn(),
            };
            setChartInstance(chart as any);

            const updateAnalysisYRange = vi.fn((min: number, max: number, _sourceKind?: string) => {
                if (appState.pendingYMode === 'restore' && appState.pendingRestoreY) {
                    const savedY = appState.pendingRestoreY;
                    setPendingYMode(null);
                    setPendingRestoreY(null);
                    chart.setYRange(savedY.min, savedY.max);
                    return;
                }
                currentY = { min, max };
            });

            const makeData = (start: number, end: number, downsampled: boolean) => ({
                ts: new Float64Array([start, (start + end) / 2, end]),
                values: { value: new Float64Array([0, 50, 100]) },
                series: {},
                colorByColumn: {},
                _meta: { downsampled },
            });
            const fetchData = vi.fn()
                .mockResolvedValueOnce(makeData(0, 4_000, true))
                .mockResolvedValueOnce(makeData(1_000, 3_000, true))
                .mockResolvedValueOnce(makeData(1_500, 2_500, true))
                .mockResolvedValueOnce(makeData(1_500, 2_500, false));

            const controller = createTimeseriesPageController({
                fetchData,
                buildRangeControls: vi.fn(),
                updateAnalysisYRange,
                updateAnalysisZoom: vi.fn(),
                getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 4_000, yMin: 0, yMax: 100 })),
                fetchAndRenderAnalytics: vi.fn(),
            } as any);

            await controller.fetchAndRender();
            controller.onZoomRangeChange({ xMin: 1_000, xMax: 3_000, yMin: 10, yMax: 90 } as any, 'user' as any);
            await controller.fetchAndRender();
            controller.onZoomRangeChange({ xMin: 1_500, xMax: 2_500, yMin: 20, yMax: 80 } as any, 'user' as any);
            await controller.fetchAndRender();
            controller.onZoomRangeChange({ xMin: 1_700, xMax: 2_300, yMin: 30, yMax: 70 } as any, 'user' as any);

            chart.resetYRange.mockClear();
            controller.zoomOut();
            await vi.runOnlyPendingTimersAsync();

            expect(appState.currentStart).toBe(1_500);
            expect(appState.currentEnd).toBe(2_500);
            expect(currentY).toEqual({ min: 20, max: 80 });
            expect(chart.resetYRange).not.toHaveBeenCalled();
            expect(fetchData).toHaveBeenCalledTimes(4);
        } finally {
            vi.useRealTimers();
        }
    });

    it('resets to the initial all-data view on the fifth consecutive double-click zoom-out', () => {
        vi.useFakeTimers();
        try {
            setInitialView({ xMin: 0, xMax: 10_000, yMin: 0, yMax: 100 });
            setViewport(4_000, 5_000);

            let currentY = { min: 40, max: 50 };
            const chart = {
                setXRange: vi.fn(),
                setYRange: vi.fn((min: number, max: number) => {
                    currentY = { min, max };
                }),
                getYRange: vi.fn(() => currentY),
            };
            setChartInstance(chart as any);

            const controller = createTimeseriesPageController({
                fetchData: vi.fn(),
                buildRangeControls: vi.fn(),
                updateAnalysisYRange: vi.fn(),
                updateAnalysisZoom: vi.fn(),
                getCurrentView: vi.fn(() => ({ xMin: 0, xMax: 10_000, yMin: 0, yMax: 100 })),
                fetchAndRenderAnalytics: vi.fn(),
            } as any);

            controller.onZoomRangeChange({ xMin: 3_000, xMax: 6_000, yMin: 30, yMax: 60 } as any, 'user' as any);
            controller.onZoomRangeChange({ xMin: 3_500, xMax: 5_500, yMin: 35, yMax: 55 } as any, 'user' as any);

            controller.zoomOut();
            controller.zoomOut();
            controller.zoomOut();
            controller.zoomOut();
            controller.zoomOut();

            expect(appState.currentStart).toBe(0);
            expect(appState.currentEnd).toBe(10_000);
            expect(currentY).toEqual({ min: 0, max: 100 });
            expect(appState.zoomHistory).toEqual([]);
            expect(chart.setXRange).toHaveBeenLastCalledWith(0, 10_000);
        } finally {
            vi.useRealTimers();
        }
    });
});
