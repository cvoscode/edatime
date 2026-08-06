import { describe, expect, it } from 'vitest';

import {
    classifySamplingState,
    formatSamplingIndicator,
    type SamplingMeta,
} from './samplingIndicator.js';

describe('sampling indicator', () => {
    describe('classifySamplingState', () => {
        it('returns unknown when meta is missing', () => {
            expect(classifySamplingState(null)).toEqual({ kind: 'unknown' });
            expect(classifySamplingState(undefined)).toEqual({ kind: 'unknown' });
        });

        it('returns unknown when downsampleKnown is false', () => {
            const meta: SamplingMeta = { downsampled: false, downsampleKnown: false, returnedRows: 3 };
            expect(classifySamplingState(meta)).toEqual({ kind: 'unknown' });
        });

        it('returns exact with rows when downsampled is false and known', () => {
            const meta: SamplingMeta = { downsampled: false, downsampleKnown: true, returnedRows: 69680, targetPoints: 69680 };
            expect(classifySamplingState(meta)).toEqual({ kind: 'exact', rows: 69680 });
        });

        it('returns exact with rows null when rows are non-finite', () => {
            const meta: SamplingMeta = { downsampled: false, downsampleKnown: true, returnedRows: NaN };
            expect(classifySamplingState(meta)).toEqual({ kind: 'exact', rows: null });
        });

        it('returns downsampled with a ratio when target is finite and positive', () => {
            const meta: SamplingMeta = { downsampled: true, downsampleKnown: true, returnedRows: 2000, targetPoints: 69680 };
            const state = classifySamplingState(meta);
            expect(state).toMatchObject({ kind: 'downsampled', rows: 2000, target: 69680 });
            expect(state.kind === 'downsampled' && state.ratio).toBeCloseTo(2000 / 69680);
        });

        it('returns downsampled with target null when targetPoints is non-finite', () => {
            const meta: SamplingMeta = { downsampled: true, downsampleKnown: true, returnedRows: 2000, targetPoints: NaN };
            expect(classifySamplingState(meta)).toEqual({ kind: 'downsampled', rows: 2000, target: null, ratio: null });
        });
    });

    describe('formatSamplingIndicator', () => {
        it('returns null for unknown state', () => {
            expect(formatSamplingIndicator({ kind: 'unknown' })).toBeNull();
        });

        it('formats exact render with thousands suffix when large', () => {
            const out = formatSamplingIndicator({ kind: 'exact', rows: 69680 });
            expect(out).toEqual({
                label: 'Exact',
                detail: 'Showing 69.7k points',
                level: 'info',
            });
        });

        it('formats exact render with the raw count when small', () => {
            const out = formatSamplingIndicator({ kind: 'exact', rows: 320 });
            expect(out?.detail).toBe('Showing 320 points');
        });

        it('formats downsampled render with both returned and target counts', () => {
            const out = formatSamplingIndicator({ kind: 'downsampled', rows: 2000, target: 69680, ratio: 2000 / 69680 });
            expect(out?.label).toBe('Downsampled');
            expect(out?.level).toBe('warn');
            expect(out?.detail).toBe('Showing 2000 of 69.7k points (approx.)');
        });

        it('falls back to target-only detail when rows are missing', () => {
            const out = formatSamplingIndicator({ kind: 'downsampled', rows: null, target: 69680, ratio: null });
            expect(out?.detail).toBe('Approximated to ~69.7k points');
        });
    });
});
