import { describe, expect, it } from 'vitest';
import { buildFftFilterRequest } from './fftFilterRequest.js';

describe('FFT filter request', () => {
    it('serializes a finite viewport and optional cutoff values', () => {
        const request = buildFftFilterRequest({
            startMs: 0, endMs: 1000, column: 'OT', filterType: 'bandpass', lowHz: 0.1, highHz: undefined,
        });

        expect(request?.get('column')).toBe('OT');
        expect(request?.get('filter_type')).toBe('bandpass');
        expect(request?.get('low_hz')).toBe('0.1');
        expect(request?.has('high_hz')).toBe(false);
    });

    it('rejects absent or non-finite viewport values', () => {
        expect(buildFftFilterRequest({ startMs: null, endMs: 1, column: 'OT', filterType: 'lowpass' })).toBeNull();
    });
});
