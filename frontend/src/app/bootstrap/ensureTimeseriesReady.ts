/**
 * ensureTimeseriesReady — coordinate chart bootstrap and timeseries page init.
 *
 * Extracted from app.ts so the orchestrator stays thin.
 * The `ensureReady()` call is idempotent: safe to call multiple times.
 */

import type { ChartInstance, ViewSnapshot } from '../../types.js';
import { appState } from '../../store/appStateCompat.js';
import { checkWebGPU } from '../webgpuGuard.js';
import { getChartType } from '../../charts/registry.js';
import { FallbackChart } from '../../charts/fallback.js';
import { setAnalysisBound, setChartInstance, setInitialView } from '../../store/index.js';
import { bindAnalysisChartEvents, getCurrentView } from '../../ui/toolbar.js';
import { setAnnotationOverlayCallback } from '../../ui/annotationPanel.js';
import { setAnomalyOverlayCallback } from '../../bootstrap/analyticsOverlay.js';
import { initAdaptiveFilterGesture } from '../adaptiveGesture.js';
import { restoreSessionAfterChartReady } from '../../bootstrap/sessionBootstrap.js';
import { dbg, dbgGroup } from '../../debug.js';
export interface TimeseriesBootstrapCallbacks {
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
}

export interface TimeseriesBootstrapDeps {
    DataChartCtor: new (
        containerId: string,
        onZoomCb: ((view: ViewSnapshot, sourceKind: string) => void) | null,
        onYRangeCb: ((min: number, max: number, sourceKind: string) => void) | null,
        onZoomOutCb: (() => void) | null,
    ) => ChartInstance;
    onZoom: (view: ViewSnapshot, sourceKind: string) => void;
    onYRange: (min: number, max: number, sourceKind: string) => void;
    onZoomOut: () => void;
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
    renderCurrentData: () => void;
    fetchAndRender: () => Promise<void>;
    refreshZoomControlsState: () => void;
}

export function createTimeseriesBootstrap(deps: TimeseriesBootstrapDeps) {
    let ready = false;
    let pending: Promise<void> | null = null;

    return {
        ensureReady: async (): Promise<void> => {
            if (ready) return;
            if (pending) return pending;

            pending = (async () => {
                if (appState.chart) {
                    ready = true;
                    return;
                }

                // Wipe any leftover canvas/overlay DOM from a previous failed init
                // so we never end up with multiple stacked charts.
                const container = document.getElementById('main-chart');
                if (container) container.replaceChildren();

                const gpuError = await checkWebGPU();

                try {
                    dbg('initial X range (ms)', { start: appState.currentStart, end: appState.currentEnd });

                    const lineType = getChartType('line');
                    if (lineType) {
                        setChartInstance(lineType.create('main-chart', {
                            onZoom: (view: ViewSnapshot, sourceKind: string) => deps.onZoom(view, sourceKind),
                            onYRange: deps.onYRange,
                            onZoomOut: deps.onZoomOut,
                        }));
                    } else {
                        if (!deps.DataChartCtor) throw new Error('DataChart module not loaded');
                        setChartInstance(new deps.DataChartCtor('main-chart', deps.onZoom, deps.onYRange, deps.onZoomOut));
                    }

                    if (gpuError) throw new Error(gpuError);

                    await Promise.race([
                        appState.chart!.init(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('ChartGPU init timed out')), 6000)),
                    ]);

                    setAnalysisBound(false);
                    bindAnalysisChartEvents();
                    initAdaptiveFilterGesture({
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        updateAnalysisYRange: deps.onYRange,
                    });
                    deps.refreshZoomControlsState();

                    setAnnotationOverlayCallback(() => appState.chart?.requestOverlayRender?.());
                    setAnomalyOverlayCallback(() => appState.chart?.requestOverlayRender?.());

                    const chart = appState.chart as ChartInstance | null;
                    chart?.setXRange?.(appState.currentStart!, appState.currentEnd!);
                    chart?.setChartText?.(
                        appState.chartText?.title || '',
                        appState.chartText?.xLabel || '',
                        appState.chartText?.yLabel || '',
                    );

                    deps.renderCurrentData();
                    await deps.fetchAndRender();

                    setInitialView(getCurrentView());
                    dbgGroup('initialView snapshot', () => dbg(appState.initialView));

                    await restoreSessionAfterChartReady({
                        metadataTimeRange: appState.metadata?.time_range ?? null,
                        currentDatasetRevision: Number(appState.datasetRevision ?? 0),
                        buildColumnToggles: deps.buildColumnToggles,
                        buildRangeControls: deps.buildRangeControls,
                        renderCurrentData: deps.renderCurrentData,
                        fetchAndRender: deps.fetchAndRender,
                    });

                    ready = true;
                } catch (e: unknown) {
                    console.warn('Primary chart failed, switching to fallback:', e);
                    try {
                        const fallbackType = getChartType('fallback');
                        setChartInstance(fallbackType
                            ? fallbackType.create('main-chart', {})
                            : new FallbackChart('main-chart'));

                        await appState.chart!.init();
                        setAnalysisBound(false);
                        bindAnalysisChartEvents();
                        deps.refreshZoomControlsState();
                        await deps.fetchAndRender();
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
