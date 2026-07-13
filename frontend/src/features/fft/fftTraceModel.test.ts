import { describe, expect, it } from 'vitest';
import { buildFftTrace, resolveFftViewport } from './fftTraceModel.js';

describe('FFT trace model', () => {
    it('prefers workspace viewport and maps a valid FFT result into a chart trace', () => {
        expect(resolveFftViewport({ xMin: 10, xMax: 20 }, 1, 2)).toEqual({ startMs: 10, endMs: 20 });
        expect(buildFftTrace({
            column: 'OT', frequencies: [1], magnitudes: [2], psd: [3], sample_rate_hz: 4, nyquist_hz: 2,
        }, '#abc')).toMatchObject({ column: 'OT', color: '#abc', psd: [3], nyquist_hz: 2 });
    });

    it('rejects an absent or malformed FFT result', () => {
        expect(buildFftTrace(null, '#abc')).toBeNull();
        expect(resolveFftViewport(undefined, null, 2)).toBeNull();
    });
});
