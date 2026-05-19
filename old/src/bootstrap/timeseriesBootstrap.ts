import { appState } from '../state.js';
import { debounce } from '../utils/dom.js';

interface TimeseriesBootstrapDeps {
    rebuildColumnToggles: () => void;
    renderColumnProfilesGrid: (force?: boolean) => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}

export function initDatasetSearchInputs(deps: Pick<TimeseriesBootstrapDeps, 'rebuildColumnToggles' | 'renderColumnProfilesGrid'>): void {
    const columnFilterInput = document.getElementById('column-filter-input') as HTMLInputElement | null;
    if (columnFilterInput) {
        const onFilterInput = debounce(() => {
            appState.filterText = (columnFilterInput.value || '').trim().toLowerCase();
            deps.rebuildColumnToggles();
        }, 120);
        columnFilterInput.addEventListener('input', onFilterInput);
    }

    const profileFilterInput = document.getElementById('profile-filter-input') as HTMLInputElement | null;
    if (profileFilterInput) {
        const onProfileFilterInput = debounce(() => {
            appState.profileFilterText = (profileFilterInput.value || '').trim().toLowerCase();
            deps.renderColumnProfilesGrid(true);
        }, 120);
        profileFilterInput.addEventListener('input', onProfileFilterInput);
    }
}

export function initTimeseriesActions(deps: TimeseriesBootstrapDeps): void {
    const resetChartRangeToDataset = async (source = 'reset') => {
        const minMs = Number((appState.metadata as any)?.time_range?.min);
        const maxMs = Number((appState.metadata as any)?.time_range?.max);
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs >= maxMs) return;
        appState.currentStart = minMs;
        appState.currentEnd = maxMs;
        appState.chart?.setXRange?.(minMs, maxMs);
        deps.updateAnalysisZoom(minMs, maxMs, source);
        deps.emitChartRangeChange(source);
        await deps.fetchAndRender();
    };

    const onRequestResetRange = () => {
        void resetChartRangeToDataset('reset');
    };
    window.addEventListener('edatime:request-chart-range-reset', onRequestResetRange);
    deps.registerCleanup(() => window.removeEventListener('edatime:request-chart-range-reset', onRequestResetRange));
    (window as any).__edatime.resetChartRangeToDataset = () => void resetChartRangeToDataset('reset');

    const clearAllFilters = async (source = 'clear') => {
        appState.columnRanges = {};
        appState.adaptiveLineFilters = [];
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
    (window as any).__edatime.clearAllFilters = () => void clearAllFilters('clear');
}