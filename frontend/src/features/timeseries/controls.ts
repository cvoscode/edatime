/**
 * Timeseries feature controls.
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
    chartExportPng?: () => void;
    chartExportSvg?: () => void;
    exportFilteredCsv?: () => void;
    exportFilteredJson?: () => void;
    exportFilteredParquet?: () => void;
}

/**
 * Creates the Timeseries controls, wiring together all column-related
 * controls and actions through a single unified surface.
 */
export function createTimeseriesControls(deps: TimeseriesFeatureDeps) {
    let initialized = false;
    let cleanupActions: Array<() => void> = [];
    let toolbarOverflow: { refresh(): void; dispose(): void } | null = null;

    const buildWorkspaceRangeControls = () => buildRangeControls(deps.workspace);
    const rebuildColumns = () => {
        buildColumnToggles(deps.fetchAndRender, buildWorkspaceRangeControls, deps.renderCurrentData, deps.workspace);
    };

    const dispose = () => {
        if (!initialized) return;
        initialized = false;
        const actions = cleanupActions;
        cleanupActions = [];
        for (const cleanup of actions) cleanup();
        toolbarOverflow?.dispose();
        toolbarOverflow = null;
    };

    const registerCleanup = (cleanup: () => void) => {
        cleanupActions.push(cleanup);
    };

    return {
        init(): () => void {
            if (initialized) return dispose;
            initialized = true;
            const disposeFilterModal = initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange, deps.workspace);
            if (typeof disposeFilterModal === 'function') registerCleanup(disposeFilterModal);
            initDatasetSearchInputs({
                rebuildColumnToggles: rebuildColumns,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => { }),
            });
            initTimeseriesActions({
                rebuildColumnToggles: rebuildColumns,
                buildRangeControls: buildWorkspaceRangeControls,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => { }),
                workspace: deps.workspace,
                fetchAndRender: deps.fetchAndRender,
                renderCurrentData: deps.renderCurrentData,
                updateAnalysisZoom: deps.updateAnalysisZoom,
                emitChartRangeChange: deps.emitChartRangeChange,
                registerCleanup,
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
                        .then(({ createTimeseriesToolbarOverflow }) => {
                            if (!initialized) return;
                            toolbarOverflow?.dispose();
                            toolbarOverflow = createTimeseriesToolbarOverflow(shelf);
                            // One extra refresh after a frame so the
                            // initial popout state is correct even if
                            // the ResizeObserver hasn't fired yet.
                            requestAnimationFrame(() => toolbarOverflow?.refresh());
                        })
                        .catch(() => { /* module missing — non-fatal */ });
                } catch { /* noop */ }
            }
            const uploadButton = document.getElementById('timeseries-empty-upload-btn');
            if (uploadButton) {
                const onUpload = () => {
                    window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'upload' } }));
                };
                uploadButton.addEventListener('click', onUpload);
                registerCleanup(() => uploadButton.removeEventListener('click', onUpload));
            }
            return dispose;
        },
        rebuildColumns,
        buildRangeControls: buildWorkspaceRangeControls,
    };
}
