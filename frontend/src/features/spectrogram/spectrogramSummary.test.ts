import { describe, expect, it } from 'vitest';
import {
    buildSpectrogramSummaryLabel,
    buildSpectrogramSummaryMetrics,
    renderSpectrogramSummary,
} from './spectrogramSummary.js';

const result = {
    column: 'HUFL',
    times_ms: [0, 500, 1000],
    frequencies: [1, 2, 3],
    magnitudes: [[1], [2], [3]],
} as any;

describe('spectrogram summary', () => {
    it('derives readable result metrics and accessible context', () => {
        expect(buildSpectrogramSummaryMetrics(result)).toEqual({
            sampleRate: '2.00 Hz',
            nyquist: '1.00 Hz',
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
        expect(document.getElementById('spectrogram-summary-rate')?.textContent).toBe('2.00 Hz');
        expect(document.getElementById('spectrogram-summary-bins')?.textContent).toBe('3');

        renderSpectrogramSummary(root, null);
        expect(root.hidden).toBe(true);
    });
});
