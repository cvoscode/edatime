import type { SpectrogramResult } from '../../services/api/index.js';
import { formatFrequencyInUnit, pickFrequencyAxisUnit } from '../../utils/spectralPresets.js';
import { formatSpectrogramTime } from './spectrogramAnalysis.js';
import type { SpectrogramPoint, SpectrogramValueRange } from './spectrogramPointFilter.js';

export interface SpectrogramChartOptionsInput {
    result: SpectrogramResult;
    points: SpectrogramPoint[];
    bounds: SpectrogramValueRange;
    logScale: boolean;
    scaleLabel: string;
    palette: readonly string[];
}

export interface SpectrogramChartOptionsModel {
    option: Record<string, unknown>;
    formatFrequency: (value: number) => string;
}

/**
 * Builds the pure ECharts view model for a computed spectrogram.
 *
 * Page runtime code owns fetching, grid/cache selection, colorbar behavior,
 * and summary DOM updates. This module owns only the chart presentation
 * contract so it can be characterized without initializing ECharts.
 */
export function buildSpectrogramChartOptions({
    result,
    points,
    bounds,
    logScale,
    scaleLabel,
    palette,
}: SpectrogramChartOptionsInput): SpectrogramChartOptionsModel {
    const timeAxis = result.times_ms;
    const frequencyAxis = result.frequencies;
    const xTickInterval = Math.max(0, Math.ceil(timeAxis.length / 8) - 1);
    const yTickInterval = Math.max(0, Math.floor(frequencyAxis.length / 10) - 1);
    const maxFrequency = frequencyAxis.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
    const frequencyUnit = pickFrequencyAxisUnit(maxFrequency);
    const formatFrequency = (value: number) => formatFrequencyInUnit(value, frequencyUnit);
    const totalSpanMs = Math.max(0, Number(timeAxis[timeAxis.length - 1] ?? 0) - Number(timeAxis[0] ?? 0));

    return {
        formatFrequency,
        option: {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 104, right: 40, top: 36, bottom: 88 },
            toolbox: {
                right: 12,
                feature: {
                    restore: { title: 'Reset zoom' },
                    saveAsImage: { title: 'Save image' },
                },
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(8, 12, 20, 0.94)',
                borderColor: 'rgba(126, 158, 212, 0.28)',
                textStyle: { color: '#eef4ff' },
                formatter: (params: { value?: number[] }) => {
                    const value = params?.value || [];
                    const xIndex = Number(value[0]);
                    const yIndex = Number(value[1]);
                    const displayMagnitude = Number(value[2]);
                    const rawMagnitude = Number(value[3]);
                    const timeMs = Number(timeAxis[xIndex]);
                    const frequency = Number(frequencyAxis[yIndex]);
                    return [
                        `<strong>${result.column || 'Spectrogram'}</strong>`,
                        `Time: ${formatSpectrogramTime(timeMs)}`,
                        `Frequency: ${formatFrequency(frequency)}`,
                        `Intensity: ${displayMagnitude.toFixed(4)}${logScale ? ' log10' : ` (${scaleLabel})`}`,
                        `Raw magnitude: ${rawMagnitude.toExponential(4)}`,
                    ].join('<br>');
                },
            },
            xAxis: {
                type: 'category',
                data: timeAxis,
                name: 'Time',
                nameLocation: 'middle',
                nameGap: 48,
                axisLabel: {
                    color: '#9fb1d1',
                    hideOverlap: true,
                    rotate: totalSpanMs > 48 * 60 * 60_000 ? 0 : 15,
                    interval: xTickInterval,
                    formatter: (value: string | number) => {
                        const date = new Date(Number(value));
                        if (totalSpanMs > 48 * 60 * 60_000) {
                            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
                        }
                        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    },
                },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'category',
                data: frequencyAxis,
                name: `Frequency (${frequencyUnit})`,
                nameLocation: 'middle',
                nameGap: 84,
                axisLabel: {
                    color: '#9fb1d1',
                    hideOverlap: true,
                    interval: yTickInterval,
                    formatter: (value: string | number) => formatFrequency(Number(value)),
                },
                splitLine: { show: false },
            },
            visualMap: {
                show: false,
                min: bounds.min,
                max: bounds.max,
                calculable: false,
                inRange: { color: [...palette] },
            },
            dataZoom: [
                {
                    type: 'inside', xAxisIndex: 0, filterMode: 'none',
                    zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
                },
                {
                    type: 'inside', yAxisIndex: 0, filterMode: 'none',
                    zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
                },
            ],
            series: [{
                name: result.column,
                type: 'heatmap',
                progressive: 4000,
                progressiveThreshold: 8000,
                emphasis: { itemStyle: { borderColor: '#ffffff', borderWidth: 1 } },
                data: points,
            }],
        },
    };
}
