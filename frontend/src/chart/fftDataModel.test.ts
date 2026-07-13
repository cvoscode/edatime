import { describe, expect, it } from 'vitest';
import { buildFftDataModel } from './fftDataModel.js';

describe('buildFftDataModel', () => {
    it('builds finite scaled points and preserves raw tooltip values', () => {
        const model = buildFftDataModel([{ column: 'OT', frequencies: [0, 2, Number.NaN], magnitudes: [1, 100, 3], psd: [4, 5, 6], sample_rate_hz: 10, nyquist_hz: 5 }], 'magnitude', true, { mode: 'none', clip: 'none', clipParam: 0 });
        expect(model.fullXMax).toBe(2);
        expect(model.series[0].data).toEqual([[0, 0], [2, 2]]);
        expect(model.series[0]._raw).toEqual([1, 100, 3]);
        expect(model.sampleRateHz).toBe(10);
    });
});
