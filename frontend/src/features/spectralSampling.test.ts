import { describe, expect, it } from 'vitest';
import { formatAnalysisSamplingContext, formatSamplingCadence } from './spectralSampling.js';

describe('spectral sampling context', () => {
    it('formats a known source cadence and distinguishes exact from downsampled views', () => {
        expect(formatSamplingCadence(600_000)).toBe('10 min');
        expect(formatAnalysisSamplingContext({
            method: 'exact', input_points: 1_440, output_points: 1_440, aggregation_factor: 1,
            source_cadence_ms: 600_000, effective_cadence_ms: 600_000,
        })).toBe('Exact sampling · 1,440 points · source and effective cadence 10 min');
        expect(formatAnalysisSamplingContext({
            method: 'block_mean', input_points: 100_000, output_points: 50_000, aggregation_factor: 2,
            source_cadence_ms: 600_000, effective_cadence_ms: 1_200_000,
        })).toBe('Block-mean downsampled · 50,000 of 100,000 points · source cadence 10 min · effective cadence 20 min');
    });

    it('states when older responses do not include cadence', () => {
        expect(formatSamplingCadence(null)).toBe('not available');
    });
});
