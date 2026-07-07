import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildColumnToggles } from './columnsController.js';
import {
    datasetState,
    setAdaptiveFilterColumn,
    setFilterText,
    setMetadata,
    setSelectedColorColumn,
    setSelectedCols,
    setSeriesColors,
} from '../../store/index.js';

function buildDom(): void {
    document.body.innerHTML = `
        <div id="header-meta"></div>
        <div id="column-toggles"></div>
    `;
}

describe('buildColumnToggles', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        buildDom();
        window.localStorage.clear();

        setMetadata({
            total_rows: 12,
            columns: [
                { name: 'ts', dtype: 'Datetime' },
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'LUFL', dtype: 'Float64' },
                { name: 'LULL', dtype: 'Float64' },
                { name: 'MUFL', dtype: 'Float64' },
                { name: 'MULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any);
        datasetState.numericCols = ['HUFL', 'HULL', 'LUFL', 'LULL', 'MUFL', 'MULL', 'OT'];
        setSelectedCols(['HUFL', 'HULL', 'OT']);
        setAdaptiveFilterColumn('HUFL');
        setSelectedColorColumn(null);
        setSeriesColors({});
        setFilterText('');
    });

    it('rerenders chip active state after deselecting a selected series', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        buildColumnToggles(fetchAndRender, buildRangeControls);

        const hullChip = Array.from(document.querySelectorAll<HTMLLabelElement>('#column-toggles .series-chip'))
            .find((chip) => chip.querySelector('.chip-label')?.textContent === 'HULL');
        expect(hullChip).toBeTruthy();
        expect(hullChip?.classList.contains('active')).toBe(true);

        hullChip!.click();

        const rebuiltHullChip = Array.from(document.querySelectorAll<HTMLLabelElement>('#column-toggles .series-chip'))
            .find((chip) => chip.querySelector('.chip-label')?.textContent === 'HULL');
        expect(rebuiltHullChip?.classList.contains('active')).toBe(false);
        expect(rebuiltHullChip?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
        expect(fetchAndRender).toHaveBeenCalledTimes(1);
    });

    it('clears the rebuild guard after rendering the empty state so later rebuilds can recover', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        setFilterText('zzz');
        buildColumnToggles(fetchAndRender, buildRangeControls);

        const container = document.getElementById('column-toggles') as HTMLElement;
        expect(container.dataset.rebuilding).toBe('');
        expect(container.textContent).toContain('No matching columns');

        setFilterText('');
        buildColumnToggles(fetchAndRender, buildRangeControls);

        expect(container.querySelectorAll('.series-chip').length).toBe(7);
    });

    it('exposes the active/total series count via the chip-rail container title and aria-label', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        buildColumnToggles(fetchAndRender, buildRangeControls);

        const container = document.getElementById('column-toggles') as HTMLElement;
        expect(container.getAttribute('title')).toBe('3 of 7 active. Click chips to add more.');
        expect(container.getAttribute('aria-label')).toBe('3 of 7 active. Click chips to add more.');

        // Adding a chip updates the summary annotation on the next rebuild.
        setSelectedCols(['HUFL', 'HULL', 'OT', 'MUFL']);
        buildColumnToggles(fetchAndRender, buildRangeControls);
        const rebuilt = document.getElementById('column-toggles') as HTMLElement;
        expect(rebuilt.getAttribute('title')).toBe('4 of 7 active. Click chips to add more.');
        expect(rebuilt.getAttribute('aria-label')).toBe('4 of 7 active. Click chips to add more.');
    });
});
