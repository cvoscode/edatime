import { describe, expect, it } from 'vitest';
import { generatePythonPolars, generateRustPolars } from './codegen.js';
import { createEmptyCleaningPlan } from './store.js';

describe('cleaning code generation', () => {
    it('emits the enabled portable range stages and omits annotations', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({ id: 'range', kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'timeseries', label: 'range', createdAt: 'now', updatedAt: 'now', column: 'value', from: 1, to: 2, mode: 'dropInside' });
        plan.stages.push({ id: 'note', kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true, sourcePage: 'timeseries', label: 'note', createdAt: 'now', updatedAt: 'now' });
        expect(generatePythonPolars(plan)).toContain('pl.col("value")');
        expect(generatePythonPolars(plan)).not.toContain('note');
        expect(generateRustPolars(plan)).toContain('is_null().or');
    });

    it('emits null and non-finite row policies in both portable code targets', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({
            id: 'missing', kind: 'missingValue', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'manual', label: 'Drop missing value rows', createdAt: 'now', updatedAt: 'now',
            column: 'value', dropNulls: true, dropNonFinite: true,
        });

        expect(generatePythonPolars(plan)).toContain('pl.col("value").is_not_null() & pl.col("value").is_finite()');
        expect(generateRustPolars(plan)).toContain('col("value").is_not_null().and(col("value").is_finite())');
    });
});
