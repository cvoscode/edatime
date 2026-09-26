import { createChart } from 'chartgpu';
import { EchartsScatterChart } from '../../chart/EchartsScatterChart.js';
import { defaultGpuPowerPreference } from '../../utils/platform.js';
import { scatterState } from '../../store/scatterState.js';
import { disposeScatterChart, resetScatterContainer } from './state.js';
import { getEl } from './helpers.js';
import { initSelectionZoom } from './selectionZoom.js';
import { isGPUAvailable, setGpuUnavailable } from './runtime.js';
import type { DensityViewRefresh } from './rendering.js';
import { renderScatterAccessibilitySummary } from './accessibilitySummary.js';

export interface ScatterChartLifecycleOptions {
    container: HTMLElement;
    renderSignature: string;
    buildOption: (container: HTMLElement | null) => unknown;
    onPerformanceUpdate: () => void;
    onDensityViewRefresh?: DensityViewRefresh;
}

/** Create or reuse the chart instance while preserving the render-signature contract. */
export async function renderScatterChart(options: ScatterChartLifecycleOptions): Promise<HTMLElement | null> {
    let container: HTMLElement | null = options.container;
    if (scatterState.chart && scatterState.lastRenderSignature !== options.renderSignature) {
        disposeScatterChart();
        container = resetScatterContainer() || getEl('scatter-chart');
    }
    if (!container) return null;

    // Claim this render after disposing our previous chart. Capturing before
    // disposal makes our own replacement look stale and destroys it immediately.
    // A new claim also invalidates any older asynchronous chart creation.
    const lifecycleGeneration = (scatterState.chartLifecycleGeneration ?? 0) + 1;
    scatterState.chartLifecycleGeneration = lifecycleGeneration;
    const nextOption = options.buildOption(container);
    if (!scatterState.chart) {
        const gpuAvailable = await isGPUAvailable();
        if (lifecycleGeneration !== scatterState.chartLifecycleGeneration) return null;
        if (!gpuAvailable) {
            setGpuUnavailable(true);
            const fallbackChart = new EchartsScatterChart('scatter-chart');
            await fallbackChart.init();
            if (lifecycleGeneration !== (scatterState.chartLifecycleGeneration ?? 0)) {
                fallbackChart.dispose();
                return null;
            }
            scatterState.chart = fallbackChart as any;
        } else {
            setGpuUnavailable(false);
            const chartOptions: Record<string, unknown> = { ...(nextOption as Record<string, unknown>) };
            const powerPreference = defaultGpuPowerPreference();
            if (powerPreference) chartOptions.powerPreference = powerPreference;
            const createdChart = await createChart(container, chartOptions as any);
            if (lifecycleGeneration !== (scatterState.chartLifecycleGeneration ?? 0)) {
                createdChart.dispose?.();
                return null;
            }
            scatterState.chart = createdChart;
        }
        const chart = scatterState.chart;
        if (!chart) return container;
        scatterState.lastRenderSignature = options.renderSignature;
        chart.setOption(nextOption as any);
        renderScatterAccessibilitySummary(container);
        initSelectionZoom(container, { onDensityViewRefresh: options.onDensityViewRefresh });
        chart.onPerformanceUpdate?.(() => {
            const now = performance.now();
            if (now - scatterState.lastUpdateMs < 100) return;
            scatterState.lastUpdateMs = now;
            options.onPerformanceUpdate();
        });
    } else {
        scatterState.chart.setOption(nextOption as any);
        renderScatterAccessibilitySummary(container);
        scatterState.lastRenderSignature = options.renderSignature;
        requestAnimationFrame(() => scatterState.chart?.resize?.());
    }
    return container;
}
