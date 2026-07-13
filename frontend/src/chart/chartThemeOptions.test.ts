import { afterEach, describe, expect, it } from 'vitest';
import { getSeriesPalette, setActiveSeriesPalette } from '../utils/seriesColors.js';
import { buildChartGpuTheme, getChartGpuColorPalette, withChartGpuTheme } from './chartThemeOptions.js';

describe('chart theme options', () => {
    afterEach(() => setActiveSeriesPalette('default'));

    it('builds a complete ChartGPU theme and preserves option fields on refresh', () => {
        expect(buildChartGpuTheme()).toEqual(expect.objectContaining({ fontSize: 12, fontFamily: expect.any(String), colorPalette: expect.any(Array) }));
        expect(withChartGpuTheme({ animation: false, series: [] })).toEqual(expect.objectContaining({ animation: false, series: [], theme: expect.any(Object), palette: expect.any(Array) }));
    });

    it('uses the same active palette as series and fallback renderers', () => {
        setActiveSeriesPalette('ocean');

        expect(getChartGpuColorPalette()).toEqual(getSeriesPalette('ocean'));
    });
});
