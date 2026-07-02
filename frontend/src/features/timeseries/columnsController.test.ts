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
    });

    it('renders an inline adaptive-filter hint next to the chip rail and highlights the active target', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        setAdaptiveFilterColumn('HUFL');
        buildColumnToggles(fetchAndRender, buildRangeControls);

        const hint = document.querySelector<HTMLElement>('.timeseries-adaptive-hint');
        expect(hint).not.toBeNull();
        expect(hint!.classList.contains('timeseries-adaptive-hint--active')).toBe(true);
        expect(hint!.getAttribute('title')).toContain('HUFL');
        expect(hint!.textContent).toMatch(/Ctrl\s*\+\s*click/);

        // Clearing the target drops the active state and updates the title.
        setAdaptiveFilterColumn('');
        buildColumnToggles(fetchAndRender, buildRangeControls);
        const clearedHint = document.querySelector<HTMLElement>('.timeseries-adaptive-hint');
        expect(clearedHint?.classList.contains('timeseries-adaptive-hint--active')).toBe(false);
        expect(clearedHint?.getAttribute('title')).toMatch(/Ctrl\+click/);
    });

    it('lets the user dismiss the adaptive-filter hint and keeps it dismissed across rebuilds', () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        setAdaptiveFilterColumn('');
        buildColumnToggles(fetchAndRender, buildRangeControls);

        const dismissButton = document.querySelector<HTMLButtonElement>('.timeseries-adaptive-hint__dismiss');
        expect(dismissButton).not.toBeNull();

        dismissButton!.click();
        expect(document.querySelector('.timeseries-adaptive-hint')).toBeNull();

        buildColumnToggles(fetchAndRender, buildRangeControls);
        expect(document.querySelector('.timeseries-adaptive-hint')).toBeNull();
    });

    it('exposes a refresh hook so the Draw help icon can re-show the dismissed hint', async () => {
        const fetchAndRender = vi.fn();
        const buildRangeControls = vi.fn();

        setAdaptiveFilterColumn('');
        buildColumnToggles(fetchAndRender, buildRangeControls);

        const dismissButton = document.querySelector<HTMLButtonElement>('.timeseries-adaptive-hint__dismiss');
        dismissButton!.click();
        expect(document.querySelector('.timeseries-adaptive-hint')).toBeNull();

        // The Draw toolbar's "?" help icon dispatches a re-show once the
        // user asks for it. After the pref is reset the hint should be
        // visible again on the next refresh call.
        const { refreshAdaptiveFilterHint, setAdaptiveHintDismissed } = await import('./columnsController.js');
        setAdaptiveHintDismissed(false);
        refreshAdaptiveFilterHint();
        expect(document.querySelector('.timeseries-adaptive-hint')).not.toBeNull();
    });
});
