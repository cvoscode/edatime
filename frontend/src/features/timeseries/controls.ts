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
import { initChartPageFilterGesture } from './filterGesture.js';
import { emitNavigationChange } from '../../platform/navigationEvents.js';
import type { TimeseriesWorkspace } from './selectionIntent.js';
import type { DataObject } from '../../types/api.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

export interface TimeseriesFeatureDeps {
    workspace: TimeseriesWorkspace;
    fetchAndRender: () => Promise<void>;
    renderCurrentData: () => void;
    getCurrentData: () => DataObject | null;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    renderColumnProfilesGrid?: (force?: boolean) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    chartExportPng?: () => void;
    chartExportSvg?: () => void;
    exportFilteredCsv?: () => void;
    exportFilteredJson?: () => void;
    exportFilteredParquet?: () => void;
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage' | 'updateStage' | 'removeStage'>;
}

/**
 * Creates the Timeseries controls, wiring together all column-related
 * controls and actions through a single unified surface.
 */
export function createTimeseriesControls(deps: TimeseriesFeatureDeps) {
    let initialized = false;
    let generation = 0;
    let cleanupActions: Array<() => void> = [];
    let modalController: ReturnType<typeof initColumnFilterModal> | null = null;
    const openColumnFilter = (column: string | null) => modalController?.open(column);

    const buildWorkspaceRangeControls = () => buildRangeControls(deps.workspace, openColumnFilter, deps.cleaningPlanStore);
    const rebuildColumns = () => {
        if (deps.cleaningPlanStore) {
            buildColumnToggles(deps.fetchAndRender, buildWorkspaceRangeControls, deps.renderCurrentData, deps.workspace, openColumnFilter, deps.cleaningPlanStore);
        } else {
            buildColumnToggles(deps.fetchAndRender, buildWorkspaceRangeControls, deps.renderCurrentData, deps.workspace, openColumnFilter);
        }
    };

    const dispose = () => {
        if (!initialized) return;
        initialized = false;
        const actions = cleanupActions;
        cleanupActions = [];
        for (const cleanup of actions) cleanup();
        modalController = null;
    };

    const registerCleanup = (cleanup: () => void) => {
        cleanupActions.push(cleanup);
    };

    return {
        init(): () => void {
            if (initialized) return dispose;
            initialized = true;
            const currentGeneration = ++generation;
            modalController = deps.cleaningPlanStore
                ? initColumnFilterModal(
                    deps.renderCurrentData,
                    deps.updateAnalysisYRange,
                    deps.workspace,
                    openColumnFilter,
                    deps.getCurrentData,
                    deps.cleaningPlanStore,
                    rebuildColumns,
                )
                : initColumnFilterModal(
                    deps.renderCurrentData,
                    deps.updateAnalysisYRange,
                    deps.workspace,
                    openColumnFilter,
                    deps.getCurrentData,
                    undefined,
                    rebuildColumns,
                );
            registerCleanup(() => modalController?.dispose());
            registerCleanup(initChartPageFilterGesture(openColumnFilter));
            registerCleanup(initDatasetSearchInputs({
                rebuildColumnToggles: rebuildColumns,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => { }),
            }));
            const onLegendToggle = (event: Event) => {
                const detail = (event as CustomEvent<{ name?: string; visible?: boolean }>).detail;
                const name = detail?.name;
                if (!name) return;
                const selection = deps.workspace.getSnapshot().selection.columns;
                const next = detail.visible
                    ? (selection.includes(name) ? selection : [...selection, name])
                    : selection.filter((column) => column !== name);
                deps.workspace.setSelection(next, deps.workspace.getSnapshot().selection.colorColumn);
                rebuildColumns();
            };
            window.addEventListener('edatime:timeseries-legend-toggle', onLegendToggle);
            registerCleanup(() => window.removeEventListener('edatime:timeseries-legend-toggle', onLegendToggle));
            void import('./toolbar.js').then(({ initSignalsToolbar }) => {
                if (initialized && generation === currentGeneration) registerCleanup(initSignalsToolbar(deps));
            });
            initTimeseriesActions({
                rebuildColumnToggles: rebuildColumns,
                buildRangeControls: buildWorkspaceRangeControls,
                renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => { }),
                workspace: deps.workspace,
                fetchAndRender: deps.fetchAndRender,
                renderCurrentData: deps.renderCurrentData,
                updateAnalysisZoom: deps.updateAnalysisZoom,
                registerCleanup,
                cleaningPlanStore: deps.cleaningPlanStore,
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
            const uploadButton = document.getElementById('timeseries-empty-upload-btn');
            if (uploadButton) {
                const onUpload = () => {
                    emitNavigationChange({ page: 'upload', navPage: 'upload' });
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
