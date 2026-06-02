import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRangeControls } from './rangeControls.js';
import {
    appStateComposite as appState,
    datasetState,
    setAdaptiveFilterColumn,
    setAdaptiveLineFilters,
    setColumnRanges,
    setMetadata,
    setPendingAdaptivePoint,
    setSelectedCols,
} from '../../store/index.js';

function buildDom(): void {
    document.body.innerHTML = '<div id="column-range-controls"></div>';
}

describe('buildRangeControls', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
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
        setSelectedCols(['HUFL', 'HULL']);
        setAdaptiveFilterColumn(null);
        setAdaptiveLineFilters([]);
        setPendingAdaptivePoint(null);
        setColumnRanges({});

        window.__edatime = { openFilterForCol: vi.fn() };
    });

    it('emits static adaptive target chip when adaptiveFilterColumn is set and column is selected', () => {
        setAdaptiveFilterColumn('HUFL');
        setSelectedCols(['HUFL', 'HULL']);

        buildRangeControls();

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
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const targetChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'Adaptive target');
        expect(targetChip).toBeFalsy();
    });

    it('emits per-column range chips for each selected column with a stored range', () => {
        setColumnRanges({ HUFL: { from: 0.1, to: 0.9 }, HULL: { from: 0.2, to: 0.8 } });
        buildRangeControls();
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

    it('clickable range chip invokes window.__edatime.openFilterForCol with column name', () => {
        setColumnRanges({ HUFL: { from: 0.1, to: 0.9 } });
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const huflChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'HUFL')!;
        huflChip.dispatchEvent(new MouseEvent('click'));
        expect(window.__edatime.openFilterForCol).toHaveBeenCalledWith('HUFL');
    });

    it('emits adaptive filter removal chip when adaptive line filters are active', () => {
        setAdaptiveLineFilters([{ id: 'f1', column: 'HUFL', keepAbove: true }] as any);
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const removalChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent?.includes('Adaptive HUFL'));
        expect(removalChip).toBeTruthy();
        expect(removalChip!.getAttribute('role')).toBe('button');
    });

    it('adaptive filter removal chip removes the filter', () => {
        setAdaptiveLineFilters([{ id: 'f1', column: 'HUFL', keepAbove: true }] as any);
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const removalChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent?.includes('Adaptive HUFL'))!;
        removalChip.dispatchEvent(new MouseEvent('click'));
        expect(appState.adaptiveLineFilters).toEqual([]);
    });

    it('emits clear-all chip when adaptive line filters are active', () => {
        setAdaptiveLineFilters([{ id: 'f1', column: 'HUFL', keepAbove: true }] as any);
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const clearChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.range')?.textContent === 'Clear all');
        expect(clearChip).toBeTruthy();
    });

    it('clear-all chip resets adaptive filters and pending point', () => {
        setAdaptiveLineFilters([{ id: 'f1', column: 'HUFL', keepAbove: true }] as any);
        setPendingAdaptivePoint({ timestamp: 123 } as any);
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const clearChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.range')?.textContent === 'Clear all')!;
        clearChip.dispatchEvent(new MouseEvent('click'));
        expect(appState.adaptiveLineFilters).toEqual([]);
        expect(appState.pendingAdaptivePoint).toBeNull();
    });

    it('keyboard Enter on clickable chip triggers openFilterForCol', () => {
        setColumnRanges({ HUFL: { from: 0.1, to: 0.9 } });
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const huflChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'HUFL')!;
        huflChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(window.__edatime.openFilterForCol).toHaveBeenCalledWith('HUFL');
    });

    it('keyboard Space on clickable chip triggers openFilterForCol', () => {
        setColumnRanges({ HUFL: { from: 0.1, to: 0.9 } });
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        const huflChip = Array.from(
            container.querySelectorAll<HTMLElement>('.range-chip'),
        ).find((c) => c.querySelector('.name')?.textContent === 'HUFL')!;
        huflChip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(window.__edatime.openFilterForCol).toHaveBeenCalledWith('HUFL');
    });

    it('emits no range chips when no column has a stored range', () => {
        setColumnRanges({});
        buildRangeControls();
        const container = document.getElementById('column-range-controls')!;
        expect(container.querySelectorAll<HTMLElement>('.range-chip').length).toBe(0);
    });
});
