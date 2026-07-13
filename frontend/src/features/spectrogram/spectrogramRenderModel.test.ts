import { describe, expect, it } from 'vitest';
import { createSpectrogramRenderModel } from './spectrogramRenderModel.js';

describe('spectrogram render model', () => {
    const result = {
        column: 'OT',
        times_ms: [0, 1],
        frequencies: [0.1, 0.2],
        magnitudes: [[1, 10], [100, 1000]],
    };

    it('reuses cached grid data while producing chart and colorbar presentation', () => {
        const model = createSpectrogramRenderModel();
        const first = model.build({ result, logRequested: true, allowLogScale: true, scaleLabel: 'raw', palette: ['#000', '#fff'] });
        const second = model.build({ result, logRequested: true, allowLogScale: true, scaleLabel: 'raw', palette: ['#000', '#fff'] });

        expect(first.logScale).toBe(true);
        expect((first.option as any).series[0].data).toHaveLength(4);
        expect(first.bounds).toEqual(second.bounds);
    });
});
