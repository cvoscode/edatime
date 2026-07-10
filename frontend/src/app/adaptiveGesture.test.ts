import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAdaptiveFilterGesture } from './adaptiveGesture.js';
import {
    setAdaptiveLineFilters,
    setChartInstance,
    setLastFetchedData,
    setSelectedCols,
} from '../store/index.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';

describe('adaptive filter gesture', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="main-chart"></div>';
        setAdaptiveLineFilters([]);
        setSelectedCols(['value']);
        setLastFetchedData({
            ts: Float64Array.from([0, 10]),
            values: { value: Float64Array.from([1, 9]) },
        } as any);
        setChartInstance({
            cssPointToData: vi.fn()
                .mockReturnValueOnce({ x: 0, y: 1 })
                .mockReturnValueOnce({ x: 10, y: 9 }),
            requestOverlayRender: vi.fn(),
            fitYToData: vi.fn(),
            getYRange: vi.fn(() => null),
        } as any);
    });

    it('publishes a completed adaptive line to workspace filters', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['value']);
        initAdaptiveFilterGesture({
            workspace,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));

        expect(workspace.getSnapshot().filters.adaptiveLines).toHaveLength(1);
        expect(workspace.getSnapshot().filters.adaptiveLines[0]).toMatchObject({ column: 'value', x1: 0, x2: 10 });
    });
});
