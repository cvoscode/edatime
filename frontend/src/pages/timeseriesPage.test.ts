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
});
