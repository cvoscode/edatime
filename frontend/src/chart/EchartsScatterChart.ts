import * as echarts from 'echarts';
import { SCATTER_PLOT_GRID } from '../features/scatter/layout.js';

export class EchartsScatterChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _lastObservedSize: { width: number; height: number } | null = null;

    constructor(containerId: string) {
        this._containerId = containerId;
    }

    async init(): Promise<void> {
        const container = document.getElementById(this._containerId);
        if (!container) throw new Error('Scatter fallback container not found');

        this._container = container;
        this._chart = echarts.init(container, undefined, { renderer: 'canvas' });
        this._resizeObserver?.disconnect();
        this._resizeObserver = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect) {
                this.resize();
                return;
            }
            const width = Math.round(rect.width);
            const height = Math.round(rect.height);
            const previous = this._lastObservedSize;
            if (previous && previous.width === width && previous.height === height) return;
            this._lastObservedSize = { width, height };
            this.resize();
        });
        this._resizeObserver.observe(container);
    }

    setOption(option: any): void {
        if (!this._chart) return;

        const translatedSeries = Array.isArray(option?.series)
            ? option.series.map((series: any) => ({
                type: 'scatter',
                name: series?.name || 'scatter',
                data: Array.isArray(series?.data) ? series.data : [],
                symbolSize: series?.symbolSize || 4,
                itemStyle: {
                    color: typeof series?.color === 'string' ? series.color : '#4a9eff',
                    opacity: series?.mode === 'density' ? 0.38 : 0.72,
                },
            }))
            : [];

        this._chart.setOption({
            animation: false,
            grid: option?.grid || { ...SCATTER_PLOT_GRID },
            tooltip: option?.tooltip || { show: true, trigger: 'item' },
            legend: { show: false },
            xAxis: {
                type: 'value',
                name: option?.xAxis?.name || 'X',
                min: option?.xAxis?.min,
                max: option?.xAxis?.max,
                nameLocation: 'middle',
                nameGap: 34,
                axisLabel: {
                    color: '#9fb1d1',
                    formatter: option?.xAxis?.tickFormatter,
                },
                splitLine: { lineStyle: { color: 'rgba(126, 158, 212, 0.12)' } },
            },
            yAxis: {
                type: 'value',
                name: option?.yAxis?.name || 'Y',
                min: option?.yAxis?.min,
                max: option?.yAxis?.max,
                nameLocation: 'middle',
                nameGap: 48,
                axisLabel: {
                    color: '#9fb1d1',
                    formatter: option?.yAxis?.tickFormatter,
                },
                splitLine: { lineStyle: { color: 'rgba(126, 158, 212, 0.12)' } },
            },
            series: translatedSeries,
        });
    }

    onPerformanceUpdate(): void {
        // ECharts does not expose the same render lifecycle hook; scatter fallback
        // only needs a callable surface to satisfy the page runtime.
    }

    resize(): void {
        this._chart?.resize?.();
    }

    dispose(): void {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._lastObservedSize = null;
        this._chart?.dispose?.();
        this._chart = null;
        this._container = null;
    }
}
