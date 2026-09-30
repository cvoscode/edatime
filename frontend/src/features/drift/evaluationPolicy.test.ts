import { describe, expect, it } from 'vitest';
import {
    filterDriftResponsesForEvaluation,
    normalizeDriftEvaluationMode,
    normalizeLatestWindowCount,
} from './evaluationPolicy.js';
import type { DriftResponse } from '../../contracts/api/v1/drift.js';

describe('drift evaluation policy', () => {
    it('normalizes supported evaluation modes and latest window count', () => {
        expect(normalizeDriftEvaluationMode('latest-n')).toBe('latest-n');
        expect(normalizeDriftEvaluationMode('unknown')).toBe('all');
        expect(normalizeLatestWindowCount('2.9')).toBe(2);
        expect(normalizeLatestWindowCount('0')).toBe(1);
        expect(normalizeLatestWindowCount(undefined)).toBe(1);
    });

    it('filters every column with the selected evaluation window policy', () => {
        const response = {
            column: 'value',
            windows: [{ label: 'first' }, { label: 'second' }, { label: 'latest' }],
        } as DriftResponse;
        const filtered = filterDriftResponsesForEvaluation(
            new Map([['value', response]]),
            'latest-n',
            2,
        );

        expect(filtered.get('value')?.windows.map((window) => window.label)).toEqual(['second', 'latest']);
        expect(filtered.get('value')).not.toBe(response);
    });
});
