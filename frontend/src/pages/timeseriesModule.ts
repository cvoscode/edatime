/**
 * Timeseries local composition seam.
 * Owns: page controller + feature entrypoint + page runtime + dataset bootstrap.
 * Replaces the per-page trampolines currently in app.ts.
 */

import { createTimeseriesPageController } from './timeseriesPage.js';
import { createTimeseriesEntrypoint } from '../features/timeseries/entrypoint.js';
import { createTimeseriesRuntime } from './timeseriesRuntime.js';
import { createDatasetBootstrap } from '../app/bootstrap/datasetBootstrap.js';
import { createTimeseriesBootstrap } from '../app/bootstrap/ensureTimeseriesReady.js';
import {
    clearScatterViewSnapshots,
    setAdaptiveLineFilters,
    setColumnRanges,
    setDatasetRevision,
    setMetadata,
    setSelectedColorColumn,
    uiState,
} from '../store/index.js';
import { getNumericColumns, getDefaultTimeseriesColumns } from './analyticsPageUtils.js';
import type { DatasetMetadata, ViewSnapshot } from '../types.js';

export interface TimeseriesModuleDeps {
    fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<import('../types.js').DataObject>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    ensurePrimaryChartCtor: () => Promise<new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => import('../types.js').ChartInstance>;
    markMetadataReady: () => void;
    sanitizeSelectedColumns: () => void;
    clearLoadedPageModules: () => void;
    ensureSessionPersistenceStarted: () => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
    setNumericCols: (cols: string[]) => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    setViewport: (start: number, end: number) => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => ViewSnapshot;
    fetchAndRenderAnalytics: () => Promise<void>;
    refreshZoomControlsState: () => void;
    zoomOut: () => void;
    chartExportPng?: () => void;
    chartExportSvg?: () => void;
    exportFilteredCsv?: () => void;
    exportFilteredJson?: () => void;
    exportFilteredParquet?: () => void;
}

export function createTimeseriesModule(deps: TimeseriesModuleDeps) {
    let datasetUiReady = false;
    let feature!: ReturnType<typeof createTimeseriesEntrypoint>;
    let datasetUiModulesPromise: Promise<{
        hydrateColumnProfiles: typeof import('../ui/profile.js').hydrateColumnProfiles;
        renderColumnProfilesGrid: typeof import('../ui/profile.js').renderColumnProfilesGrid;
        applyPartialTimeRangeFromMetadata: typeof import('../features/upload/partialLoadControls.js').applyPartialTimeRangeFromMetadata;
        setProfileMode: typeof import('../features/upload/preview.js').setProfileMode;
        setUploadPreviewStatus: typeof import('../features/upload/preview.js').setUploadPreviewStatus;
    }> | null = null;

    function ensureDatasetUiModules() {
        if (!datasetUiModulesPromise) {
            datasetUiModulesPromise = Promise.all([
                import('../ui/profile.js'),
                import('../features/upload/preview.js'),
                import('../features/upload/partialLoadControls.js'),
            ]).then(([profileModule, previewModule, partialLoadModule]) => ({
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
        buildRangeControls: () => feature.buildRangeControls(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        getCurrentView: deps.getCurrentView,
        fetchAndRenderAnalytics: deps.fetchAndRenderAnalytics,
        recoverFromColumnMismatch: async () => {
            const metadata = await deps.fetchMetadata();
            storeFetchedMetadata(metadata);

            const numericColumns = getNumericColumns(metadata);
            deps.setNumericCols(numericColumns);

            const validNames = new Set(numericColumns);
            const recoveredSelection = deps.getSelectedCols().filter((col) => validNames.has(col));
            const nextSelectedCols = recoveredSelection.length > 0
                ? recoveredSelection
                : getDefaultTimeseriesColumns(metadata);

            deps.setSelectedCols(nextSelectedCols);
            deps.sanitizeSelectedColumns();
            deps.setAdaptiveFilterColumn(nextSelectedCols[0] || null);

            if (uiState.selectedColorColumn && !validNames.has(uiState.selectedColorColumn)) {
                setSelectedColorColumn(null);
            }

            feature.rebuildColumns();
            feature.buildRangeControls();
            return deps.getSelectedCols().length > 0;
        },
    });

    // 2. Create the feature entrypoint (wires column toggles, range controls, actions)
    feature = createTimeseriesEntrypoint({
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        emitChartRangeChange: (sourceKind) => pageController.emitChartRangeChange(sourceKind),
        registerCleanup: () => {}, // owned by runtime via createPageLifecycle
        chartExportPng: deps.chartExportPng,
        chartExportSvg: deps.chartExportSvg,
        exportFilteredCsv: deps.exportFilteredCsv,
        exportFilteredJson: deps.exportFilteredJson,
        exportFilteredParquet: deps.exportFilteredParquet,
    });

    // 3. Create the bootstrap (owns dataset readiness)
    const storeFetchedMetadata = (metadata: DatasetMetadata) => {
        setMetadata(metadata);
        const revision = metadata?.revision;
        setDatasetRevision(typeof revision === 'number' ? revision : 0);
    };

    const initializeDatasetUi = async (metadata: DatasetMetadata) => {
        const datasetUi = await ensureDatasetUiModules();

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
        feature.rebuildColumns();
        feature.buildRangeControls();
        window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));

        const timeRange = metadata.time_range;
        if (!timeRange) return;
        const start = Number(timeRange.min);
        const end = Number(timeRange.max);
        deps.setViewport(start, end);
        deps.updateAnalysisZoom(start, end, 'initial');
        pageController.emitChartRangeChange('initial');
    };

    const bootstrap = createDatasetBootstrap({
        ensureChartModules: async () => { /* no-op: chart modules loaded before this module is created */ },
        fetchMetadata: deps.fetchMetadata,
        storeFetchedMetadata,
        markMetadataReady: deps.markMetadataReady,
        initializeDatasetUi,
        setNumericCols: deps.setNumericCols,
        setDefaultSelectedColumns: (cols: string[]) => deps.setSelectedCols(cols),
        sanitizeSelectedColumns: deps.sanitizeSelectedColumns,
        refreshVisibleData: async () => { await pageController.fetchAndRender(); },
        clearLoadedPageModules: deps.clearLoadedPageModules,
        getNumericColumns: (metadata: DatasetMetadata) => getNumericColumns(metadata),
        getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => getDefaultTimeseriesColumns(metadata),
        rebuildTimeseriesColumns: () => feature.rebuildColumns(),
        clearPersistedFilters: () => {
            setColumnRanges({});
            setAdaptiveLineFilters([]);
            clearScatterViewSnapshots();
        },
        timeseriesFeatureInit: () => feature.init(),
        ensureSessionPersistenceStarted: deps.ensureSessionPersistenceStarted,
        setViewport: deps.setViewport,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        emitWorkflowRefresh: () => { window.dispatchEvent(new CustomEvent('edatime:workflow-refresh')); },
        emitChartRangeChange: (sourceKind?: string) => pageController.emitChartRangeChange(sourceKind),
        setAdaptiveFilterColumn: deps.setAdaptiveFilterColumn,
        getSelectedCols: deps.getSelectedCols,
        setSelectedCols: deps.setSelectedCols,
    });

    const chartBootstrap = createTimeseriesBootstrap({
        ensurePrimaryChartCtor: deps.ensurePrimaryChartCtor,
        onZoom: (view, sourceKind) => pageController.onZoomRangeChange(view, sourceKind),
        onYRange: deps.updateAnalysisYRange,
        onZoomOut: deps.zoomOut,
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => feature.buildRangeControls(),
        renderCurrentData: () => pageController.renderCurrentData(),
        fetchAndRender: () => pageController.fetchAndRender(),
        refreshZoomControlsState: deps.refreshZoomControlsState,
    });

    // 4. Create the runtime (owns page lifecycle via createPageRuntime)
    const ensureReady = async (): Promise<void> => {
        await bootstrap.ensureDatasetReady();
        await chartBootstrap.ensureReady();
    };
    const runtime = createTimeseriesRuntime({
        initFeature: () => feature.init(),
        ensureReady,
    });

    // 5. Return the stable module surface. The public `ensureReady` matches
    // the runtime contract: the dataset is hydrated first, then the chart
    // is mounted against it. Anything that drives the timeseries page
    // (e.g. page-change handlers) must await this exact sequence.
    return {
        mount: () => runtime.mount(),
        ensureDatasetReady: () => bootstrap.ensureDatasetReady(),
        ensureReady,
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => feature.buildRangeControls(),
        emitChartRangeChange: (sourceKind?: string) => pageController.emitChartRangeChange(sourceKind),
        onZoomRangeChange: (view: ViewSnapshot, sourceKind?: string) => pageController.onZoomRangeChange(view, sourceKind),
        refreshAfterMutation: (options?: { selectedColumn?: string }) => bootstrap.refreshAfterMutation(options),
    };
}
