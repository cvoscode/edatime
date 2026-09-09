import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildColumnToggles } from './columnsController.js';

import { setAdaptiveFilterColumn, setFilterText } from './interaction.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { setDropdownValue } from '../../ui/primitives/Dropdown.js';

function buildDom(): void {
    document.body.innerHTML = `
        <div id="header-meta"></div>
        <div id="column-toggles"></div>
        <span id="timeseries-series-disclosure-value"></span>
        <div id="timeseries-color-slot"></div>
    `;
}

describe('buildColumnToggles', () => {
    let workspace: ReturnType<typeof createWorkspaceStore>;

    beforeEach(() => {
        vi.restoreAllMocks();
        buildDom();
        window.localStorage.clear();

        workspace = createWorkspaceStore();
        workspace.commitDataset(workspace.beginDatasetSession(), {
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
        } as any, 1);
        setAdaptiveFilterColumn('HUFL');
        workspace.setAppearance({ seriesColors: {} });
        setFilterText('');
        workspace.setSelection(['HUFL', 'HULL', 'OT']);
    });

    it('rerenders chip active state after deselecting a selected series', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        buildColumnToggles(fetchAndRender, buildRangeControls, null, workspace);

        const hullChip = Array.from(document.querySelectorAll<HTMLLabelElement>('#column-toggles .series-chip'))
            .find((chip) => chip.querySelector('.chip-label')?.textContent === 'HULL');
        expect(hullChip).toBeTruthy();
        expect(hullChip?.classList.contains('active')).toBe(true);

        hullChip!.click();

        const rebuiltHullChip = Array.from(document.querySelectorAll<HTMLLabelElement>('#column-toggles .series-chip'))
            .find((chip) => chip.querySelector('.chip-label')?.textContent === 'HULL');
        expect(rebuiltHullChip?.classList.contains('active')).toBe(false);
        expect(rebuiltHullChip?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
        expect(document.getElementById('column-toggles')?.getAttribute('aria-label')).toBe('2 of 7 active. Click chips to add more.');
        expect(document.getElementById('column-toggles')?.getAttribute('title')).toBe('2 of 7 active. Click chips to add more.');
        expect(document.getElementById('timeseries-series-disclosure-value')?.textContent).toBe('2 of 7 active');
        expect(fetchAndRender).toHaveBeenCalledTimes(1);
    });

    it('publishes chip selection changes to the workspace intent', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();
        buildColumnToggles(fetchAndRender, buildRangeControls, null, workspace);

        const hullChip = Array.from(document.querySelectorAll<HTMLLabelElement>('#column-toggles .series-chip'))
            .find((chip) => chip.querySelector('.chip-label')?.textContent === 'HULL');
        hullChip!.click();

        expect(workspace.getSnapshot().selection.columns).toEqual(['HUFL', 'OT']);
    });

    it('accumulates rapid chip changes from the live workspace selection', () => {
        const fetchAndRender = vi.fn();
        buildColumnToggles(fetchAndRender, vi.fn(), null, workspace);

        const chipFor = (column: string) => Array.from(document.querySelectorAll<HTMLLabelElement>('#column-toggles .series-chip'))
            .find((chip) => chip.querySelector('.chip-label')?.textContent === column)!;
        chipFor('LUFL').click();
        chipFor('LULL').click();

        expect(workspace.getSnapshot().selection.columns).toEqual(['HUFL', 'HULL', 'OT', 'LUFL', 'LULL']);
    });

    it('publishes color-by changes to the workspace selection intent', () => {
        const fetchAndRender = vi.fn();
        buildColumnToggles(fetchAndRender, vi.fn(), null, workspace);

        setDropdownValue('color-column-select', 'MUFL', { emitChange: true });

        expect(workspace.getSnapshot().selection).toEqual({
            columns: ['HUFL', 'HULL', 'OT', 'MUFL'],
            colorColumn: 'MUFL',
        });
        const sourceChip = document.querySelector<HTMLElement>('[data-col="MUFL"]');
        expect(sourceChip?.classList.contains('is-color-source')).toBe(true);
        expect(sourceChip?.textContent).toContain('Color source');
        expect(fetchAndRender).toHaveBeenCalledOnce();
    });

    it('clears the rebuild guard after rendering the empty state so later rebuilds can recover', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        setFilterText('zzz');
        buildColumnToggles(fetchAndRender, buildRangeControls, null, workspace);

        const container = document.getElementById('column-toggles') as HTMLElement;
        expect(container.dataset.rebuilding).toBe('');
        expect(container.textContent).toContain('No matching columns');

        setFilterText('');
        buildColumnToggles(fetchAndRender, buildRangeControls, null, workspace);

        expect(container.querySelectorAll('.series-chip').length).toBe(7);
    });

    it('exposes the active/total series count via the chip-rail container title and aria-label', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        buildColumnToggles(fetchAndRender, buildRangeControls, null, workspace);

        const container = document.getElementById('column-toggles') as HTMLElement;
        expect(container.getAttribute('title')).toBe('3 of 7 active. Click chips to add more.');
        expect(container.getAttribute('aria-label')).toBe('3 of 7 active. Click chips to add more.');

        // Adding a chip updates the summary annotation on the next rebuild.
        workspace.setSelection(['HUFL', 'HULL', 'OT', 'MUFL']);
        buildColumnToggles(fetchAndRender, buildRangeControls, null, workspace);
        const rebuilt = document.getElementById('column-toggles') as HTMLElement;
        expect(rebuilt.getAttribute('title')).toBe('4 of 7 active. Click chips to add more.');
        expect(rebuilt.getAttribute('aria-label')).toBe('4 of 7 active. Click chips to add more.');
    });
});
