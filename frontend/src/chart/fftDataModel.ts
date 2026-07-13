import type { FrequencyPeak } from '../utils/spectralPresets.js';
import { applySpectralScale, type SpectralScaleOptions } from '../utils/spectralScaling.js';
import { SERIES_COLORS } from '../utils/seriesColors.js';

export interface FftTrace {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
    color?: string;
    sample_rate_hz?: number;
    nyquist_hz?: number;
    dominant_peaks?: FrequencyPeak[];
}

export interface FftDataModel {
    fullXMax: number;
    series: FftSeriesModel[];
    yMin: number;
    yMax: number;
    sampleRateHz: number;
    nyquistHz: number;
    dominantPeaks: FrequencyPeak[];
}

export interface FftSeriesModel {
    type: 'line';
    name: string;
    color: string;
    data: Array<[number, number]>;
    _raw: number[];
    _preLog: number[];
}

export function buildFftDataModel(
    traces: readonly FftTrace[],
    mode: string,
    logScale: boolean,
    scaleOptions: SpectralScaleOptions,
): FftDataModel {
    let fullXMax = 0;
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    let sampleRateHz = 0;
    let nyquistHz = 0;
    let dominantPeaks: FrequencyPeak[] = [];
    const series = traces.map((trace, index) => {
        for (const frequency of trace.frequencies) fullXMax = Math.max(fullXMax, Number(frequency) || 0);
        if (!sampleRateHz && trace.sample_rate_hz) sampleRateHz = trace.sample_rate_hz;
        if (!nyquistHz && trace.nyquist_hz) nyquistHz = trace.nyquist_hz;
        if (dominantPeaks.length === 0 && trace.dominant_peaks) dominantPeaks = trace.dominant_peaks;
        const raw = mode === 'psd' ? trace.psd : trace.magnitudes;
        const preLog = raw.map((value) => {
            const numeric = Number(value);
            return logScale ? (numeric > 0 ? Math.log10(numeric) : -10) : numeric;
        });
        const scaled = applySpectralScale(preLog, scaleOptions);
        yMin = Math.min(yMin, scaled.vmin);
        yMax = Math.max(yMax, scaled.vmax);
        const points: [number, number][] = [];
        for (let pointIndex = 0; pointIndex < trace.frequencies.length; pointIndex += 1) {
            const x = Number(trace.frequencies[pointIndex]);
            const y = Number(scaled.displayValues[pointIndex]);
            if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
        }
        return { type: 'line' as const, name: trace.column, color: trace.color || SERIES_COLORS[index % SERIES_COLORS.length], data: points, _raw: raw, _preLog: preLog };
    });
    return { fullXMax: fullXMax > 0 ? fullXMax : 1, series, yMin, yMax, sampleRateHz, nyquistHz, dominantPeaks };
}
