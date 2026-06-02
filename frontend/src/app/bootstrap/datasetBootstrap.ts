/**
 * Dataset bootstrap owner.
 * Absorbs dataset metadata bootstrap and post-mutation refresh from app.ts.
 * Coordinates: chart modules → metadata fetch → store → mark ready → column setup → UI hydration.
 */

import type { DatasetMetadata } from '../../types.js';
import { isMetadataReady, markMetadataReady } from '../pageRegistry.js';
import {
    setMetadata,
    setDatasetRevision,
} from '../../store/index.js';
import { appState } from '../../store/appStateCompat.js';
import { getNumericColumns, getDefaultTimeseriesColumns } from '../../pages/analyticsPageUtils.js';
import { hydrateColumnProfiles, renderColumnProfilesGrid } from '../../ui/profile.js';
import { setUploadPreviewStatus, setProfileMode, applyPartialTimeRangeFromMetadata } from '../../ui/upload.js';
import { setMetaText } from '../../ui/metaBar.js';
import { DEBUG, dbg, dbgGroup } from '../../debug.js';

// Note: page-change listener wiring is intentionally omitted here.
// It will be handled by timeseriesRuntime.ts (Task 3).

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
    buildMetaBar: (metadata: DatasetMetadata) => void;
    onMetadataReady?: () => void;
    emitWorkflowRefresh?: () => void;
    setAdaptiveFilterColumn: (col: string | null) => void;
    getSelectedCols: () => string[];
    setSelectedCols: (cols: string[]) => void;
    timeseriesFeatureInit?: () => void;
    ensureSessionPersistenceStarted?: () => void;
    setMetaText: (text: string) => void;
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
    // ── storeFetchedMetadata ───────────────────────────────────────────────
    function storeFetchedMetadata(metadata: DatasetMetadata): void {
        setMetadata(metadata);
        const revision = metadata?.revision;
        setDatasetRevision(typeof revision === 'number' ? revision : 0);
    }

    // ── initializeDatasetUi ───────────────────────────────────────────────
    // NOTE: This intentionally does NOT wire the 'edatime:page-change' listener.
    // That wiring lives in timeseriesRuntime.ts (Task 3).
    let _datasetUiReady = false;
    function initializeDatasetUi(metadata: DatasetMetadata): void {
        if (!_datasetUiReady) {
            deps.timeseriesFeatureInit?.();
            deps.ensureSessionPersistenceStarted?.();
            _datasetUiReady = true;
        }

        hydrateColumnProfiles(metadata);
        renderColumnProfilesGrid(true);
        applyPartialTimeRangeFromMetadata(metadata, false);
        setUploadPreviewStatus('Showing current dataset profile. Drop/select a file to preview before loading.');
        setProfileMode('dataset');

        deps.rebuildTimeseriesColumns();
        deps.buildMetaBar(metadata);
        // rebuildTimeseriesRanges is called by the caller (app.ts shell)
        deps.emitWorkflowRefresh?.();

        const timeRange = metadata.time_range;
        if (!timeRange) return;
        const start = Number(timeRange.min);
        const end = Number(timeRange.max);
        deps.setViewport(start, end);
        deps.updateAnalysisZoom(start, end, 'initial');
        deps.emitChartRangeChange?.('initial');
    }

    // ── Bootstrap sequence ───────────────────────────────────────────────
    async function ensureDatasetReady(): Promise<void> {
        if (isMetadataReady()) return;
        if (_datasetReadyPromise) return _datasetReadyPromise;

        _datasetReadyPromise = (async () => {
            await deps.ensureChartModules();

            const metadata = await deps.fetchMetadata();
            storeFetchedMetadata(metadata);
            markMetadataReady();
            window.dispatchEvent(new Event('edatime:metadata-ready'));
            if (DEBUG) dbgGroup('metadata', () => dbg(appState.metadata));

            const metadataTimeRange = appState.metadata?.time_range;
            if (!metadataTimeRange) {
                setMetaText('No valid time range found.');
                return;
            }

            deps.setNumericCols(deps.getNumericColumns(metadata));

            const selectedCols = deps.getSelectedCols();
            if (!selectedCols.length) {
                deps.setSelectedCols(deps.getDefaultTimeseriesColumns(metadata));
            }
            deps.setAdaptiveFilterColumn(deps.getSelectedCols()[0] || null);
            deps.sanitizeSelectedColumns();

            initializeDatasetUi(metadata);
        })().catch((error) => {
            _datasetReadyPromise = null;
            throw error;
        });

        return _datasetReadyPromise;
    }

    // ── Refresh after mutation ─────────────────────────────────────────────
    async function refreshAfterMutation(options?: { selectedColumn?: string }): Promise<void> {
        if (!isMetadataReady()) {
            // If metadata isn't ready yet, run full bootstrap instead
            await ensureDatasetReady();
            return;
        }

        deps.clearLoadedPageModules();
        const metadata = await deps.fetchMetadata();
        storeFetchedMetadata(metadata);
        markMetadataReady();
        deps.setNumericCols(deps.getNumericColumns(metadata));

        const selectedColumn = options?.selectedColumn;
        if (selectedColumn && !deps.getSelectedCols().includes(selectedColumn)) {
            deps.setSelectedCols([...deps.getSelectedCols(), selectedColumn]);
        }

        deps.sanitizeSelectedColumns();
        deps.rebuildTimeseriesColumns();
        deps.buildMetaBar(metadata);
        await deps.refreshVisibleData();
    }

    return { ensureDatasetReady, refreshAfterMutation };
}