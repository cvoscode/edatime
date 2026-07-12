import { describe, expect, it } from 'vitest';
import { computeRobustDisplayBounds, normalizeRobustDisplayRange, suggestRobustDisplayRange } from './yRangePolicy.js';

describe('Y-range policy', () => {
    it('normalizes robust display options into supported bounds', () => {
        expect(normalizeRobustDisplayRange({ mode: 'percentile', param: 99 })).toEqual({ mode: 'percentile', param: 25 });
        expect(normalizeRobustDisplayRange({ mode: 'iqr', param: 0 })).toEqual({ mode: 'iqr', param: 0.1 });
    });

    it('computes percentile and IQR display bounds without mutating values', () => {
        const values = [1, 2, 3, 100];
        expect(computeRobustDisplayBounds(values, { mode: 'percentile', param: 25 })).toEqual({ min: 1.75, max: 27.25 });
        expect(computeRobustDisplayBounds(values, { mode: 'iqr', param: 1.5 })).toEqual({ min: -36.5, max: 65.5 });
    });

    it('suggests clipping only when the raw span is spike-dominated', () => {
        expect(suggestRobustDisplayRange([1, 2, 3, 100], 1, 100)).toEqual({ mode: 'percentile', param: 1 });
        expect(suggestRobustDisplayRange([1, 2, 3, 4], 1, 4)).toBeNull();
    });
});
