import { describe, expect, it } from 'vitest';

import { buildFftChartOptions } from './fftChartOptions.js';

describe('buildFftChartOptions', () => {
    it('keeps scaled bounds and low-frequency axis presentation together', () => {
        const options = buildFftChartOptions({
            model: { series: [], yMin: -2, yMax: 3 },
            xMin: 0,
            xMax: 0.001,
            mode: 'magnitude',
            logScale: true,
            scaleOptions: { mode: 'zscore', clip: 'none', clipParam: 0 },
        });

        expect(options.xAxis.name).toBe('Frequency (cycles/day)');
        expect(options.xAxis.axisLabel.formatter(0.001)).toBe('86.40');
        expect(options.yAxis.min).toBe(-2);
        expect(options.yAxis.max).toBe(3);
        expect(options.yAxis.name).toBe('scaled (z-score → [0,1])');
    });
});
