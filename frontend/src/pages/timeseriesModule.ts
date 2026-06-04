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
import { hydrateColumnProfiles, renderColumnProfilesGrid } from '../ui/profile.js';
import { applyPartialTimeRangeFromMetadata, setProfileMode, setUploadPreviewStatus } from '../ui/upload.js';
import { setDatasetRevision, setMetadata } from '../store/index.js';
import { getNumericColumns, getDefaultTimeseriesColumns } from './analyticsPageUtils.js';
import { buildMetaBar, setMetaText } from '../ui/metaBar.js';
import type { DatasetMetadata } from '../types.js';

export interface TimeseriesModuleDeps {
    fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<import('../types.js').DataObject>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    DataChartCtor: new (
        containerId: string,
        onZoomCb: ((start: number, end: number, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => import('../types.js').ChartInstance;
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
    getCurrentView: () => { start: number; end: number };
    fetchAndRenderAnalytics: () => Promise<void>;
    refreshZoomControlsState: () => void;
    zoomOut: () => void;
}

export function createTimeseriesModule(deps: TimeseriesModuleDeps) {
    let datasetUiReady = false;
    let feature!: ReturnType<typeof createTimeseriesEntrypoint>;

    // 1. Create the page controller (holds fetch/render/chart state)
    const pageController = createTimeseriesPageController({
        fetchData: deps.fetchData,
        buildRangeControls: () => feature.buildRangeControls(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        getCurrentView: deps.getCurrentView,
        fetchAndRenderAnalytics: deps.fetchAndRenderAnalytics,
    });

    // 2. Create the feature entrypoint (wires column toggles, range controls, actions)
    feature = createTimeseriesEntrypoint({
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        emitChartRangeChange: (sourceKind) => pageController.emitChartRangeChange(sourceKind),
        registerCleanup: () => {}, // owned by runtime via createPageLifecycle
    });

    // 3. Create the bootstrap (owns dataset readiness)
    const storeFetchedMetadata = (metadata: DatasetMetadata) => {
        setMetadata(metadata);
        const revision = metadata?.revision;
        setDatasetRevision(typeof revision === 'number' ? revision : 0);
    };

    const initializeDatasetUi = (metadata: DatasetMetadata) => {
        if (!datasetUiReady) {
            feature.init();
            deps.ensureSessionPersistenceStarted();
            datasetUiReady = true;
        }

        hydrateColumnProfiles(metadata);
        renderColumnProfilesGrid(true);
        applyPartialTimeRangeFromMetadata(metadata, false);
        setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
        setProfileMode('dataset');
        feature.rebuildColumns();
        feature.buildRangeControls();
        buildMetaBar(metadata);
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
        buildMetaBar: (metadata: DatasetMetadata) => buildMetaBar(metadata),
        timeseriesFeatureInit: () => feature.init(),
        ensureSessionPersistenceStarted: deps.ensureSessionPersistenceStarted,
        setViewport: deps.setViewport,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        setMetaText,
        emitWorkflowRefresh: () => { window.dispatchEvent(new CustomEvent('edatime:workflow-refresh')); },
        emitChartRangeChange: (sourceKind?: string) => pageController.emitChartRangeChange(sourceKind),
        setAdaptiveFilterColumn: deps.setAdaptiveFilterColumn,
        getSelectedCols: deps.getSelectedCols,
        setSelectedCols: deps.setSelectedCols,
    });

    const chartBootstrap = createTimeseriesBootstrap({
        DataChartCtor: deps.DataChartCtor,
        onZoom: (newStart, newEnd, sourceKind) => pageController.onZoomRangeChange(newStart, newEnd, sourceKind),
        onYRange: deps.updateAnalysisYRange,
        onZoomOut: deps.zoomOut,
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => feature.buildRangeControls(),
        renderCurrentData: () => pageController.renderCurrentData(),
        fetchAndRender: () => pageController.fetchAndRender(),
        refreshZoomControlsState: deps.refreshZoomControlsState,
    });

    // 4. Create the runtime (owns page lifecycle via createPageRuntime)
    const runtime = createTimeseriesRuntime({
        initFeature: () => feature.init(),
        ensureReady: async () => {
            await bootstrap.ensureDatasetReady();
            await chartBootstrap.ensureReady();
        },
    });

    // 5. Return the stable module surface
    return {
        mount: () => runtime.mount(),
        ensureDatasetReady: () => bootstrap.ensureDatasetReady(),
        ensureReady: () => bootstrap.ensureDatasetReady(), // same as ensureDatasetReady for now
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => feature.buildRangeControls(),
        emitChartRangeChange: (sourceKind?: string) => pageController.emitChartRangeChange(sourceKind),
        onZoomRangeChange: (newStart: number, newEnd: number, sourceKind?: string) => pageController.onZoomRangeChange(newStart, newEnd, sourceKind),
        refreshAfterMutation: (options?: { selectedColumn?: string }) => bootstrap.refreshAfterMutation(options),
    };
}
