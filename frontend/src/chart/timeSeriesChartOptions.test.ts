import { describe, expect, it } from 'vitest';
import { buildTimeSeriesChartOptions } from './timeSeriesChartOptions.js';

describe('buildTimeSeriesChartOptions', () => {
    it('builds a static ChartGPU contract around the supplied domain and model', () => {
        const options = buildTimeSeriesChartOptions({
            grid: { left: 10 }, theme: { backgroundColor: '#000' }, palette: ['#fff'],
            xDomain: { min: 1_000, max: 3_000 },
            yAxis: { type: 'value', min: 0, max: 10, tickFormatter: String },
            series: [{ type: 'line', name: 'temperature', data: [[1_000, 1]] }] as any,
            annotations: [],
        });

        expect(options).toMatchObject({ animation: false, legend: { show: false }, xAxis: { min: 1_000, max: 3_000 } });
        expect((options.tooltip as any).formatter([{ seriesName: 'temperature', value: [1_000, 1] }])).toContain('temperature');
    });
});
