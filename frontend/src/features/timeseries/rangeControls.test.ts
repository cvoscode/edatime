import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRangeControls } from './rangeControls.js';
import {
    datasetState,
    setMetadata,
} from '../../store/datasetState.js';
import {
    setAdaptiveFilterColumn,
    setPendingAdaptivePoint,
    uiState,
} from '../../store/uiState.js';
import { createWorkspaceStore, type WorkspaceStore } from '../../workspace/workspaceStore.js';
import { __resetFilterModalOpenerForTests, registerFilterModalOpener } from './filterModalService.js';

function buildDom(): void {
    document.body.innerHTML = '<div id="column-range-controls"></div>';
}

function setActiveFilters(
    workspace: WorkspaceStore,
    columnRanges: Record<string, { from: number; to: number }> = {},
    adaptiveLines: any[] = [],
): void {
    workspace.setFilters({ columnRanges, adaptiveLines });
}

describe('buildRangeControls', () => {
    let workspace: WorkspaceStore;
    let openFilterForColumn: ReturnType<typeof vi.fn<(column: string | null) => void>>;

    beforeEach(() => {
        vi.restoreAllMocks();
        __resetFilterModalOpenerForTests();
        buildDom();

        setMetadata({
            total_rows: 100,
            columns: [
                { name: 'ts', dtype: 'Datetime' },
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL'],
            time_column: 'ts',
            time_range: { min: 0, max: 100 },
            column_profiles: [
                { name: 'HUFL', min: 0, max: 1 },
                { name: 'HULL', min: 0, max: 1 },
            ],
        } as any);
        datasetState.numericCols = ['HUFL', 'HULL'];
        setAdaptiveFilterColumn(null);
        setPendingAdaptivePoint(null);
        workspace = createWorkspaceStore();
        workspace.setSelection(['HUFL', 'HULL']);
        openFilterForColumn = vi.fn<(column: string | null) => void>();
        registerFilterModalOpener(openFilterForColumn);
    });

    it('emits static adaptive target chip when adaptiveFilterColumn is set and column is selected', () => {
        setAdaptiveFilterColumn('HUFL');
        workspace.setSelection(['HUFL', 'HULL']);

        buildRangeControls(workspace);

        const container = document.getElementById('column-range-controls')!;
        const chips = container.querySelectorAll<HTMLElement>('.range-chip');
        const targetChip = Array.from(chips).find(
            (c) => c.querySelector('.name')?.textContent === 'Adaptive target',
        );
        expect(targetChip).toBeTruthy();
        expect(targetChip!.getAttribute('role')).toBeNull();
    });

    it('emits no adaptive target chip when adaptiveFilterColumn is not set', () => {
        setAdaptiveFilterColumn(null);
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const targetChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'Adaptive target');
        expect(targetChip).toBeFalsy();
    });

    it('emits per-column range chips for each selected column with a stored range', () => {
        setActiveFilters(workspace, { HUFL: { from: 0.1, to: 0.9 }, HULL: { from: 0.2, to: 0.8 } });
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const chips = container.querySelectorAll<HTMLElement>('.range-chip');
        const huflChip = Array.from(chips).find(
            (c) => c.querySelector('.name')?.textContent === 'HUFL',
        );
        const hullChip = Array.from(chips).find(
            (c) => c.querySelector('.name')?.textContent === 'HULL',
        );
        expect(huflChip).toBeTruthy();
        expect(hullChip).toBeTruthy();
        expect(huflChip!.getAttribute('role')).toBe('button');
        expect(hullChip!.getAttribute('role')).toBe('button');
    });

    it('clickable range chip invokes the filter modal opener with the column name', () => {
        setActiveFilters(workspace, { HUFL: { from: 0.1, to: 0.9 } });
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const huflChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'HUFL')!;
        huflChip.dispatchEvent(new MouseEvent('click'));
        expect(openFilterForColumn).toHaveBeenCalledWith('HUFL');
    });

    it('emits adaptive filter removal chip when adaptive line filters are active', () => {
        setActiveFilters(workspace, {}, [{ id: 'f1', column: 'HUFL', keepAbove: true }]);
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const removalChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent?.includes('Adaptive HUFL'));
        expect(removalChip).toBeTruthy();
        expect(removalChip!.getAttribute('role')).toBe('button');
    });

    it('adaptive filter removal chip removes the filter', () => {
        setActiveFilters(workspace, {}, [{ id: 'f1', column: 'HUFL', keepAbove: true }]);
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const removalChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent?.includes('Adaptive HUFL'))!;
        removalChip.dispatchEvent(new MouseEvent('click'));
        expect(workspace.getSnapshot().filters.adaptiveLines).toEqual([]);
    });

    it('publishes adaptive filter removal to workspace intent', () => {
        const workspace = createWorkspaceStore();
        const filter = { id: 'f1', column: 'HUFL', keepAbove: true } as any;
        workspace.setSelection(['HUFL', 'HULL']);
        workspace.setFilters({ columnRanges: {}, adaptiveLines: [filter] });

        buildRangeControls(workspace);
        const removalChip = Array.from(document.querySelectorAll<HTMLElement>('.range-chip'))
            .find((chip) => chip.querySelector('.name')?.textContent?.includes('Adaptive HUFL'))!;
        removalChip.dispatchEvent(new MouseEvent('click'));

        expect(workspace.getSnapshot().filters.adaptiveLines).toEqual([]);
    });

    it('emits clear-all chip when adaptive line filters are active', () => {
        setActiveFilters(workspace, {}, [{ id: 'f1', column: 'HUFL', keepAbove: true }]);
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const clearChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.range')?.textContent === 'Clear all');
        expect(clearChip).toBeTruthy();
    });

    it('clear-all chip resets adaptive filters and pending point', () => {
        setActiveFilters(workspace, {}, [{ id: 'f1', column: 'HUFL', keepAbove: true }]);
        setPendingAdaptivePoint({ timestamp: 123 } as any);
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const clearChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.range')?.textContent === 'Clear all')!;
        clearChip.dispatchEvent(new MouseEvent('click'));
        expect(workspace.getSnapshot().filters.adaptiveLines).toEqual([]);
        expect(uiState.pendingAdaptivePoint).toBeNull();
    });

    it('keyboard Enter on clickable chip triggers the filter modal opener', () => {
        setActiveFilters(workspace, { HUFL: { from: 0.1, to: 0.9 } });
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const huflChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'HUFL')!;
        huflChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(openFilterForColumn).toHaveBeenCalledWith('HUFL');
    });

    it('keyboard Space on clickable chip triggers the filter modal opener', () => {
        setActiveFilters(workspace, { HUFL: { from: 0.1, to: 0.9 } });
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        const huflChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'HUFL')!;
        huflChip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(openFilterForColumn).toHaveBeenCalledWith('HUFL');
    });

    it('emits no range chips when no column has a stored range', () => {
        setActiveFilters(workspace);
        buildRangeControls(workspace);
        const container = document.getElementById('column-range-controls')!;
        expect(container.querySelectorAll<HTMLElement>('.range-chip').length).toBe(0);
    });
});
