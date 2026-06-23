import * as echarts from 'echarts';
import {
    type FrequencyPeak,
    formatFrequency,
} from '../utils/spectralPresets.js';
import { applySpectralScale } from '../utils/spectralScaling.js';

export interface EchartsFftTrace {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
    color?: string;
    sample_rate_hz?: number;
    nyquist_hz?: number;
    dominant_peaks?: FrequencyPeak[];
}

const TRACE_COLORS = [
    '#7ad151', '#4ac3e8', '#f97316', '#e879f9',
    '#facc15', '#60a5fa', '#f43f5e',
];

export class EchartsLineChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _resizeObserver: ResizeObserver | null = null;

    onZoomChange: ((isZoomed: boolean) => void) | null = null;

    constructor(containerId: string) {
        this._containerId = containerId;
    }

    async init(): Promise<void> {
        const container = document.getElementById(this._containerId);
        if (!container) throw new Error('FFT fallback container not found');

        this._container = container;
        this._chart = echarts.init(container, undefined, { renderer: 'canvas' });
        this._resizeObserver?.disconnect();
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(container);
    }

    updateData(
        traces: EchartsFftTrace[],
        mode: string,
        logScale: boolean,
        scaleOptions?: { mode: 'none' | 'minmax' | 'zscore' | 'robust'; clip: 'none' | 'percentile' | 'iqr'; clipParam: number },
    ): void {
        if (!this._chart) return;

        const opts = scaleOptions || { mode: 'none' as const, clip: 'none' as const, clipParam: 0.5 };
        const series = traces.map((trace, index) => {
            const values = mode === 'psd' ? trace.psd : trace.magnitudes;
            const preLog: number[] = values.map((v) => {
                const r = Number(v);
                return logScale ? (r > 0 ? Math.log10(r) : -10) : r;
            });
            const scaled = applySpectralScale(preLog, opts);
            const display = Array.from(scaled.displayValues);
            return {
                type: 'line',
                name: trace.column,
                showSymbol: false,
                smooth: false,
                lineStyle: { width: 1.5 },
                itemStyle: { color: trace.color || TRACE_COLORS[index % TRACE_COLORS.length] },
                data: trace.frequencies.map((frequency, pointIndex) => {
                    const y = display[pointIndex];
                    return [frequency, y];
                }).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
            };
        });

        this._chart.setOption({
            animation: false,
            grid: { left: 72, right: 28, top: 24, bottom: 48 },
            legend: {
                top: 8,
                right: 12,
                textStyle: { color: '#c8d4ef' },
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(8, 12, 20, 0.94)',
                borderColor: 'rgba(126, 158, 212, 0.28)',
                textStyle: { color: '#eef4ff' },
                formatter: (params: any[]) => {
                    const first = params?.[0];
                    const frequency = Number(first?.value?.[0]);
                    const heading = Number.isFinite(frequency) ? formatFrequency(frequency) : 'Frequency';
                    const rows = (params || []).map((entry) => {
                        const yValue = Number(entry?.value?.[1]);
                        return `${entry.marker || ''} ${entry.seriesName}: ${Number.isFinite(yValue) ? yValue.toFixed(4) : '—'}`;
                    });
                    return [heading, ...rows].join('<br>');
                },
            },
            xAxis: {
                type: 'value',
                name: 'Frequency (Hz)',
                nameLocation: 'middle',
                nameGap: 36,
                axisLabel: { color: '#9fb1d1' },
                splitLine: { lineStyle: { color: 'rgba(126, 158, 212, 0.12)' } },
            },
            yAxis: {
                type: 'value',
                name: logScale ? `log10(${mode === 'psd' ? 'PSD' : 'Magnitude'})` : (mode === 'psd' ? 'PSD' : 'Magnitude'),
                nameLocation: 'middle',
                nameGap: 52,
                axisLabel: { color: '#9fb1d1' },
                splitLine: { lineStyle: { color: 'rgba(126, 158, 212, 0.12)' } },
            },
            series,
        });
    }

    clear(): void {
        this._chart?.clear();
        this.onZoomChange?.(false);
    }

    resetView(): void {
        this.onZoomChange?.(false);
    }

    getIsZoomed(): boolean {
        return false;
    }

    resize(): void {
        this._chart?.resize?.();
    }

    destroy(): void {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._chart?.dispose?.();
        this._chart = null;
        this._container = null;
    }
}
