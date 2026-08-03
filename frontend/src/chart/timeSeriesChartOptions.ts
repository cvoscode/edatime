import type { AnnotationConfig, ChartGPUOptions, SeriesConfig } from 'chartgpu';
import { formatTimeTick } from './ticks.js';
import { formatTimeSeriesTooltip } from './timeSeriesTooltip.js';

export interface TimeSeriesChartOptionsInput {
    grid: unknown;
    theme: unknown;
    palette: string[];
    xDomain: { min: number; max: number };
    yAxis: { type: 'value'; min?: number; max?: number; tickFormatter: (value: number) => string };
    series: SeriesConfig[];
    annotations: AnnotationConfig[];
}

export function buildTimeSeriesChartOptions(input: TimeSeriesChartOptionsInput): ChartGPUOptions {
    const { xDomain } = input;
    const spanMs = Math.max(1, xDomain.max - xDomain.min);
    return {
        animation: false,
        grid: input.grid,
        theme: input.theme,
        palette: input.palette,
        xAxis: {
            type: 'time',
            min: xDomain.min,
            max: xDomain.max,
            tickFormatter: (value: number) => formatTimeTick(value, spanMs),
        },
        yAxis: input.yAxis,
        legend: { show: false },
        tooltip: {
            show: true,
            trigger: 'axis',
            formatter: (params: unknown) => formatTimeSeriesTooltip(params, xDomain),
        },
        series: input.series,
        annotations: input.annotations,
    } as ChartGPUOptions;
}
