import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAdaptiveFilterGesture, positionAdaptivePicker } from './adaptiveGesture.js';
import { setChartInstance } from '../../store/chartState.js';
import { getColumnSeriesColor } from '../../utils/seriesColors.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { createCleaningPlanStore } from '../../cleaning/store.js';

describe('adaptive filter gesture', () => {
    let currentData: any;
    beforeEach(() => {
        document.body.innerHTML = '<div id="main-chart"></div>';
        currentData = {
            ts: Float64Array.from([0, 10]),
            values: { value: Float64Array.from([1, 9]) },
        } as any;
        setChartInstance({
            cssPointToData: vi.fn()
                .mockReturnValueOnce({ x: 0, y: 1 })
                .mockReturnValueOnce({ x: 10, y: 9 }),
            requestOverlayRender: vi.fn(),
            fitYToData: vi.fn(),
            getYRange: vi.fn(() => null),
        } as any);
    });

    const chooseFilterSide = (label = 'Keep above') => {
        Array.from(document.querySelectorAll<HTMLButtonElement>('.adaptive-trace-picker__option'))
            .find((button) => button.textContent === label)!.click();
    };

    it('publishes a completed adaptive line to workspace filters', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['value']);
        initAdaptiveFilterGesture({
            workspace,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            getCurrentData: () => currentData,
            updateAnalysisYRange: vi.fn(),
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));

        expect(document.querySelector('.adaptive-trace-picker__suggestion')?.textContent).toContain('Suggested: keep above');
        chooseFilterSide('Keep below');

        expect(workspace.getSnapshot().filters.adaptiveLines).toHaveLength(1);
        expect(workspace.getSnapshot().filters.adaptiveLines[0]).toMatchObject({ column: 'value', x1: 0, x2: 10, keepAbove: false });
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
            getCurrentData: () => currentData,
            updateAnalysisYRange: vi.fn(),
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
        chooseFilterSide();

        expect(workspace.getSnapshot().filters.adaptiveLines).toHaveLength(1);
    });

    it('adds the completed adaptive line to the active cleaning plan', () => {
        const workspace = createWorkspaceStore();
        const planStore = createCleaningPlanStore();
        planStore.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 0, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        workspace.setSelection(['value']);
        initAdaptiveFilterGesture({
            workspace,
            cleaningPlanStore: planStore,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            getCurrentData: () => currentData,
            updateAnalysisYRange: vi.fn(),
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
        chooseFilterSide('Keep below');

        expect(planStore.getSnapshot()!.stages).toMatchObject([{
            kind: 'adaptiveLine', column: 'value', x1Ms: 0, x2Ms: 10, keepAbove: false, applyWithinSegmentOnly: true,
        }]);
        expect(workspace.getSnapshot().filters.adaptiveLines).toEqual([]);
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
            getCurrentData: () => currentData,
            updateAnalysisYRange,
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
        chooseFilterSide();

        expect(buildRangeControls).toHaveBeenCalledTimes(1);
        expect(renderCurrentData).toHaveBeenCalledTimes(1);
        expect(buildColumnToggles).toHaveBeenCalledTimes(1);
        expect((window as any).__edatime).toBeUndefined();
    });

    it('uses the same canonical column colors as the trace chips in the picker', () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['HUFL', 'HULL', 'OT', 'MUFL']);
        initAdaptiveFilterGesture({
            workspace,
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
            renderCurrentData: vi.fn(),
            getCurrentData: () => currentData,
            updateAnalysisYRange: vi.fn(),
        } as any);
        const chart = document.getElementById('main-chart')!;

        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        chart.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, button: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));

        const option = (column: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('.adaptive-trace-picker__option'))
            .find((button) => button.textContent === column)!;
        expect(option('HUFL').style.getPropertyValue('--pick-accent')).toBe(getColumnSeriesColor('HUFL'));
        expect(option('MUFL').style.getPropertyValue('--pick-accent')).toBe(getColumnSeriesColor('MUFL'));
        expect(option('OT').style.getPropertyValue('--pick-accent')).toBe(getColumnSeriesColor('OT'));
    });

    it('flips and clamps the picker so it remains reachable at chart edges', () => {
        expect(positionAdaptivePicker(
            { x: 700, y: 500 }, { width: 240, height: 260 }, { width: 720, height: 540 },
        )).toEqual({ left: 452, top: 232 });
        expect(positionAdaptivePicker(
            { x: 0, y: 0 }, { width: 240, height: 260 }, { width: 720, height: 540 },
        )).toEqual({ left: 12, top: 12 });
    });
});
