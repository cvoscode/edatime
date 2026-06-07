import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    appStateComposite,
    chartState,
    datasetState,
    runtimeState,
    scatterState,
    store,
    uiState,
} from './index.js';
import { setChartInstance } from './chartState.js';
import {
    setColumnRange,
    setPreviewSelectedColumns,
    setSelectedCols,
} from './uiState.js';
import { setLastFetchedData, setRefetchOnZoom } from './runtimeState.js';

describe('store contract', () => {
    beforeEach(() => {
        store.clearSubscribers();
        setSelectedCols([]);
        setColumnRange('value', { from: 0, to: 1 });
        uiState.columnRanges = {};
        setPreviewSelectedColumns([]);
        setLastFetchedData(null);
        setRefetchOnZoom(true);
        setChartInstance(null);
        scatterState.activeView = 'plot';
        scatterState.zoomHistory = [];
        datasetState.metadata = null;
        datasetState.numericCols = [];
    });

    it('subscribes, emits, and unsubscribes typed store events', () => {
        const handler = vi.fn();
        const unsubscribe = store.subscribe('ui:selectedCols', handler);

        setSelectedCols(['temperature']);

        expect(handler).toHaveBeenCalledWith({
            next: ['temperature'],
            previous: [],
        });

        unsubscribe();
        setSelectedCols(['pressure']);

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('uses immutable updates for array and object setters', () => {
        const previousSelected = uiState.selectedCols;
        const previousRanges = uiState.columnRanges;

        setSelectedCols(['value']);
        setColumnRange('value', { from: 2, to: 5 });

        expect(uiState.selectedCols).toEqual(['value']);
        expect(uiState.selectedCols).not.toBe(previousSelected);
        expect(uiState.columnRanges).toEqual({ value: { from: 2, to: 5 } });
        expect(uiState.columnRanges).not.toBe(previousRanges);
    });

    it('keeps runtime state synchronized through the legacy appState facade', () => {
        const data = {
            ts: Float64Array.from([1, 2]),
            values: { value: Float64Array.from([3, 4]) },
            color: null,
            color_column: null,
            _meta: {
                downsampled: false,
                downsampleKnown: true,
                returnedRows: 2,
                targetPoints: 10,
            },
        };

        appStateComposite.lastFetchedData = data;
        appStateComposite.refetchOnZoom = false;

        expect(runtimeState.lastFetchedData).toBe(data);
        expect(runtimeState.refetchOnZoom).toBe(false);
        expect(appStateComposite.lastFetchedData).toBe(data);
    });

    it('disposes the previous chart instance when replacing it', () => {
        const previous = {
            deepDispose: vi.fn(),
            destroy: vi.fn(),
        };
        const next = {};

        setChartInstance(previous as any);
        setChartInstance(next as any);

        expect(previous.deepDispose).toHaveBeenCalledTimes(1);
        expect(previous.destroy).not.toHaveBeenCalled();
        expect(chartState.chart).toBe(next);
    });

    it('does not dispose a chart when setting the same instance again', () => {
        const chart = { deepDispose: vi.fn() };

        setChartInstance(chart as any);
        setChartInstance(chart as any);

        expect(chart.deepDispose).not.toHaveBeenCalled();
    });

    it('delegates scatter and profile/upload preview fields from appState', () => {
        appStateComposite.scatter.activeView = 'matrix';
        appStateComposite.previewSelectedColumns = ['value'];
        appStateComposite.profileFilterText = 'val';

        expect(scatterState.activeView).toBe('matrix');
        expect(uiState.previewSelectedColumns).toEqual(['value']);
        expect(uiState.profileFilterText).toBe('val');
    });
});
