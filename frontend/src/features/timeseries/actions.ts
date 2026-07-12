/**
 * features/timeseries/actions.ts — canonical home for Timeseries action wiring.
 *
 * Contains global Timeseries actions: chart-range reset, filter clear,
 * and dataset-search input initialization.
 *
 * All functions here are side-effect-only (DOM + window events) and take
 * dependency hooks rather than importing from appState directly.
 */

import {
    clearScatterViewSnapshots,
    chartState,
    datasetState,
    setAdaptiveLineFilters,
    setColumnRanges,
    setFilterText,
    setProfileFilterCategory,
    setProfileFilterText,
    setViewport,
    type ProfileFilterCategory,
    uiState,
} from '../../store/index.js';
import { debounce } from '../../utils/function.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface TimeseriesActionDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'setViewport'>;
    rebuildColumnToggles: () => void;
    renderColumnProfilesGrid: (force?: boolean) => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}

export interface TimeseriesExportDeps {
    chartExportPng: () => void;
    chartExportSvg: () => void;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
    exportFilteredParquet: () => void;
}

/**
 * Wire the timeseries page export buttons:
 *   - top-level toolbar: #export-png-btn, #export-csv-btn
 *   - export-options modal: #export-svg-btn, #export-data-csv-btn,
 *     #export-data-json-btn, #export-data-parquet-btn
 *
 * The keyboard shortcuts (Shift+P / Shift+E) and the in-modal
 * `#open-export-options-btn` open/close behavior are wired elsewhere; this
 * function is only responsible for the actual click handlers on the
 * action buttons.
 */
export function initTimeseriesExportButtons(deps: TimeseriesExportDeps): void {
    const png = document.getElementById('export-png-btn');
    if (png && !png.dataset.bound) {
        png.addEventListener('click', () => deps.chartExportPng());
        png.dataset.bound = '1';
    }

    const csv = document.getElementById('export-csv-btn');
    if (csv && !csv.dataset.bound) {
        csv.addEventListener('click', () => deps.exportFilteredCsv());
        csv.dataset.bound = '1';
    }

    const svg = document.getElementById('export-svg-btn');
    if (svg && !svg.dataset.bound) {
        svg.addEventListener('click', () => deps.chartExportSvg());
        svg.dataset.bound = '1';
    }

    const dataCsv = document.getElementById('export-data-csv-btn');
    if (dataCsv && !dataCsv.dataset.bound) {
        dataCsv.addEventListener('click', () => deps.exportFilteredCsv());
        dataCsv.dataset.bound = '1';
    }

    const dataJson = document.getElementById('export-data-json-btn');
    if (dataJson && !dataJson.dataset.bound) {
        dataJson.addEventListener('click', () => deps.exportFilteredJson());
        dataJson.dataset.bound = '1';
    }

    const dataParquet = document.getElementById('export-data-parquet-btn');
    if (dataParquet && !dataParquet.dataset.bound) {
        dataParquet.addEventListener('click', () => deps.exportFilteredParquet());
        dataParquet.dataset.bound = '1';
    }
}

export function initDatasetSearchInputs(
    deps: Pick<TimeseriesActionDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>,
): void {
    const columnFilterInput = document.getElementById('column-filter-input') as HTMLInputElement | null;
    if (columnFilterInput) {
        const onFilterInput = debounce(() => {
            setFilterText((columnFilterInput.value || '').trim().toLowerCase());
            deps.rebuildColumnToggles();
        }, 120);
        columnFilterInput.addEventListener('input', onFilterInput);
    }

    const profileFilterInput = document.getElementById('profile-filter-input') as HTMLInputElement | null;
    if (profileFilterInput) {
        const onProfileFilterInput = debounce(() => {
            setProfileFilterText((profileFilterInput.value || '').trim().toLowerCase());
            deps.renderColumnProfilesGrid(true);
        }, 120);
        profileFilterInput.addEventListener('input', onProfileFilterInput);
    }

    // Profile filter category pills: All / Numeric / Datetime.
    const categoryButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.profile-filter-category-btn'),
    );
    if (categoryButtons.length > 0) {
        const setActiveCategoryButton = (category: ProfileFilterCategory) => {
            for (const button of categoryButtons) {
                button.classList.toggle('is-active', button.dataset.category === category);
                button.setAttribute('aria-pressed', button.dataset.category === category ? 'true' : 'false');
            }
        };
        // Initial state mirrors the store default so the UI never lies.
        setActiveCategoryButton(uiState.profileFilterCategory);
        for (const button of categoryButtons) {
            button.addEventListener('click', () => {
                const category = (button.dataset.category || 'all') as ProfileFilterCategory;
                setProfileFilterCategory(category);
                setActiveCategoryButton(category);
                deps.renderColumnProfilesGrid(true);
            });
        }
    }
}

export function initTimeseriesActions(deps: TimeseriesActionDeps): void {
    const resetChartRangeToDataset = async (source = 'reset') => {
        const minMs = Number((datasetState.metadata as any)?.time_range?.min);
        const maxMs = Number((datasetState.metadata as any)?.time_range?.max);
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs >= maxMs) return;
        deps.workspace.setViewport({ xMin: minMs, xMax: maxMs, yMin: null, yMax: null });
        setViewport(minMs, maxMs);
        chartState.chart?.setXRange?.(minMs, maxMs);
        deps.updateAnalysisZoom(minMs, maxMs, source);
        deps.emitChartRangeChange(source);
        await deps.fetchAndRender();
    };

    const onRequestResetRange = () => {
        void resetChartRangeToDataset('reset');
    };
    window.addEventListener('edatime:request-chart-range-reset', onRequestResetRange);
    deps.registerCleanup(() => window.removeEventListener('edatime:request-chart-range-reset', onRequestResetRange));

    const clearAllFilters = async (source = 'clear') => {
        const filters = deps.workspace.getSnapshot().filters;
        deps.workspace.setFilters({ ...filters, columnRanges: {}, adaptiveLines: [] });
        setColumnRanges({});
        setAdaptiveLineFilters([]);
        clearScatterViewSnapshots();
        deps.buildRangeControls();
        deps.renderCurrentData();
        window.dispatchEvent(new CustomEvent('edatime:column-filters-change', { detail: { source } }));
        window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change', { detail: { source } }));
        await deps.fetchAndRender();
    };

    const onClearAllFilters = () => {
        void clearAllFilters('clear');
    };
    window.addEventListener('edatime:clear-all-filters', onClearAllFilters);
    deps.registerCleanup(() => window.removeEventListener('edatime:clear-all-filters', onClearAllFilters));
}
