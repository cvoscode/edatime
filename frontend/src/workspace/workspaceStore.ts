import type { ViewSnapshot } from '../types/chart.js';
import type {
    WorkspaceChange,
    WorkspaceChangeKind,
    WorkspaceSnapshot,
    WorkspaceStore,
} from '../contracts/workspace.js';
export type {
    DatasetSession,
    WorkspaceChange,
    WorkspaceChangeKind,
    WorkspaceSnapshot,
    WorkspaceStore,
} from '../contracts/workspace.js';

export interface WorkspaceSnapshotFixture {
    dataset?: Partial<WorkspaceSnapshot['dataset']>;
    selection?: Partial<WorkspaceSnapshot['selection']>;
    filters?: Partial<WorkspaceSnapshot['filters']>;
    viewport?: ViewSnapshot | null;
}

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    return {
        dataset: { ...snapshot.dataset },
        selection: { columns: [...snapshot.selection.columns], colorColumn: snapshot.selection.colorColumn },
        filters: {
            columnRanges: { ...snapshot.filters.columnRanges },
            adaptiveLines: snapshot.filters.adaptiveLines.map((filter) => ({ ...filter })),
        },
        viewport: snapshot.viewport ? { ...snapshot.viewport } : null,
    };
}

/** Build a complete, cloned workspace snapshot for tests and feature fixtures. */
export function makeWorkspaceSnapshot(fixture: WorkspaceSnapshotFixture = {}): WorkspaceSnapshot {
    return cloneSnapshot({
        dataset: {
            metadata: null,
            revision: 0,
            activeSourceVersionId: null,
            rootSourceVersionId: null,
            parentSourceVersionId: null,
            sourceFingerprint: null,
            ...fixture.dataset,
        },
        selection: { columns: [], colorColumn: null, ...fixture.selection },
        filters: {
            columnRanges: {},
            adaptiveLines: [],
            ...fixture.filters,
        },
        viewport: fixture.viewport ?? null,
    });
}

function normalizeColumns(columns: readonly string[]): string[] {
    return [...new Set(columns.map((column) => String(column).trim()).filter(Boolean))];
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameViewport(left: ViewSnapshot | null, right: ViewSnapshot | null): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    return left.xMin === right.xMin
        && left.xMax === right.xMax
        && left.yMin === right.yMin
        && left.yMax === right.yMax;
}

function sameFilters(left: WorkspaceSnapshot['filters'], right: WorkspaceSnapshot['filters']): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function createWorkspaceStore(): WorkspaceStore {
    let snapshot = makeWorkspaceSnapshot();
    let nextSessionId = 0;
    let revision = 0;
    let activeSession: { id: number; controller: AbortController } | null = null;
    const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>();
    const selectorListeners = new Set<{
        select: (snapshot: Readonly<WorkspaceSnapshot>) => unknown;
        notify: (value: unknown, change: WorkspaceChange) => void;
        equals: (previous: unknown, next: unknown) => boolean;
        previous: unknown;
    }>();

    function publish(kind: WorkspaceChangeKind): void {
        const published = cloneSnapshot(snapshot);
        for (const listener of listeners) listener(published);
        const change: WorkspaceChange = { kind, revision: ++revision };
        for (const subscriber of selectorListeners) {
            const next = subscriber.select(snapshot);
            if (subscriber.equals(subscriber.previous, next)) continue;
            subscriber.previous = next;
            subscriber.notify(next, change);
        }
    }

    function update(next: WorkspaceSnapshot, kind: WorkspaceChangeKind): void {
        snapshot = next;
        publish(kind);
    }

    return {
        getSnapshot: () => cloneSnapshot(snapshot),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        subscribeSelector(selector, listener, equals = Object.is) {
            const subscriber = {
                select: selector as (snapshot: Readonly<WorkspaceSnapshot>) => unknown,
                notify: listener as (value: unknown, change: WorkspaceChange) => void,
                equals: equals as (previous: unknown, next: unknown) => boolean,
                previous: selector(snapshot),
            };
            selectorListeners.add(subscriber);
            return () => selectorListeners.delete(subscriber);
        },
        beginDatasetSession() {
            activeSession?.controller.abort();
            const controller = new AbortController();
            const session = { id: ++nextSessionId, controller };
            activeSession = session;
            return { id: session.id, signal: controller.signal };
        },
        commitDataset(session, metadata, revision) {
            if (!activeSession || activeSession.id !== session.id || session.signal.aborted) return false;
            const sourceVersionId = String(metadata.source_version_id ?? '').trim() || `legacy-source-r${revision}`;
            update({
                ...snapshot,
                dataset: {
                    metadata,
                    revision,
                    activeSourceVersionId: sourceVersionId,
                    rootSourceVersionId: String(metadata.root_source_version_id ?? '').trim() || sourceVersionId,
                    parentSourceVersionId: String(metadata.parent_source_version_id ?? '').trim() || null,
                    sourceFingerprint: String(metadata.dataset_fingerprint ?? '').trim() || null,
                },
            }, 'dataset');
            return true;
        },
        setSelection(columns, colorColumn = null) {
            const normalizedColumns = normalizeColumns(columns);
            if (
                sameArray(snapshot.selection.columns, normalizedColumns)
                && snapshot.selection.colorColumn === colorColumn
            ) return;
            update({
                ...snapshot,
                selection: { columns: normalizedColumns, colorColumn },
            }, 'selection');
        },
        setFilters(filters) {
            const nextFilters = {
                columnRanges: { ...filters.columnRanges },
                adaptiveLines: filters.adaptiveLines.map((filter) => ({ ...filter })),
            };
            if (sameFilters(snapshot.filters, nextFilters)) return;
            update({
                ...snapshot,
                filters: nextFilters,
            }, 'filters');
        },
        setViewport(viewport) {
            const nextViewport = viewport ? { ...viewport } : null;
            if (sameViewport(snapshot.viewport, nextViewport)) return;
            update({ ...snapshot, viewport: nextViewport }, 'viewport');
        },
        dispose() {
            activeSession?.controller.abort();
            activeSession = null;
            listeners.clear();
            selectorListeners.clear();
        },
    };
}
