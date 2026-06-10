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
import * as seriesCollapseModule from './seriesCollapse.js';
import { applyCollapse } from './seriesCollapse.js';

function buildDom(): void {
    document.body.innerHTML = `
        <div id="header-meta"></div>
        <div id="column-toggles"></div>
    `;
}

describe('buildColumnToggles', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(seriesCollapseModule, 'applyCollapse');
        buildDom();

        setMetadata({
            total_rows: 12,
            columns: [
                { name: 'ts', dtype: 'Datetime' },
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'MUFL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'MUFL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any);
        datasetState.numericCols = ['HUFL', 'HULL', 'MUFL'];
        setSelectedCols(['HUFL', 'HULL', 'MUFL']);
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

        expect(container.querySelectorAll('.series-chip').length).toBe(3);
        expect(container.textContent).not.toContain('No matching columns');
    });
});
