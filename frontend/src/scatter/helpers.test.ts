/**
 * Tests for frontend/src/scatter/helpers.ts
 *
 * Validates scatter-page utilities: color palettes, gradient sampling,
 * hex/RGB conversion, and computation helpers.
 */
import { describe, it, expect } from 'vitest';
import {
    paletteForScale,
    hexToRgb,
    rgbToHex,
    sampleGradient,
    computeColorExtent,
    MATRIX_POINT_LIMIT,
    MATRIX_MAX_COLUMNS,
    HISTOGRAM_BINS,
    LOW_CARDINALITY_LIMIT,
} from './helpers';

describe('scatter constants', () => {
    it('defines sensible limits', () => {
        expect(MATRIX_POINT_LIMIT).toBeGreaterThan(0);
        expect(MATRIX_MAX_COLUMNS).toBeGreaterThan(0);
        expect(HISTOGRAM_BINS).toBeGreaterThan(0);
        expect(LOW_CARDINALITY_LIMIT).toBeGreaterThan(0);
    });
});

describe('paletteForScale', () => {
    it('returns viridis palette by default', () => {
        const colors = paletteForScale('viridis');
        expect(colors.length).toBeGreaterThanOrEqual(6);
        expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('returns plasma palette', () => {
        const colors = paletteForScale('plasma');
        expect(colors[0]).toBe('#0d0887');
    });

    it('returns inferno palette', () => {
        const colors = paletteForScale('inferno');
        expect(colors[0]).toBe('#000004');
    });
});

describe('hexToRgb', () => {
    it('converts 6-digit hex to rgb', () => {
        expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
        expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
        expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('handles 3-digit hex', () => {
        expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('handles hex without hash', () => {
        expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });
});

describe('rgbToHex', () => {
    it('converts rgb to hex', () => {
        expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
        expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
    });

    it('clamps values to 0-255', () => {
        expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe('#ff0080');
    });

    it('rounds fractional values', () => {
        expect(rgbToHex({ r: 127.6, g: 0, b: 0 })).toBe('#800000');
    });
});

describe('sampleGradient', () => {
    const stops = ['#000000', '#ffffff'];

    it('returns first color at t=0', () => {
        expect(sampleGradient(stops, 0)).toBe('#000000');
    });

    it('returns last color at t=1', () => {
        expect(sampleGradient(stops, 1)).toBe('#ffffff');
    });

    it('interpolates at t=0.5', () => {
        const mid = sampleGradient(stops, 0.5);
        // Should be approximately #808080
        const rgb = hexToRgb(mid);
        expect(rgb.r).toBeGreaterThan(120);
        expect(rgb.r).toBeLessThan(136);
    });

    it('clamps values outside [0,1]', () => {
        expect(sampleGradient(stops, -1)).toBe('#000000');
        expect(sampleGradient(stops, 2)).toBe('#ffffff');
    });

    it('handles single-stop palette', () => {
        expect(sampleGradient(['#ff0000'], 0.5)).toBe('#ff0000');
    });

    it('handles empty palette', () => {
        const result = sampleGradient([], 0.5);
        expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe('computeColorExtent', () => {
    it('computes min/max from numeric array', () => {
        expect(computeColorExtent([1, 5, 3, 8, 2])).toEqual({ min: 1, max: 8 });
    });

    it('returns null for null input', () => {
        expect(computeColorExtent(null)).toBeNull();
    });

    it('returns null for all-NaN values', () => {
        expect(computeColorExtent([NaN, NaN])).toBeNull();
    });

    it('skips NaN values', () => {
        expect(computeColorExtent([NaN, 3, NaN, 7, NaN])).toEqual({ min: 3, max: 7 });
    });
});
