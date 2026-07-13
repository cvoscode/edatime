/**
 * ensureTimeseriesReady — coordinate chart bootstrap and timeseries page init.
 *
 * Extracted from app.ts so the orchestrator stays thin.
 * The `ensureReady()` call is idempotent: safe to call multiple times.
 */

import type { ChartInstance, ViewSnapshot } from '../../types.js';
import { checkWebGPU } from '../webgpuGuard.js';
import { getChartType } from '../../charts/registry.js';
import { FallbackChart } from '../../charts/fallback.js';
import { chartState, setChartInstance, setInitialView } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import { setAnalysisBound } from '../../store/runtimeState.js';
import { bindAnalysisChartEvents, getCurrentView } from '../../ui/toolbar.js';
import { setAnnotationOverlayCallback } from '../../ui/annotationPanel.js';
import { setAnomalyOverlayCallback } from '../../bootstrap/analyticsOverlay.js';
import { initAdaptiveFilterGesture } from '../adaptiveGesture.js';
import { restoreSessionAfterChartReady } from '../../bootstrap/sessionBootstrap.js';
import { dbg, dbgGroup } from '../../debug.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
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
    fetchAndRender: () => Promise<void>;
    refreshZoomControlsState: () => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport'>;
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
                    dbg('initial X range (ms)', { start: chartState.currentStart, end: chartState.currentEnd });

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

                    setAnalysisBound(false);
                    bindAnalysisChartEvents();
                    initAdaptiveFilterGesture({
                        workspace: deps.workspace,
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        updateAnalysisYRange: deps.onYRange,
                    });
                    deps.refreshZoomControlsState();

                    setAnnotationOverlayCallback(() => chartState.chart?.requestOverlayRender?.());
                    setAnomalyOverlayCallback(() => chartState.chart?.requestOverlayRender?.());

                    const chart = chartState.chart as ChartInstance | null;
                    chart?.setXRange?.(chartState.currentStart!, chartState.currentEnd!);
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
                        setAnalysisBound(false);
                        bindAnalysisChartEvents();
                        const fallbackChart = chartState.chart as ChartInstance | null;
                        fallbackChart?.setXRange?.(chartState.currentStart!, chartState.currentEnd!);
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
