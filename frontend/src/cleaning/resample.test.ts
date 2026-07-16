import { describe, expect, it } from 'vitest';

import { createEmptyCleaningPlan } from './store.js';
import { hasAscendingTimeSortBefore, normalizeFixedDuration, parseResampleAggregations } from './resample.js';

describe('resampling contract helpers', () => {
    it('accepts only positive fixed durations', () => {
        expect(normalizeFixedDuration(' 15m ')).toBe('15m');
        expect(normalizeFixedDuration('0m')).toBeNull();
        expect(normalizeFixedDuration('1d')).toBeNull();
        expect(normalizeFixedDuration('1mo')).toBeNull();
        expect(normalizeFixedDuration('-1h')).toBeNull();
    });

    it('parses explicit unique non-time aggregations', () => {
        expect(parseResampleAggregations(' value:mean, volume:sum ', 'ts')).toEqual([
            { column: 'value', method: 'mean' },
            { column: 'volume', method: 'sum' },
        ]);
        expect(parseResampleAggregations('value:mean, value:max', 'ts')).toBeNull();
        expect(parseResampleAggregations('ts:last', 'ts')).toBeNull();
        expect(parseResampleAggregations('value:median', 'ts')).toBeNull();
    });

    it('uses the latest earlier enabled sort as the ordering contract', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({ id: 'sort', kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'sort', createdAt: 'now', updatedAt: 'now', columns: ['ts'], descending: false, nullsLast: true });
        expect(hasAscendingTimeSortBefore(plan)).toBe(true);
        plan.stages.push({ id: 'later-sort', kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'sort', createdAt: 'now', updatedAt: 'now', columns: ['value'], descending: false, nullsLast: true });
        expect(hasAscendingTimeSortBefore(plan)).toBe(false);
    });
});
