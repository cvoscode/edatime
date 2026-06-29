import * as echarts from 'echarts';
import {
    type FrequencyPeak,
    formatFrequency,
} from '../utils/spectralPresets.js';
import { applySpectralScale } from '../utils/spectralScaling.js';
import { SERIES_COLORS } from '../utils/seriesColors.js';

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

/**
 * ECharts fallback uses the shared `SERIES_COLORS` palette so the FFT
 * fallback chart matches the WebGPU primary on cross-page color changes.
 */
const TRACE_COLORS = SERIES_COLORS;

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

        // Adaptive Y-axis precision: 1-2 decimals depending on range so the
        // rotated Y-axis label never crowds the tick labels. Mirrors the
        // WebGPU primary chart's `yTickPrec` heuristic.
        let yMinDisplay = Number.POSITIVE_INFINITY;
        let yMaxDisplay = Number.NEGATIVE_INFINITY;
        for (const trace of traces) {
            const values = mode === 'psd' ? trace.psd : trace.magnitudes;
            for (const v of values) {
                const r = Number(v);
                if (!Number.isFinite(r)) continue;
                if (r > yMaxDisplay) yMaxDisplay = r;
                if (r < yMinDisplay) yMinDisplay = r;
            }
        }
        const yRange = Number.isFinite(yMaxDisplay) && Number.isFinite(yMinDisplay)
            ? yMaxDisplay - yMinDisplay
            : 0;
        const yTickPrec = yRange >= 100 ? 0 : yRange >= 10 ? 1 : 2;

        this._chart.setOption({
            animation: false,
            grid: { left: 96, right: 28, top: 24, bottom: 56 },
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
                        return `${entry.marker || ''} ${entry.seriesName}: ${Number.isFinite(yValue) ? yValue.toFixed(yTickPrec + 2) : '—'}`;
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
                nameGap: 64,
                axisLabel: {
                    color: '#9fb1d1',
                    formatter: (value: number) => Number(value).toFixed(yTickPrec),
                },
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
