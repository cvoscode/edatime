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
    createCanvasOverlay, ensureRelativePosition,
    initBoxZoom, tooltipRow, tooltipWrap,
} from './chartInteractions.js';
import {
    type FrequencyPeak,
    type FrequencyUnit,
    formatFrequencyInUnit,
    formatFrequency,
    frequencyUnitScale,
    frequencyToPeriod,
    checkAliasingWarning,
    pickFrequencyUnit,
    formatCyclesPerDay,
    useCyclesPerDayFrequencyAxis,
} from '../utils/spectralPresets.js';
import {
    applySpectralScale,
    scaleModeLabel,
    DEFAULT_SPECTRAL_SCALE,
    type SpectralScaleOptions,
} from '../utils/spectralScaling.js';
import { SERIES_COLORS } from '../utils/seriesColors.js';

const FFT_GRID: GridLayout = { left: 112, right: 32, top: 52, bottom: 52 };

/**
 * Fallback palette for the FFT chart when no per-column color override is
 * supplied. Points at the shared `SERIES_COLORS` so cross-page color
 * changes (`setSeriesColor(...)`) automatically apply to FFT traces as
 * well — see `usage_issue.md` §1.3.
 */
const FFT_TRACE_COLORS = SERIES_COLORS;

export interface FftTrace {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
    color?: string;
    // New spectral info
    sample_rate_hz?: number;
    nyquist_hz?: number;
    dominant_peaks?: FrequencyPeak[];
}

export class FftChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _overlayCanvas: HTMLCanvasElement | null = null;
    private _overlayObserver: ResizeObserver | null = null;
    private _selectionBox: (HTMLElement & { dispose?: () => void }) | null = null;

    private _xMin = 0;
    private _xMax = 0;   // 0 = "use full range"
    private _fullXMax = 1;
    private _mode = 'magnitude';
    private _logScale = true;
    private _scaleOptions: SpectralScaleOptions = { ...DEFAULT_SPECTRAL_SCALE };
    private _annotations: number[] = [];  // freqHz values
    private _traces: FftTrace[] = [];
    private _showPeakLabels = true;
    private _sampleRateHz = 0;
    private _nyquistHz = 0;
    private _dominantPeaks: FrequencyPeak[] = [];

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
        this._selectionBox?.dispose?.();
        this._selectionBox = null;
        this._container = container;
        ensureRelativePosition(container);

        const chartOptions: Record<string, unknown> = {
            grid: FFT_GRID,
            xAxis: { type: 'value' },
            yAxis: { type: 'value' },
            legend: { show: false, position: 'right' },
            series: [],
        };
        const powerPreference = defaultGpuPowerPreference();
        if (powerPreference) chartOptions.powerPreference = powerPreference;
        this._chart = await createChart(container, chartOptions as any);

        this._initOverlay();
        this._initInteractions();
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

    private _xScale(): number {
        return frequencyUnitScale(this._xUnit());
    }

    private _formatXAxisTick(hz: number, fractionDigits: number): string {
        if (useCyclesPerDayFrequencyAxis(this._getXMax())) {
            return formatCyclesPerDay(hz, fractionDigits).replace(/\s+cycles\/day$/, '');
        }
        return formatFrequencyInUnit(hz, this._xUnit(), fractionDigits).replace(/\s+[A-Za-zµ]+$/, '');
    }

    private _xAxisLabel(): string {
        if (useCyclesPerDayFrequencyAxis(this._getXMax())) return 'Frequency (cycles/day)';
        return `Frequency (${this._xUnit()})`;
    }

    private _yAxisLabel(): string {
        const base = this._mode === 'psd' ? 'PSD' : 'Magnitude';
        return this._logScale ? `log10(${base})` : base;
    }

    private _formatLogAxisTick(value: number): string {
        const magnitude = 10 ** value;
        if (!Number.isFinite(magnitude) || magnitude <= 0) return '';
        if (magnitude >= 1000 || magnitude < 0.001) {
            return magnitude.toExponential(1).replace('e+', 'e+');
        }
        return Number(magnitude.toPrecision(2)).toString();
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

        this._fullXMax = 0;
        for (const t of traces) {
            for (const f of t.frequencies) {
                if (f > this._fullXMax) this._fullXMax = f;
            }
            // Capture spectral info from first trace
            if (t.sample_rate_hz && this._sampleRateHz === 0) {
                this._sampleRateHz = t.sample_rate_hz;
            }
            if (t.nyquist_hz && this._nyquistHz === 0) {
                this._nyquistHz = t.nyquist_hz;
            }
            if (t.dominant_peaks && this._dominantPeaks.length === 0) {
                this._dominantPeaks = t.dominant_peaks;
            }
        }
        if (this._fullXMax <= 0) this._fullXMax = 1;

        // Notify external listeners about spectral info
        this.onSpectralInfoUpdate?.({
            sampleRateHz: this._sampleRateHz,
            nyquistHz: this._nyquistHz,
            peaks: this._dominantPeaks,
        });

        const xMin = this._getXMin();
        const xMax = this._getXMax();
        const sc = this._xScale();
        const unit = this._xUnit();
        const rng = useCyclesPerDayFrequencyAxis(xMax)
            ? (xMax - xMin) * 86_400
            : (xMax - xMin) * sc;
        const tickPrec = useCyclesPerDayFrequencyAxis(xMax)
            ? (rng >= 100 ? 1 : 2)
            : (rng >= 100 ? 0 : rng >= 10 ? 1 : rng >= 1 ? 2 : 3);

        const scaleOpts = this._scaleOptions;
        const scaleLabel = scaleModeLabel(scaleOpts.mode, scaleOpts.clip, scaleOpts.clipParam);

        // Build the (pre-scale) raw y values once per trace so the tooltip
        // can still show the underlying magnitude even when the y-axis is
        // stretched. We keep `raw` for tooltip, then compute `display` for
        // the actual chart series.
        const yDisplay: number[][] = [];
        let yMin = Number.POSITIVE_INFINITY;
        let yMax = Number.NEGATIVE_INFINITY;
        const seriesList = traces.map((t, ti) => {
            const raw = mode === 'psd' ? t.psd : t.magnitudes;
            const preLog: number[] = new Array(raw.length);
            for (let i = 0; i < raw.length; i += 1) {
                const r = Number(raw[i]);
                preLog[i] = logScale ? (r > 0 ? Math.log10(r) : -10) : r;
            }
            const scaled = applySpectralScale(preLog, scaleOpts);
            const display = Array.from(scaled.displayValues);
            yDisplay.push(display);
            if (scaled.vmin < yMin) yMin = scaled.vmin;
            if (scaled.vmax > yMax) yMax = scaled.vmax;
            const points: [number, number][] = [];
            for (let i = 0; i < t.frequencies.length; i += 1) {
                const f = t.frequencies[i];
                const y = display[i];
                if (Number.isFinite(f) && Number.isFinite(y)) points.push([f, y]);
            }
            return {
                type: 'line' as const,
                name: t.column,
                color: t.color || FFT_TRACE_COLORS[ti % FFT_TRACE_COLORS.length],
                data: points,
                // Stash on the series object so the tooltip can show the raw
                // magnitude alongside the scaled display value.
                _raw: raw as number[],
                _preLog: preLog,
            } as any;
        });

        const tooltipFormatter = (params: unknown): string => {
            const list = Array.isArray(params) ? params : [params as any];
            if (!list.length) return '';
            const x = Number((list[0] as any)?.value?.[0]);
            const freqLabel = Number.isFinite(x)
                ? (useCyclesPerDayFrequencyAxis(xMax) ? formatCyclesPerDay(x, 2) : formatFrequencyInUnit(x, unit))
                : '';
            const rows = list.map((p: any) => {
                const name = String(p?.seriesName ?? '');
                const y = Number(p?.value?.[1]);
                const idx = p?.dataIndex;
                const seriesObj = p?.series as any;
                const preLog = seriesObj?._preLog as number[] | undefined;
                const raw = seriesObj?._raw as number[] | undefined;
                const yStr = Number.isFinite(y) ? y.toFixed(4) : '';
                const lines = [tooltipRow(name, yStr)];
                if (preLog && Number.isFinite(preLog[idx]) && scaleOpts.mode !== 'none') {
                    lines.push(tooltipRow(' pre-scale', preLog[idx].toFixed(4)));
                }
                if (raw && Number.isFinite(Number(raw[idx]))) {
                    lines.push(tooltipRow(' raw', Number(raw[idx]).toExponential(3)));
                }
                return lines.join('');
            }).join('');
            return freqLabel
                ? tooltipWrap(`${freqLabel}<br>${scaleLabel}`, rows)
                : rows;
        };

        const useScaledY = scaleOpts.mode !== 'none';
        const yMinOut = useScaledY && Number.isFinite(yMin) ? yMin : undefined;
        const yMaxOut = useScaledY && Number.isFinite(yMax) ? yMax : undefined;
        // Adaptive Y-axis precision: 1-2 decimals depending on range so
        // the rotated Y-axis label never crowds the tick labels.
        const yRange = Number.isFinite(yMax) && Number.isFinite(yMin) ? yMax - yMin : 0;
        const yTickPrec = yRange >= 100 ? 0 : yRange >= 10 ? 1 : 2;

        this._chart.setOption({
            grid: FFT_GRID,
            xAxis: {
                type: 'value',
                min: xMin,
                max: xMax,
                name: this._xAxisLabel(),
                nameLocation: 'middle',
                nameGap: 32,
                nameTextStyle: {
                    color: '#cfd9f1',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: [8, 0, 0, 0],
                },
                axisLabel: {
                    color: '#9fb1d1',
                    fontSize: 11,
                    hideOverlap: true,
                    margin: 8,
                    formatter: (v: number) => this._formatXAxisTick(v, tickPrec),
                },
                axisTick: {
                    alignWithLabel: true,
                },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                min: yMinOut,
                max: yMaxOut,
                name: this._logScale
                    ? (useScaledY ? `scaled (${scaleLabel})` : `log10(${this._mode === 'psd' ? 'PSD' : 'Magnitude'})`)
                    : (useScaledY ? `scaled (${scaleLabel})` : this._mode === 'psd' ? 'PSD' : 'Magnitude'),
                nameLocation: 'middle',
                nameGap: 76,
                nameTextStyle: {
                    color: '#cfd9f1',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: [0, 0, 8, 0],
                },
                axisLabel: {
                    color: '#9fb1d1',
                    fontSize: 11,
                    hideOverlap: true,
                    margin: 8,
                    formatter: this._logScale
                        ? (v: number) => this._formatLogAxisTick(v)
                        : (v: number) => v.toFixed(yTickPrec),
                },
                axisTick: {
                    alignWithLabel: true,
                },
                splitLine: { show: false },
            },
            tooltip: { show: true, trigger: 'axis', formatter: tooltipFormatter },
            series: seriesList,
        });
        this._renderOverlay();
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
        this._selectionBox?.dispose?.();
        this._selectionBox = null;
        this._overlayObserver?.disconnect();
        this._overlayObserver = null;
        this._chart?.dispose?.();
        this._chart = null;
    }

    /* ── Annotation overlay canvas ─────────────────────── */

    private _initOverlay(): void {
        const container = this._container;
        if (!container) return;
        const { canvas, observer } = createCanvasOverlay(container, () => this._renderOverlay());
        this._overlayCanvas = canvas;
        this._overlayObserver = observer;
    }

    private _renderOverlay(): void {
        const canvas = this._overlayCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = canvas.width;
        const xMin = this._getXMin();
        const xMax = this._getXMax();
        if (xMax <= xMin) return;
        const unit = this._xUnit();
        const plotL = FFT_GRID.left;
        const plotT = FFT_GRID.top;
        const plotW = w - FFT_GRID.left - FFT_GRID.right;
        const plotH = canvas.height - FFT_GRID.top - FFT_GRID.bottom;
        if (plotW <= 0 || plotH <= 0) return;

        // Draw peak labels if enabled
        if (this._showPeakLabels && this._dominantPeaks.length > 0) {
            this._renderPeakLabels(ctx, xMin, xMax, plotL, plotT, plotW, plotH);
        }

        if (this._annotations.length === 0) return;

        ctx.save();
        ctx.font = '11px Inter, system-ui, sans-serif';
        for (const freqHz of this._annotations) {
            if (freqHz < xMin || freqHz > xMax) continue;
            const ax = plotL + ((freqHz - xMin) / (xMax - xMin)) * plotW;
            ctx.strokeStyle = 'rgba(255,220,80,0.85)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(ax, plotT);
            ctx.lineTo(ax, plotT + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
            const label = formatFrequencyInUnit(freqHz, unit);
            ctx.fillStyle = 'rgba(255,220,80,0.95)';
            ctx.textAlign = ax > w / 2 ? 'right' : 'left';
            ctx.fillText(label, ax + (ax > w / 2 ? -5 : 5), plotT + 14);
        }
        ctx.restore();
    }

    /* ── Box zoom + scroll + click-annotate ────────────── */

    private _initInteractions(): void {
        const container = this._container;
        if (!container) return;

        this._selectionBox = initBoxZoom({
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

    /** Render dominant frequency peak labels on the overlay. */
    private _renderPeakLabels(
        ctx: CanvasRenderingContext2D,
        xMin: number,
        xMax: number,
        plotL: number,
        plotT: number,
        plotW: number,
        plotH: number,
    ): void {
        ctx.save();
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textBaseline = 'middle';

        // Collapse peaks that land in the same visual neighborhood so the
        // left edge of the plot does not turn into an unreadable label stack.
        const peakCandidates: Array<{ peak: FrequencyPeak; ax: number; ay: number }> = [];
        const peaksToShow = this._dominantPeaks.slice(0, 3);
        const rowHeight = 18;
        const labelTop = plotT + 12;

        for (const peak of peaksToShow) {
            const freqHz = peak.frequency_hz;
            if (freqHz < xMin || freqHz > xMax) continue;

            const ax = plotL + ((freqHz - xMin) / (xMax - xMin)) * plotW;

            // Find Y position based on magnitude
            const traceData = this._traces[0];
            if (!traceData) continue;
            const raw = this._mode === 'psd' ? traceData.psd : traceData.magnitudes;
            const freqIdx = traceData.frequencies.findIndex((f) => Math.abs(f - freqHz) < 1e-10);
            if (freqIdx < 0) continue;

            const yVal = this._logScale ? (raw[freqIdx] > 0 ? Math.log10(raw[freqIdx]) : -10) : raw[freqIdx];

            // Calculate Y coordinate (need to get Y range from traces)
            let yMin = Infinity, yMax = -Infinity;
            for (const t of this._traces) {
                const vals = this._mode === 'psd' ? t.psd : t.magnitudes;
                for (const v of vals) {
                    const y = this._logScale ? (v > 0 ? Math.log10(v) : -10) : v;
                    if (y < yMin) yMin = y;
                    if (y > yMax) yMax = y;
                }
            }
            if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) continue;

            const ay = plotT + plotH - ((yVal - yMin) / (yMax - yMin)) * plotH;
            peakCandidates.push({ peak, ax, ay });
        }

        const clusteredPeaks: Array<{ peak: FrequencyPeak; ax: number; ay: number }> = [];
        let previousCandidate: { peak: FrequencyPeak; ax: number; ay: number } | null = null;
        for (const candidate of peakCandidates) {
            const overlapsPrevious = previousCandidate
                && Math.abs(previousCandidate.ax - candidate.ax) < 60
                && Math.abs(previousCandidate.ay - candidate.ay) < 40;
            if (!overlapsPrevious) clusteredPeaks.push(candidate);
            previousCandidate = candidate;
        }

        let rowIndex = 0;
        for (const { peak, ax, ay } of clusteredPeaks.slice(0, 2)) {
            const freqHz = peak.frequency_hz;

            // Draw peak marker
            ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
            ctx.beginPath();
            ctx.arc(ax, ay, 4, 0, Math.PI * 2);
            ctx.fill();

            const alignRight = ax > plotL + plotW / 2;
            const labelX = ax + (alignRight ? -12 : 12);
            const labelY = labelTop + (rowIndex * rowHeight);
            const periodY = labelY + 10;
            const lineEndX = labelX + (alignRight ? -4 : 4);
            rowIndex += 1;

            // Draw a short leader so the label is clearly tied to its peak.
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay - 6);
            ctx.lineTo(lineEndX, labelY);
            ctx.stroke();

            // Draw label
            const label = formatFrequency(freqHz);
            const period = frequencyToPeriod(freqHz);
            const plateWidth = Math.max(ctx.measureText(label).width, ctx.measureText(`(${period})`).width) + 10;
            const plateHeight = 18;
            const plateX = alignRight ? labelX - plateWidth : labelX;
            const plateY = labelY - 8;
            ctx.fillStyle = 'rgba(11, 17, 28, 0.78)';
            ctx.fillRect(plateX, plateY, plateWidth, plateHeight);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.textAlign = alignRight ? 'right' : 'left';
            ctx.fillText(label, labelX, labelY);
            ctx.fillStyle = 'rgba(180, 180, 180, 0.85)';
            ctx.fillText(`(${period})`, labelX, periodY);
        }

        ctx.restore();
    }
}
