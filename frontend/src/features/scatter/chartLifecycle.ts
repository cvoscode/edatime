import { createChart } from 'chartgpu';
import { EchartsScatterChart } from '../../chart/EchartsScatterChart.js';
import { defaultGpuPowerPreference } from '../../utils/platform.js';
import { scatterState } from '../../store/scatterState.js';
import { disposeScatterChart, resetScatterContainer } from './state.js';
import { getEl } from './helpers.js';
import { initSelectionZoom } from './selectionZoom.js';
import { isGPUAvailable, setGpuUnavailable } from './runtime.js';
import type { DensityViewRefresh } from './rendering.js';
import { createAccessibilitySummaryTable, type SeriesSummary } from '../../chart/accessibilityTable.js';
import { currentControls } from './state.js';

export interface ScatterChartLifecycleOptions {
    container: HTMLElement;
    renderSignature: string;
    buildOption: (container: HTMLElement | null) => unknown;
    onPerformanceUpdate: () => void;
    onDensityViewRefresh?: DensityViewRefresh;
}

function syncAccessibilitySummary(container: HTMLElement, option: unknown): void {
    container.querySelector('table[data-chart-summary="scatter"]')?.remove();
    void option;
    const controls = currentControls();
    const axes: Array<{ name: string; index: 0 | 1 }> = [
        { name: controls.x || 'X axis', index: 0 },
        { name: controls.y || 'Y axis', index: 1 },
    ];
    const summaries: SeriesSummary[] = axes.flatMap(({ name, index }) => {
        const values = scatterState.points.map((point) => Number(point[index])).filter(Number.isFinite);
        if (values.length === 0) return [];
        const sorted = [...values].sort((left, right) => left - right);
        const total = values.reduce((sum, value) => sum + value, 0);
        let min = values[0];
        let max = values[0];
        for (const value of values) {
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        const mean = total / values.length;
        const midpoint = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2 : sorted[midpoint]!;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        return [{ name, count: values.length, min, max, mean, std: Math.sqrt(variance), median, missingCount: 0 }];
    });
    if (summaries.length === 0) return;
    const table = createAccessibilitySummaryTable('Scatter chart', summaries, { visible: true });
    const correlationRows: Array<[string, number | null | undefined]> = [
        ['Pearson r', scatterState.currentPairStats?.pearsonRaw],
        ['Spearman ρ', scatterState.currentPairStats?.spearmanRaw],
    ];
    const correlationBody = document.createElement('tbody');
    correlationBody.className = 'chart-summary-table__correlations';
    for (const [name, value] of correlationRows) {
        const row = document.createElement('tr');
        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.textContent = name;
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.textContent = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—';
        row.append(heading, cell);
        correlationBody.append(row);
    }
    table.append(correlationBody);
    table.dataset.chartSummary = 'scatter';
    container.appendChild(table);
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
        syncAccessibilitySummary(container, nextOption);
        initSelectionZoom(container, { onDensityViewRefresh: options.onDensityViewRefresh });
        chart.onPerformanceUpdate?.(() => {
            const now = performance.now();
            if (now - scatterState.lastUpdateMs < 100) return;
            scatterState.lastUpdateMs = now;
            options.onPerformanceUpdate();
        });
    } else {
        scatterState.chart.setOption(nextOption as any);
        syncAccessibilitySummary(container, nextOption);
        scatterState.lastRenderSignature = options.renderSignature;
        requestAnimationFrame(() => scatterState.chart?.resize?.());
    }
    return container;
}
