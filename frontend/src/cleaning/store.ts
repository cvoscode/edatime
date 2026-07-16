import { hashCleaningPlan } from './planHash.js';
import type { CleaningDatasetIdentity, CleaningPlan, CleaningStage, CleaningStageInput } from './types.js';

export type CleaningPlanHistoryAction = 'baseline' | 'draftRestored' | 'imported' | 'stageAdded' | 'stageUpdated' | 'stageRemoved' | 'stageReordered' | 'restored';

/** An immutable, dataset-scoped version of the plan shown in the pipeline graph. */
export interface CleaningPlanHistoryEntry {
    id: string;
    action: CleaningPlanHistoryAction;
    createdAt: string;
    dirty: boolean;
    plan: CleaningPlan;
}

export interface CleaningPlanStore {
    getSnapshot(): CleaningPlan | null;
    getHistory(): CleaningPlanHistoryEntry[];
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
    restoreHistoryEntry(id: string): boolean;
    clear(): void;
}

export interface CleaningPlanDraftStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface CleaningPlanStoreOptions {
    /** Optional browser persistence. Test/embedded stores stay in-memory unless supplied. */
    draftStorage?: CleaningPlanDraftStorage | null;
}

const DRAFT_STORAGE_PREFIX = 'edatime-cleaning-draft-v1:';

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

function sameIdentity(plan: CleaningPlan, identity: CleaningDatasetIdentity): boolean {
    return plan.sourceVersionId === identity.sourceVersionId
        && plan.datasetRevision === identity.datasetRevision
        && plan.datasetFingerprint === identity.datasetFingerprint
        && plan.schemaFingerprint === identity.schemaFingerprint
        && plan.timeColumn === identity.timeColumn;
}

function draftKey(identity: CleaningDatasetIdentity): string {
    return DRAFT_STORAGE_PREFIX + [
        identity.sourceVersionId,
        identity.datasetRevision,
        identity.datasetFingerprint,
        identity.schemaFingerprint,
        identity.timeColumn,
    ].map((value) => encodeURIComponent(String(value ?? ''))).join(':');
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

export function createCleaningPlanStore(options: CleaningPlanStoreOptions = {}): CleaningPlanStore {
    let plan: CleaningPlan | null = null;
    let dirty = false;
    let activeDraftKey: string | null = null;
    type HistoryEntry = { plan: CleaningPlan; dirty: boolean };
    let undoStack: HistoryEntry[] = [];
    let redoStack: HistoryEntry[] = [];
    let history: CleaningPlanHistoryEntry[] = [];
    let historyCursor = -1;
    const listeners = new Set<(plan: CleaningPlan | null) => void>();

    const publish = (): void => {
        const snapshot = plan ? clone(plan) : null;
        for (const listener of listeners) listener(snapshot);
    };
    const removeDraft = (): void => {
        if (!activeDraftKey || !options.draftStorage) return;
        try {
            options.draftStorage.removeItem(activeDraftKey);
        } catch {
            // Draft persistence is best effort (private mode/quota may reject it).
        }
    };
    const persistDraft = (): void => {
        if (!activeDraftKey || !options.draftStorage) return;
        if (!plan || !dirty) {
            removeDraft();
            return;
        }
        try {
            options.draftStorage.setItem(activeDraftKey, JSON.stringify(plan));
        } catch {
            // Keep the canonical in-memory plan when persistence is unavailable.
        }
    };
    const loadDraft = (identity: CleaningDatasetIdentity): CleaningPlan | null => {
        if (!activeDraftKey || !options.draftStorage) return null;
        try {
            const raw = options.draftStorage.getItem(activeDraftKey);
            if (!raw) return null;
            const candidate = JSON.parse(raw) as CleaningPlan;
            validatePlan(candidate);
            return sameIdentity(candidate, identity) ? candidate : null;
        } catch {
            return null;
        }
    };
    const requirePlan = (): CleaningPlan => {
        if (!plan) throw new Error('No active cleaning plan. Select a dataset first.');
        return plan;
    };
    const appendHistory = (action: CleaningPlanHistoryAction): void => {
        if (!plan) return;
        history = history.slice(0, historyCursor + 1);
        history.push({ id: newId('revision'), action, createdAt: now(), dirty, plan: clone(plan) });
        historyCursor = history.length - 1;
    };
    const commit = (next: CleaningPlan, recordUndo = true, nextDirty = true, action: CleaningPlanHistoryAction = 'stageUpdated'): void => {
        validatePlan(next);
        if (recordUndo && plan) {
            undoStack.push({ plan: clone(plan), dirty });
            redoStack = [];
        }
        plan = clone(next);
        dirty = nextDirty;
        appendHistory(action);
        persistDraft();
        publish();
    };

    return {
        getSnapshot: () => plan ? clone(plan) : null,
        getHistory: () => history.slice(0, historyCursor + 1).map((entry) => ({ ...entry, plan: clone(entry.plan) })),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        resetForDataset(identity) {
            activeDraftKey = draftKey(identity);
            const restored = loadDraft(identity);
            const next = restored || createEmptyCleaningPlan(identity);
            undoStack = [];
            redoStack = [];
            history = [];
            historyCursor = -1;
            commit(next, false, !!restored, restored ? 'draftRestored' : 'baseline');
            return clone(next);
        },
        setPlan(next) {
            validatePlan(next);
            if (plan && !sameIdentity(next, plan)) {
                throw new Error('Imported cleaning plan must match the active dataset identity.');
            }
            undoStack = [];
            redoStack = [];
            history = [];
            historyCursor = -1;
            // Imported plans are reproducible inputs, but their stages have
            // not yet been materialized against this active source version.
            commit(next, false, true, 'imported');
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
            commit(touch({ ...current, stages }), true, true, 'stageAdded');
            return clone(stage);
        },
        updateStage(id, patch) {
            const current = requirePlan();
            const stages = current.stages.map((stage) => stage.id === id
                ? { ...stage, ...clone(patch), id: stage.id, kind: stage.kind, updatedAt: now() } as CleaningStage
                : stage);
            if (stages.every((stage) => stage.id !== id)) throw new Error(`Unknown cleaning stage '${id}'.`);
            commit(touch({ ...current, stages }), true, true, 'stageUpdated');
        },
        removeStage(id) {
            const current = requirePlan();
            const stages = current.stages.filter((stage) => stage.id !== id);
            if (stages.length === current.stages.length) throw new Error(`Unknown cleaning stage '${id}'.`);
            commit(touch({ ...current, stages }), true, true, 'stageRemoved');
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
            commit(touch({ ...current, stages }), true, true, 'stageReordered');
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
            historyCursor = Math.max(0, historyCursor - 1);
            persistDraft();
            publish();
            return true;
        },
        redo() {
            if (!plan || redoStack.length === 0) return false;
            const next = redoStack.pop()!;
            undoStack.push({ plan: clone(plan), dirty });
            plan = next.plan;
            dirty = next.dirty;
            historyCursor = Math.min(history.length - 1, historyCursor + 1);
            persistDraft();
            publish();
            return true;
        },
        restoreHistoryEntry(id) {
            const entry = history.slice(0, historyCursor + 1).find((candidate) => candidate.id === id);
            const current = plan;
            if (!entry || !current) return false;
            const restored = {
                ...clone(entry.plan),
                id: current.id,
                createdAt: current.createdAt,
                planRevision: current.planRevision + 1,
                updatedAt: now(),
            };
            commit(restored, true, entry.dirty, 'restored');
            return true;
        },
        clear() {
            removeDraft();
            plan = null;
            dirty = false;
            activeDraftKey = null;
            undoStack = [];
            redoStack = [];
            history = [];
            historyCursor = -1;
            publish();
        },
    };
}

function browserDraftStorage(): CleaningPlanDraftStorage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

/** Singleton used by page integrations; tests should normally construct an in-memory store. */
export const cleaningPlanStore = createCleaningPlanStore({ draftStorage: browserDraftStorage() });

export function getCleaningPlanHash(): string | null {
    const plan = cleaningPlanStore.getSnapshot();
    return plan ? hashCleaningPlan(plan) : null;
}
