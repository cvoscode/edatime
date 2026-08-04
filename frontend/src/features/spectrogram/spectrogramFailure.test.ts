import { describe, expect, it } from 'vitest';
import { describeSpectrogramFailure } from './spectrogramFailure.js';

describe('spectrogram failure guidance', () => {
    it('points input-budget failures to the persisted sample-limit setting', () => {
        const error = Object.assign(new Error(
            'spectrogram input points exceeds the configured work budget: estimated=65536, limit=16384',
        ), { code: 'work_budget_exceeded' });

        expect(describeSpectrogramFailure(error)).toContain('Settings → Analytics');
        expect(describeSpectrogramFailure(error)).toContain('Spectrogram sample limit');
    });

    it('points output-cell failures to Hop', () => {
        const error = Object.assign(new Error(
            'spectrogram output cells exceeds the configured work budget',
        ), { code: 'work_budget_exceeded' });

        expect(describeSpectrogramFailure(error)).toContain('Increase Hop');
        expect(describeSpectrogramFailure(error)).toContain('50% or 75%');
    });
});
