import * as echarts from 'echarts';
import { SCATTER_PLOT_GRID } from '../features/scatter/index.js';
import { getChartPalette, onThemeChange } from '../utils/theme.js';

export class EchartsScatterChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _lastObservedSize: { width: number; height: number } | null = null;
    private _lastOption: any = null;
    private _themeUnsubscribe: (() => void) | null = null;

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
        this._themeUnsubscribe?.();
        this._themeUnsubscribe = onThemeChange(() => {
            if (this._lastOption) this.setOption(this._lastOption);
        });
    }

    setOption(option: any): void {
        if (!this._chart) return;
        this._lastOption = option;
        const palette = getChartPalette();

        const translatedSeries = Array.isArray(option?.series)
            ? option.series.map((series: any) => ({
                type: 'scatter',
                name: series?.name || 'scatter',
                data: Array.isArray(series?.data) ? series.data : [],
                symbolSize: series?.symbolSize || 4,
                itemStyle: {
                    color: typeof series?.color === 'string' ? series.color : palette.scatterPoint,
                    opacity: series?.mode === 'density' ? 0.38 : 0.72,
                },
            }))
            : [];

        this._chart.setOption({
            animation: false,
            backgroundColor: palette.background,
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
                    color: palette.textDim,
                    formatter: option?.xAxis?.tickFormatter,
                },
                axisLine: { lineStyle: { color: palette.borderHi } },
                splitLine: { lineStyle: { color: palette.border } },
            },
            yAxis: {
                type: 'value',
                name: option?.yAxis?.name || 'Y',
                min: option?.yAxis?.min,
                max: option?.yAxis?.max,
                nameLocation: 'middle',
                nameGap: 48,
                axisLabel: {
                    color: palette.textDim,
                    formatter: option?.yAxis?.tickFormatter,
                },
                axisLine: { lineStyle: { color: palette.borderHi } },
                splitLine: { lineStyle: { color: palette.border } },
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
        this._themeUnsubscribe?.();
        this._themeUnsubscribe = null;
        this._lastObservedSize = null;
        this._lastOption = null;
        this._chart?.dispose?.();
        this._chart = null;
        this._container = null;
    }
}
