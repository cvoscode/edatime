/**
 * Dataset bootstrap owner.
 * Absorbs dataset metadata bootstrap and post-mutation refresh from app.ts.
 * Coordinates: chart modules → metadata fetch → store → mark ready → column setup → UI hydration.
 */

import type { DatasetMetadata } from '../../types.js';
import { isMetadataReady } from '../pageRegistry.js';
import { DEBUG, dbg, dbgGroup } from '../../debug.js';
import {
    assertDatasetRequestScopeActive,
    captureDatasetRequestScope,
    invalidateDatasetRequestScope,
} from '../../services/api/http.js';

export interface DatasetBootstrapDeps {
    ensureChartModules: () => Promise<void>;
    fetchMetadata: () => Promise<DatasetMetadata>;
    markMetadataReady: () => void;
    clearLoadedPageModules: () => void;
    storeFetchedMetadata: (metadata: DatasetMetadata) => void;
    initializeDatasetUi: (metadata: DatasetMetadata) => void;
    setNumericCols: (cols: string[]) => void;
    setDefaultSelectedColumns: (cols: string[]) => void;
    sanitizeSelectedColumns: () => void;
    refreshVisibleData: () => Promise<void>;
    getNumericColumns: (metadata: DatasetMetadata) => string[];
    getDefaultTimeseriesColumns: (metadata: DatasetMetadata) => string[];
    rebuildTimeseriesColumns: () => void;
    onMetadataReady?: () => void;
    emitWorkflowRefresh?: () => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
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

/**
 * Creates the dataset bootstrap owner.
 * Call `result.ensureDatasetReady()` to run the bootstrap sequence.
 * Call `result.refreshAfterMutation()` to refresh after a data mutation (e.g. upload).
 */
export function createDatasetBootstrap(deps: DatasetBootstrapDeps): BootstrapResult {
    function syncDatasetSelection(metadata: DatasetMetadata, selectedColumn?: string): void {
        deps.setNumericCols(deps.getNumericColumns(metadata));

        if (!deps.getSelectedCols().length) {
            deps.setSelectedCols(deps.getDefaultTimeseriesColumns(metadata));
        }

        if (selectedColumn) {
            const next = new Set(deps.getSelectedCols());
            next.add(selectedColumn);
            deps.setSelectedCols(Array.from(next));
        }

        deps.sanitizeSelectedColumns();

        if (!deps.getSelectedCols().length) {
            deps.setSelectedCols(deps.getDefaultTimeseriesColumns(metadata));
            deps.sanitizeSelectedColumns();
        }

        deps.setAdaptiveFilterColumn(deps.getSelectedCols()[0] || null);
    }

    // ── Bootstrap sequence ───────────────────────────────────────────────
    async function ensureDatasetReady(): Promise<void> {
        if (isMetadataReady()) return;
        if (_datasetReadyPromise) return _datasetReadyPromise;

        let pending: Promise<void>;
        pending = (async () => {
            const requestScope = captureDatasetRequestScope();
            await deps.ensureChartModules();

            const metadata = await deps.fetchMetadata();
            assertDatasetRequestScopeActive(requestScope);
            deps.storeFetchedMetadata(metadata);
            deps.markMetadataReady();
            window.dispatchEvent(new Event('edatime:metadata-ready'));
            if (DEBUG) dbgGroup('metadata', () => dbg(metadata));

            if (!metadata.time_range) {
                return;
            }

            syncDatasetSelection(metadata);

            deps.initializeDatasetUi(metadata);
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

        if (!isMetadataReady()) {
            // If metadata isn't ready yet, run full bootstrap instead
            await ensureDatasetReady();
            return;
        }

        deps.clearLoadedPageModules();
        const metadata = await deps.fetchMetadata();
        deps.storeFetchedMetadata(metadata);
        deps.markMetadataReady();
        syncDatasetSelection(metadata, options?.selectedColumn);
        deps.initializeDatasetUi(metadata);
        deps.rebuildTimeseriesColumns();
        await deps.refreshVisibleData();
    }

    return { ensureDatasetReady, refreshAfterMutation };
}
