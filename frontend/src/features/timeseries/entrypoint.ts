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
} from './columnsController.js';
import { initDatasetSearchInputs, initTimeseriesActions, initTimeseriesExportButtons } from './actions.js';
import type { TimeseriesWorkspace } from './selectionIntent.js';

export interface TimeseriesFeatureDeps {
    workspace: TimeseriesWorkspace;
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    renderColumnProfilesGrid?: (force?: boolean) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
    chartExportPng?: () => void;
    chartExportSvg?: () => void;
    exportFilteredCsv?: () => void;
    exportFilteredJson?: () => void;
    exportFilteredParquet?: () => void;
}

/**
 * Creates the timeseries feature entrypoint, wiring together all column-related
 * controls and actions through a single unified surface.
 */
export function createTimeseriesEntrypoint(deps: TimeseriesFeatureDeps) {
    const buildWorkspaceRangeControls = () => buildRangeControls(deps.workspace);
    const rebuildColumns = () => {
        buildColumnToggles(deps.fetchAndRender, buildWorkspaceRangeControls, deps.renderCurrentData, deps.workspace);
    };

    return {
        init() {
            initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange, deps.workspace);
            initDatasetSearchInputs({
                rebuildColumnToggles: rebuildColumns,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => { }),
            });
            initTimeseriesActions({
                ...deps,
                rebuildColumnToggles: rebuildColumns,
                buildRangeControls: buildWorkspaceRangeControls,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => { }),
            });
            if (deps.chartExportPng && deps.chartExportSvg && deps.exportFilteredCsv
                && deps.exportFilteredJson && deps.exportFilteredParquet) {
                initTimeseriesExportButtons({
                    chartExportPng: deps.chartExportPng,
                    chartExportSvg: deps.chartExportSvg,
                    exportFilteredCsv: deps.exportFilteredCsv,
                    exportFilteredJson: deps.exportFilteredJson,
                    exportFilteredParquet: deps.exportFilteredParquet,
                });
            }
            // Wire the per-segment overflow popout on the timeseries
            // utility shelf so segments stay a single row tall at
            // every viewport (see improvement_features.md #14).
            // Failure is non-fatal — the layout still works without
            // the popout, it just doesn't react to resize.
            const shelf = document.querySelector<HTMLElement>('.timeseries-utility-shelf');
            if (shelf) {
                try {
                    // Late-imported to keep the initial bundle small
                    // and to avoid a static dependency cycle with
                    // the timeseries page module.
                    void import('./toolbarOverflow.js')
                        .then(({ initTimeseriesToolbarOverflow, refreshTimeseriesToolbarOverflow }) => {
                            try { initTimeseriesToolbarOverflow(shelf); } catch { /* noop */ }
                            // One extra refresh after a frame so the
                            // initial popout state is correct even if
                            // the ResizeObserver hasn't fired yet.
                            requestAnimationFrame(() => { try { refreshTimeseriesToolbarOverflow(); } catch { /* noop */ } });
                        })
                        .catch(() => { /* module missing — non-fatal */ });
                } catch { /* noop */ }
            }
        },
        rebuildColumns,
        buildRangeControls: buildWorkspaceRangeControls,
    };
}
