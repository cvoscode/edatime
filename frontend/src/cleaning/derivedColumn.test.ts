import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDerivedColumn } from './derivedColumn.js';
import { createCleaningPlanStore } from './store.js';
import { validateCleaningPlan } from './api.js';

vi.mock('./api.js', () => ({ validateCleaningPlan: vi.fn() }));
const identity = { sourceVersionId: 'source', datasetRevision: 1, datasetFingerprint: null, schemaFingerprint: 'schema', timeColumn: 'ts' };

describe('calculated columns', () => {
    beforeEach(() => { vi.mocked(validateCleaningPlan).mockReset().mockResolvedValue({} as any); });

    it('validates chained expressions against all earlier stages', async () => {
        const store = createCleaningPlanStore();
        store.resetForDataset(identity);
        await addDerivedColumn(store, 'a + b', 'total', 'timeseries');
        await addDerivedColumn(store, 'total / 2', 'average');
        expect(vi.mocked(validateCleaningPlan).mock.calls[1][0].stages).toMatchObject([
            { expression: 'a + b', outputColumn: 'total' },
            { expression: 'total / 2', outputColumn: 'average' },
        ]);
        expect(store.getSnapshot()?.stages).toHaveLength(2);
    });

    it('keeps the working dataset unchanged when a calculation is invalid', async () => {
        const store = createCleaningPlanStore();
        store.resetForDataset(identity);
        vi.mocked(validateCleaningPlan).mockRejectedValue(new Error('Unknown column: missing'));
        await expect(addDerivedColumn(store, 'missing + 1', 'total')).rejects.toThrow('Unknown column');
        expect(store.getSnapshot()?.stages).toEqual([]);
    });

    it('does not insert a calculation into a dataset selected during validation', async () => {
        const store = createCleaningPlanStore();
        store.resetForDataset(identity);
        let resolve!: (result: any) => void;
        vi.mocked(validateCleaningPlan).mockReturnValue(new Promise((done) => { resolve = done; }));
        const pending = addDerivedColumn(store, 'a + b', 'total');
        store.resetForDataset({ ...identity, sourceVersionId: 'replacement', datasetRevision: 2 });
        resolve({});
        await expect(pending).rejects.toThrow('dataset or pipeline changed');
        expect(store.getSnapshot()?.stages).toEqual([]);
    });
});
