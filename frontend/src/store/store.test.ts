import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chartState, setChartInstance } from './chartState.js';
import { datasetState } from './datasetState.js';
import { clearSubscribers, subscribe } from './events.js';
import { scatterState } from './scatterState.js';
import {
    setColumnRange,
    setPreviewSelectedColumns,
    uiState,
} from './uiState.js';

describe('store contract', () => {
    beforeEach(() => {
        clearSubscribers();
        setColumnRange('value', { from: 0, to: 1 });
        uiState.columnRanges = {};
        setPreviewSelectedColumns([]);
        setChartInstance(null);
        scatterState.activeView = 'plot';
        scatterState.zoomHistory = [];
        datasetState.metadata = null;
        datasetState.numericCols = [];
    });

    it('uses immutable updates for array and object setters', () => {
        const previousRanges = uiState.columnRanges;

        setColumnRange('value', { from: 2, to: 5 });

        expect(uiState.columnRanges).toEqual({ value: { from: 2, to: 5 } });
        expect(uiState.columnRanges).not.toBe(previousRanges);
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

});
