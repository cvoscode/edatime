import { describe, expect, it } from 'vitest';
import { buildSpectrogramChartOptions } from './spectrogramChartOptions.js';

describe('spectrogram chart options', () => {
    it('builds the heatmap, shared palette, and compact axis presentation', () => {
        const points = [[0, 0, 0.5, 7]] as any;
        const { option, formatFrequency } = buildSpectrogramChartOptions({
            result: {
                column: 'HUFL',
                times_ms: [1_700_000_000_000, 1_700_000_060_000],
                frequencies: [0.0001, 0.0003],
                magnitudes: [[7, 8], [9, 10]],
            } as any,
            points,
            bounds: { min: -2, max: 3 },
            logScale: true,
            scaleLabel: 'z-score',
            palette: ['#111111', '#eeeeee'],
        });
        const chart = option as any;

        expect(chart.grid).toMatchObject({ left: 104, top: 36, bottom: 88 });
        expect(chart.visualMap).toMatchObject({ min: -2, max: 3, inRange: { color: ['#111111', '#eeeeee'] } });
        expect(chart.series[0]).toMatchObject({ type: 'heatmap', progressive: 4000, data: points });
        expect(chart.yAxis.name).toBe('Frequency (µHz)');
        expect(chart.xAxis.axisLabel.formatter(1_700_000_000_000)).toMatch(/^\d{2}:\d{2}$/);
        expect(formatFrequency(0.0003)).toBe('300.00 µHz');
    });

    it('formats a tooltip from the compact point payload', () => {
        const { option } = buildSpectrogramChartOptions({
            result: {
                column: 'HUFL',
                times_ms: [1_700_000_000_000],
                frequencies: [0.0003],
                magnitudes: [[7]],
            } as any,
            points: [[0, 0, 0.5, 7]],
            bounds: { min: 0, max: 1 },
            logScale: false,
            scaleLabel: 'min-max [0,1]',
            palette: ['#111111'],
        });
        const tooltip = (option as any).tooltip.formatter({ value: [0, 0, 0.5, 7] });

        expect(tooltip).toContain('Frequency: 300.00 µHz');
        expect(tooltip).toContain('Intensity: 0.5000 (min-max [0,1])');
        expect(tooltip).toContain('Raw magnitude: 7.0000e+0');
    });
});
