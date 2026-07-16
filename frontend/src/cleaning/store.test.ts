import { describe, expect, it } from 'vitest';

import { compileCleaningPlanForLegacyFilters } from './compiler.js';
import { hashCleaningPlan } from './planHash.js';
import { createCleaningPlanStore } from './store.js';

function memoryStorage() {
    const entries = new Map<string, string>();
    return {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => { entries.set(key, value); },
        removeItem: (key: string) => { entries.delete(key); },
        keys: () => [...entries.keys()],
    };
}

const identity = {
    sourceVersionId: 'source-1',
    datasetRevision: 7,
    datasetFingerprint: 'dataset-fingerprint',
    schemaFingerprint: 'schema-fingerprint',
    timeColumn: 'ts',
    sourceName: 'fixture.parquet',
};

function setupPlan() {
    const store = createCleaningPlanStore();
    store.resetForDataset({
        sourceVersionId: 'source-1',
        datasetRevision: 7,
        datasetFingerprint: 'dataset-fingerprint',
        schemaFingerprint: 'schema-fingerprint',
        timeColumn: 'ts',
        sourceName: 'fixture.parquet',
    });
    return store;
}

describe('cleaning plan store', () => {
    it('appends stages from different pages in authored order and leaves the baseline unchanged', () => {
        const store = setupPlan();
        const time = store.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Keep training range', startMs: 100, endMs: 200, mode: 'keepInside',
        });
        const value = store.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'scatter', label: 'Keep values', column: 'value', from: 1, to: 5, mode: 'keepInside',
        });

        const plan = store.getSnapshot()!;
        expect(plan.sourceVersionId).toBe('source-1');
        expect(plan.stages.map((stage) => stage.id)).toEqual([time.id, value.id]);

        store.reorderStage(value.id, 0);
        expect(store.getSnapshot()!.stages.map((stage) => stage.id)).toEqual([value.id, time.id]);
        expect(store.getSnapshot()!.sourceVersionId).toBe('source-1');
    });

    it('changes the semantic hash only for enabled executable behavior', () => {
        const store = setupPlan();
        const stage = store.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Initial label', column: 'value', from: -0, to: 4, mode: 'keepInside',
        });
        const first = hashCleaningPlan(store.getSnapshot()!);

        store.updateStage(stage.id, { label: 'Renamed stage', note: 'audit note' });
        expect(hashCleaningPlan(store.getSnapshot()!)).toBe(first);

        store.setStageEnabled(stage.id, false);
        expect(hashCleaningPlan(store.getSnapshot()!)).not.toBe(first);
    });

    it('notifies with immutable snapshots', () => {
        const store = setupPlan();
        const received: number[] = [];
        store.subscribe((plan) => {
            if (plan) received.push(plan.stages.length);
        });

        store.addStage({
            kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true,
            sourcePage: 'drift', label: 'Investigate this period', severity: 'warning',
        });
        const snapshot = store.getSnapshot()!;
        snapshot.stages.length = 0;

        expect(received).toEqual([1]);
        expect(store.getSnapshot()!.stages).toHaveLength(1);
    });

    it('undoes and redoes stage mutations without crossing a dataset reset boundary', () => {
        const store = setupPlan();
        expect(store.isDirty()).toBe(false);
        const stage = store.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Window', startMs: 1, endMs: 2, mode: 'keepInside',
        });

        expect(store.canUndo()).toBe(true);
        expect(store.isDirty()).toBe(true);
        expect(store.undo()).toBe(true);
        expect(store.getSnapshot()!.stages).toEqual([]);
        expect(store.isDirty()).toBe(false);
        expect(store.canRedo()).toBe(true);
        expect(store.redo()).toBe(true);
        expect(store.getSnapshot()!.stages.map((item) => item.id)).toEqual([stage.id]);
        expect(store.isDirty()).toBe(true);

        store.resetForDataset({
            sourceVersionId: 'source-2', datasetRevision: 8, datasetFingerprint: 'data-2', schemaFingerprint: 'schema-2', timeColumn: 'ts',
        });
        expect(store.canUndo()).toBe(false);
        expect(store.canRedo()).toBe(false);
        expect(store.isDirty()).toBe(false);
    });

    it('treats an imported plan as unmaterialized until the dataset baseline changes', () => {
        const store = setupPlan();
        const imported = { ...store.getSnapshot()!, id: 'imported-plan', planRevision: 4 };

        store.setPlan(imported);

        expect(store.isDirty()).toBe(true);
        store.resetForDataset({
            sourceVersionId: 'source-2', datasetRevision: 8, datasetFingerprint: 'data-2', schemaFingerprint: 'schema-2', timeColumn: 'ts',
        });
        expect(store.isDirty()).toBe(false);
    });

    it('restores an autosaved draft only for the identical dataset identity', () => {
        const storage = memoryStorage();
        const writer = createCleaningPlanStore({ draftStorage: storage });
        writer.resetForDataset(identity);
        writer.addStage({
            kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true,
            sourcePage: 'drift', label: 'Keep this investigation note', severity: 'warning',
        });
        expect(storage.keys()).toHaveLength(1);

        const reloaded = createCleaningPlanStore({ draftStorage: storage });
        const restored = reloaded.resetForDataset(identity);
        expect(restored.stages).toHaveLength(1);
        expect(reloaded.isDirty()).toBe(true);

        const other = reloaded.resetForDataset({ ...identity, sourceVersionId: 'source-2' });
        expect(other.stages).toEqual([]);
        expect(reloaded.isDirty()).toBe(false);
    });

    it('drops an autosaved draft when undo returns to the source baseline', () => {
        const storage = memoryStorage();
        const store = createCleaningPlanStore({ draftStorage: storage });
        store.resetForDataset(identity);
        store.addStage({
            kind: 'annotation', executionClass: 'annotation', scope: 'annotation', enabled: true,
            sourcePage: 'drift', label: 'Temporary note', severity: 'warning',
        });
        expect(storage.keys()).toHaveLength(1);

        store.undo();
        expect(store.isDirty()).toBe(false);
        expect(storage.keys()).toEqual([]);
    });

    it('rejects imported plans that target another source instead of silently rebinding them', () => {
        const store = setupPlan();
        const foreign = { ...store.getSnapshot()!, sourceVersionId: 'source-elsewhere' };
        expect(() => store.setPlan(foreign)).toThrow(/active dataset identity/);
    });
});

describe('legacy cleaning-plan compiler', () => {
    it('lowers the portable intersection without silently dropping stages', () => {
        const store = setupPlan();
        store.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'First window', startMs: 200, endMs: 100, mode: 'keepInside',
        });
        store.addStage({
            kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'drift', label: 'Second window', startMs: 150, endMs: 250, mode: 'keepInside',
        });
        store.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'scatter', label: 'Value range', column: 'value', from: 5, to: 1, mode: 'keepInside',
        });
        store.addStage({
            kind: 'adaptiveLine', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'timeseries', label: 'Adaptive line', column: 'value', x1Ms: 1, y1: 2, x2Ms: 3, y2: 4,
            keepAbove: true, applyWithinSegmentOnly: true,
        });

        const compiled = compileCleaningPlanForLegacyFilters(store.getSnapshot()!);
        expect(compiled.start).toBe(150);
        expect(compiled.end).toBe(200);
        expect(compiled.filters).toEqual([{ column: 'value', from: 1, to: 5 }]);
        expect(compiled.lineFilters).toEqual([{ column: 'value', x1: 1, y1: 2, x2: 3, y2: 4, keepAbove: true }]);
        expect(compiled.unsupportedForLegacyFilters).toEqual([]);
    });

    it('requires a plan-aware endpoint when the legacy wire contract cannot preserve a stage', () => {
        const store = setupPlan();
        const stage = store.addStage({
            kind: 'columnRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
            sourcePage: 'scatter', label: 'Drop outliers', column: 'value', from: 1, to: 5, mode: 'dropInside',
        });

        const compiled = compileCleaningPlanForLegacyFilters(store.getSnapshot()!);
        expect(compiled.unsupportedForLegacyFilters.map((entry) => entry.id)).toEqual([stage.id]);
        expect(compiled.filters).toEqual([]);
    });
});
