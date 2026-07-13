import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAdaptiveFilterGesture } from './adaptiveGesture.js';
import { setChartInstance } from '../../store/chartState.js';
import { setLastFetchedData } from '../../store/runtimeState.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';

describe('adaptive filter gesture', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="main-chart"></div>';
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

    it('builds the adaptive line from workspace filter intent', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['value']);
        workspace.setFilters({ columnRanges: { value: { from: 0, to: 10 } }, adaptiveLines: [] });

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
    });

    it('applies the gesture through explicit deps instead of a window bridge', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['value']);
        const buildColumnToggles = vi.fn();
        const buildRangeControls = vi.fn();
        const renderCurrentData = vi.fn();
        const updateAnalysisYRange = vi.fn();

        initAdaptiveFilterGesture({
            workspace,
            buildColumnToggles,
            buildRangeControls,
            renderCurrentData,
            updateAnalysisYRange,
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));

        expect(buildRangeControls).toHaveBeenCalledTimes(1);
        expect(renderCurrentData).toHaveBeenCalledTimes(1);
        expect(buildColumnToggles).toHaveBeenCalledTimes(1);
        expect((window as any).__edatime).toBeUndefined();
    });
});
