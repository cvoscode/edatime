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

import { appState, applyColumnRanges } from '../state.js';
import type { AnomalyResponse, AdaptiveLineFilter } from '../types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RollingBandData {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

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
        bands.push({ column: col, ts: tsOut, mean, upper1, lower1, upper2, lower2 });
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

/**
 * Fetch anomaly regions from the backend and update appState.
 * Returns early if currentStart / currentEnd are not finite.
 */
export async function fetchAnomalyRegions(
    fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null,
    signal?: AbortSignal,
): Promise<void> {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;

    if (_anomalyController) _anomalyController.abort();
    _anomalyController = new AbortController();
    const controllerSignal = _anomalyController.signal;

    const startIso = new Date(appState.currentStart!).toISOString();
    const endIso = new Date(appState.currentEnd!).toISOString();
    const cols = appState.selectedCols.join(',');

    try {
        if (appState.anomalyEnabled && fetchAnomalies) {
            const resp = await fetchAnomalies(startIso, endIso, cols, appState.anomalyMethod, appState.anomalyThreshold, controllerSignal);
            appState.anomalyRegions = resp?.regions ?? null;
        } else {
            appState.anomalyRegions = null;
        }
    } catch (e: unknown) {
        if (!(e instanceof Error) || e.name !== 'AbortError') {
            console.warn('Anomaly fetch failed:', e);
        }
        appState.anomalyRegions = null;
    }

    requestOverlayRender();
}

/** Compute rolling bands from lastFetchedData + column ranges; update appState. */
export function computeAndSetRollingBands(windowSize: number): void {
    if (!appState.rollingEnabled) {
        appState.rollingBands = null;
        return;
    }
    const filtered = applyColumnRanges(appState.lastFetchedData!);
    appState.rollingBands = computeFrontendRollingBands(filtered, appState.selectedCols, windowSize);
}

/** Stop any in-flight anomaly request. */
export function cancelAnalyticsFetch(): void {
    _anomalyController?.abort();
}

/** Whether an analytics fetch is currently in-flight. */
export const isAnalyticsControllerActive = (): boolean =>
    _anomalyController !== null && !_anomalyController.signal.aborted;