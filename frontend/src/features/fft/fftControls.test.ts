import { describe, expect, it } from 'vitest';
import { buildFftFilterCutoffState, buildFftScaleOptions } from './fftControls.js';

describe('FFT control policy', () => {
    it('normalizes scale controls and exposes only meaningful filter cutoffs', () => {
        expect(buildFftScaleOptions({ mode: 'zscore', clipEnabled: true, clipMethod: 'iqr', clipParam: 'bad' }))
            .toEqual({ mode: 'zscore', clip: 'iqr', clipParam: 0.5 });
        expect(buildFftFilterCutoffState('lowpass')).toMatchObject({ bandVisible: true, low: { disabled: true }, high: { disabled: false } });
        expect(buildFftFilterCutoffState('none')).toMatchObject({ bandVisible: false, low: { disabled: true }, high: { disabled: true } });
    });
});
