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

        it('returns unknown when downsample state is unknown and there is no approximation evidence', () => {
            const meta: SamplingMeta = { downsampled: false, downsampleKnown: false, approximationKnown: false, returnedRows: 3 };
            expect(classifySamplingState(meta)).toEqual({ kind: 'unknown' });
        });

        it('returns exact only when both sampling stages are known to be absent', () => {
            const meta: SamplingMeta = {
                downsampled: false, downsampleKnown: true, approximate: false, approximationKnown: true,
                returnedRows: 69680, filteredRows: 69680, candidateRows: 69680, targetPoints: 69680,
            };
            expect(classifySamplingState(meta)).toMatchObject({ kind: 'exact', rows: 69680 });
        });

        it('does not classify an unknown approximation header as exact without complete confirming counts', () => {
            const meta: SamplingMeta = {
                downsampled: false, downsampleKnown: true, approximate: false, approximationKnown: false,
                returnedRows: 4,
            };
            expect(classifySamplingState(meta)).toEqual({ kind: 'unknown' });
        });

        it('infers approximation when candidate rows contradict the downsample flag', () => {
            const meta: SamplingMeta = {
                downsampled: false, downsampleKnown: true, approximate: false, approximationKnown: false,
                samplingAlgorithm: 'envelope-lttb-v1',
                filteredRows: 1000, candidateRows: 4, returnedRows: 4, targetPoints: 100,
                sourceRows: 1000, renderedPoints: 4,
            };
            expect(classifySamplingState(meta)).toMatchObject({
                kind: 'sampled', approximate: true, downsampled: false,
                eligibleRows: 1000, candidateRows: 4, returnedRows: 4,
            });
        });

        it('classifies explicit approximation even when final downsampling is false', () => {
            const meta: SamplingMeta = {
                downsampled: false, downsampleKnown: true, approximate: true, approximationKnown: true,
                filteredRows: 1000, candidateRows: 4, returnedRows: 4, samplingAlgorithm: 'envelope-v1',
            };
            expect(classifySamplingState(meta)).toMatchObject({ kind: 'sampled', approximate: true, downsampled: false });
        });

        it('returns downsampled with a ratio when target is finite and positive', () => {
            const meta: SamplingMeta = {
                downsampled: true, downsampleKnown: true, approximate: false, approximationKnown: true,
                returnedRows: 2000, filteredRows: 69680, candidateRows: 69680, targetPoints: 69680,
            };
            const state = classifySamplingState(meta);
            expect(state).toMatchObject({ kind: 'sampled', eligibleRows: 69680, target: 69680, downsampled: true });
            expect(state.kind === 'sampled' && state.ratio).toBeCloseTo(1);
        });

        it('returns sampled with target null when targetPoints is non-finite', () => {
            const meta: SamplingMeta = {
                downsampled: true, downsampleKnown: true, approximate: false, approximationKnown: true,
                returnedRows: 2000, targetPoints: NaN,
            };
            expect(classifySamplingState(meta)).toMatchObject({
                kind: 'sampled', eligibleRows: 2000, candidateRows: null, returnedRows: 2000,
                target: null, ratio: null,
            });
        });

        it('infers final reduction from candidate and returned counts', () => {
            const state = classifySamplingState({
                downsampled: false, downsampleKnown: true, approximate: false, approximationKnown: true,
                filteredRows: 1000, candidateRows: 10, returnedRows: 4,
            });
            expect(state).toMatchObject({ kind: 'sampled', approximate: true, downsampled: true });
        });
    });

    describe('formatSamplingIndicator', () => {
        it('returns null for unknown state', () => {
            expect(formatSamplingIndicator({ kind: 'unknown' })).toBeNull();
        });

        it('formats exact observations distinctly from plotted points', () => {
            const out = formatSamplingIndicator({
                kind: 'exact', rows: 69680, renderedPoints: 69680,
            });
            expect(out).toEqual({
                label: 'Exact',
                detail: 'Showing 69.7k original observations',
                level: 'info',
            });
        });

        it('formats envelope candidate and returned counts even when final downsampling is false', () => {
            const out = formatSamplingIndicator({
                kind: 'sampled', eligibleRows: 1000, candidateRows: 4, returnedRows: 4,
                target: 100, ratio: 10, algorithm: 'envelope-lttb-v1',
                approximate: true, downsampled: false, renderedPoints: 4,
            });
            expect(out).toEqual({
                label: 'Envelope sample',
                detail: '1000 eligible observations → 4 candidates → 4 returned · 4 rendered · envelope-lttb-v1',
                level: 'warn',
            });
        });

        it('formats a final reduction after an approximate candidate stage', () => {
            const out = formatSamplingIndicator({
                kind: 'sampled', eligibleRows: 1000, candidateRows: 20, returnedRows: 10,
                target: 10, ratio: 100, algorithm: 'envelope-lttb-v1',
                approximate: true, downsampled: true, renderedPoints: 10,
            });
            expect(out?.label).toBe('Approximate + reduced');
            expect(out?.detail).toContain('20 candidates → 10 returned');
            expect(out?.detail).toContain('final reduction');
        });

        it('falls back to target-only detail when counts are missing', () => {
            const out = formatSamplingIndicator({
                kind: 'sampled', eligibleRows: null, candidateRows: null, returnedRows: null,
                target: 69680, ratio: null, algorithm: null, approximate: false, downsampled: true,
            });
            expect(out?.detail).toBe('Target ~69.7k points · final reduction');
        });
    });
});
