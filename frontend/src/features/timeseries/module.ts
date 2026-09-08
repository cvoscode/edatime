/**
 * Timeseries local composition seam.
 * Owns: page controller + feature controls + page runtime + dataset bootstrap.
 * Replaces the per-page trampolines currently in app.ts.
 */

import { createTimeseriesPageController } from './controller.js';
import { createTimeseriesControls } from './controls.js';
import { createTimeseriesLifecycle } from './lifecycle.js';
import { createDatasetBootstrap } from './datasetBootstrap.js';
import { createTimeseriesBootstrap } from './ensureReady.js';
import { createTimeseriesShortcuts } from './shortcuts.js';
import { createTimeseriesRuntimeCache } from './runtimeCache.js';
import { clearScatterViewSnapshots } from '../../store/scatterState.js';
import { getEffectiveNumericColumns, getDefaultTimeseriesColumns } from '../../platform/analyticsColumns.js';
import { emitFeatureEvent } from '../../platform/featureEvents.js';
import type { DataObject, DatasetMetadata } from '../../types/api.js';
import type { ViewSnapshot } from '../../types/chart.js';
import type { WorkspaceStore } from '../../contracts/workspace.js';
import type { ApiRequestOptions } from '../../services/api/http.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

export interface TimeseriesModuleDeps {
    fetchData: (
        start: string,
        end: string,
        width: number,
        columns?: string,
        colorColumn?: string | null,
        lookaroundMs?: number,
        options?: ApiRequestOptions,
    ) => Promise<DataObject>;
    fetchMetadata: (options?: ApiRequestOptions) => Promise<DatasetMetadata>;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'beginDatasetSession' | 'commitDataset' | 'setSelection' | 'setFilters' | 'setViewport' | 'subscribe'>;
    ensurePrimaryChartCtor: () => Promise<new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => import('../../types/chart.js').ChartInstance>;
    markMetadataReady: () => void;
    isMetadataReady: () => boolean;
    sanitizeSelectedColumns: () => void;
    clearLoadedPageModules: () => void;
    ensureSessionPersistenceStarted: () => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => ViewSnapshot;
    fetchAndRenderAnalytics: () => Promise<void>;
    refreshZoomControlsState: () => void;
    setAnomalyOverlayRenderCallback?: (callback: (() => void) | null) => void;
    chartExportPng?: () => void;
    chartExportSvg?: () => void;
    exportFilteredCsv?: () => void;
    exportFilteredJson?: () => void;
    exportFilteredParquet?: () => void;
    onDatasetCommitted?: (metadata: DatasetMetadata, revision: number) => void;
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage' | 'updateStage' | 'removeStage'>;
}

export function createTimeseriesModule(deps: TimeseriesModuleDeps) {
    const runtimeCache = createTimeseriesRuntimeCache();
    let datasetUiReady = false;
    let disposed = false;
    const lifetime = new AbortController();
    let feature!: ReturnType<typeof createTimeseriesControls>;
    let datasetUiModulesPromise: Promise<{
        loadProfile: typeof import('../upload/index.js').loadProfile;
        hydrateColumnProfiles: typeof import('../upload/index.js').hydrateColumnProfiles;
        renderColumnProfilesGrid: typeof import('../upload/index.js').renderColumnProfilesGrid;
        applyPartialTimeRangeFromMetadata: typeof import('../upload/partialLoadControls.js').applyPartialTimeRangeFromMetadata;
        setProfileMode: typeof import('../upload/preview.js').setProfileMode;
        setUploadPreviewStatus: typeof import('../upload/preview.js').setUploadPreviewStatus;
    }> | null = null;

    function ensureDatasetUiModules() {
        if (!datasetUiModulesPromise) {
            datasetUiModulesPromise = Promise.all([
                import('../upload/index.js'),
                import('../upload/preview.js'),
                import('../upload/partialLoadControls.js'),
            ]).then(([profileModule, previewModule, partialLoadModule]) => ({
                loadProfile: profileModule.loadProfile,
                hydrateColumnProfiles: profileModule.hydrateColumnProfiles,
                renderColumnProfilesGrid: profileModule.renderColumnProfilesGrid,
                applyPartialTimeRangeFromMetadata: partialLoadModule.applyPartialTimeRangeFromMetadata,
                setProfileMode: previewModule.setProfileMode,
                setUploadPreviewStatus: previewModule.setUploadPreviewStatus,
            }));
        }
        return datasetUiModulesPromise;
    }

    // 1. Create the page controller (holds fetch/render/chart state)
    const pageController = createTimeseriesPageController({
        fetchData: deps.fetchData,
        runtimeCache,
        workspace: deps.workspace,
        buildRangeControls: () => feature.buildRangeControls(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        getCurrentView: deps.getCurrentView,
        fetchAndRenderAnalytics: deps.fetchAndRenderAnalytics,
        recoverFromColumnMismatch: async () => {
            const session = deps.workspace.beginDatasetSession();
            const metadata = await deps.fetchMetadata({ signal: AbortSignal.any([lifetime.signal, session.signal]) });
            if (disposed) return false;
            if (!deps.workspace.commitDataset(session, metadata, Number(metadata.revision) || 0)) return false;

            const numericColumns = getEffectiveNumericColumns(metadata, deps.cleaningPlanStore?.getSnapshot());

            const validNames = new Set(numericColumns);
            const recoveredSelection = deps.workspace.getSnapshot().selection.columns.filter((col) => validNames.has(col));
            const nextSelectedCols = recoveredSelection.length > 0
                ? recoveredSelection
                : getDefaultTimeseriesColumns(metadata, deps.cleaningPlanStore?.getSnapshot());

            deps.workspace.setSelection(nextSelectedCols);
            deps.sanitizeSelectedColumns();
            deps.setAdaptiveFilterColumn(nextSelectedCols[0] || null);

            const currentColorColumn = deps.workspace.getSnapshot().selection.colorColumn;
            if (currentColorColumn && !validNames.has(currentColorColumn)) {
                deps.workspace.setSelection(
                    nextSelectedCols,
                    null,
                );
            }

            feature.rebuildColumns();
            feature.buildRangeControls();
            return deps.workspace.getSnapshot().selection.columns.length > 0;
        },
    });

    // 2. Create the feature controls (wires column toggles, range controls, actions)
    feature = createTimeseriesControls({
        workspace: deps.workspace,
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        getCurrentData: () => pageController.getCurrentData(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        chartExportPng: deps.chartExportPng,
        chartExportSvg: deps.chartExportSvg,
        exportFilteredCsv: deps.exportFilteredCsv,
        exportFilteredJson: deps.exportFilteredJson,
        exportFilteredParquet: deps.exportFilteredParquet,
        cleaningPlanStore: deps.cleaningPlanStore,
    });

    // 3. Create the bootstrap (owns dataset readiness)

    const initializeDatasetUi = async (metadata: DatasetMetadata, signal: AbortSignal) => {
        const committedMetadata = deps.workspace.getSnapshot().dataset.metadata;
        const datasetUi = await ensureDatasetUiModules();
        if (disposed || signal.aborted || deps.workspace.getSnapshot().dataset.metadata !== committedMetadata) return;

        if (!datasetUiReady) {
            feature.init();
            deps.ensureSessionPersistenceStarted();
            datasetUiReady = true;
        }

        datasetUi.hydrateColumnProfiles(metadata);
        datasetUi.renderColumnProfilesGrid(true);
        datasetUi.applyPartialTimeRangeFromMetadata(metadata, false);
        datasetUi.setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
        datasetUi.setProfileMode('dataset');
        void datasetUi.loadProfile(signal, () => !disposed && !signal.aborted
            && deps.workspace.getSnapshot().dataset.metadata === committedMetadata, datasetUi);
        feature.rebuildColumns();
        feature.buildRangeControls();
        emitFeatureEvent('workflow:refresh', undefined);

        const timeRange = metadata.time_range;
        if (!timeRange) return;
        const start = Number(timeRange.min);
        const end = Number(timeRange.max);
        runtimeCache.initialView = { xMin: start, xMax: end, yMin: null, yMax: null };
        deps.workspace.setViewport(runtimeCache.initialView);
        deps.updateAnalysisZoom(start, end, 'initial');
    };

    const bootstrap = createDatasetBootstrap({
        ensureChartModules: async () => { /* no-op: chart modules loaded before this module is created */ },
        fetchMetadata: deps.fetchMetadata,
        workspace: deps.workspace,

        markMetadataReady: deps.markMetadataReady,
        isMetadataReady: deps.isMetadataReady,
        initializeDatasetUi,

        sanitizeSelectedColumns: deps.sanitizeSelectedColumns,
        refreshVisibleData: async () => { await pageController.fetchAndRender(); },
        clearLoadedPageModules: deps.clearLoadedPageModules,

        getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => getDefaultTimeseriesColumns(metadata, deps.cleaningPlanStore?.getSnapshot()),
        rebuildTimeseriesColumns: () => feature.rebuildColumns(),
        clearPersistedFilters: () => {
            const filters = deps.workspace.getSnapshot().filters;
            deps.workspace.setFilters({ ...filters, columnRanges: {}, adaptiveLines: [] });
            clearScatterViewSnapshots();
        },
        timeseriesFeatureInit: () => feature.init(),
        ensureSessionPersistenceStarted: deps.ensureSessionPersistenceStarted,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        emitWorkflowRefresh: () => emitFeatureEvent('workflow:refresh', undefined),
        setAdaptiveFilterColumn: deps.setAdaptiveFilterColumn,
        onDatasetCommitted: deps.onDatasetCommitted,
    });

    const chartBootstrap = createTimeseriesBootstrap({
        cleaningPlanStore: deps.cleaningPlanStore,
        runtimeCache,
        ensurePrimaryChartCtor: deps.ensurePrimaryChartCtor,
        onZoom: (view, sourceKind) => pageController.onZoomRangeChange(view, sourceKind),
        onYRange: deps.updateAnalysisYRange,
        onZoomOut: () => pageController.zoomOut(),
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => feature.buildRangeControls(),
        renderCurrentData: () => pageController.renderCurrentData(),
        fetchAndRender: () => pageController.fetchAndRender(),
        getCurrentData: () => pageController.getCurrentData(),
        refreshZoomControlsState: deps.refreshZoomControlsState,
        setAnomalyOverlayRenderCallback: deps.setAnomalyOverlayRenderCallback,
        workspace: deps.workspace,
    });

    // 4. Create the runtime (owns page lifecycle via createPageRuntime)
    const ensureReady = async (): Promise<void> => {
        await bootstrap.ensureDatasetReady();
        await chartBootstrap.ensureReady();
    };
    const runtime = createTimeseriesLifecycle({
        initFeature: () => feature.init(),
        ensureReady,
    });
    const shortcuts = createTimeseriesShortcuts();

    // 5. Return the stable module surface. The public `ensureReady` matches
    // the runtime contract: the dataset is hydrated first, then the chart
    // is mounted against it. Anything that drives the timeseries page
    // (e.g. page-change handlers) must await this exact sequence.
    return {
        mount: () => {
            const disposeRuntime = runtime.mount();
            const disposeShortcuts = shortcuts.mount({
                fetchAndRender: () => pageController.fetchAndRender(),
                zoomOut: () => pageController.zoomOut(),
                resetZoom: () => pageController.resetZoom(),
                chartExportPng: deps.chartExportPng ?? (() => {}),
                exportFilteredCsv: deps.exportFilteredCsv ?? (() => {}),
                exportFilteredJson: deps.exportFilteredJson ?? (() => {}),
            });
            return () => {
                disposed = true;
                lifetime.abort();
                bootstrap.dispose();
                chartBootstrap.dispose();
                disposeShortcuts();
                disposeRuntime();
                pageController.dispose();
            };
        },
        ensureDatasetReady: () => bootstrap.ensureDatasetReady(),
        ensureReady,
        fetchAndRender: () => pageController.fetchAndRender(),
        getCurrentData: () => pageController.getCurrentData(),
        renderCurrentData: () => pageController.renderCurrentData(),
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => feature.buildRangeControls(),
        onZoomRangeChange: (view: ViewSnapshot, sourceKind?: string) => pageController.onZoomRangeChange(view, sourceKind),
        resetZoom: () => pageController.resetZoom(),
        zoomOut: () => pageController.zoomOut(),
        refreshAfterMutation: (options?: { selectedColumn?: string }) => bootstrap.refreshAfterMutation(options),
    };
}
