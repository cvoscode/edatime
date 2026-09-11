import { timeseriesInteraction, resetTimeseriesInteraction } from './interaction.js';
import type { TimeseriesRuntimeCache } from './runtimeCache.js';
/**
 * ensureReady — coordinate chart bootstrap and Timeseries page initialization.
 *
 * Extracted from app.ts so the orchestrator stays thin.
 * The `ensureReady()` call is idempotent: safe to call multiple times.
 */

import type { ChartInstance, ViewSnapshot } from '../../types/chart.js';
import { checkWebGPU } from '../../chart/webgpuGuard.js';
import { getChartType } from '../../charts/registry.js';
import { primaryChart, setPrimaryChartInstance } from '../../charts/primaryChart.js';
import { bindAnalysisChartEvents, getCurrentView } from '../../ui/toolbar.js';
import { initAdaptiveFilterGesture } from './adaptiveGesture.js';
import { restoreSessionAfterChartReady } from '../../platform/sessionLifecycle.js';
import { dbg, dbgGroup } from '../../debug.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';
import type { DataObject } from '../../types/api.js';
import { getDefaultTimeseriesChartText } from './chartText.js';
export { getDefaultTimeseriesChartText } from './chartText.js';
export interface TimeseriesBootstrapCallbacks {
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
}

export interface TimeseriesBootstrapDeps {
    cleaningPlanStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>;
    runtimeCache: Pick<TimeseriesRuntimeCache, 'initialView'>;
    ensurePrimaryChartCtor: () => Promise<new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => ChartInstance>;
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    getCurrentData: () => DataObject | null;
    fetchAndRender: () => Promise<void>;
    refreshZoomControlsState: () => void;
    setAnomalyOverlayRenderCallback?: (callback: (() => void) | null) => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport' | 'subscribe'>;
}

export function createTimeseriesBootstrap(deps: TimeseriesBootstrapDeps) {
    let ready = false;
    let disposed = false;
    let disposeGesture = () => {};
    let ownedChart: ChartInstance | null = null;
    let pending: Promise<void> | null = null;

    return {
        ensureReady: async (): Promise<void> => {
            if (disposed || ready) return;
            if (pending) return pending;

            pending = (async () => {
                if (primaryChart.current) {
                    deps.refreshZoomControlsState();
                    ready = true;
                    return;
                }

                const gpuError = await checkWebGPU();
                if (disposed) return;

                try {
                    let initialViewport = deps.workspace.getSnapshot().viewport;
                    dbg('initial X range (ms)', { start: initialViewport?.xMin, end: initialViewport?.xMax });

                    const lineType = getChartType('line');
                    if (lineType) {
                        // DataChart invokes its onZoom callback as
                        // `onZoomCallback(view, sourceKind)` where `view` is a
                        // `ViewSnapshot`. Forward the args unchanged so the
                        // page controller receives a real view with finite
                        // xMin/xMax; the previous wrapper declared a
                        // (start, end, sourceKind) signature, which corrupted
                        // the view (treating the snapshot object as `start`
                        // and the source kind as `end`) and caused the page
                        // controller's Number.isFinite guard to bail out
                        // silently.
                        setPrimaryChartInstance(lineType.create('main-chart', {
                            onZoom: (view: ViewSnapshot, sourceKind: string) =>
                                deps.onZoom(view, sourceKind),
                            onYRange: deps.onYRange,
                            onZoomOut: deps.onZoomOut,
                        }));
                    } else {
                        const DataChartCtor = await deps.ensurePrimaryChartCtor();
                        if (disposed) return;
                        setPrimaryChartInstance(new DataChartCtor('main-chart', deps.onZoom, deps.onYRange, deps.onZoomOut));
                    }

                    ownedChart = primaryChart.current as ChartInstance | null;
                    (primaryChart.current as ChartInstance | null)?.setPendingAdaptivePointReader?.(() => timeseriesInteraction.pendingAdaptivePoint);
                    if (gpuError) throw new Error(gpuError);

                    let timer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        await Promise.race([
                            primaryChart.current!.init(),
                            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000); }),
                        ]);
                    } finally { clearTimeout(timer); }
                    if (disposed || primaryChart.current !== ownedChart) return;
                    initialViewport = deps.workspace.getSnapshot().viewport;

                    bindAnalysisChartEvents();
                    const adaptiveGestureDeps = {
                        workspace: deps.workspace,
                        ...(deps.cleaningPlanStore ? { cleaningPlanStore: deps.cleaningPlanStore } : {}),
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        getCurrentData: deps.getCurrentData,
                        updateAnalysisYRange: deps.onYRange,
                    };
                    disposeGesture = initAdaptiveFilterGesture(adaptiveGestureDeps);
                    deps.refreshZoomControlsState();

                    deps.setAnomalyOverlayRenderCallback?.(() => primaryChart.current?.requestOverlayRender?.());

                    const chart = primaryChart.current as ChartInstance | null;
                    const initialStart = Number(initialViewport?.xMin);
                    const initialEnd = Number(initialViewport?.xMax);
                    if (Number.isFinite(initialStart) && Number.isFinite(initialEnd)) {
                        chart?.setXRange?.(initialStart, initialEnd);
                    }
                    const initialSnapshot = deps.workspace.getSnapshot();
                    const chartText = getDefaultTimeseriesChartText(
                        initialSnapshot.appearance,
                        initialSnapshot.selection.columns,
                    );
                    chart?.setChartText?.(chartText.title, chartText.xLabel, chartText.yLabel);

                    deps.renderCurrentData();
                    await deps.fetchAndRender();
                    if (disposed) return;

                    deps.runtimeCache.initialView = getCurrentView(deps.workspace);
                    deps.refreshZoomControlsState();
                    dbgGroup('initialView snapshot', () => dbg(deps.runtimeCache.initialView));

                    await restoreSessionAfterChartReady({
                        metadataTimeRange: deps.workspace.getSnapshot().dataset.metadata?.time_range ?? null,
                        currentDatasetRevision: Number(deps.workspace.getSnapshot().dataset.revision ?? 0),
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        fetchAndRender: deps.fetchAndRender,
                        workspace: deps.workspace,
                    });

                    if (disposed) return;
                    ready = true;
                } catch (e: unknown) {
                    if (disposed) return;
                    console.warn('Primary chart failed, switching to fallback:', e);
                    try {
                        const fallbackType = getChartType('fallback');
                        const fallbackCallbacks = {
                            onZoom: deps.onZoom,
                            onYRange: deps.onYRange,
                            onZoomOut: deps.onZoomOut,
                        };
                        if (fallbackType) {
                            setPrimaryChartInstance(fallbackType.create('main-chart', fallbackCallbacks));
                        } else {
                            const { FallbackChart } = await import('../../charts/fallback.js');
                            setPrimaryChartInstance(new FallbackChart(
                                'main-chart',
                                deps.onZoom,
                                deps.onYRange,
                                deps.onZoomOut,
                            ));
                        }

                        ownedChart = primaryChart.current as ChartInstance | null;
                        await primaryChart.current!.init();
                        if (disposed || primaryChart.current !== ownedChart) return;
                        bindAnalysisChartEvents();
                        const fallbackChart = primaryChart.current as ChartInstance | null;
                        const fallbackViewport = deps.workspace.getSnapshot().viewport;
                        const fallbackStart = Number(fallbackViewport?.xMin);
                        const fallbackEnd = Number(fallbackViewport?.xMax);
                        if (Number.isFinite(fallbackStart) && Number.isFinite(fallbackEnd)) {
                            fallbackChart?.setXRange?.(fallbackStart, fallbackEnd);
                        }
                        const fallbackSnapshot = deps.workspace.getSnapshot();
                        const fallbackChartText = getDefaultTimeseriesChartText(
                            fallbackSnapshot.appearance,
                            fallbackSnapshot.selection.columns,
                        );
                        fallbackChart?.setChartText?.(
                            fallbackChartText.title,
                            fallbackChartText.xLabel,
                            fallbackChartText.yLabel,
                        );
                        await deps.fetchAndRender();
                        if (disposed) return;

                        deps.runtimeCache.initialView = getCurrentView(deps.workspace);
                        deps.refreshZoomControlsState();
                        ready = true;
                    } catch (fallbackErr: unknown) {
                        if (disposed) return;
                        console.error('Fallback chart also failed:', fallbackErr);

                    }
                }
            })();

            try {
                await pending;
            } finally {
                pending = null;
            }
        },
        isReady: () => ready,
        dispose: () => {
            disposed = true;
            disposeGesture();
            resetTimeseriesInteraction();
            if (ownedChart && primaryChart.current === ownedChart) setPrimaryChartInstance(null);
        },
    };
}
