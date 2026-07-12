import { describe, expect, it } from 'vitest';
import { fillVisibleSpectrogramPoints, isSpectrogramColorFilterActive } from './spectrogramPointFilter.js';

describe('spectrogram point filter', () => {
    it('distinguishes full bounds from an active filter and reuses the target buffer', () => {
        expect(isSpectrogramColorFilterActive({ min: 0, max: 10 }, { min: 0, max: 10 })).toBe(false);
        expect(isSpectrogramColorFilterActive({ min: 2, max: 8 }, { min: 0, max: 10 })).toBe(true);
        const target: any[] = [[99, 99, 99, 99]];
        expect(fillVisibleSpectrogramPoints([[0, 0, 1, 1], [1, 0, 5, 5], [2, 0, 9, 9]], target as any, { min: 2, max: 8 })).toBe(target);
        expect(target).toEqual([[1, 0, 5, 5]]);
    });
});
