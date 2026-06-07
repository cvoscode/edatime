import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTimeseriesPageController } from './timeseriesPage.js';
import { appState } from '../store/appStateCompat.js';
import {
    setChartInstance,
    setFetchDebounceId,
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
});
