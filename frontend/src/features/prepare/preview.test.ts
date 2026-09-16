import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCleaningPlanStore } from '../../cleaning/store.js';
import type { CleaningPreviewResponse } from '../../cleaning/api.js';

const api = vi.hoisted(() => ({ previewCleaningPlan: vi.fn(), applyCleaningPlan: vi.fn() }));
vi.mock('../../cleaning/api.js', () => api);
import { createPreparationPreview } from './preview.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function setup() {
    const store = createCleaningPlanStore();
    store.resetForDataset({ sourceVersionId: 'source-1', datasetRevision: 3, datasetFingerprint: 'data', schemaFingerprint: 'schema', timeColumn: 'ts' });
    const stage = store.addStage({ kind: 'sort', executionClass: 'polarsExpression', scope: 'order', enabled: true, sourcePage: 'manual', label: 'Sort', columns: ['ts'], descending: false, nullsLast: true });
    const result = {
        sourceVersion: { id: 'source-1' }, datasetRevision: 3, planHash: 'server-hash',
        rowsBefore: 100, rowsAfter: 100, rowsRemoved: 0, columnsBefore: 2, columnsAfter: 2,
        warnings: [], stageImpacts: [],
    } as unknown as CleaningPreviewResponse;
    api.previewCleaningPlan.mockResolvedValue(result);
    const onChange = vi.fn();
    const onApplied = vi.fn();
    const preview = createPreparationPreview({ getPlan: store.getSnapshot, onChange, onApplied });
    return { store, stage, result, onChange, onApplied, preview };
}

describe('Preparation preview approval', () => {
    beforeEach(() => vi.resetAllMocks());

    it('rejects a preview response from a different source or dataset revision', async () => {
        const { preview, result } = setup();
        api.previewCleaningPlan.mockResolvedValueOnce({ ...result, datasetRevision: 4 });
        await preview.preview();
        expect(preview.getState()).toMatchObject({ canApply: false, running: false, result: null });
        expect(preview.getState().message).toContain('dataset changed');
        await preview.materialize();
        expect(api.applyCleaningPlan).not.toHaveBeenCalled();
        await preview.preview();
        expect(preview.getState().canApply).toBe(true);
        preview.dispose();
    });

    it('keeps the latest preview when an aborted older request completes afterward', async () => {
        const { preview, result, stage, store } = setup();
        const older = deferred<CleaningPreviewResponse>();
        const newer = deferred<CleaningPreviewResponse>();
        api.previewCleaningPlan.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
        const first = preview.preview();
        const signal = api.previewCleaningPlan.mock.calls[0]![1].signal as AbortSignal;
        store.updateStage(stage.id, { descending: true });
        const second = preview.preview();
        expect(signal.aborted).toBe(true);
        newer.resolve({ ...result, rowsAfter: 75 });
        await second;
        older.resolve(result);
        await first;
        expect(preview.getState().result?.rowsAfter).toBe(75);
        expect(preview.getState().canApply).toBe(true);
        preview.dispose();
    });

    it('prevents duplicate creation and requires a new preview after a failed apply', async () => {
        const { preview, onApplied } = setup();
        const apply = deferred<never>();
        api.applyCleaningPlan.mockReturnValueOnce(apply.promise);
        await preview.preview();
        const first = preview.materialize();
        await preview.materialize();
        await preview.preview();
        expect(api.applyCleaningPlan).toHaveBeenCalledOnce();
        expect(api.previewCleaningPlan).toHaveBeenCalledOnce();
        expect(preview.getState().canApply).toBe(false);
        apply.reject(new Error('Creation failed'));
        await first;
        expect(preview.getState()).toMatchObject({ applying: false, canApply: false, message: 'Creation failed' });
        expect(onApplied).not.toHaveBeenCalled();
        await preview.preview();
        expect(preview.getState().canApply).toBe(true);
        preview.dispose();
    });

    it('does not turn a baseline or an annotation-only preview into approval', async () => {
        const { preview, stage, store } = setup();
        store.removeStage(stage.id);
        store.addStage({ kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true, sourcePage: 'manual', label: 'Note' });
        await preview.preview();
        expect(preview.getState().result).not.toBeNull();
        expect(preview.getState().canApply).toBe(false);
        await preview.materialize();
        expect(api.applyCleaningPlan).not.toHaveBeenCalled();
        preview.dispose();
    });

    it('aborts preview work on disposal without notifying a removed page', async () => {
        const { preview, result, onChange } = setup();
        const response = deferred<CleaningPreviewResponse>();
        api.previewCleaningPlan.mockReturnValueOnce(response.promise);
        const work = preview.preview();
        const signal = api.previewCleaningPlan.mock.calls[0]![1].signal as AbortSignal;
        preview.dispose();
        const calls = onChange.mock.calls.length;
        response.resolve(result);
        await work;
        expect(signal.aborted).toBe(true);
        expect(onChange).toHaveBeenCalledTimes(calls);
        expect(preview.getState().canApply).toBe(false);
    });
});
