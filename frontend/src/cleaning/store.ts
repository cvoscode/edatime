import { hashCleaningPlan } from './planHash.js';
import type { CleaningDatasetIdentity, CleaningPlan, CleaningStage, CleaningStageInput } from './types.js';

export interface CleaningPlanStore {
    getSnapshot(): CleaningPlan | null;
    subscribe(listener: (plan: CleaningPlan | null) => void): () => void;
    resetForDataset(identity: CleaningDatasetIdentity): CleaningPlan;
    setPlan(plan: CleaningPlan): void;
    addStage(stage: CleaningStageInput, options?: { position?: number }): CleaningStage;
    updateStage(id: string, patch: Partial<CleaningStage>): void;
    removeStage(id: string): void;
    setStageEnabled(id: string, enabled: boolean): void;
    reorderStage(id: string, targetIndex: number): void;
    canUndo(): boolean;
    canRedo(): boolean;
    isDirty(): boolean;
    undo(): boolean;
    redo(): boolean;
    clear(): void;
}

function now(): string {
    return new Date().toISOString();
}

let idSequence = 0;
function newId(prefix: string): string {
    idSequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function touch(plan: CleaningPlan): CleaningPlan {
    return { ...plan, planRevision: plan.planRevision + 1, updatedAt: now() };
}

function validatePlan(plan: CleaningPlan): void {
    if (plan.schemaVersion !== 1) throw new Error(`Unsupported cleaning plan schema version: ${plan.schemaVersion}`);
    if (!plan.sourceVersionId.trim()) throw new Error('Cleaning plan requires a source version ID.');
    if (!Number.isSafeInteger(plan.datasetRevision) || plan.datasetRevision < 0) {
        throw new Error('Cleaning plan requires a non-negative dataset revision.');
    }
    if (!plan.schemaFingerprint.trim()) throw new Error('Cleaning plan requires a schema fingerprint.');
    if (!plan.timeColumn.trim()) throw new Error('Cleaning plan requires a time column.');
    const ids = new Set<string>();
    for (const stage of plan.stages) {
        if (!stage.id.trim() || ids.has(stage.id)) throw new Error('Cleaning plan stage IDs must be unique.');
        ids.add(stage.id);
    }
}

export function createEmptyCleaningPlan(identity: CleaningDatasetIdentity): CleaningPlan {
    const timestamp = now();
    return {
        schemaVersion: 1,
        id: newId('plan'),
        planRevision: 0,
        sourceVersionId: identity.sourceVersionId,
        datasetRevision: identity.datasetRevision,
        datasetFingerprint: identity.datasetFingerprint,
        schemaFingerprint: identity.schemaFingerprint,
        timeColumn: identity.timeColumn,
        sourceName: identity.sourceName ?? null,
        stages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export function createCleaningPlanStore(): CleaningPlanStore {
    let plan: CleaningPlan | null = null;
    let dirty = false;
    type HistoryEntry = { plan: CleaningPlan; dirty: boolean };
    let undoStack: HistoryEntry[] = [];
    let redoStack: HistoryEntry[] = [];
    const listeners = new Set<(plan: CleaningPlan | null) => void>();

    const publish = (): void => {
        const snapshot = plan ? clone(plan) : null;
        for (const listener of listeners) listener(snapshot);
    };
    const requirePlan = (): CleaningPlan => {
        if (!plan) throw new Error('No active cleaning plan. Select a dataset first.');
        return plan;
    };
    const commit = (next: CleaningPlan, recordHistory = true, nextDirty = true): void => {
        validatePlan(next);
        if (recordHistory && plan) {
            undoStack.push({ plan: clone(plan), dirty });
            redoStack = [];
        }
        plan = clone(next);
        dirty = nextDirty;
        publish();
    };

    return {
        getSnapshot: () => plan ? clone(plan) : null,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        resetForDataset(identity) {
            const next = createEmptyCleaningPlan(identity);
            undoStack = [];
            redoStack = [];
            commit(next, false, false);
            return clone(next);
        },
        setPlan(next) {
            validatePlan(next);
            undoStack = [];
            redoStack = [];
            // Imported plans are reproducible inputs, but their stages have
            // not yet been materialized against this active source version.
            commit(next, false, true);
        },
        addStage(input, options) {
            const current = requirePlan();
            const timestamp = now();
            const stage = { ...clone(input), id: newId('stage'), createdAt: timestamp, updatedAt: timestamp } as CleaningStage;
            const stages = [...current.stages];
            const requestedPosition = options?.position;
            const position = Number.isInteger(requestedPosition)
                ? Math.max(0, Math.min(stages.length, requestedPosition!))
                : stages.length;
            stages.splice(position, 0, stage);
            commit(touch({ ...current, stages }));
            return clone(stage);
        },
        updateStage(id, patch) {
            const current = requirePlan();
            const stages = current.stages.map((stage) => stage.id === id
                ? { ...stage, ...clone(patch), id: stage.id, kind: stage.kind, updatedAt: now() } as CleaningStage
                : stage);
            if (stages.every((stage) => stage.id !== id)) throw new Error(`Unknown cleaning stage '${id}'.`);
            commit(touch({ ...current, stages }));
        },
        removeStage(id) {
            const current = requirePlan();
            const stages = current.stages.filter((stage) => stage.id !== id);
            if (stages.length === current.stages.length) throw new Error(`Unknown cleaning stage '${id}'.`);
            commit(touch({ ...current, stages }));
        },
        setStageEnabled(id, enabled) {
            this.updateStage(id, { enabled } as Partial<CleaningStage>);
        },
        reorderStage(id, targetIndex) {
            const current = requirePlan();
            const sourceIndex = current.stages.findIndex((stage) => stage.id === id);
            if (sourceIndex < 0) throw new Error(`Unknown cleaning stage '${id}'.`);
            const stages = [...current.stages];
            const [stage] = stages.splice(sourceIndex, 1);
            stages.splice(Math.max(0, Math.min(stages.length, Math.trunc(targetIndex))), 0, stage);
            commit(touch({ ...current, stages }));
        },
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
        isDirty: () => dirty,
        undo() {
            if (!plan || undoStack.length === 0) return false;
            const previous = undoStack.pop()!;
            redoStack.push({ plan: clone(plan), dirty });
            plan = previous.plan;
            dirty = previous.dirty;
            publish();
            return true;
        },
        redo() {
            if (!plan || redoStack.length === 0) return false;
            const next = redoStack.pop()!;
            undoStack.push({ plan: clone(plan), dirty });
            plan = next.plan;
            dirty = next.dirty;
            publish();
            return true;
        },
        clear() {
            plan = null;
            dirty = false;
            undoStack = [];
            redoStack = [];
            publish();
        },
    };
}

/** Singleton used by page integrations; tests should normally construct a store. */
export const cleaningPlanStore = createCleaningPlanStore();

export function getCleaningPlanHash(): string | null {
    const plan = cleaningPlanStore.getSnapshot();
    return plan ? hashCleaningPlan(plan) : null;
}
