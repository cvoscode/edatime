import { describe, expect, it } from 'vitest';
import { findDominantFrequencyBand, formatSpectrogramTime } from './spectrogramAnalysis.js';

describe('spectrogram analysis', () => {
    it('finds the contiguous dominant frequency band', () => {
        expect(findDominantFrequencyBand({ frequencies: [1, 2, 3, 4], magnitudes: [[1, 8, 7, 1], [1, 8, 6, 1]] } as any)).toEqual({
            lowerIndex: 1, upperIndex: 2, dominantHz: 2,
        });
    });

    it('returns no band for an empty frequency axis and formats valid timestamps', () => {
        expect(findDominantFrequencyBand({ frequencies: [], magnitudes: [] } as any)).toBeNull();
        expect(formatSpectrogramTime(0)).toContain('1970');
    });
});
