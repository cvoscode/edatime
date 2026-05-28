/**
 * Timeseries feature entrypoint.
 *
 * Provides a single surface that wires together column toggles, range controls,
 * filter modal, search inputs, and timeseries actions.
 */

import {
    buildColumnToggles,
    buildRangeControls,
    initColumnFilterModal,
    initDatasetSearchInputs,
    initTimeseriesActions,
} from './columnsController.js';

export interface TimeseriesFeatureDeps {
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    renderColumnProfilesGrid?: (force?: boolean) => void;
    updateAnalysisZoom?: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange?: (sourceKind?: string) => void;
    registerCleanup?: (cleanup: () => void) => void;
}

/**
 * Creates the timeseries feature entrypoint, wiring together all column-related
 * controls and actions through a single unified surface.
 */
export function createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps) {
    const rebuildColumns = () => {
        buildColumnToggles(deps.fetchAndRender, buildRangeControls, deps.renderCurrentData);
    };

    return {
        init() {
            initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange);
            initDatasetSearchInputs({
                rebuildColumnToggles: rebuildColumns,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => {}),
            });
            initTimeseriesActions({
                ...deps,
                rebuildColumnToggles: rebuildColumns,
                buildRangeControls,
            });
        },
        rebuildColumns,
        buildRangeControls,
    };
}