/**
 * Dataset bootstrap owner.
 * Absorbs dataset metadata bootstrap and post-mutation refresh from app.ts.
 * Coordinates: chart modules → metadata fetch → store → mark ready → column setup → UI hydration.
 */

import type { DatasetMetadata } from '../../types/api.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { DEBUG, dbg, dbgGroup } from '../../debug.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    invalidateDatasetRequestScope,
} from '../../services/api/datasetRequestScope.js';

export interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'beginDatasetSession' | 'commitDataset' | 'setSelection' | 'setFilters'>;
    markMetadataReady: () => void;
    isMetadataReady: () => boolean;
    clearLoadedPageModules: () => void;
    storeFetchedMetadata: (metadata: DatasetMetadata) => void;
    initializeDatasetUi: (metadata: DatasetMetadata) => Promise<void>;
    setNumericCols: (cols: string[]) => void;
    setDefaultSelectedColumns: (cols: string[]) => void;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    getNumericColumns: (metadata: DatasetMetadata) => string[];
    getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => string[];
    rebuildTimeseriesColumns: () => void;
    clearPersistedFilters: () => void;
    onMetadataReady?: () => void;
    emitWorkflowRefresh?: () => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    timeseriesFeatureInit?: () => void;
    ensureSessionPersistenceStarted?: () => void;
    setViewport: (start: number, end: number) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind: string) => void;
    emitChartRangeChange: (sourceKind?: string) => void;
}

interface BootstrapResult {
    ensureDatasetReady(): Promise<void>;
    refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void>;
}

// Module-level deduplication promise shared across all callers
let _datasetReadyPromise: Promise<void> | null = null;
let _lastDatasetRevision: number | null = null;

/**
 * Creates the dataset bootstrap owner.
 * Call `result.ensureDatasetReady()` to run the bootstrap sequence.
 * Call `result.refreshAfterMutation()` to refresh after a data mutation (e.g. upload).
 */
export function createDatasetBootstrap(deps: DatasetBootstrapDeps): BootstrapResult {
    function syncDatasetSelection(metadata: DatasetMetadata, selectedColumn?: string): void {
        deps.setNumericCols(deps.getNumericColumns(metadata));

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
        if (deps.isMetadataReady()) return;
        if (_datasetReadyPromise) return _datasetReadyPromise;

        let pending: Promise<void>;
        pending = (async () => {
            const requestScope = captureDatasetRequestScope();
            const workspaceSession = deps.workspace.beginDatasetSession();
            await deps.ensureChartModules();

            const metadata = await deps.fetchMetadata();
            assertDatasetRequestScopeActive(requestScope);
            const revision = Number.isFinite(Number(metadata?.revision)) ? Number(metadata.revision) : 0;
            if (!deps.workspace.commitDataset(workspaceSession, metadata, revision)) return;
            deps.storeFetchedMetadata(metadata);
            _lastDatasetRevision = revision;
            deps.markMetadataReady();
            window.dispatchEvent(new Event('edatime:metadata-ready'));
            if (DEBUG) dbgGroup('metadata', () => dbg(metadata));

            if (!metadata.time_range) {
                return;
            }

            syncDatasetSelection(metadata);

            await deps.initializeDatasetUi(metadata);
        })().catch((error) => {
            if (_datasetReadyPromise === pending) {
                _datasetReadyPromise = null;
            }
            throw error;
        });
        _datasetReadyPromise = pending;

        return _datasetReadyPromise;
    }

    // ── Refresh after mutation ─────────────────────────────────────────────
    async function refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
        invalidateDatasetRequestScope();
        _datasetReadyPromise = null;

        if (!deps.isMetadataReady()) {
            // If metadata isn't ready yet, run full bootstrap instead
            await ensureDatasetReady();
            return;
        }

        deps.clearLoadedPageModules();
        deps.clearPersistedFilters();
        deps.workspace.setFilters({ columnRanges: {}, adaptiveLines: [] });
        const previousRevision = _lastDatasetRevision;
        const workspaceSession = deps.workspace.beginDatasetSession();
        const metadata = await deps.fetchMetadata();
        const nextRevision = Number.isFinite(Number(metadata?.revision)) ? Number(metadata.revision) : 0;
        if (!deps.workspace.commitDataset(workspaceSession, metadata, nextRevision)) return;
        deps.storeFetchedMetadata(metadata);
        _lastDatasetRevision = nextRevision;
        deps.markMetadataReady();
        // Mirror the initial-bootstrap event so subscribers (e.g. the scatter
        // page) can re-read metadata after a dataset mutation such as upload.
        window.dispatchEvent(new Event('edatime:metadata-ready'));
        window.dispatchEvent(new CustomEvent('edatime:dataset-changed', {
            detail: {
                previousRevision,
                nextRevision,
            },
        }));
        syncDatasetSelection(metadata, options?.selectedColumn);
        await deps.initializeDatasetUi(metadata);
        deps.rebuildTimeseriesColumns();
        await deps.refreshVisibleData();
    }

    return { ensureDatasetReady, refreshAfterMutation };
}
