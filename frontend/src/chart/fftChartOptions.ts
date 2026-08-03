import { formatFftTooltip } from './fftTooltipPresentation.js';
import type { FftDataModel } from './fftDataModel.js';
import {
    formatCyclesPerDay,
    formatFrequencyInUnit,
    frequencyUnitScale,
    pickFrequencyUnit,
    useCyclesPerDayFrequencyAxis,
} from '../utils/spectralPresets.js';
import { scaleModeLabel, type SpectralScaleOptions } from '../utils/spectralScaling.js';
import { getChartPalette } from '../utils/theme.js';

const FFT_GRID = { left: 112, right: 32, top: 52, bottom: 52 };

export function buildFftChartOptions(input: {
    model: Pick<FftDataModel, 'series' | 'yMin' | 'yMax'>;
    xMin: number;
    xMax: number;
    mode: string;
    logScale: boolean;
    scaleOptions: SpectralScaleOptions;
}): any {
    const { model, xMin, xMax, mode, logScale, scaleOptions } = input;
    const unit = pickFrequencyUnit(xMax);
    const scale = frequencyUnitScale(unit);
    const cyclesPerDay = useCyclesPerDayFrequencyAxis(xMax);
    const range = cyclesPerDay ? (xMax - xMin) * 86_400 : (xMax - xMin) * scale;
    const tickPrecision = cyclesPerDay
        ? (range >= 100 ? 1 : 2)
        : (range >= 100 ? 0 : range >= 10 ? 1 : range >= 1 ? 2 : 3);
    const scaleLabel = scaleModeLabel(scaleOptions.mode, scaleOptions.clip, scaleOptions.clipParam);
    const useScaledY = scaleOptions.mode !== 'none';
    const yRange = Number.isFinite(model.yMax) && Number.isFinite(model.yMin) ? model.yMax - model.yMin : 0;
    const yTickPrecision = yRange >= 100 ? 0 : yRange >= 10 ? 1 : 2;
    const palette = getChartPalette();

    return {
        grid: FFT_GRID,
        xAxis: {
            type: 'value', min: xMin, max: xMax,
            name: cyclesPerDay ? 'Frequency (cycles/day)' : `Frequency (${unit})`,
            nameLocation: 'middle', nameGap: 32,
            nameTextStyle: { color: palette.text, fontSize: 12, fontWeight: 600, padding: [8, 0, 0, 0] },
            axisLabel: {
                color: palette.textDim, fontSize: 11, hideOverlap: true, margin: 8,
                formatter: (value: number) => cyclesPerDay
                    ? formatCyclesPerDay(value, tickPrecision).replace(/\s+cycles\/day$/, '')
                    : formatFrequencyInUnit(value, unit, tickPrecision).replace(/\s+[A-Za-zµ]+$/, ''),
            },
            axisLine: { lineStyle: { color: palette.borderHi } },
            axisTick: { alignWithLabel: true }, splitLine: { show: false },
        },
        yAxis: {
            type: 'value',
            min: useScaledY && Number.isFinite(model.yMin) ? model.yMin : undefined,
            max: useScaledY && Number.isFinite(model.yMax) ? model.yMax : undefined,
            name: logScale
                ? (useScaledY ? `scaled (${scaleLabel})` : `log10(${mode === 'psd' ? 'PSD' : 'Magnitude'})`)
                : (useScaledY ? `scaled (${scaleLabel})` : mode === 'psd' ? 'PSD' : 'Magnitude'),
            nameLocation: 'middle', nameGap: 76,
            nameTextStyle: { color: palette.text, fontSize: 12, fontWeight: 600, padding: [0, 0, 8, 0] },
            axisLabel: {
                color: palette.textDim, fontSize: 11, hideOverlap: true, margin: 8,
                formatter: logScale ? formatLogAxisTick : (value: number) => value.toFixed(yTickPrecision),
            },
            axisLine: { lineStyle: { color: palette.borderHi } },
            axisTick: { alignWithLabel: true }, splitLine: { show: false },
        },
        tooltip: {
            show: true, trigger: 'axis',
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderHi,
            textStyle: { color: palette.text },
            formatter: (params: unknown) => formatFftTooltip(params, { xMax, unit, scaleMode: scaleOptions.mode, scaleLabel }),
        },
        series: model.series,
    };
}

function formatLogAxisTick(value: number): string {
    const magnitude = 10 ** value;
    if (!Number.isFinite(magnitude) || magnitude <= 0) return '';
    if (magnitude >= 1000 || magnitude < 0.001) return magnitude.toExponential(1).replace('e+', 'e+');
    return Number(magnitude.toPrecision(2)).toString();
}
