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

    it('distinguishes the record-length trend bin from periodic peaks', () => {
        const info = buildFftSpectralInfo([{
            column: 'OT', frequencies: [1 / 1_000_000, 2 / 1_000_000], magnitudes: [], psd: [],
            sample_rate_hz: 1 / 900, nyquist_hz: 1 / 1800,
            dominant_peaks: [{ frequency_hz: 1 / 1_000_000, magnitude: 1, power: 12, rank: 1 }],
        }]);

        expect(info.peaks[0]?.rank).toBe('Trend');
        expect(info.peaks[0]?.title).toContain('do not interpret as a stable periodic cycle');
    });
});
