// filepath: frontend/src/utils/spectralScaling.test.ts
import { describe, expect, it } from 'vitest';
import {
    applySpectralScale,
    quantileSorted,
    scaleModeLabel,
    type SpectralScaleOptions,
} from './spectralScaling.js';

describe('quantileSorted', () => {
    it('returns exact values for canonical positions on a sorted array', () => {
        const sorted = [1, 2, 3, 4, 5];
        expect(quantileSorted(sorted, 0)).toBe(1);
        expect(quantileSorted(sorted, 0.5)).toBe(3);
        expect(quantileSorted(sorted, 1)).toBe(5);
    });

    it('linearly interpolates between two adjacent values', () => {
        const sorted = [10, 20];
        expect(quantileSorted(sorted, 0.25)).toBeCloseTo(12.5, 6);
        expect(quantileSorted(sorted, 0.75)).toBeCloseTo(17.5, 6);
    });

    it('clamps q to [0, 1]', () => {
        const sorted = [1, 2, 3];
        expect(quantileSorted(sorted, -0.5)).toBe(1);
        expect(quantileSorted(sorted, 1.5)).toBe(3);
    });

    it('returns NaN for empty input', () => {
        expect(quantileSorted([], 0.5)).toBeNaN();
    });
});

describe('applySpectralScale', () => {
    it('returns 0..1 range with minmax normalization', () => {
        const raw = [1, 2, 3, 4, 5];
        const result = applySpectralScale(raw, { mode: 'minmax', clip: 'none', clipParam: 0.5 });
        expect(result.vmin).toBe(0);
        expect(result.vmax).toBe(1);
        expect(result.displayValues[0]).toBe(0);
        expect(result.displayValues[4]).toBe(1);
        expect(result.displayValues[2]).toBeCloseTo(0.5, 6);
    });

    it('mode=none passes clipped values through verbatim', () => {
        const raw = [1, 2, 3, 4, 5];
        const result = applySpectralScale(raw, { mode: 'none', clip: 'none', clipParam: 0.5 });
        expect(result.vmin).toBe(1);
        expect(result.vmax).toBe(5);
        expect(Array.from(result.displayValues)).toEqual([1, 2, 3, 4, 5]);
    });

    it('percentile clip tightens vmin/vmax around the data body', () => {
        // 10 extreme outliers on a long signal so percentile clip has room
        // to bite on each side.
        const raw = [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
            40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
            1000, -1000, 2000, -2000, 3000, -3000, 4000, -4000, 5000, -5000,
        ];
        const unclipped = applySpectralScale(raw, { mode: 'none', clip: 'none', clipParam: 0.5 });
        const clipped = applySpectralScale(raw, { mode: 'none', clip: 'percentile', clipParam: 10 });
        // 10% per tail on 60 samples clips the extreme ±5000/±4000/±3000
        // outliers at least on the high side, pulling clipHigh inside 1000.
        expect(clipped.clipHigh).toBeLessThan(unclipped.clipHigh);
        expect(clipped.clipHigh).toBeLessThan(1000);
        // The 5 extreme outliers above 49 dominate unclipped max, so
        // clipping must shrink the span.
        const tight = applySpectralScale(raw, { mode: 'none', clip: 'percentile', clipParam: 20 });
        expect(tight.clipHigh).toBeLessThan(50);
        expect(tight.clipLow).toBeGreaterThan(0);
    });

    it('IQR clip with k=1.5 matches the standard boxplot rule', () => {
        const raw = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const result = applySpectralScale(raw, { mode: 'none', clip: 'iqr', clipParam: 1.5 });
        // Q1=3, Q3=7, IQR=4 → bounds [3 − 6, 7 + 6] = [-3, 13]
        expect(result.clipLow).toBe(-3);
        expect(result.clipHigh).toBe(13);
    });

    it('robust normalization maps Q1 to 0.25 and Q3 to 0.75', () => {
        const raw = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const result = applySpectralScale(raw, { mode: 'robust', clip: 'none', clipParam: 0.5 });
        expect(result.displayValues[2]).toBeCloseTo(0.25, 6); // Q1
        expect(result.displayValues[6]).toBeCloseTo(0.75, 6); // Q3
    });

    it('zscore normalization collapses to a stable [0, 1] range', () => {
        const raw = [10, 12, 14, 16, 18];
        const result = applySpectralScale(raw, { mode: 'zscore', clip: 'none', clipParam: 0.5 });
        expect(result.vmin).toBe(0);
        expect(result.vmax).toBe(1);
        // Center value should be ~0.5
        expect(result.displayValues[2]).toBeCloseTo(0.5, 6);
    });

    it('preserves non-finite values as NaN in the output', () => {
        const raw = [1, NaN, 3, Infinity, 5];
        const result = applySpectralScale(raw, { mode: 'minmax', clip: 'none', clipParam: 0.5 });
        expect(Number.isNaN(result.displayValues[1])).toBe(true);
        expect(Number.isNaN(result.displayValues[3])).toBe(true);
        expect(result.displayValues[0]).toBe(0);
        expect(result.displayValues[4]).toBe(1);
    });

    it('handles all-non-finite input without throwing', () => {
        const raw = [NaN, Infinity, -Infinity];
        const result = applySpectralScale(raw, { mode: 'minmax', clip: 'none', clipParam: 0.5 });
        expect(result.vmin).toBe(0);
        expect(result.vmax).toBe(1);
        for (const v of result.displayValues) expect(Number.isNaN(v)).toBe(true);
    });

    it('clip + minmax composes so the full dynamic range is used', () => {
        const raw = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1000];
        const result = applySpectralScale(raw, { mode: 'minmax', clip: 'iqr', clipParam: 1.5 });
        // 1000 is a huge outlier; with IQR clip and k=1.5 it should be clipped
        // well before reaching 1000.
        expect(result.clipHigh).toBeLessThan(1000);
        // All surviving values are then stretched into [0, 1].
        expect(result.vmin).toBe(0);
        expect(result.vmax).toBe(1);
    });

    it('degenerate input (all equal) still returns a stable span', () => {
        const raw = [5, 5, 5, 5];
        const result = applySpectralScale(raw, { mode: 'minmax', clip: 'none', clipParam: 0.5 });
        expect(result.vmin).toBe(0);
        expect(result.vmax).toBe(1);
        for (const v of result.displayValues) expect(v).toBe(0.5);
    });
});

describe('scaleModeLabel', () => {
    it('returns "raw" when both mode and clip are none', () => {
        expect(scaleModeLabel('none', 'none', 0.5)).toBe('raw');
    });

    it('describes percentile clipping', () => {
        expect(scaleModeLabel('none', 'percentile', 0.5)).toMatch(/clipped/);
    });

    it('describes IQR clipping', () => {
        expect(scaleModeLabel('none', 'iqr', 1.5)).toMatch(/IQR/);
    });

    it('combines mode + clip', () => {
        const label = scaleModeLabel('minmax', 'percentile', 1);
        expect(label).toContain('min-max');
        expect(label).toContain('clip');
    });
});

describe('default options', () => {
    it('matches the previous look-and-feel (no scaling, no clip)', () => {
        const defaults: SpectralScaleOptions = { mode: 'none', clip: 'none', clipParam: 0.5 };
        const raw = [1, 2, 3];
        const result = applySpectralScale(raw, defaults);
        expect(Array.from(result.displayValues)).toEqual([1, 2, 3]);
        expect(result.vmin).toBe(1);
        expect(result.vmax).toBe(3);
    });
});
