/**
 * Session save / restore for EdaTime.
 *
 * Serialises the user's analysis state (selected columns, zoom, filters,
 * chart settings, page, scatter choices, etc.) to JSON.
 * Provides localStorage auto-save and manual JSON export/import.
 */

import {
    analyticsState,
    setAnomalyEnabled,
    setAnomalyMethod,
    setAnomalyThreshold,
    setRollingEnabled,
    setRollingDisplayMode,
    setRollingWindow,
} from '../store/analyticsState.js';
import { chartState, setChartText } from '../store/chartState.js';
import { datasetState } from '../store/datasetState.js';
import {
    setSeriesColors,
    uiState,
} from '../store/uiState.js';
import { toast } from './toast.js';
import { getHashPage } from './router.js';
import { getDropdownValue, setDropdownValue } from '../ui/primitives/Dropdown.js';
import { emitFeatureEvent } from '../platform/featureEvents.js';
import { onNavigationChange } from '../platform/navigationEvents.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

const STORAGE_KEY = 'edatime-session';
type SessionWorkspace = Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport' | 'subscribe'>;
let configuredWorkspace: SessionWorkspace | null = null;

export function configureSessionWorkspace(workspace: SessionWorkspace | null): void {
    configuredWorkspace = workspace;
}

/** The serialisable subset of the focused frontend store. */
export interface SessionSnapshot {
    version: 1;
    timestamp: number;
    page: string;
    selectedCols: string[];
    seriesColors: Record<string, string>;
    columnRanges: Record<string, { from: number; to: number }>;
    adaptiveLineFilters: Array<{
        column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean;
    }>;
    currentStart: number | null;
    currentEnd: number | null;
    selectedColorColumn: string | null;
    chartText: { title: string; xLabel: string; yLabel: string };
    rollingEnabled: boolean;
    rollingWindow: number;
    rollingDisplayMode?: 'raw' | 'smooth' | 'both';
    anomalyEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    scatterX: string;
    scatterY: string;
    scatterColorColumn: string;
    scatterRenderMode: string;
    datasetRevision?: number;
}

export interface ApplySessionOptions {
    navigate?: boolean;
    preferHashPage?: boolean;
    metadataTimeRange?: { min: number; max: number } | null;
    currentDatasetRevision?: number;
    announceAdjustments?: boolean;
    workspace?: SessionWorkspace;
}

export interface ApplySessionResult {
    revisionMismatch: boolean;
    rangeAdjusted: boolean;
    usedMetadataRange: boolean;
    droppedFilterCount: number;
    navigatedToPage: boolean;
}

function currentPage(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement)?.dataset?.pageName || 'upload';
}

function readSelect(id: string): string {
    return getDropdownValue(id);
}

/** Capture the current analysis state as a serialisable snapshot. */
export function captureSession(): SessionSnapshot {
    const intent = configuredWorkspace?.getSnapshot();
    return {
        version: 1,
        timestamp: Date.now(),
        page: currentPage(),
        selectedCols: [...(intent?.selection.columns ?? [])],
        seriesColors: { ...uiState.seriesColors },
        columnRanges: intent ? { ...intent.filters.columnRanges } : {},
        adaptiveLineFilters: intent ? intent.filters.adaptiveLines.map((f) => ({ ...f })) : [],
        currentStart: intent?.viewport?.xMin ?? null,
        currentEnd: intent?.viewport?.xMax ?? null,
        selectedColorColumn: intent?.selection.colorColumn ?? null,
        chartText: { ...chartState.chartText },
        rollingEnabled: analyticsState.rollingEnabled,
        rollingWindow: analyticsState.rollingWindow,
        rollingDisplayMode: analyticsState.rollingDisplayMode,
        anomalyEnabled: analyticsState.anomalyEnabled,
        anomalyMethod: analyticsState.anomalyMethod,
        anomalyThreshold: analyticsState.anomalyThreshold,
        scatterX: readSelect('scatter-x-col'),
        scatterY: readSelect('scatter-y-col'),
        scatterColorColumn: readSelect('scatter-color-column'),
        scatterRenderMode: readSelect('scatter-render-mode'),
        datasetRevision: Number.isFinite(Number(datasetState.datasetRevision)) ? Number(datasetState.datasetRevision) : 0,
    };
}

/** Restore the focused store from a snapshot. Does NOT trigger re-renders — caller should. */
export function applySession(
    snap: SessionSnapshot,
    options: ApplySessionOptions = {},
): ApplySessionResult {
    const workspace = options.workspace ?? configuredWorkspace;
    const result: ApplySessionResult = {
        revisionMismatch: false,
        rangeAdjusted: false,
        usedMetadataRange: false,
        droppedFilterCount: 0,
        navigatedToPage: false,
    };

    if (!snap || snap.version !== 1) return result;

    const announceAdjustments = options.announceAdjustments !== false;
    const metadataTimeRange = options.metadataTimeRange
        || ((datasetState.metadata as any)?.time_range ?? null);

    const currentRevision = Number(
        options.currentDatasetRevision
        ?? datasetState.datasetRevision
        ?? (datasetState.metadata as any)?.revision
        ?? 0,
    );
    const snapshotRevision = Number(snap.datasetRevision ?? 0);
    const hasRevisions = Number.isFinite(currentRevision) && currentRevision > 0
        && Number.isFinite(snapshotRevision) && snapshotRevision > 0;
    const revisionMismatch = hasRevisions && currentRevision !== snapshotRevision;
    result.revisionMismatch = revisionMismatch;

    const metadataColumns = Array.isArray((datasetState.metadata as any)?.columns)
        ? (datasetState.metadata as any).columns
        : [];
    const validMetadataNames = new Set(
        metadataColumns.map((col: any) => String(col?.name ?? '').trim()).filter(Boolean),
    );
    const metadataNumericNames = new Set(
        Array.isArray((datasetState.metadata as any)?.numeric_columns)
            ? (datasetState.metadata as any).numeric_columns.map((col: any) => String(col ?? '').trim()).filter(Boolean)
            : [],
    );

    const restoredSelectedCols = Array.isArray(snap.selectedCols) ? snap.selectedCols : [];
    const nextSelectedCols = validMetadataNames.size === 0
        ? restoredSelectedCols
        : restoredSelectedCols.filter((col) => {
            const name = String(col ?? '').trim();
            if (!name || !validMetadataNames.has(name)) return false;
            if (metadataNumericNames.size > 0 && !metadataNumericNames.has(name)) return false;
            return true;
        });

    const appliedSelectedCols = nextSelectedCols.length > 0
        ? nextSelectedCols
        : [...(workspace?.getSnapshot().selection.columns ?? [])];
    const requestedColorColumn = String(snap.selectedColorColumn ?? '').trim();
    const validColorColumn = !requestedColorColumn || validMetadataNames.size === 0 || validMetadataNames.has(requestedColorColumn);
    const appliedColorColumn = snap.selectedColorColumn !== undefined && validColorColumn
        ? snap.selectedColorColumn
        : (snap.selectedColorColumn !== undefined ? null : (workspace?.getSnapshot().selection.colorColumn ?? null));

    workspace?.setSelection(appliedSelectedCols, appliedColorColumn);
    if (snap.seriesColors) setSeriesColors({ ...snap.seriesColors });

    if (revisionMismatch) {
        const staleRanges = Object.keys(snap.columnRanges || {}).length;
        const staleLines = Array.isArray(snap.adaptiveLineFilters) ? snap.adaptiveLineFilters.length : 0;
        result.droppedFilterCount = staleRanges + staleLines;
        workspace?.setFilters({ columnRanges: {}, adaptiveLines: [] });
    } else {
        const restoredAdaptiveLines = Array.isArray(snap.adaptiveLineFilters)
            ? snap.adaptiveLineFilters.map((f: any) => ({ ...f, id: f.id ?? `restored-${Date.now()}` }))
            : [...(workspace?.getSnapshot().filters.adaptiveLines ?? [])];
        const restoredRanges = snap.columnRanges
            ? { ...snap.columnRanges }
            : { ...(workspace?.getSnapshot().filters.columnRanges ?? {}) };
        workspace?.setFilters({ columnRanges: restoredRanges, adaptiveLines: restoredAdaptiveLines });
    }

    if (!revisionMismatch) {
        const hasStart = Number.isFinite(snap.currentStart);
        const hasEnd = Number.isFinite(snap.currentEnd);
        if (hasStart && hasEnd) {
            let nextStart = Number(snap.currentStart);
            let nextEnd = Number(snap.currentEnd);

            const minMs = Number(metadataTimeRange?.min);
            const maxMs = Number(metadataTimeRange?.max);
            const hasMetadataBounds = Number.isFinite(minMs) && Number.isFinite(maxMs) && minMs < maxMs;

            if (hasMetadataBounds) {
                const noOverlap = nextEnd <= minMs || nextStart >= maxMs;
                if (noOverlap) {
                    nextStart = minMs;
                    nextEnd = maxMs;
                    result.rangeAdjusted = true;
                    result.usedMetadataRange = true;
                } else {
                    const clampedStart = Math.max(nextStart, minMs);
                    const clampedEnd = Math.min(nextEnd, maxMs);
                    if (clampedStart !== nextStart || clampedEnd !== nextEnd) {
                        result.rangeAdjusted = true;
                    }
                    nextStart = clampedStart;
                    nextEnd = clampedEnd;
                    if (nextStart >= nextEnd) {
                        nextStart = minMs;
                        nextEnd = maxMs;
                        result.usedMetadataRange = true;
                    }
                }
            }

            workspace?.setViewport({ xMin: nextStart, xMax: nextEnd, yMin: null, yMax: null });
        }
    }

    if (snap.chartText) setChartText({ ...snap.chartText });
    if (snap.rollingEnabled !== undefined) setRollingEnabled(snap.rollingEnabled);
    if (Number.isFinite(snap.rollingWindow)) setRollingWindow(snap.rollingWindow);
    if (snap.rollingDisplayMode === 'raw' || snap.rollingDisplayMode === 'smooth' || snap.rollingDisplayMode === 'both') {
        setRollingDisplayMode(snap.rollingDisplayMode);
    }
    if (snap.anomalyEnabled !== undefined) setAnomalyEnabled(snap.anomalyEnabled);
    if (snap.anomalyMethod) setAnomalyMethod(snap.anomalyMethod);
    if (Number.isFinite(snap.anomalyThreshold)) setAnomalyThreshold(snap.anomalyThreshold);

    // Restore scatter dropdowns
    const setSelect = (id: string, val: string) => {
        if (val) setDropdownValue(id, val);
    };
    setSelect('scatter-x-col', snap.scatterX);
    setSelect('scatter-y-col', snap.scatterY);
    setSelect('scatter-color-column', snap.scatterColorColumn);
    setSelect('scatter-render-mode', snap.scatterRenderMode);

    if (revisionMismatch && announceAdjustments) {
        toast('Session belongs to another dataset revision; stale filters were cleared.', 'warning');
    } else if (result.usedMetadataRange && announceAdjustments) {
        toast('Saved chart range did not match this dataset and was reset to dataset bounds.', 'warning');
    } else if (result.rangeAdjusted && announceAdjustments) {
        toast('Saved chart range was clamped to the current dataset time range.', 'warning');
    }

    // Navigate to the saved page unless hash routing should take precedence.
    const hashPage = getHashPage();
    const shouldPreferHash = !!options.preferHashPage && !!hashPage;
    const shouldNavigate = options.navigate !== false && !shouldPreferHash;
    if (shouldNavigate && snap.page) {
        const btn = document.querySelector(`.sidebar .nav-item[data-page="${snap.page}"]`) as HTMLElement | null;
        if (btn) {
            btn.click();
            result.navigatedToPage = true;
        }
    }

    return result;
}

// ─── localStorage persistence ───────────────────────────────────────────────

export function autoSaveSession(): void {
    try {
        const snap = captureSession();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch { /* quota exceeded — silent */ }
}

export function autoRestoreSession(): SessionSnapshot | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw) as SessionSnapshot;
        if (snap?.version !== 1) return null;
        return snap;
    } catch {
        return null;
    }
}

export function clearSavedSession(): void {
    localStorage.removeItem(STORAGE_KEY);
}

// ─── JSON file export / import ──────────────────────────────────────────────

export function exportSessionToFile(): void {
    const snap = captureSession();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edatime-session-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Session exported', 'success');
}

export function importSessionFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const snap = JSON.parse(reader.result as string) as SessionSnapshot;
                if (snap?.version !== 1) throw new Error('Invalid session file');
                applySession(snap);
                toast('Session restored from file', 'success');
                emitFeatureEvent('session:restored', undefined);
            } catch (e: any) {
                toast(`Failed to import session: ${e.message}`, 'error');
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

// ─── Auto-save on navigation / filter changes ───────────────────────────────

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _disposeAutoSave: (() => void) | null = null;

export function initAutoSave(): () => void {
    _disposeAutoSave?.();
    const debouncedSave = () => {
        if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
        _autoSaveTimer = setTimeout(autoSaveSession, 2000);
    };

    const unsubscribeNavigation = onNavigationChange(debouncedSave);
    window.addEventListener('beforeunload', autoSaveSession);
    const unsubscribeWorkspace = configuredWorkspace?.subscribe(debouncedSave) ?? (() => {});
    const dispose = () => {
        unsubscribeNavigation();
        window.removeEventListener('beforeunload', autoSaveSession);
        unsubscribeWorkspace();
        if (_autoSaveTimer) {
            clearTimeout(_autoSaveTimer);
            _autoSaveTimer = null;
        }
        if (_disposeAutoSave === dispose) _disposeAutoSave = null;
    };
    _disposeAutoSave = dispose;
    return dispose;
}
