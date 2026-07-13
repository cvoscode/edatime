import type { ViewSnapshot } from '../types/chart.js';
import type { WorkspaceSnapshot, WorkspaceStore } from '../contracts/workspace.js';
export type { DatasetSession, WorkspaceSnapshot, WorkspaceStore } from '../contracts/workspace.js';

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
        dataset: { metadata: null, revision: 0, ...fixture.dataset },
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

export function createWorkspaceStore(): WorkspaceStore {
    let snapshot = makeWorkspaceSnapshot();
    let nextSessionId = 0;
    let activeSession: { id: number; controller: AbortController } | null = null;
    const listeners = new Set<(snapshot: WorkspaceSnapshot) => void>();

    function publish(): void {
        const published = cloneSnapshot(snapshot);
        for (const listener of listeners) listener(published);
    }

    function update(next: WorkspaceSnapshot): void {
        snapshot = next;
        publish();
    }

    return {
        getSnapshot: () => cloneSnapshot(snapshot),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
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
            update({
                ...snapshot,
                dataset: { metadata, revision },
            });
            return true;
        },
        setSelection(columns, colorColumn = null) {
            update({
                ...snapshot,
                selection: { columns: normalizeColumns(columns), colorColumn },
            });
        },
        setFilters(filters) {
            update({
                ...snapshot,
                filters: {
                    columnRanges: { ...filters.columnRanges },
                    adaptiveLines: filters.adaptiveLines.map((filter) => ({ ...filter })),
                },
            });
        },
        setViewport(viewport) {
            update({ ...snapshot, viewport: viewport ? { ...viewport } : null });
        },
        dispose() {
            activeSession?.controller.abort();
            activeSession = null;
            listeners.clear();
        },
    };
}
