import { formatTwoDecimals } from '../formatUtils.js';
import { computeDisplayYRange } from './displayYRangePolicy.js';
import type { GridLayout } from './chartInteractions.js';
import { computeChartGrid } from './gridLayout.js';
import { niceLinearTicks } from './ticks.js';

export interface TimeSeriesAxisPresentationInput {
    userMin: number | null;
    userMax: number | null;
    dataMin: number | null;
    dataMax: number | null;
    robustMin: number | null;
    robustMax: number | null;
    stackFromZero: boolean;
    yAxisLabel: string;
    scale?: number;
}

export interface TimeSeriesYAxisOption {
    type: 'value';
    min?: number;
    max?: number;
    tickFormatter: (value: number) => string;
}

export function buildTimeSeriesAxisPresentation(input: TimeSeriesAxisPresentationInput): {
    yAxis: TimeSeriesYAxisOption;
    grid: GridLayout;
} {
    const yAxis: TimeSeriesYAxisOption = {
        type: 'value',
        tickFormatter: formatTwoDecimals,
    };
    const range = computeDisplayYRange(input);
    if (range) {
        yAxis.min = range.min;
        yAxis.max = range.max;
    }
    const yMin = Number(yAxis.min);
    const yMax = Number(yAxis.max);
    const yTickLabels = Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin
        ? niceLinearTicks(yMin, yMax, 6).map(yAxis.tickFormatter)
        : [formatTwoDecimals(0), formatTwoDecimals(1)];
    return {
        yAxis,
        grid: computeChartGrid({ yTickLabels, yAxisLabel: input.yAxisLabel, scale: input.scale }),
    };
}
