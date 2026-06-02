/**
 * Timeseries local composition seam.
 * Owns: page controller + feature entrypoint + page runtime + dataset bootstrap.
 * Replaces the per-page trampolines currently in app.ts.
 */

import { createTimeseriesPageController } from './timeseriesPage.js';
import { createTimeseriesEntrypoint } from '../features/timeseries/entrypoint.js';
import { createTimeseriesRuntime } from './timeseriesRuntime.js';
import { createDatasetBootstrap } from '../app/bootstrap/datasetBootstrap.js';
import { setViewport, setNumericCols, setSelectedCols, setAdaptiveFilterColumn } from '../store/index.js';
import { getNumericColumns, getDefaultTimeseriesColumns } from './analyticsPageUtils.js';
import { buildMetaBar, setMetaText } from '../ui/metaBar.js';
import type { DatasetMetadata } from '../types.js';

export interface TimeseriesModuleDeps {
    fetchData: (start: string, end: string, width: number, columns?: string, colorColumn?: string | null, signal?: AbortSignal) => Promise<import('../types.js').DataObject>;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => { start: number; end: number };
    fetchAndRenderAnalytics: () => Promise<void>;
    refreshZoomControlsState: () => void;
    zoomOut: () => void;
}

export function createTimeseriesModule(deps: TimeseriesModuleDeps) {
    // 1. Create the page controller (holds fetch/render/chart state)
    const pageController = createTimeseriesPageController({
        fetchData: deps.fetchData,
        buildRangeControls: deps.buildRangeControls,
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        getCurrentView: deps.getCurrentView,
        fetchAndRenderAnalytics: deps.fetchAndRenderAnalytics,
    });

    // 2. Create the feature entrypoint (wires column toggles, range controls, actions)
    const feature = createTimeseriesEntrypoint({
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        updateAnalysisYRange: deps.updateAnalysisYRange,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        emitChartRangeChange: (sourceKind) => pageController.emitChartRangeChange(sourceKind),
        registerCleanup: () => {}, // owned by runtime via createPageLifecycle
    });

    // 3. Create the bootstrap (owns dataset readiness)
    const bootstrap = createDatasetBootstrap({
        ensureChartModules: async () => { /* no-op: chart modules loaded before this module is created */ },
        fetchMetadata: () => { /* provided by app.ts */ throw new Error('fetchMetadata not wired'); },
        storeFetchedMetadata: (_metadata: DatasetMetadata) => { /* handled inside bootstrap */ },
        markMetadataReady: () => { /* handled inside bootstrap */ },
        initializeDatasetUi: (_metadata: DatasetMetadata) => { /* handled inside bootstrap */ },
        setNumericCols,
        setDefaultSelectedColumns: (cols: string[]) => setSelectedCols(cols),
        sanitizeSelectedColumns: () => { /* from filtering */ },
        refreshVisibleData: async () => { await pageController.fetchAndRender(); },
        clearLoadedPageModules: () => { /* from pageRegistry */ },
        getNumericColumns: (metadata: DatasetMetadata) => getNumericColumns(metadata),
        getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => getDefaultTimeseriesColumns(metadata),
        rebuildTimeseriesColumns: () => feature.rebuildColumns(),
        buildMetaBar: (metadata: DatasetMetadata) => buildMetaBar(metadata),
        timeseriesFeatureInit: () => feature.init(),
        ensureSessionPersistenceStarted: () => { /* from bootstrap/sessionBootstrap.js */ },
        setViewport,
        updateAnalysisZoom: deps.updateAnalysisZoom,
        setMetaText,
        emitWorkflowRefresh: () => { window.dispatchEvent(new CustomEvent('edatime:workflow-refresh')); },
        emitChartRangeChange: (sourceKind?: string) => pageController.emitChartRangeChange(sourceKind),
        setAdaptiveFilterColumn,
        getSelectedCols: () => [], // placeholder — app.ts will provide via closure
        setSelectedCols,
    });

    // 4. Create the runtime (owns page lifecycle via createPageRuntime)
    const runtime = createTimeseriesRuntime({
        initFeature: () => feature.init(),
        ensureReady: () => bootstrap.ensureDatasetReady(),
    });

    // 5. Return the stable module surface
    return {
        mount: () => runtime.mount(),
        ensureDatasetReady: () => bootstrap.ensureDatasetReady(),
        ensureReady: () => bootstrap.ensureDatasetReady(), // same as ensureDatasetReady for now
        fetchAndRender: () => pageController.fetchAndRender(),
        renderCurrentData: () => pageController.renderCurrentData(),
        buildColumnToggles: () => feature.rebuildColumns(),
        buildRangeControls: () => deps.buildRangeControls(),
        emitChartRangeChange: (sourceKind?: string) => pageController.emitChartRangeChange(sourceKind),
        onZoomRangeChange: (newStart: number, newEnd: number, sourceKind?: string) => pageController.onZoomRangeChange(newStart, newEnd, sourceKind),
        refreshAfterMutation: (options?: { selectedColumn?: string }) => bootstrap.refreshAfterMutation(options),
    };
}