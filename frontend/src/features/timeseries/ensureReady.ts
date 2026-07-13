/**
 * ensureReady — coordinate chart bootstrap and Timeseries page initialization.
 *
 * Extracted from app.ts so the orchestrator stays thin.
 * The `ensureReady()` call is idempotent: safe to call multiple times.
 */

import type { ChartInstance, ViewSnapshot } from '../../types/chart.js';
import { checkWebGPU } from '../../chart/webgpuGuard.js';
import { getChartType } from '../../charts/registry.js';
import { FallbackChart } from '../../charts/fallback.js';
import { chartState, setChartInstance, setInitialView } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import { bindAnalysisChartEvents, getCurrentView } from '../../ui/toolbar.js';
import { initAdaptiveFilterGesture } from './adaptiveGesture.js';
import { restoreSessionAfterChartReady } from '../../platform/sessionLifecycle.js';
import { dbg, dbgGroup } from '../../debug.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import type { DataObject } from '../../types/api.js';
export interface TimeseriesBootstrapCallbacks {
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
}

export interface TimeseriesBootstrapDeps {
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
    let pending: Promise<void> | null = null;

    return {
        ensureReady: async (): Promise<void> => {
            if (ready) return;
            if (pending) return pending;

            pending = (async () => {
                if (chartState.chart) {
                    deps.refreshZoomControlsState();
                    ready = true;
                    return;
                }

                const gpuError = await checkWebGPU();

                try {
                    const initialViewport = deps.workspace.getSnapshot().viewport;
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
                        setChartInstance(lineType.create('main-chart', {
                            onZoom: (view: ViewSnapshot, sourceKind: string) =>
                                deps.onZoom(view, sourceKind),
                            onYRange: deps.onYRange,
                            onZoomOut: deps.onZoomOut,
                        }));
                    } else {
                        const DataChartCtor = await deps.ensurePrimaryChartCtor();
                        setChartInstance(new DataChartCtor('main-chart', deps.onZoom, deps.onYRange, deps.onZoomOut));
                    }

                    if (gpuError) throw new Error(gpuError);

                    await Promise.race([
                        chartState.chart!.init(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000)),
                    ]);

                    bindAnalysisChartEvents();
                    initAdaptiveFilterGesture({
                        workspace: deps.workspace,
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        getCurrentData: deps.getCurrentData,
                        updateAnalysisYRange: deps.onYRange,
                    });
                    deps.refreshZoomControlsState();

                    deps.setAnomalyOverlayRenderCallback?.(() => chartState.chart?.requestOverlayRender?.());

                    const chart = chartState.chart as ChartInstance | null;
                    const initialStart = Number(initialViewport?.xMin);
                    const initialEnd = Number(initialViewport?.xMax);
                    if (Number.isFinite(initialStart) && Number.isFinite(initialEnd)) {
                        chart?.setXRange?.(initialStart, initialEnd);
                    }
                    chart?.setChartText?.(
                        chartState.chartText?.title || '',
                        chartState.chartText?.xLabel || '',
                        chartState.chartText?.yLabel || '',
                    );

                    deps.renderCurrentData();
                    await deps.fetchAndRender();

                    setInitialView(getCurrentView());
                    deps.refreshZoomControlsState();
                    dbgGroup('initialView snapshot', () => dbg(chartState.initialView));

                    await restoreSessionAfterChartReady({
                        metadataTimeRange: datasetState.metadata?.time_range ?? null,
                        currentDatasetRevision: Number(datasetState.datasetRevision ?? 0),
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        fetchAndRender: deps.fetchAndRender,
                        workspace: deps.workspace,
                    });

                    ready = true;
                } catch (e: unknown) {
                    console.warn('Primary chart failed, switching to fallback:', e);
                    try {
                        const fallbackType = getChartType('fallback');
                        const fallbackCallbacks = {
                            onZoom: deps.onZoom,
                            onYRange: deps.onYRange,
                            onZoomOut: deps.onZoomOut,
                        };
                        setChartInstance(fallbackType
                            ? fallbackType.create('main-chart', fallbackCallbacks)
                            : new FallbackChart('main-chart', deps.onZoom, deps.onYRange, deps.onZoomOut));

                        await chartState.chart!.init();
                        bindAnalysisChartEvents();
                        const fallbackChart = chartState.chart as ChartInstance | null;
                        const fallbackViewport = deps.workspace.getSnapshot().viewport;
                        const fallbackStart = Number(fallbackViewport?.xMin);
                        const fallbackEnd = Number(fallbackViewport?.xMax);
                        if (Number.isFinite(fallbackStart) && Number.isFinite(fallbackEnd)) {
                            fallbackChart?.setXRange?.(fallbackStart, fallbackEnd);
                        }
                        fallbackChart?.setChartText?.(
                            chartState.chartText?.title || '',
                            chartState.chartText?.xLabel || '',
                            chartState.chartText?.yLabel || '',
                        );
                        await deps.fetchAndRender();

                        setInitialView(getCurrentView());
                        deps.refreshZoomControlsState();
                        ready = true;
                    } catch (fallbackErr: unknown) {
                        const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
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
    };
}
