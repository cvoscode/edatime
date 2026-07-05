import { describe, expect, it } from 'vitest';

import {
    formatFrequency,
    frequencyToPeriod,
    pickFrequencyAxisUnit,
    pickFrequencyUnit,
} from '../utils/spectralPresets.js';

describe('FFT label helpers', () => {
    it('formats low frequencies without long raw-float labels', () => {
        expect(formatFrequency(0.0004659095)).toBe('465.91 µHz');
        expect(frequencyToPeriod(0.0004659095)).toBe('35.8 min');
    });

    it('uses the same unit picker for FFT and spectrogram axes', () => {
        const maxFrequencyHz = 0.0004659095;
        expect(pickFrequencyAxisUnit(maxFrequencyHz)).toBe('µHz');
        expect(pickFrequencyAxisUnit(maxFrequencyHz)).toBe(pickFrequencyUnit(maxFrequencyHz));
    });
});
