/**
 * store — central pub/sub state container.
 *
 * Exposes sub-states and provides a simple event emitter so UI modules
 * can react to state changes without polling.
 *
 * Usage:
 *   import { store, chartState, uiState, datasetState } from './store/index.js';
 *   store.subscribe('chart:viewport', ({ start, end }) => { ... });
 *
 * For backward compatibility, modules may still import from '../state.js' which
 * re-exports these sub-states. New code should prefer importing from here directly.
 */

import type { AppStateType, RollingBandData, AnomalyRegionData, AdaptiveLineFilter, ColumnRange, PendingAdaptivePoint, ProfileRow, DatasetMetadata, SpectralFilterPreview } from '../types.js';
import { datasetState, setMetadata, type DatasetState } from './datasetState.js';
import { uiState, type UiState } from './uiState.js';
import { analyticsState, type AnalyticsState } from './analyticsState.js';
import { chartState, type ChartState } from './chartState.js';
import { scatterState, type ScatterState } from './scatterState.js';

// Re-export the sub-states
export { chartState, analyticsState, uiState, datasetState, scatterState };
export type { ChartState, AnalyticsState, UiState, DatasetState, ScatterState };

// ── AppState composite (backward-compatible) ──────────────────────────────
//
// appState is a plain mutable object. It is NOT kept in sync with sub-states
// automatically — call sites that mutate it (e.g. `appState.metadata = x`)
// must switch to the proper sub-state setters over time.
//
// Modules that import `appState` from '../state.js' get this object.
// New code should import sub-states directly for all state operations.
//
// Standalone properties (lived on this composite only):
//   currentStart, currentEnd, initialView, zoomHistory, chartText,
//   analysisBound, lastFetchedData, rollingWindow (number)
//
// Delegated properties (forward to sub-states, do NOT mutate directly):
//   metadata → datasetState
//   selectedCols → uiState
//   columnRanges → uiState
//   adaptiveLineFilters → uiState
//   rollingEnabled/rollingBands/anomalyEnabled/anomalyRegions → analyticsState
//   seriesColors, selectedColorColumn → uiState
//   numericCols, columnProfiles, datasetRevision → datasetState

export const appStateComposite = {
    // ── Delegated properties ─────────────────────────────────────────────────
    // These delegate to sub-states so that imports from '../state.js'
    // stay in sync with the authoritative sub-state values.

    get metadata(): DatasetMetadata | null { return datasetState.metadata; },
    set metadata(v: DatasetMetadata | null) { setMetadata(v); },

    get numericCols(): string[] { return datasetState.numericCols; },
    set numericCols(v: string[]) { datasetState.numericCols = v; },

    get columnProfiles(): ProfileRow[] { return datasetState.columnProfiles; },
    set columnProfiles(v: ProfileRow[]) { datasetState.columnProfiles = v; },

    get datasetRevision(): number { return datasetState.datasetRevision; },
    set datasetRevision(v: number) { datasetState.datasetRevision = v; },

    get selectedCols(): string[] { return uiState.selectedCols; },
    set selectedCols(v: string[]) { uiState.selectedCols = v; },

    get columnRanges(): Record<string, ColumnRange> { return uiState.columnRanges; },
    set columnRanges(v: Record<string, ColumnRange>) { uiState.columnRanges = v; },

    get adaptiveLineFilters(): AdaptiveLineFilter[] { return uiState.adaptiveLineFilters; },
    set adaptiveLineFilters(v: AdaptiveLineFilter[]) { uiState.adaptiveLineFilters = v; },

    get pendingAdaptivePoint(): PendingAdaptivePoint | null { return uiState.pendingAdaptivePoint; },
    set pendingAdaptivePoint(v: PendingAdaptivePoint | null) { uiState.pendingAdaptivePoint = v; },

    get seriesColors(): Record<string, string> { return uiState.seriesColors; },
    set seriesColors(v: Record<string, string>) { uiState.seriesColors = v; },

    get selectedColorColumn(): string | null { return uiState.selectedColorColumn; },
    set selectedColorColumn(v: string | null) { uiState.selectedColorColumn = v; },

    get rollingEnabled(): boolean { return analyticsState.rollingEnabled; },
    set rollingEnabled(v: boolean) { analyticsState.rollingEnabled = v; },

    get rollingWindow(): number { return analyticsState.rollingWindow; },
    set rollingWindow(v: number) { analyticsState.rollingWindow = v; },

    get rollingBands(): RollingBandData[] | null { return analyticsState.rollingBands; },
    set rollingBands(v: RollingBandData[] | null) { analyticsState.rollingBands = v; },

    get anomalyEnabled(): boolean { return analyticsState.anomalyEnabled; },
    set anomalyEnabled(v: boolean) { analyticsState.anomalyEnabled = v; },

    get anomalyMethod(): string { return analyticsState.anomalyMethod; },
    set anomalyMethod(v: string) { analyticsState.anomalyMethod = v; },

    get anomalyThreshold(): number { return analyticsState.anomalyThreshold; },
    set anomalyThreshold(v: number) { analyticsState.anomalyThreshold = v; },

    get anomalyRegions(): AnomalyRegionData[] | null { return analyticsState.anomalyRegions; },
    set anomalyRegions(v: AnomalyRegionData[] | null) { analyticsState.anomalyRegions = v; },

    get spectralFilterPreview(): SpectralFilterPreview | null { return analyticsState.spectralFilterPreview; },
    set spectralFilterPreview(v: SpectralFilterPreview | null) { analyticsState.spectralFilterPreview = v; },

    // ── Standalone properties ────────────────────────────────────────────────

    currentStart: null as number | null,
    currentEnd: null as number | null,
    initialView: null as unknown,
    zoomHistory: [] as unknown[],
    chartText: { title: '', xLabel: '', yLabel: '' },
    fetchDebounceId: null as ReturnType<typeof setTimeout> | null,
    chart: null as unknown,

    filterText: '',
    profileFilterText: '',
    previewSelectedColumns: [] as string[],
    previewTimeColumn: null as string | null,
    profileGridBound: false,
    profileGridHeaderBound: false,
    profileGridSort: { key: 'name', dir: 'asc' as const },
    profileGridColWidths: [56, 220, 120, 140, 100, 130, 130, 260],

    scatter: {
        chart: null,
        initialized: false,
        pageInitialized: false,
        activeView: 'plot',
        loading: false,
        metadata: null,
        totalPoints: 0,
        allPoints: [] as [number, number][],
        points: [] as [number, number][],
        allColorValues: null,
        allColorLabels: null,
        full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
        view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
        zoomHistory: [] as unknown[],
        drag: null,
        selectionBox: null,
        colorColumn: '',
        colorValues: null,
        colorLabels: null,
        colorMin: null,
        colorMax: null,
        correlationsByColumn: new Map(),
        suggestionThreshold: 0.7,
        lastBinnedText: '',
        lastUpdateMs: 0,
        densityTooltipCache: null,
        lastOptionSeries: null,
        columnTypes: new Map(),
        lastSuggestions: [] as unknown[],
        lastRenderSignature: '',
        matrixCache: new Map(),
        matrixColumnOrder: [] as string[],
        overviewRequestId: 0,
        scatterRequestId: 0,
    } as AppStateType['scatter'],

    // appState-only fields
    lastFetchedData: null,
    analysisBound: false,
    refetchOnZoom: true,
    pendingYMode: 'fit' as const,
    pendingRestoreY: null,
} as AppStateType;

/* ── Pub/sub ─────────────────────────────────────────────────────────────── */

type Listener = (state: unknown) => void;
const _listeners = new Map<string, Set<Listener>>();

export const store = {
    subscribe(event: string, listener: Listener): () => void {
        if (!_listeners.has(event)) _listeners.set(event, new Set());
        _listeners.get(event)!.add(listener);
        return () => _listeners.get(event)?.delete(listener);
    },

    notify(event: string, state: unknown): void {
        _listeners.get(event)?.forEach((l) => l(state));
    },

    get<K extends keyof ChartState>(key: K): ChartState[K] {
        switch (key) {
            case 'chart': return chartState[key];
            default: return chartState[key] as ChartState[K];
        }
    },
};