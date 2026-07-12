import { describe, expect, it } from 'vitest';
import { COLOR_SCALES, getColorFromScale, paletteForColorScale } from './colorScales.js';

describe('global color scales', () => {
    it('has one canonical palette for every supported scale', () => {
        expect(paletteForColorScale('viridis')).toBe(COLOR_SCALES.viridis);
        expect(paletteForColorScale('unknown')).toBe(COLOR_SCALES.viridis);
    });

    it('interpolates canonical endpoints without changing them', () => {
        expect(getColorFromScale(0, 'plasma')).toBe(COLOR_SCALES.plasma[0]);
        expect(getColorFromScale(1, 'plasma')).toBe(COLOR_SCALES.plasma.at(-1));
    });
});
