/**
 * analyticsOverlay — rolling-band computation, anomaly region fetching,
 * and overlay render coordination.
 *
 * Extracted from app.ts to keep the orchestrator slim.
 * Consumed by timeseriesPage.ts (render) and app.ts (init + callers).
 *
 * Public API:
 *   AnalyticsOverlayController — start(), stop(), fetchAndRender(), isRunning
 *   computeFrontendRollingBands  — moved from timeseriesPage.ts
 *   setAnomalyOverlayCallback     — for ChartGPU wiring
 */

import { applyFilterIntentToData, type TimeseriesFilterIntent } from '../services/timeseries/filtering.js';
import type { ApiRequestOptions } from '../services/api/http.js';
import {
    analyticsState,
    setAnomalyRegions,
    setAnomalySummaryStats,
    setRollingBands,
} from '../store/analyticsState.js';
import { chartState } from '../store/chartState.js';
import { runtimeState } from '../store/runtimeState.js';
import type { AdaptiveLineFilter } from '../types/store.js';
import type { AnomalyResponse } from '../types/api.js';
import type { RollingBandData } from '../types/analytics.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';
import { getSeriesColor } from '../utils/seriesColors.js';
import { onFeatureEvent } from '../platform/featureEvents.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { RollingBandData } from '../types/analytics.js';

// ── Rolling band computation ──────────────────────────────────────────────────

/**
 * Compute rolling mean ± 1σ / 2σ bands for selected columns.
 * Moved from pages/timeseriesPage.ts so it can be reused in analytics listeners.
 */
export function computeFrontendRollingBands(
    data: { ts?: Float64Array | number[]; series: Record<string, { x: Float64Array | number[]; y: Float64Array | number[] }> } | null,
    cols: string[],
    windowSize: number,
): RollingBandData[] {
    const ts = data?.ts;
    if (!ts || ts.length < 2) return [];

    const n = ts.length;
    const half = Math.floor((windowSize - 1) / 2);
    const bands: RollingBandData[] = [];

    for (const col of cols) {
        const series = data?.series?.[col];
        const ys = series?.y;
        if (!ys || ys.length !== n) continue;

        const tsOut: number[] = new Array(n);
        const mean: (number | null)[] = new Array(n).fill(null);
        const upper1: (number | null)[] = new Array(n).fill(null);
        const lower1: (number | null)[] = new Array(n).fill(null);
        const upper2: (number | null)[] = new Array(n).fill(null);
        const lower2: (number | null)[] = new Array(n).fill(null);

        for (let i = 0; i < n; i++) {
            tsOut[i] = Number(ts[i]);
            const start = Math.max(0, i - half);
            const end = Math.min(n, i + half + 1);
            let sum = 0, sumSq = 0, cnt = 0;
            for (let j = start; j < end; j++) {
                const v = Number(ys[j]);
                if (Number.isFinite(v)) { sum += v; sumSq += v * v; cnt++; }
            }
            if (cnt >= 2) {
                const m = sum / cnt;
                const std = Math.sqrt(Math.max(0, (sumSq / cnt) - m * m));
                mean[i] = m;
                upper1[i] = m + std;
                lower1[i] = m - std;
                upper2[i] = m + 2 * std;
                lower2[i] = m - 2 * std;
            }
        }
        bands.push({
            column: col,
            color: getSeriesColor(col, cols.indexOf(col)),
            ts: tsOut,
            mean,
            upper1,
            lower1,
            upper2,
            lower2,
        });
    }
    return bands;
}

// ── Anomaly overlay controller ───────────────────────────────────────────────

let _anomalyController: AbortController | null = null;
let _overlayCallback: (() => void) | null = null;

/** Wire ChartGPU's overlay render callback so anomaly/rolling overlays trigger a re-render. */
export function setAnomalyOverlayCallback(cb: () => void): void {
    _overlayCallback = cb;
}

function requestOverlayRender(): void {
    _overlayCallback?.();
}

function getFilterIntent(
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
): TimeseriesFilterIntent {
    return workspace.getSnapshot();
}

/**
 * Fetch anomaly regions from the backend and update analytics state.
 * Returns early if currentStart / currentEnd are not finite.
 */
export async function fetchAnomalyRegions(
    fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, options?: ApiRequestOptions) => Promise<AnomalyResponse>) | null,
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
): Promise<void> {
    if (!Number.isFinite(chartState.currentStart) || !Number.isFinite(chartState.currentEnd)) return;

    if (_anomalyController) _anomalyController.abort();
    _anomalyController = new AbortController();
    const controllerSignal = _anomalyController.signal;

    const startIso = new Date(chartState.currentStart!).toISOString();
    const endIso = new Date(chartState.currentEnd!).toISOString();
    const cols = workspace.getSnapshot().selection.columns.join(',');

    try {
        if (analyticsState.anomalyEnabled && fetchAnomalies) {
            const resp = await fetchAnomalies(
                startIso,
                endIso,
                cols,
                analyticsState.anomalyMethod,
                analyticsState.anomalyThreshold,
                { signal: controllerSignal },
            );
            setAnomalyRegions(resp?.regions ?? null);
            setAnomalySummaryStats(resp?.summary_stats ?? null);
        } else {
            setAnomalyRegions(null);
            setAnomalySummaryStats(null);
        }
    } catch (e: unknown) {
        if (!(e instanceof Error) || e.name !== 'AbortError') {
            console.warn('Anomaly fetch failed:', e);
        }
        setAnomalyRegions(null);
        setAnomalySummaryStats(null);
    }

    requestOverlayRender();
}

/** Compute rolling bands from lastFetchedData + column ranges; update analytics state. */
export function computeAndSetRollingBands(
    windowSize: number,
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
): void {
    if (!analyticsState.rollingEnabled) {
        setRollingBands(null);
        return;
    }
    const intent = getFilterIntent(workspace);
    const filtered = applyFilterIntentToData(runtimeState.lastFetchedData!, intent);
    setRollingBands(computeFrontendRollingBands(filtered, [...intent.selection.columns], windowSize));
}

/** Stop any in-flight anomaly request. */
export function cancelAnalyticsFetch(): void {
    _anomalyController?.abort();
}

/** Whether an analytics fetch is currently in-flight. */
export const isAnalyticsControllerActive = (): boolean =>
    _anomalyController !== null && !_anomalyController.signal.aborted;

// ── Combined analytics listener wiring ───────────────────────────────────────

/**
 * Wire typed analytics-change notifications to:
 *   1. Recompute rolling bands from current lastFetchedData
 *   2. Trigger chart overlay re-render
 *   3. Fetch fresh anomaly regions
 *
 * Exported so app.ts can call this during shell init without inlining the callback.
 */
export function initAnalyticsListeners(
    fetchAndRenderAnalytics: () => Promise<void>,
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
): () => void {
    const handler = () => {
        if (runtimeState.lastFetchedData) {
            if (analyticsState.rollingEnabled) {
                const intent = getFilterIntent(workspace);
                const filtered = applyFilterIntentToData(runtimeState.lastFetchedData, intent);
                setRollingBands(computeFrontendRollingBands(
                    filtered,
                    [...intent.selection.columns],
                    analyticsState.rollingWindow || 50,
                ));
            } else {
                setRollingBands(null);
            }
            chartState.chart?.requestOverlayRender?.();
        }
        fetchAndRenderAnalytics().catch((err: unknown) => { console.warn('Analytics fetch failed:', err); });
    };

    return onFeatureEvent('analytics:change', handler);
}

/**
 * Standalone analytics fetch for the overlay panel.
 * Dynamic import keeps services/api out of the main module load path.
 */
export async function fetchAndRenderAnalytics(
    fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, options?: ApiRequestOptions) => Promise<AnomalyResponse>) | null,
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
): Promise<void> {
    await fetchAnomalyRegions(fetchAnomalies ?? null, workspace);
}
