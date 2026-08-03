/**
 * FftChart — ChartGPU adapter for FFT / Power Spectral Density visualisation.
 *
 * Mirrors the DataChart API (box-drag zoom with selection box div, same visual
 * style, canvas annotation overlay) but uses a numeric value x-axis for
 * frequency data instead of a time axis.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { defaultGpuPowerPreference } from '../utils/platform.js';
import {
    type GridLayout,
    ensureRelativePosition,
} from './chartInteractions.js';
import { buildFftChartOptions } from './fftChartOptions.js';
import { FftInteractionResources } from './fftInteractionResources.js';
import { renderFftOverlay } from './fftOverlayPresentation.js';
import { FftOverlayResources } from './fftOverlayResources.js';
import {
    type FrequencyPeak,
    type FrequencyUnit,
    checkAliasingWarning,
    pickFrequencyUnit,
} from '../utils/spectralPresets.js';
import {
    DEFAULT_SPECTRAL_SCALE,
    type SpectralScaleOptions,
} from '../utils/spectralScaling.js';
import { buildFftDataModel, type FftDataModel, type FftTrace } from './fftDataModel.js';
import { buildChartGpuTheme, getChartGpuColorPalette, withChartGpuTheme } from './chartThemeOptions.js';
import { onThemeChange } from '../utils/theme.js';

const FFT_GRID: GridLayout = { left: 112, right: 32, top: 52, bottom: 52 };

export type { FftTrace } from './fftDataModel.js';

export class FftChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _overlayResources = new FftOverlayResources();
    private _interactionResources = new FftInteractionResources();

    private _xMin = 0;
    private _xMax = 0;   // 0 = "use full range"
    private _fullXMax = 1;
    private _mode = 'magnitude';
    private _logScale = true;
    private _scaleOptions: SpectralScaleOptions = { ...DEFAULT_SPECTRAL_SCALE };
    private _annotations: number[] = [];  // freqHz values
    private _traces: FftTrace[] = [];
    private _overlayModel: FftDataModel | null = null;
    private _showPeakLabels = true;
    private _sampleRateHz = 0;
    private _nyquistHz = 0;
    private _dominantPeaks: FrequencyPeak[] = [];
    private _themeUnsubscribe: (() => void) | null = null;

    /** Called with true when zoomed, false when view reset to full range. */
    onZoomChange: ((isZoomed: boolean) => void) | null = null;

    /** Called when spectral info is updated (for external UI updates). */
    onSpectralInfoUpdate: ((info: { sampleRateHz: number; nyquistHz: number; peaks: FrequencyPeak[] }) => void) | null = null;

    constructor(containerId: string) {
        this._containerId = containerId;
    }

    async init(): Promise<void> {
        const container = document.getElementById(this._containerId);
        if (!container) return;
        this.destroy();
        this._container = container;
        ensureRelativePosition(container);

        const chartOptions: Record<string, unknown> = {
            grid: FFT_GRID,
            theme: buildChartGpuTheme(),
            palette: getChartGpuColorPalette(),
            xAxis: { type: 'value' },
            yAxis: { type: 'value' },
            legend: { show: false, position: 'right' },
            series: [],
        };
        const powerPreference = defaultGpuPowerPreference();
        if (powerPreference) chartOptions.powerPreference = powerPreference;
        this._chart = await createChart(container, chartOptions as any);

        this._overlayResources.mount(container, () => this._renderOverlay());
        this._initInteractions();
        this._themeUnsubscribe?.();
        this._themeUnsubscribe = onThemeChange(() => {
            if (!this._chart) return;
            if (this._traces.length > 0) this._applyCurrentOption();
            else this._chart.setOption(withChartGpuTheme({ series: [] }));
            this._renderOverlay();
        });
    }

    /* ── Frequency unit helpers ────────────────────────── */

    private _getXMin(): number { return this._xMin; }
    private _getXMax(): number { return this._xMax > 0 ? this._xMax : this._fullXMax; }

    getIsZoomed(): boolean {
        if (this._xMax <= 0) return false;
        return !(this._xMin === 0 && Math.abs(this._xMax - this._fullXMax) < 1e-30);
    }

    private _xUnit(): FrequencyUnit {
        return pickFrequencyUnit(this._getXMax());
    }

    /* ── Data update ───────────────────────────────────── */

    updateData(
        traces: FftTrace[],
        mode: string,
        logScale: boolean,
        scaleOptions?: SpectralScaleOptions,
    ): void {
        if (!this._chart) return;
        this._traces = traces;
        this._mode = mode;
        this._logScale = logScale;
        if (scaleOptions) this._scaleOptions = scaleOptions;

        const model = buildFftDataModel(traces, mode, logScale, this._scaleOptions);
        this._overlayModel = model;
        this._fullXMax = model.fullXMax;
        if (this._sampleRateHz === 0) this._sampleRateHz = model.sampleRateHz;
        if (this._nyquistHz === 0) this._nyquistHz = model.nyquistHz;
        if (this._dominantPeaks.length === 0) this._dominantPeaks = model.dominantPeaks;

        // Notify external listeners about spectral info
        this.onSpectralInfoUpdate?.({
            sampleRateHz: this._sampleRateHz,
            nyquistHz: this._nyquistHz,
            peaks: this._dominantPeaks,
        });

        this._applyCurrentOption();
        this._renderOverlay();
    }

    private _applyCurrentOption(): void {
        const model = this._overlayModel;
        if (!this._chart || !model) return;
        this._chart.setOption(withChartGpuTheme(buildFftChartOptions({
            model,
            xMin: this._getXMin(),
            xMax: this._getXMax(),
            mode: this._mode,
            logScale: this._logScale,
            scaleOptions: this._scaleOptions,
        })) as any);
    }

    /**
     * Update the active scale options and re-render with the existing
     * traces. Cheap — does not refetch from the backend.
     */
    setScaleOptions(scaleOptions: SpectralScaleOptions): void {
        this._scaleOptions = scaleOptions;
        if (this._traces.length > 0) {
            this.updateData(this._traces, this._mode, this._logScale, this._scaleOptions);
        }
    }

    /* ── View control ──────────────────────────────────── */

    setView(xMin: number, xMax: number): void {
        this._xMin = xMin;
        this._xMax = xMax;
        if (this._traces.length > 0) {
            this.updateData(this._traces, this._mode, this._logScale);
        }
        this.onZoomChange?.(this.getIsZoomed());
    }

    resetView(): void {
        this._xMin = 0;
        this._xMax = 0;
        if (this._traces.length > 0) {
            this.updateData(this._traces, this._mode, this._logScale);
        }
        this.onZoomChange?.(false);
    }

    clear(): void {
        this._traces = [];
        this._overlayModel = null;
        this._annotations = [];
        this._xMin = 0;
        this._xMax = 0;
        this._fullXMax = 1;
        this._sampleRateHz = 0;
        this._nyquistHz = 0;
        this._dominantPeaks = [];
        this._chart?.setOption({ series: [] });
        this._renderOverlay();
    }

    /** Toggle peak label display. */
    setShowPeakLabels(show: boolean): void {
        this._showPeakLabels = show;
        this._renderOverlay();
    }

    /** Get spectral info for display. */
    getSpectralInfo(): { sampleRateHz: number; nyquistHz: number; peaks: FrequencyPeak[] } {
        return {
            sampleRateHz: this._sampleRateHz,
            nyquistHz: this._nyquistHz,
            peaks: this._dominantPeaks,
        };
    }

    destroy(): void {
        this._themeUnsubscribe?.();
        this._themeUnsubscribe = null;
        this._interactionResources.dispose();
        this._overlayResources.dispose();
        this._chart?.dispose?.();
        this._chart = null;
    }

    /* ── Annotation overlay canvas ─────────────────────── */

    private _renderOverlay(): void {
        const canvas = this._overlayResources.canvas;
        if (!canvas) return;
        const xMin = this._getXMin();
        const xMax = this._getXMax();
        renderFftOverlay(canvas, FFT_GRID, {
            xMin,
            xMax,
            unit: this._xUnit(),
            annotations: this._annotations,
            showPeakLabels: this._showPeakLabels,
            dominantPeaks: this._dominantPeaks,
            primaryTracePoints: this._overlayModel?.series[0]?.data ?? [],
            yMin: this._overlayModel?.yMin ?? 0,
            yMax: this._overlayModel?.yMax ?? 0,
        });
    }

    /* ── Box zoom + scroll + click-annotate ────────────── */

    private _initInteractions(): void {
        const container = this._container;
        if (!container) return;

        this._interactionResources.mount({
            container,
            grid: FFT_GRID,
            getXRange: () => ({ min: this._getXMin(), max: this._getXMax() }),
            onZoom: (min, max) => {
                this.setView(Math.max(0, min), Math.min(this._fullXMax, max));
            },
            onClick: (cssX) => {
                if (this._traces.length === 0) return;
                const rect = container.getBoundingClientRect();
                const plotL = FFT_GRID.left;
                const plotW = Math.max(1, rect.width - FFT_GRID.left - FFT_GRID.right);
                if (cssX < plotL || cssX > plotL + plotW) return;
                const xMin = this._getXMin();
                const xMax = this._getXMax();
                const freqHz = xMin + ((cssX - plotL) / plotW) * (xMax - xMin);
                if (!Number.isFinite(freqHz) || freqHz < 0) return;
                const existIdx = this._annotations.findIndex((f) => {
                    const ax = plotL + ((f - xMin) / (xMax - xMin)) * plotW;
                    return Math.abs(ax - cssX) < 8;
                });
                if (existIdx >= 0) this._annotations.splice(existIdx, 1);
                else this._annotations.push(freqHz);
                this._renderOverlay();
            },
            onDblClick: () => {
                this._annotations = [];
                this.resetView();
            },
        });
    }

}
