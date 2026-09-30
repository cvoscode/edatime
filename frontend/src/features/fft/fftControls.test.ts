import { describe, expect, it } from 'vitest';
import { buildFftFilterCutoffState, buildFftScaleOptions, parseFftDetrend, validateFftFilterCutoffs } from './fftControls.js';

describe('FFT control policy', () => {
    it('normalizes scale controls and exposes only meaningful filter cutoffs', () => {
        expect(buildFftScaleOptions({ mode: 'zscore', clipEnabled: true, clipMethod: 'iqr', clipParam: 'bad' }))
            .toEqual({ mode: 'zscore', clip: 'iqr', clipParam: 0.5 });
        expect(buildFftFilterCutoffState('lowpass')).toMatchObject({ bandVisible: true, low: { disabled: true }, high: { disabled: false } });
        expect(buildFftFilterCutoffState('none')).toMatchObject({ bandVisible: false, low: { disabled: true }, high: { disabled: true } });
    });

    it('rejects cutoffs outside Nyquist and filters that pass everything', () => {
        expect(validateFftFilterCutoffs('lowpass', '', '0.6', 0.5)).toMatchObject({ valid: false });
        expect(validateFftFilterCutoffs('highpass', '0', '', 0.5)).toMatchObject({
            valid: false,
            message: expect.stringContaining('entire spectrum'),
        });
        expect(validateFftFilterCutoffs('bandpass', '0.3', '0.2', 0.5)).toMatchObject({
            valid: false,
            message: expect.stringContaining('below high'),
        });
    });

    it('returns numeric cutoffs for a valid filter', () => {
        expect(validateFftFilterCutoffs('bandpass', '0.1', '0.4', 0.5)).toEqual({
            valid: true,
            message: 'Valid range: 0 to 0.5 Hz.',
            lowHz: 0.1,
            highHz: 0.4,
        });
    });
});

describe('parseFftDetrend', () => {
    it('accepts the contract values', () => {
        expect(parseFftDetrend('none')).toBe('none');
        expect(parseFftDetrend('linear')).toBe('linear');
        expect(parseFftDetrend('constant')).toBe('constant');
    });

    it('falls back to the API default for empty or unknown values', () => {
        expect(parseFftDetrend('')).toBe('constant');
        expect(parseFftDetrend(null)).toBe('constant');
        expect(parseFftDetrend('quadratic')).toBe('constant');
    });
});
