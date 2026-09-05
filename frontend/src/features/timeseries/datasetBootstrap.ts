/**
 * Dataset bootstrap owner.
 * Absorbs dataset metadata bootstrap and post-mutation refresh from app.ts.
 * Coordinates: chart modules → metadata fetch → store → mark ready → column setup → UI hydration.
 */

import type { ApiRequestOptions } from '../../services/api/http.js';
import type { DatasetMetadata } from '../../types/api.js';
import type { WorkspaceStore } from '../../contracts/workspace.js';
import { DEBUG, dbg, dbgGroup } from '../../debug.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    invalidateDatasetRequestScope,
} from '../../services/api/datasetRequestScope.js';

export interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: (options?: ApiRequestOptions) => Promise<DatasetMetadata>;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'beginDatasetSession' | 'commitDataset' | 'setSelection' | 'setFilters'>;
    markMetadataReady: () => void;
    isMetadataReady: () => boolean;
    clearLoadedPageModules: () => void;
    initializeDatasetUi: (metadata: DatasetMetadata, signal: AbortSignal) => Promise<void>;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => string[];
    rebuildTimeseriesColumns: () => void;
    clearPersistedFilters: () => void;
    onMetadataReady?: () => void;
    emitWorkflowRefresh?: () => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    onDatasetCommitted?: (metadata: DatasetMetadata, revision: number) => void;
    timeseriesFeatureInit?: () => void;
    ensureSessionPersistenceStarted?: () => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind: string) => void;
}

interface BootstrapResult {
    dispose(): void;
    ensureDatasetReady(): Promise<void>;
    refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void>;
}

/**
 * Creates the dataset bootstrap owner.
 * Call `result.ensureDatasetReady()` to run the bootstrap sequence.
 * Call `result.refreshAfterMutation()` to refresh after a data mutation (e.g. upload).
 */
export function createDatasetBootstrap(deps: DatasetBootstrapDeps): BootstrapResult {
    // Bootstrap ownership is feature-instance scoped. This deduplicates
    // concurrent callers for one mounted application without coupling a
    // later mount or an isolated test/runtime to a retired instance.
    const lifetime = new AbortController();
    let datasetReadyPromise: Promise<void> | null = null;

    function syncDatasetSelection(metadata: DatasetMetadata, selectedColumn?: string): void {


        const writeSelection = (columns: readonly string[]) => {
            const next = [...new Set(columns.map((column) => String(column).trim()).filter(Boolean))];
            deps.workspace.setSelection(next);
        };

        let nextSelection = [...deps.workspace.getSnapshot().selection.columns];
        if (!nextSelection.length) nextSelection = deps.getDefaultTimeseriesColumns(metadata);

        if (selectedColumn) {
            const next = new Set(nextSelection);
            next.add(selectedColumn);
            nextSelection = Array.from(next);
        }

        writeSelection(nextSelection);
        deps.sanitizeSelectedColumns();

        if (!deps.workspace.getSnapshot().selection.columns.length) {
            writeSelection(deps.getDefaultTimeseriesColumns(metadata));
            deps.sanitizeSelectedColumns();
        }

        deps.setAdaptiveFilterColumn(deps.workspace.getSnapshot().selection.columns[0] || null);
    }

    // ── Bootstrap sequence ───────────────────────────────────────────────
    async function ensureDatasetReady(): Promise<void> {
        if (lifetime.signal.aborted || deps.isMetadataReady()) return;
        if (datasetReadyPromise) return datasetReadyPromise;

        let pending: Promise<void>;
        pending = (async () => {
            const requestScope = captureDatasetRequestScope();
            const workspaceSession = deps.workspace.beginDatasetSession();
            await deps.ensureChartModules();

            const metadata = await deps.fetchMetadata({ signal: AbortSignal.any([lifetime.signal, workspaceSession.signal]) });
            assertDatasetRequestScopeActive(requestScope);
            const revision = Number.isFinite(Number(metadata?.revision)) ? Number(metadata.revision) : 0;
            if (lifetime.signal.aborted || !deps.workspace.commitDataset(workspaceSession, metadata, revision)) return;
            deps.onDatasetCommitted?.(metadata, revision);

            deps.markMetadataReady();
            if (DEBUG) dbgGroup('metadata', () => dbg(metadata));

            if (!metadata.time_range) {
                return;
            }

            syncDatasetSelection(metadata);

            await deps.initializeDatasetUi(metadata, workspaceSession.signal);
        })().catch((error) => {
            if (datasetReadyPromise === pending) {
                datasetReadyPromise = null;
            }
            throw error;
        });
        datasetReadyPromise = pending;

        return datasetReadyPromise;
    }

    // ── Refresh after mutation ─────────────────────────────────────────────
    async function refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
        if (lifetime.signal.aborted) return;
        invalidateDatasetRequestScope();
        datasetReadyPromise = null;

        if (!deps.isMetadataReady()) {
            // If metadata isn't ready yet, run full bootstrap instead
            await ensureDatasetReady();
            return;
        }

        deps.clearLoadedPageModules();
        deps.clearPersistedFilters();
        deps.workspace.setFilters({ columnRanges: {}, adaptiveLines: [] });
        const workspaceSession = deps.workspace.beginDatasetSession();
        const metadata = await deps.fetchMetadata({ signal: AbortSignal.any([lifetime.signal, workspaceSession.signal]) });
        const nextRevision = Number.isFinite(Number(metadata?.revision)) ? Number(metadata.revision) : 0;
        if (lifetime.signal.aborted || !deps.workspace.commitDataset(workspaceSession, metadata, nextRevision)) return;
        deps.onDatasetCommitted?.(metadata, nextRevision);

        deps.markMetadataReady();
        syncDatasetSelection(metadata, options?.selectedColumn);
        await deps.initializeDatasetUi(metadata, workspaceSession.signal);
        if (lifetime.signal.aborted || workspaceSession.signal.aborted) return;
        deps.rebuildTimeseriesColumns();
        await deps.refreshVisibleData();
    }

    return { ensureDatasetReady, refreshAfterMutation, dispose: () => lifetime.abort() };
}
