import { describe, expect, it } from 'vitest';
import { buildFftSpectralInfo } from './fftSpectralInfo.js';

describe('FFT spectral information', () => {
    it('projects the first trace with metadata into readable rates and peaks', () => {
        const info = buildFftSpectralInfo([{
            column: 'OT', frequencies: [], magnitudes: [], psd: [], sample_rate_hz: 1 / 3600, nyquist_hz: 1 / 7200,
            dominant_peaks: [{ frequency_hz: 1 / 86400, magnitude: 1, power: 12, rank: 1 }],
        }]);

        expect(info.visible).toBe(true);
        expect(info.sampleRate.text).toContain('hr');
        expect(info.peaks[0]).toMatchObject({ rank: '#1', period: '1.0 days' });
    });
});
