import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initFilterModalController as createFilterModalController } from './filterModalController.js';
import {
    setChartInstance,
} from '../../store/chartState.js';
import { datasetState, setMetadata } from '../../store/datasetState.js';
import { setLastFetchedData } from '../../store/runtimeState.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { requestColumnFilterOpen as openFilterForColumn } from './filterModalEvents.js';

let workspace = createWorkspaceStore();

function initFilterModalController(
    deps: Omit<Parameters<typeof createFilterModalController>[0], 'workspace'>
        & Partial<Pick<Parameters<typeof createFilterModalController>[0], 'workspace'>>,
) {
    return createFilterModalController({ ...deps, workspace: deps.workspace ?? workspace });
}

function setWorkspaceRanges(columnRanges: Record<string, { from: number; to: number }>): void {
    const filters = workspace.getSnapshot().filters;
    workspace.setFilters({ ...filters, columnRanges });
}

function buildModalDOM(): void {
    document.body.innerHTML = `
    <div id="column-filter-modal" hidden></div>
    <button id="column-filter-open-btn"></button>
    <button id="column-filter-close-btn"></button>
    <button id="column-filter-cancel-btn"></button>
    <button id="column-filter-apply-btn"></button>
    <button id="column-filter-clear-btn"></button>
    <select id="column-filter-col"></select>
    <input id="column-filter-min" type="text" />
    <input id="column-filter-max" type="text" />
    <input id="column-filter-min-range" type="range" />
    <input id="column-filter-max-range" type="range" />
    <div id="column-filter-range-fill"></div>
    <span id="column-filter-range-min-value"></span>
    <span id="column-filter-range-max-value"></span>
    <span id="column-filter-hint"></span>
    `;
}

describe('initFilterModalController', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        buildModalDOM();

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
                { name: 'HUFL', min: 0.0, max: 1.0 },
                { name: 'HULL', min: 0.0, max: 1.0 },
            ],
        } as any);
        datasetState.numericCols = ['HUFL', 'HULL'];
        workspace = createWorkspaceStore();
        workspace.setSelection(['HUFL', 'HULL']);
        setWorkspaceRanges({});

        // Provide lastFetchedData so getFullBoundsForCol works in tests
        setLastFetchedData({
            timestamp: 0,
            values: {
                HUFL: new Float64Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
                HULL: new Float64Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
            },
        } as any);

        // Mock chart
        setChartInstance({
            fitYToData: vi.fn(),
            getYRange: vi.fn().mockReturnValue({ min: 0, max: 1 }),
            requestOverlayRender: vi.fn(),
        } as any);
    });

    describe('filter modal opener', () => {
        it('shows the modal when opened', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });

            openFilterForColumn('HUFL');

            const modal = document.getElementById('column-filter-modal')!;
            expect(modal.hidden).toBe(false);
            expect((window as any).__edatime?.openFilterForCol).toBeUndefined();
        });

        it('releases its global opener when disposed', () => {
            const dispose = initFilterModalController({
                renderCurrentData: vi.fn(),
                updateAnalysisYRange: vi.fn(),
            });

            expect(openFilterForColumn('HUFL')).toBe(true);
            dispose();
            expect(openFilterForColumn('HUFL')).toBe(false);
        });

        it('populates column select with available columns', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });

            openFilterForColumn('HUFL');

            const select = document.getElementById('column-filter-col') as HTMLSelectElement;
            const options = Array.from(select.options).map((o) => o.value);
            expect(options).toContain('HUFL');
            expect(options).toContain('HULL');
        });

        it('syncs min/max text inputs from stored columnRanges', () => {
            setWorkspaceRanges({ HUFL: { from: 0.2, to: 0.8 } });
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });

            openFilterForColumn('HUFL');

            const minInput = document.getElementById('column-filter-min') as HTMLInputElement;
            const maxInput = document.getElementById('column-filter-max') as HTMLInputElement;
            expect(minInput.value).toBe('0.20');
            expect(maxInput.value).toBe('0.80');
        });

        it('defaults to full bounds when no stored range exists', () => {
            setWorkspaceRanges({});
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });

            openFilterForColumn('HUFL');

            const minInput = document.getElementById('column-filter-min') as HTMLInputElement;
            const maxInput = document.getElementById('column-filter-max') as HTMLInputElement;
            // Default range is the full bounds from lastFetchedData (0 to 1)
            expect(minInput.value).toBe('0.00');
            expect(maxInput.value).toBe('1.00');
        });
    });

    describe('apply button', () => {
        it('writes edited bounds to workspace filters', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const minInput = document.getElementById('column-filter-min') as HTMLInputElement;
            const maxInput = document.getElementById('column-filter-max') as HTMLInputElement;
            minInput.value = '0.30';
            maxInput.value = '0.70';

            const applyBtn = document.getElementById('column-filter-apply-btn') as HTMLButtonElement;
            applyBtn.click();

            expect(workspace.getSnapshot().filters.columnRanges.HUFL).toEqual({ from: 0.3, to: 0.7 });
        });

        it('publishes edited bounds to workspace filters', () => {
            const workspace = createWorkspaceStore();
            workspace.setSelection(['HUFL', 'HULL']);
            workspace.setFilters({ columnRanges: {}, adaptiveLines: [] });
            initFilterModalController({
                renderCurrentData: vi.fn(),
                updateAnalysisYRange: vi.fn(),
                workspace,
            });
            openFilterForColumn('HUFL');

            (document.getElementById('column-filter-min') as HTMLInputElement).value = '0.30';
            (document.getElementById('column-filter-max') as HTMLInputElement).value = '0.70';
            (document.getElementById('column-filter-apply-btn') as HTMLButtonElement).click();

            expect(workspace.getSnapshot().filters.columnRanges).toEqual({ HUFL: { from: 0.3, to: 0.7 } });
        });

        it('calls renderCurrentData after apply', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const applyBtn = document.getElementById('column-filter-apply-btn') as HTMLButtonElement;
            applyBtn.click();

            expect(renderCurrentData).toHaveBeenCalled();
        });

        it('hides the modal after apply', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const applyBtn = document.getElementById('column-filter-apply-btn') as HTMLButtonElement;
            applyBtn.click();

            const modal = document.getElementById('column-filter-modal')!;
            expect(modal.hidden).toBe(true);
        });

        it('calls updateAnalysisYRange after apply', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const applyBtn = document.getElementById('column-filter-apply-btn') as HTMLButtonElement;
            applyBtn.click();

            expect(updateAnalysisYRange).toHaveBeenCalled();
        });
    });

    describe('clear button', () => {
        it('resets column range to full bounds from profile', () => {
            setWorkspaceRanges({ HUFL: { from: 0.2, to: 0.8 } });
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const clearBtn = document.getElementById('column-filter-clear-btn') as HTMLButtonElement;
            clearBtn.click();

            expect(workspace.getSnapshot().filters.columnRanges.HUFL).toEqual({ from: 0.0, to: 1.0 });
        });

        it('calls renderCurrentData after clear', () => {
            setWorkspaceRanges({ HUFL: { from: 0.2, to: 0.8 } });
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const clearBtn = document.getElementById('column-filter-clear-btn') as HTMLButtonElement;
            clearBtn.click();

            expect(renderCurrentData).toHaveBeenCalled();
        });
    });

    describe('cancel button', () => {
        it('closes modal without state change', () => {
            setWorkspaceRanges({ HUFL: { from: 0.2, to: 0.8 } });
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const minInput = document.getElementById('column-filter-min') as HTMLInputElement;
            minInput.value = '0.35';
            const cancelBtn = document.getElementById('column-filter-cancel-btn') as HTMLButtonElement;
            cancelBtn.click();

            const modal = document.getElementById('column-filter-modal')!;
            expect(modal.hidden).toBe(true);
            // Original stored range unchanged
            expect(workspace.getSnapshot().filters.columnRanges.HUFL).toEqual({ from: 0.2, to: 0.8 });
        });
    });

    describe('Escape key', () => {
        it('closes modal on Escape keydown', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            const modal = document.getElementById('column-filter-modal')!;
            expect(modal.hidden).toBe(true);
        });
    });

    describe('backdrop click', () => {
        it('closes modal when clicking modal backdrop (not inner content)', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const modal = document.getElementById('column-filter-modal')!;
            modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(modal.hidden).toBe(true);
        });
    });

    describe('text input and range slider synchronization', () => {
        it('updates range slider when text input changes', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const minInput = document.getElementById('column-filter-min') as HTMLInputElement;
            minInput.value = '0.50';
            minInput.dispatchEvent(new Event('input'));

            const minRangeInput = document.getElementById('column-filter-min-range') as HTMLInputElement;
            expect(minRangeInput.value).toBe('0.5');
        });

        it('updates text input when range slider changes', () => {
            const renderCurrentData = vi.fn();
            const updateAnalysisYRange = vi.fn();
            initFilterModalController({ renderCurrentData, updateAnalysisYRange });
            openFilterForColumn('HUFL');

            const minRangeInput = document.getElementById('column-filter-min-range') as HTMLInputElement;
            minRangeInput.value = '0.50';
            minRangeInput.dispatchEvent(new Event('input'));

            const minInput = document.getElementById('column-filter-min') as HTMLInputElement;
            expect(minInput.value).toBe('0.50');
        });
    });
});
