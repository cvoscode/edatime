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
import { analyticsState } from '../../store/analyticsState.js';
import { subscribe as subscribeStore } from '../../store/events.js';
import { getAnnotationsForPage } from '../../chart/annotations.js';
import { getDropdownValue } from '../../ui/primitives/Dropdown.js';

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
    let cleanupActions: Array<() => void> = [];
    let toolbarOverflow: { refresh(): void; dispose(): void } | null = null;
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
            const normalizeToggle = document.getElementById('timeseries-normalize-series') as HTMLInputElement | null;
            if (normalizeToggle) {
                const onNormalize = () => deps.renderCurrentData();
                normalizeToggle.addEventListener('change', onNormalize);
                registerCleanup(() => normalizeToggle.removeEventListener('change', onNormalize));
            }
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
            // Wire the per-segment overflow popout on the timeseries
            // utility shelf so segments stay a single row tall at
            // every viewport (see improvement_features.md #14).
            // Failure is non-fatal — the layout still works without
            // the popout, it just doesn't react to resize.
            const shelf = document.querySelector<HTMLElement>('.timeseries-utility-shelf');
            if (shelf) {
                const syncToolsSummary = () => {
                    const snapshot = deps.workspace.getSnapshot();
                    const range = snapshot.dataset.metadata?.time_range;
                    const viewport = snapshot.viewport;
                    const activeGroups: string[] = [];
                    if (getDropdownValue('draw-tool') !== 'none') activeGroups.push('Drawing');
                    if (Object.values(snapshot.appearance.chartText).some((value) => value.trim())) activeGroups.push('Labels');
                    if (getAnnotationsForPage('timeseries').length > 0) activeGroups.push('Notes');
                    if (analyticsState.rollingEnabled || analyticsState.anomalyEnabled || analyticsState.spectralFilterPreview) activeGroups.push('Analytics');
                    if (Object.keys(snapshot.filters.columnRanges).length > 0 || snapshot.filters.adaptiveLines.length > 0) activeGroups.push('Range');
                    if (range && viewport && (viewport.xMin !== Number(range.min) || viewport.xMax !== Number(range.max))) activeGroups.push('Zoom');
                    const detail = shelf.querySelector<HTMLElement>('.timeseries-tools-summary-detail');
                    const activeSummary = activeGroups.length ? ` (${activeGroups.join(', ')} active)` : '';
                    if (detail) detail.textContent = `Drawing, labels, analytics, zoom, range, export${activeSummary}`;
                    shelf.title = activeGroups.length
                        ? `Active chart tools: ${activeGroups.join(', ')}`
                        : 'No chart tools have active state';
                };
                syncToolsSummary();
                if (deps.workspace.subscribe) registerCleanup(deps.workspace.subscribe(syncToolsSummary));
                for (const eventName of ['analytics:rollingEnabled', 'analytics:anomalyEnabled', 'analytics:spectralFilterPreview'] as const) {
                    registerCleanup(subscribeStore(eventName, syncToolsSummary));
                }
                shelf.addEventListener('input', syncToolsSummary);
                shelf.addEventListener('change', syncToolsSummary);
                window.addEventListener('edatime:annotations-changed', syncToolsSummary);
                registerCleanup(() => {
                    shelf.removeEventListener('input', syncToolsSummary);
                    shelf.removeEventListener('change', syncToolsSummary);
                    window.removeEventListener('edatime:annotations-changed', syncToolsSummary);
                });
                try {
                    // Late-imported to keep the initial bundle small
                    // and to avoid a static dependency cycle with
                    // the timeseries page module.
                    void import('../../ui/toolbarOverflow.js')
                        .then(({ createToolbarOverflow }) => {
                            if (!initialized) return;
                            toolbarOverflow?.dispose();
                            toolbarOverflow = createToolbarOverflow(shelf, {
                                fieldsSelector: ':scope > .scatter-toolbar__fields, :scope > .scatter-toolbar__controls',
                                showCount: true,
                            });
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
