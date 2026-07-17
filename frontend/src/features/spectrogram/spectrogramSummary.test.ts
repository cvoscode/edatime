import { describe, expect, it } from 'vitest';
import {
    buildSpectrogramSummaryLabel,
    buildSpectrogramSummaryMetrics,
    renderSpectrogramSummary,
} from './spectrogramSummary.js';

const result = {
    column: 'HUFL',
    sample_rate_hz: 2,
    times_ms: [0, 500, 1000],
    frequencies: [1, 2, 3],
    magnitudes: [[1], [2], [3]],
} as any;

describe('spectrogram summary', () => {
    it('derives readable result metrics and accessible context', () => {
        expect(buildSpectrogramSummaryMetrics(result)).toEqual({
            sampleRate: '1 / 0.5 sec',
            nyquist: '1 / 1.0 sec',
            timePoints: '3',
            frequencyBins: '3',
        });
        expect(buildSpectrogramSummaryLabel({
            result,
            windowSize: 96,
            hopSize: 48,
            scaleLabel: 'z-score',
            peakLabel: '2.00 Hz',
        })).toBe('Spectrogram of HUFL · Window 96 · Hop 48 · z-score · Peak 2.00 Hz');
    });

    it('updates structured summary fields and hides them without a result', () => {
        document.body.innerHTML = `
            <div id="summary" hidden>
              <span id="spectrogram-summary-rate"></span>
              <span id="spectrogram-summary-nyquist"></span>
              <span id="spectrogram-summary-points"></span>
              <span id="spectrogram-summary-bins"></span>
            </div>
        `;
        const root = document.getElementById('summary')!;
        renderSpectrogramSummary(root, result);
        expect(root.hidden).toBe(false);
        expect(document.getElementById('spectrogram-summary-rate')?.textContent).toBe('1 / 0.5 sec');
        expect(document.getElementById('spectrogram-summary-bins')?.textContent).toBe('3');

        renderSpectrogramSummary(root, null);
        expect(root.hidden).toBe(true);
    });

    it('uses the original sample cadence rather than STFT hop spacing', () => {
        const ettm2 = {
            ...result,
            sample_rate_hz: 1 / (15 * 60),
            times_ms: [0, 43_200_000, 86_400_000],
        };
        expect(buildSpectrogramSummaryMetrics(ettm2)).toMatchObject({
            sampleRate: '1 / 15.0 min',
            nyquist: '1 / 30.0 min',
        });
    });
});
