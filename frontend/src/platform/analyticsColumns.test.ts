import { describe, expect, it } from 'vitest';

import {
    getAnalyticsChipColor,
    getDefaultTimeseriesColumns,
    getNumericColumns,
    getEffectiveNumericColumns,
} from './analyticsColumns.js';
import { createCleaningPlanStore } from '../cleaning/store.js';
import { getEffectiveColumns } from '../cleaning/schema.js';

const metadata = (numericColumns: string[], timeColumn = 'timestamp') => ({
    numeric_columns: numericColumns,
    time_column: timeColumn,
}) as any;

describe('analytics page utilities', () => {
    it('follows ordered calculations, column selection, resampling and split labels', () => {
        const store = createCleaningPlanStore();
        store.resetForDataset({ sourceVersionId: 'source', datasetRevision: 1, datasetFingerprint: null, schemaFingerprint: 'schema', timeColumn: 'timestamp' });
        const source = { ...metadata(['a', 'b']), columns: [{ name: 'timestamp', dtype: 'Datetime' }, { name: 'a', dtype: 'Float64' }, { name: 'b', dtype: 'Float64' }] };
        store.addStage({ kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Total', outputColumn: 'total', expression: 'a + b' });
        const resample = store.addStage({ kind: 'resample', executionClass: 'polarsExpression', scope: 'row', enabled: true, sourcePage: 'manual', label: 'Resample', every: '1m', aggregations: [{ column: 'total', method: 'mean' }] });
        store.addStage({ kind: 'chronologicalSplit', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Split', outputColumn: 'split', trainEndMs: 1, validationEndMs: 2, embargoMs: 0 });
        expect(getEffectiveColumns(source, store.getSnapshot()).map((column) => column.name)).toEqual(['timestamp', 'total', 'split']);
        expect(getEffectiveNumericColumns(source, store.getSnapshot())).toEqual(['total']);
        store.setStageEnabled(resample.id, false);
        expect(getEffectiveNumericColumns(source, store.getSnapshot())).toEqual(['a', 'b', 'total']);
        store.addStage({ kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Keep', mode: 'keep', columns: ['timestamp', 'total', 'split'] });
        expect(getEffectiveNumericColumns(source, store.getSnapshot())).toEqual(['total']);
        expect(source.numeric_columns).toEqual(['a', 'b']);
        expect(getEffectiveNumericColumns({ ...source, source_version_id: 'replacement' }, store.getSnapshot())).toEqual(['a', 'b']);
    });
    it('excludes the configured time column and legacy ts column from numeric choices', () => {
        expect(getNumericColumns(metadata(['timestamp', 'ts', 'load', 'temperature']))).toEqual([
            'load',
            'temperature',
        ]);
    });

    it('accepts the backend abbreviated numeric dtypes and its authoritative numeric column list', () => {
        const source = { ...metadata(['a', 'b']), columns: [{ name: 'a', dtype: 'f64' }, { name: 'b', dtype: 'i32' }] };
        expect(getEffectiveNumericColumns(source)).toEqual(['a', 'b']);
    });

    it('uses a caller override before falling back to the stable shared palette', () => {
        expect(getAnalyticsChipColor('load', { load: '#123456' })).toBe('#123456');
        expect(getAnalyticsChipColor('load')).toMatch(/^#/);
        expect(getAnalyticsChipColor('load')).not.toBe(getAnalyticsChipColor('other'));
    });

    it('starts with two features and a likely target for a legible first view', () => {
        expect(getDefaultTimeseriesColumns(metadata(['HUFL', 'HULL', 'MUFL', 'OT']))).toEqual([
            'HUFL',
            'HULL',
            'OT',
        ]);
    });

    it('starts with the first three numeric series when no likely target exists', () => {
        expect(getDefaultTimeseriesColumns(metadata(['a', 'b', 'c', 'd']))).toEqual(['a', 'b', 'c']);
    });

    it('keeps small datasets fully selected', () => {
        expect(getDefaultTimeseriesColumns(metadata(['a', 'b']))).toEqual(['a', 'b']);
    });
});
