import type { DatasetMetadata } from '../types/api.js';
import type { ViewSnapshot } from '../types/chart.js';
import type { AdaptiveLineFilter, ColumnRange } from '../types/store.js';

/** Canonical cross-feature intent published by the application workspace. */
export interface DatasetSession {
    readonly id: number;
    readonly signal: AbortSignal;
}

export interface WorkspaceSnapshot {
    dataset: {
        metadata: DatasetMetadata | null;
        revision: number;
        /** Optional while legacy metadata endpoints are being migrated. */
        activeSourceVersionId?: string | null;
        rootSourceVersionId?: string | null;
        parentSourceVersionId?: string | null;
        sourceFingerprint?: string | null;
    };
    selection: { columns: readonly string[]; colorColumn: string | null };
    filters: {
        columnRanges: Readonly<Record<string, ColumnRange>>;
        adaptiveLines: readonly AdaptiveLineFilter[];
    };
    viewport: ViewSnapshot | null;
}

export type WorkspaceChangeKind = 'dataset' | 'selection' | 'filters' | 'viewport';

export interface WorkspaceChange {
    readonly kind: WorkspaceChangeKind;
    readonly revision: number;
}

export interface WorkspaceStore {
    getSnapshot(): WorkspaceSnapshot;
    subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
    /**
     * Observe one derived workspace slice. Listeners run only when that slice
     * changes according to `equals`; use `getSnapshot()` when a defensive
     * copy of a complete snapshot is needed.
     */
    subscribeSelector<T>(
        selector: (snapshot: Readonly<WorkspaceSnapshot>) => T,
        listener: (value: T, change: WorkspaceChange) => void,
        equals?: (previous: T, next: T) => boolean,
    ): () => void;
    beginDatasetSession(): DatasetSession;
    commitDataset(session: DatasetSession, metadata: DatasetMetadata, revision: number): boolean;
    setSelection(columns: readonly string[], colorColumn?: string | null): void;
    setFilters(filters: WorkspaceSnapshot['filters']): void;
    setViewport(viewport: ViewSnapshot | null): void;
    dispose(): void;
}
