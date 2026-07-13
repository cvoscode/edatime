/**
 * analyticsOverlay — rolling-band computation, anomaly region fetching,
 * and overlay render coordination.
 *
 * Owned by the Timeseries feature because it derives overlays from its data,
 * filter intent, and chart render lifecycle.
 *
 * Public API:
 *   AnalyticsOverlayController — fetch, redraw, cancellation, and disposal
 *   computeFrontendRollingBands  — moved from timeseriesPage.ts
 *   createAnalyticsOverlayController — per-Timeseries/root lifecycle owner
 */

import { applyFilterIntentToData, type TimeseriesFilterIntent } from '../../services/timeseries/filtering.js';
import type { ApiRequestOptions } from '../../services/api/http.js';
import {
    analyticsState,
    setAnomalyRegions,
    setAnomalySummaryStats,
    setRollingBands,
} from '../../store/analyticsState.js';
import { chartState } from '../../store/chartState.js';
import type { AdaptiveLineFilter } from '../../types/store.js';
import type { AnomalyResponse, DataObject } from '../../types/api.js';
import type { RollingBandData } from '../../types/analytics.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { getSeriesColor } from '../../utils/seriesColors.js';
import { onFeatureEvent } from '../../platform/featureEvents.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { RollingBandData } from '../../types/analytics.js';

// ── Rolling band computation ──────────────────────────────────────────────────

/**
 * Compute rolling mean ± 1σ / 2σ bands for selected columns.
 * Lives with the Timeseries feature so it can be reused by its analytics listeners.
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

function getFilterIntent(
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
): TimeseriesFilterIntent {
    return workspace.getSnapshot();
}

export interface AnalyticsOverlayController {
    setRenderCallback(callback: (() => void) | null): void;
    fetchAnomalyRegions(
        fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, options?: ApiRequestOptions) => Promise<AnomalyResponse>) | null,
        workspace: Pick<WorkspaceStore, 'getSnapshot'>,
    ): Promise<void>;
    fetchAndRender(
        fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, options?: ApiRequestOptions) => Promise<AnomalyResponse>) | null,
        workspace: Pick<WorkspaceStore, 'getSnapshot'>,
    ): Promise<void>;
    cancel(): void;
    isFetchActive(): boolean;
    dispose(): void;
}

/**
 * Creates the anomaly request and redraw owner for one Timeseries feature.
 * Keeping the abort controller and callback here prevents one app root from
 * cancelling or redrawing another root's overlay work.
 */
export function createAnalyticsOverlayController(): AnalyticsOverlayController {
    let anomalyController: AbortController | null = null;
    let overlayCallback: (() => void) | null = null;

    async function fetchAnomalyRegions(
        fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, options?: ApiRequestOptions) => Promise<AnomalyResponse>) | null,
        workspace: Pick<WorkspaceStore, 'getSnapshot'>,
    ): Promise<void> {
        const viewport = workspace.getSnapshot().viewport;
        const start = Number(viewport?.xMin);
        const end = Number(viewport?.xMax);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return;

        anomalyController?.abort();
        const controller = new AbortController();
        anomalyController = controller;

        const startIso = new Date(start).toISOString();
        const endIso = new Date(end).toISOString();
        const cols = workspace.getSnapshot().selection.columns.join(',');

        try {
            if (analyticsState.anomalyEnabled && fetchAnomalies) {
                const resp = await fetchAnomalies(
                    startIso,
                    endIso,
                    cols,
                    analyticsState.anomalyMethod,
                    analyticsState.anomalyThreshold,
                    { signal: controller.signal },
                );
                if (anomalyController !== controller) return;
                setAnomalyRegions(resp?.regions ?? null);
                setAnomalySummaryStats(resp?.summary_stats ?? null);
            } else if (anomalyController === controller) {
                setAnomalyRegions(null);
                setAnomalySummaryStats(null);
            }
        } catch (error: unknown) {
            if (anomalyController !== controller) return;
            if (!(error instanceof Error) || error.name !== 'AbortError') {
                console.warn('Anomaly fetch failed:', error);
            }
            setAnomalyRegions(null);
            setAnomalySummaryStats(null);
        } finally {
            if (anomalyController === controller) {
                anomalyController = null;
                overlayCallback?.();
            }
        }
    }

    return {
        setRenderCallback(callback) {
            overlayCallback = callback;
        },
        fetchAnomalyRegions,
        fetchAndRender: fetchAnomalyRegions,
        cancel() {
            anomalyController?.abort();
            anomalyController = null;
        },
        isFetchActive() {
            return anomalyController !== null && !anomalyController.signal.aborted;
        },
        dispose() {
            anomalyController?.abort();
            anomalyController = null;
            overlayCallback = null;
        },
    };
}

/** Compute rolling bands from the feature's current data and column ranges. */
export function computeAndSetRollingBands(
    windowSize: number,
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
    getCurrentData: () => DataObject | null,
): void {
    if (!analyticsState.rollingEnabled) {
        setRollingBands(null);
        return;
    }
    const intent = getFilterIntent(workspace);
    const data = getCurrentData();
    if (!data) {
        setRollingBands(null);
        return;
    }
    const filtered = applyFilterIntentToData(data, intent);
    setRollingBands(computeFrontendRollingBands(filtered, [...intent.selection.columns], windowSize));
}

// ── Combined analytics listener wiring ───────────────────────────────────────

/**
 * Wire typed analytics-change notifications to:
 *   1. Recompute rolling bands from the current feature data
 *   2. Trigger chart overlay re-render
 *   3. Fetch fresh anomaly regions
 *
 * Exported so app.ts can call this during shell init without inlining the callback.
 */
export function initAnalyticsListeners(
    fetchAndRenderAnalytics: () => Promise<void>,
    workspace: Pick<WorkspaceStore, 'getSnapshot'>,
    getCurrentData: () => DataObject | null,
): () => void {
    const handler = () => {
        const data = getCurrentData();
        if (data) {
            if (analyticsState.rollingEnabled) {
                const intent = getFilterIntent(workspace);
                const filtered = applyFilterIntentToData(data, intent);
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
 * The request owner is injected by the application root, which keeps this
 * listener focused on typed-event subscription and workspace intent.
 */
