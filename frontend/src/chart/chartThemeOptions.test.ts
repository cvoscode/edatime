import { describe, expect, it } from 'vitest';
import { buildChartGpuTheme, withChartGpuTheme } from './chartThemeOptions.js';

describe('chart theme options', () => {
    it('builds a complete ChartGPU theme and preserves option fields on refresh', () => {
        expect(buildChartGpuTheme()).toEqual(expect.objectContaining({ fontSize: 12, fontFamily: expect.any(String), colorPalette: expect.any(Array) }));
        expect(withChartGpuTheme({ animation: false, series: [] })).toEqual(expect.objectContaining({ animation: false, series: [], theme: expect.any(Object), palette: expect.any(Array) }));
    });
});
