import { describe, expect, it } from 'vitest';
import { buildSpectrogramGridModel, getSpectrogramDisplayBounds, getVisibleSpectrogramPoints } from './spectrogramGridModel.js';

describe('spectrogram grid model', () => {
    it('caches raw/log points and reuses the mode/range filtered buffer', () => {
        const model = buildSpectrogramGridModel({ times_ms: [0, 1], frequencies: [1, 2], magnitudes: [[1, 10], [100, Number.NaN]] } as any);
        expect(model.linearPoints).toHaveLength(3);
        expect(getSpectrogramDisplayBounds(model, 'log')).toMatchObject({ min: 0, max: 2 });
        const range = { min: 1, max: 2 };
        const first = getVisibleSpectrogramPoints(model, 'log', range, getSpectrogramDisplayBounds(model, 'log'));
        const second = getVisibleSpectrogramPoints(model, 'log', range, getSpectrogramDisplayBounds(model, 'log'));
        expect(first).toBe(second);
        expect(first).toHaveLength(2);
    });
});
