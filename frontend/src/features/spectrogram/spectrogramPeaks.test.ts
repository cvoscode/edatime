import { describe, expect, it } from 'vitest';
import { buildSpectrogramPeakRows } from './spectrogramPeaks.js';

describe('buildSpectrogramPeakRows', () => {
    it('ranks bins by mean absolute magnitude from the current spectrogram result', () => {
        const peaks = buildSpectrogramPeakRows({
            column: 'value', sample_rate_hz: 1, times_ms: [0, 1], frequencies: [0, 0.25, 0.5],
            magnitudes: [[-2, 6, 1], [2, 2, 5]],
        });
        expect(peaks[0]).toEqual({ frequencyHz: 0.25, meanMagnitude: 4, timePointCount: 2 });
        expect(peaks[1]).toEqual({ frequencyHz: 0.5, meanMagnitude: 3, timePointCount: 2 });
    });

    it('does not count null magnitudes as zero observations', () => {
        expect(buildSpectrogramPeakRows({
            column: 'value', times_ms: [0, 1], frequencies: [0.25], magnitudes: [[10], [null as any]],
        })).toEqual([{ frequencyHz: 0.25, meanMagnitude: 10, timePointCount: 1 }]);
        expect(buildSpectrogramPeakRows({
            column: 'value', times_ms: [0, 1], frequencies: [0.25], magnitudes: [[null as any], [null as any]],
        })).toEqual([]);
    });

    it('skips empty or invalid frequency bins', () => {
        expect(buildSpectrogramPeakRows({
            column: 'value', times_ms: [0], frequencies: [Number.NaN, 0.25], magnitudes: [[null as any, Number.NaN]],
        })).toEqual([]);
    });
});
