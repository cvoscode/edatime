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

    it('emits portable schema projection and drop operations', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({
            id: 'select', kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
            sourcePage: 'manual', label: 'Keep model columns', createdAt: 'now', updatedAt: 'now',
            columns: ['ts', 'target'], mode: 'keep',
        });
        plan.stages.push({
            id: 'drop', kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
            sourcePage: 'manual', label: 'Drop metadata', createdAt: 'now', updatedAt: 'now',
            columns: ['metadata'], mode: 'drop',
        });

        expect(generatePythonPolars(plan)).toContain('lf = lf.select([pl.col("ts"), pl.col("target")])');
        expect(generatePythonPolars(plan)).toContain('lf = lf.drop(["metadata"])');
        expect(generateRustPolars(plan)).toContain('lf = lf.select(vec![col("ts"), col("target")]);');
        expect(generateRustPolars(plan)).toContain('lf = lf.drop(by_name(["metadata"], true, false));');
    });

    it('emits a stable ordered sort in both portable targets', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({ id: 'sort', kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'sort', createdAt: 'now', updatedAt: 'now', columns: ['device', 'ts'], descending: true, nullsLast: true });
        expect(generatePythonPolars(plan)).toContain('lf.sort(by=["device", "ts"], descending=True, nulls_last=True, maintain_order=True)');
        expect(generateRustPolars(plan)).toContain('with_order_descending(true).with_nulls_last(true).with_maintain_order(true)');
    });

    it('emits bounded forward null fills in both portable targets', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({ id: 'fill', kind: 'fillNull', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'fill', createdAt: 'now', updatedAt: 'now', columns: ['value'], strategy: 'forward', limit: 2 });
        expect(generatePythonPolars(plan)).toContain('pl.col("value").fill_null(strategy="forward", limit=2)');
        expect(generateRustPolars(plan)).toContain('FillNullStrategy::Forward(Some(2))');
        expect(generatePythonPolars(plan)).toContain('requires an earlier stable sort on the time column');
    });

    it('emits explicit fixed-duration resampling in both portable targets', () => {
        const plan = createEmptyCleaningPlan({ sourceVersionId: 'source-1', datasetRevision: 1, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
        plan.stages.push({ id: 'sort', kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'sort', createdAt: 'now', updatedAt: 'now', columns: ['ts'], descending: false, nullsLast: true });
        plan.stages.push({ id: 'resample', kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'resample', createdAt: 'now', updatedAt: 'now', every: '15m', aggregations: [{ column: 'value', method: 'mean' }, { column: 'volume', method: 'sum' }] });

        expect(generatePythonPolars(plan)).toContain('group_by_dynamic("ts", every="15m", period="15m", closed="left", label="left", start_by="window")');
        expect(generatePythonPolars(plan)).toContain('pl.col("volume").sum().alias("volume")');
        expect(generateRustPolars(plan)).toContain('Duration::try_parse("15m")?');
        expect(generateRustPolars(plan)).toContain('start_by: StartBy::WindowBound');
        expect(generateRustPolars(plan)).toContain('col("value").mean().alias("value")');
    });
});
