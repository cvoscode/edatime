import { describe, expect, it } from 'vitest';
import { resolveSpectrogramHopSize, resolveSpectrogramWindowSize } from './spectrogramControls.js';

describe('spectrogram controls', () => {
    it('clamps custom window and hop values to valid bounds', () => {
        expect(resolveSpectrogramWindowSize('custom', '9000')).toBe(4096);
        expect(resolveSpectrogramWindowSize('bad', '')).toBe(96);
        expect(resolveSpectrogramHopSize('custom', '0', 128)).toBe(1);
        expect(resolveSpectrogramHopSize('custom', '999', 128)).toBe(128);
    });

    it('resolves fractional hop presets against the selected window', () => {
        expect(resolveSpectrogramHopSize('0.25', null, 96)).toBe(24);
        expect(resolveSpectrogramHopSize('invalid', null, 96)).toBe(48);
    });
});
