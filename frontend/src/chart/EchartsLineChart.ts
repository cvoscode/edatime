import * as echarts from 'echarts';
import { type FrequencyPeak } from '../utils/spectralPresets.js';
import { DEFAULT_SPECTRAL_SCALE, type SpectralScaleOptions } from '../utils/spectralScaling.js';
import { getChartPalette, onThemeChange } from '../utils/theme.js';
import { buildFftDataModel } from './fftDataModel.js';
import { buildFftChartOptions } from './fftChartOptions.js';
import { createFftAccessibilitySummary } from './fftAccessibilitySummary.js';

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
 * ECharts fallback uses the active shared series palette so the FFT
 * fallback chart matches the WebGPU primary on cross-page color changes.
 */
export class EchartsLineChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _themeUnsubscribe: (() => void) | null = null;
    private _accessibilityTable: HTMLTableElement | null = null;
    private _lastUpdate: {
        traces: EchartsFftTrace[];
        mode: string;
        logScale: boolean;
        scaleOptions?: { mode: 'none' | 'minmax' | 'zscore' | 'robust'; clip: 'none' | 'percentile' | 'iqr'; clipParam: number };
    } | null = null;

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
        this._themeUnsubscribe?.();
        this._themeUnsubscribe = onThemeChange(() => {
            if (!this._lastUpdate) return;
            this.updateData(
                this._lastUpdate.traces,
                this._lastUpdate.mode,
                this._lastUpdate.logScale,
                this._lastUpdate.scaleOptions,
            );
        });
    }

    updateData(
        traces: EchartsFftTrace[],
        mode: string,
        logScale: boolean,
        scaleOptions?: SpectralScaleOptions,
    ): void {
        if (!this._chart) return;
        this._lastUpdate = { traces, mode, logScale, scaleOptions };

        const opts = scaleOptions || DEFAULT_SPECTRAL_SCALE;
        const chartPalette = getChartPalette();
        const model = buildFftDataModel(traces, mode, logScale, opts);
        const option = buildFftChartOptions({
            model,
            xMin: 0,
            xMax: model.fullXMax,
            mode,
            logScale,
            scaleOptions: opts,
        });
        this._chart.setOption({
            ...option,
            animation: false,
            backgroundColor: chartPalette.background,
            legend: {
                top: 8,
                right: 12,
                textStyle: { color: chartPalette.text },
            },
            series: model.series.map((series) => ({
                ...series,
                showSymbol: false,
                smooth: false,
                lineStyle: { width: 1.5, color: series.color },
                itemStyle: { color: series.color },
            })),
        });
        this._accessibilityTable?.remove();
        this._accessibilityTable = createFftAccessibilitySummary(model, mode, logScale, opts);
        if (this._accessibilityTable) this._container?.appendChild(this._accessibilityTable);
    }

    clear(): void {
        this._chart?.clear();
        this._accessibilityTable?.remove();
        this._accessibilityTable = null;
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
        this._themeUnsubscribe?.();
        this._themeUnsubscribe = null;
        this._lastUpdate = null;
        this._accessibilityTable?.remove();
        this._accessibilityTable = null;
        this._chart?.dispose?.();
        this._chart = null;
        this._container = null;
    }
}
