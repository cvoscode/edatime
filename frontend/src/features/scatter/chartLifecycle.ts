import { createChart } from '../../../libs/chartgpu/dist/index.js';
import { EchartsScatterChart } from '../../chart/EchartsScatterChart.js';
import { defaultGpuPowerPreference } from '../../utils/platform.js';
import { scatterState } from '../../store/scatterState.js';
import { disposeScatterChart, resetScatterContainer } from './state.js';
import { getEl } from './helpers.js';
import { initSelectionZoom } from './selectionZoom.js';
import { isGPUAvailable, setGpuUnavailable } from './runtime.js';

export interface ScatterChartLifecycleOptions {
    container: HTMLElement;
    renderSignature: string;
    buildOption: (container: HTMLElement | null) => unknown;
    onPerformanceUpdate: () => void;
}

/** Create or reuse the chart instance while preserving the render-signature contract. */
export async function renderScatterChart(options: ScatterChartLifecycleOptions): Promise<HTMLElement | null> {
    let container: HTMLElement | null = options.container;
    if (scatterState.chart && scatterState.lastRenderSignature !== options.renderSignature) {
        disposeScatterChart();
        container = resetScatterContainer() || getEl('scatter-chart');
    }
    if (!container) return null;

    const nextOption = options.buildOption(container);
    if (!scatterState.chart) {
        if (!await isGPUAvailable()) {
            setGpuUnavailable(true);
            const fallbackChart = new EchartsScatterChart('scatter-chart');
            await fallbackChart.init();
            scatterState.chart = fallbackChart as any;
        } else {
            setGpuUnavailable(false);
            const chartOptions: Record<string, unknown> = { ...(nextOption as Record<string, unknown>) };
            const powerPreference = defaultGpuPowerPreference();
            if (powerPreference) chartOptions.powerPreference = powerPreference;
            scatterState.chart = await createChart(container, chartOptions as any);
        }
        const chart = scatterState.chart;
        if (!chart) return container;
        scatterState.lastRenderSignature = options.renderSignature;
        chart.setOption(nextOption as any);
        initSelectionZoom(container);
        chart.onPerformanceUpdate?.(() => {
            const now = performance.now();
            if (now - scatterState.lastUpdateMs < 100) return;
            scatterState.lastUpdateMs = now;
            options.onPerformanceUpdate();
        });
    } else {
        scatterState.chart.setOption(nextOption as any);
        scatterState.lastRenderSignature = options.renderSignature;
        requestAnimationFrame(() => scatterState.chart?.resize?.());
    }
    return container;
}
