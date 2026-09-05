import { beforeEach, describe, expect, it, vi } from 'vitest';
import { primaryChart, setPrimaryChartInstance as setChartInstance } from '../charts/primaryChart.js';
import { clearSubscribers, subscribe } from './events.js';
import { scatterState } from './scatterState.js';
import { setPreviewSelectedColumns } from '../features/upload/uploadUi.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';

describe('store contract', () => {
    beforeEach(() => {
        clearSubscribers();
        setPreviewSelectedColumns([]);
        setChartInstance(null);
        scatterState.activeView = 'plot';
        scatterState.zoomHistory = [];
    });

    it('keeps workspace filter snapshots immutable', () => {
        const workspace = createWorkspaceStore();
        const previousFilters = workspace.getSnapshot().filters;

        workspace.setFilters({ columnRanges: { value: { from: 2, to: 5 } }, adaptiveLines: [] });

        expect(workspace.getSnapshot().filters.columnRanges).toEqual({ value: { from: 2, to: 5 } });
        expect(workspace.getSnapshot().filters).not.toBe(previousFilters);
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
        expect(primaryChart.current).toBe(next);
    });

    it('does not dispose a chart when setting the same instance again', () => {
        const chart = { deepDispose: vi.fn() };

        setChartInstance(chart as any);
        setChartInstance(chart as any);

        expect(chart.deepDispose).not.toHaveBeenCalled();
    });

});
