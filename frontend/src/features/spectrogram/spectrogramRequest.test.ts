import { describe, expect, it } from 'vitest';
import { buildSpectrogramRequest, SPECTROGRAM_MAX_POINTS } from './spectrogramRequest.js';

describe('spectrogram request', () => {
    const base = {
        column: 'HUFL',
        startMs: 1_700_000_000_000,
        endMs: 1_700_000_060_000,
        windowSize: 320,
        hopSize: 48,
        normalize: 'zscore' as const,
        clipEnabled: true,
        clipMethod: 'iqr' as const,
        clipParam: 0,
    };

    it('preserves resolved values and a finite zero clip parameter', () => {
        expect(buildSpectrogramRequest(base)).toEqual({
            start: '2023-11-14T22:13:20.000Z',
            end: '2023-11-14T22:14:20.000Z',
            column: 'HUFL',
            windowSize: 320,
            hopSize: 48,
            maxPoints: SPECTROGRAM_MAX_POINTS,
            normalize: 'zscore',
            clip: 'iqr',
            clipParam: 0,
        });
    });

    it('disables clipping and normalizes an invalid parameter to the API default', () => {
        expect(buildSpectrogramRequest({ ...base, clipEnabled: false, clipParam: Number.NaN }))
            .toMatchObject({ clip: 'none', clipParam: 0.5 });
    });

    it('uses the configured sample limit when provided', () => {
        expect(buildSpectrogramRequest({ ...base, maxPoints: 16_384 }))
            .toMatchObject({ maxPoints: 16_384 });
    });

    it('does not build a request without a column or finite viewport', () => {
        expect(buildSpectrogramRequest({ ...base, column: '  ' })).toBeNull();
        expect(buildSpectrogramRequest({ ...base, endMs: Number.NaN })).toBeNull();
    });
});
