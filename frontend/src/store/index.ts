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
 * For backward compatibility, modules may still import `appState` from
 * '../store/appStateCompat.js', which re-exports the composite `appState`
 * object below. New code should prefer importing from here directly.
 */

import type { AppStateType, RollingBandData, AnomalyRegionData, AdaptiveLineFilter, ColumnRange, PendingAdaptivePoint, ProfileRow, DatasetMetadata, SpectralFilterPreview, ViewSnapshot, ChartInstance, YMode } from '../types.js';
import { datasetState, setColumnProfiles, setDatasetRevision, setMetadata, setNumericCols, type DatasetState } from './datasetState.js';
import {
    setAdaptiveFilterColumn,
    setAdaptiveLineFilters,
    setColumnRanges,
    setFilterText,
    setPendingAdaptivePoint,
    setPreviewSelectedColumns,
    setPreviewTimeColumn,
    setProfileFilterCategory,
    setProfileFilterText,
    setProfileGridBound,
    setProfileGridColWidths,
    setProfileGridHeaderBound,
    setProfileGridSort,
    setSelectedColorColumn,
    setSelectedCols,
    setSeriesColors,
    uiState,
    type UiState,
} from './uiState.js';
import {
    analyticsState,
    setAnomalyEnabled,
    setAnomalyMethod,
    setAnomalyRegions,
    setAnomalyThreshold,
    setRollingBands,
    setRollingEnabled,
    setRollingWindow,
    setSpectralFilterPreview,
    type AnalyticsState,
} from './analyticsState.js';
import { chartState, setChartInstance, setChartText, setInitialView, setViewport, setZoomHistory, type ChartState } from './chartState.js';
import { replaceScatterState, scatterState, type ScatterState } from './scatterState.js';
import {
    runtimeState,
    setAnalysisBound,
    setFetchDebounceId,
    setLastFetchedData,
    setPendingRestoreY,
    setPendingYMode,
    setRefetchOnZoom,
    type RuntimeState,
} from './runtimeState.js';
import { clearSubscribers, subscribe, unsubscribe } from './events.js';

// Re-export the sub-states
export { chartState, analyticsState, uiState, datasetState, scatterState, runtimeState, subscribe, unsubscribe };
export type { ChartState, AnalyticsState, UiState, DatasetState, ScatterState, RuntimeState };
export * from './analyticsState.js';
export * from './chartState.js';
export * from './datasetState.js';
export * from './runtimeState.js';
export * from './scatterState.js';
export * from './uiState.js';

// ── AppState composite (backward-compatible) ──────────────────────────────
//
// appState is a plain mutable object. It is NOT kept in sync with sub-states
// automatically — call sites that mutate it (e.g. `appState.metadata = x`)
// must switch to the proper sub-state setters over time.
//
// Modules that import `appState` from '../store/appStateCompat.js' get this object.
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

function warnLegacyAppStateWrite(property: PropertyKey): void {
    const meta = import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } };
    const env = meta.env;
    if (!env?.DEV || env.MODE === 'test') return;
    console.warn(`[EdaTime] Direct appState.${String(property)} writes are deprecated. Import the matching store setter from ./store/index.js instead.`);
}

const appStateCompositeTarget = {
    // ── Delegated properties ─────────────────────────────────────────────────
    // These delegate to sub-states so that imports from '../store/appStateCompat.js'
    // stay in sync with the authoritative sub-state values.

    get metadata(): DatasetMetadata | null { return datasetState.metadata; },
    set metadata(v: DatasetMetadata | null) { setMetadata(v); },

    get numericCols(): string[] { return datasetState.numericCols; },
    set numericCols(v: string[]) { setNumericCols(v); },

    get columnProfiles(): ProfileRow[] { return datasetState.columnProfiles; },
    set columnProfiles(v: ProfileRow[]) { setColumnProfiles(v); },

    get datasetRevision(): number { return datasetState.datasetRevision; },
    set datasetRevision(v: number) { setDatasetRevision(v); },

    get selectedCols(): string[] { return uiState.selectedCols; },
    set selectedCols(v: string[]) { setSelectedCols(v); },

    get adaptiveFilterColumn(): string | null { return uiState.adaptiveFilterColumn; },
    set adaptiveFilterColumn(v: string | null) { setAdaptiveFilterColumn(v); },

    get columnRanges(): Record<string, ColumnRange> { return uiState.columnRanges; },
    set columnRanges(v: Record<string, ColumnRange>) { setColumnRanges(v); },

    get adaptiveLineFilters(): AdaptiveLineFilter[] { return uiState.adaptiveLineFilters; },
    set adaptiveLineFilters(v: AdaptiveLineFilter[]) { setAdaptiveLineFilters(v); },

    get pendingAdaptivePoint(): PendingAdaptivePoint | null { return uiState.pendingAdaptivePoint; },
    set pendingAdaptivePoint(v: PendingAdaptivePoint | null) { setPendingAdaptivePoint(v); },

    get seriesColors(): Record<string, string> { return uiState.seriesColors; },
    set seriesColors(v: Record<string, string>) { setSeriesColors(v); },

    get selectedColorColumn(): string | null { return uiState.selectedColorColumn; },
    set selectedColorColumn(v: string | null) { setSelectedColorColumn(v); },

    get filterText(): string { return uiState.filterText; },
    set filterText(v: string) { setFilterText(v); },

    get profileFilterText(): string { return uiState.profileFilterText; },
    set profileFilterText(v: string) { setProfileFilterText(v); },

    get profileFilterCategory(): UiState['profileFilterCategory'] { return uiState.profileFilterCategory; },
    set profileFilterCategory(v: UiState['profileFilterCategory']) { setProfileFilterCategory(v); },

    get previewSelectedColumns(): string[] { return uiState.previewSelectedColumns; },
    set previewSelectedColumns(v: string[]) { setPreviewSelectedColumns(v); },

    get previewTimeColumn(): string | null { return uiState.previewTimeColumn; },
    set previewTimeColumn(v: string | null) { setPreviewTimeColumn(v); },

    get profileGridBound(): boolean { return uiState.profileGridBound; },
    set profileGridBound(v: boolean) { setProfileGridBound(v); },

    get profileGridHeaderBound(): boolean { return uiState.profileGridHeaderBound; },
    set profileGridHeaderBound(v: boolean) { setProfileGridHeaderBound(v); },

    get profileGridSort(): UiState['profileGridSort'] { return uiState.profileGridSort; },
    set profileGridSort(v: UiState['profileGridSort']) { setProfileGridSort(v); },

    get profileGridColWidths(): number[] { return uiState.profileGridColWidths; },
    set profileGridColWidths(v: number[]) { setProfileGridColWidths(v); },

    get rollingEnabled(): boolean { return analyticsState.rollingEnabled; },
    set rollingEnabled(v: boolean) { setRollingEnabled(v); },

    get rollingWindow(): number { return analyticsState.rollingWindow; },
    set rollingWindow(v: number) { setRollingWindow(v); },

    get rollingBands(): RollingBandData[] | null { return analyticsState.rollingBands; },
    set rollingBands(v: RollingBandData[] | null) { setRollingBands(v); },

    get anomalyEnabled(): boolean { return analyticsState.anomalyEnabled; },
    set anomalyEnabled(v: boolean) { setAnomalyEnabled(v); },

    get anomalyMethod(): string { return analyticsState.anomalyMethod; },
    set anomalyMethod(v: string) { setAnomalyMethod(v); },

    get anomalyThreshold(): number { return analyticsState.anomalyThreshold; },
    set anomalyThreshold(v: number) { setAnomalyThreshold(v); },

    get anomalyRegions(): AnomalyRegionData[] | null { return analyticsState.anomalyRegions; },
    set anomalyRegions(v: AnomalyRegionData[] | null) { setAnomalyRegions(v); },

    get spectralFilterPreview(): SpectralFilterPreview | null { return analyticsState.spectralFilterPreview; },
    set spectralFilterPreview(v: SpectralFilterPreview | null) { setSpectralFilterPreview(v); },

    // ── Delegated viewport properties ─────────────────────────────────────────
    // These delegate to chartState so the store index stays in sync.

    get currentStart(): number | null { return chartState.currentStart; },
    set currentStart(v: number | null) { setViewport(v, chartState.currentEnd); },

    get currentEnd(): number | null { return chartState.currentEnd; },
    set currentEnd(v: number | null) { setViewport(chartState.currentStart, v); },

    get initialView(): ViewSnapshot | null { return chartState.initialView; },
    set initialView(v: ViewSnapshot | null) { setInitialView(v); },

    get zoomHistory(): ViewSnapshot[] { return chartState.zoomHistory; },
    set zoomHistory(v: ViewSnapshot[]) { setZoomHistory(v); },

    get chartText(): { title: string; xLabel: string; yLabel: string } { return chartState.chartText; },
    set chartText(v: { title: string; xLabel: string; yLabel: string }) { setChartText(v); },

    get chart(): ChartInstance | null { return chartState.chart; },
    set chart(v: ChartInstance | null) { setChartInstance(v); },

    get scatter(): ScatterState { return scatterState; },
    set scatter(v: ScatterState) { replaceScatterState(v); },

    get fetchDebounceId(): ReturnType<typeof setTimeout> | null { return runtimeState.fetchDebounceId; },
    set fetchDebounceId(v: ReturnType<typeof setTimeout> | null) { setFetchDebounceId(v); },

    get lastFetchedData(): AppStateType['lastFetchedData'] { return runtimeState.lastFetchedData; },
    set lastFetchedData(v: AppStateType['lastFetchedData']) { setLastFetchedData(v); },

    get analysisBound(): boolean { return runtimeState.analysisBound; },
    set analysisBound(v: boolean) { setAnalysisBound(v); },

    get refetchOnZoom(): boolean { return runtimeState.refetchOnZoom; },
    set refetchOnZoom(v: boolean) { setRefetchOnZoom(v); },

    get pendingYMode(): YMode | null { return runtimeState.pendingYMode; },
    set pendingYMode(v: YMode | null) { setPendingYMode(v); },

    get pendingRestoreY(): { min: number; max: number } | null { return runtimeState.pendingRestoreY; },
    set pendingRestoreY(v: { min: number; max: number } | null) { setPendingRestoreY(v); },
} as AppStateType;

export const appStateComposite = new Proxy(appStateCompositeTarget, {
    set(target, property, value, receiver) {
        warnLegacyAppStateWrite(property);
        return Reflect.set(target, property, value, receiver);
    },
}) as AppStateType;

export const appState = appStateComposite;

/* ── Store ────────────────────────────────────────────────────────────────── */

export const store = {
    subscribe,
    unsubscribe,
    clearSubscribers,

    get<K extends keyof ChartState>(key: K): ChartState[K] {
        switch (key) {
            case 'chart': return chartState[key];
            default: return chartState[key] as ChartState[K];
        }
    },

    set<K extends keyof ChartState>(key: K, value: ChartState[K]): void {
        chartState[key] = value;
    },
};
