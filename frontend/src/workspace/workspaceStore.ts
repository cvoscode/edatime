import type { AdaptiveLineFilter, ColumnRange, DatasetMetadata, ViewSnapshot } from '../types.js';

export interface DatasetSession {
    readonly id: number;
    readonly signal: AbortSignal;
}

export interface WorkspaceSnapshot {
    dataset: {
        metadata: DatasetMetadata | null;
        revision: number;
    };
    selection: {
        columns: readonly string[];
        colorColumn: string | null;
    };
    filters: {
        columnRanges: Readonly<Record<string, ColumnRange>>;
        adaptiveLines: readonly AdaptiveLineFilter[];
    };
    viewport: ViewSnapshot | null;
}

export interface WorkspaceStore {
    getSnapshot(): WorkspaceSnapshot;
    subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
    beginDatasetSession(): DatasetSession;
    commitDataset(session: DatasetSession, metadata: DatasetMetadata, revision: number): boolean;
    setSelection(columns: readonly string[], colorColumn?: string | null): void;
    setFilters(filters: WorkspaceSnapshot['filters']): void;
    setViewport(viewport: ViewSnapshot | null): void;
    dispose(): void;
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

function normalizeColumns(columns: readonly string[]): string[] {
    return [...new Set(columns.map((column) => String(column).trim()).filter(Boolean))];
}

export function createWorkspaceStore(): WorkspaceStore {
    let snapshot: WorkspaceSnapshot = {
        dataset: { metadata: null, revision: 0 },
        selection: { columns: [], colorColumn: null },
        filters: { columnRanges: {}, adaptiveLines: [] },
        viewport: null,
    };
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
