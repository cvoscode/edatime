/**
 * drift/runtime.ts — Drift page lifecycle, loading, and export ownership.
 *
 * Exports:
 *   - initDriftPageRuntime() — bootstraps the analysis page runtime
 *   - syncDriftEmptyState() — module-level wrapper for empty state sync
 *   - _setEchartsModule() — test isolation hook for ECharts mock reset
 */

import { createAnalysisPageRuntime } from '../pages/shared/analysisPageRuntime.js';
import { createRequestTask } from '../pages/shared/requestTask.js';
import { exportEChartsPNG } from '../utils/chartExport.js';

/** Module-level runtime handle for the drift page lifecycle. */
let driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let driftPageCleanup: (() => void) | null = null;

/**
 * Module-level empty-state sync for drift.
 * Wraps the inner syncEmptyState so the runtime can call it without needing
 * a closure reference into initDriftPage.
 */
let _syncDriftEmptyState: (show: boolean, message?: string) => void = () => { };

/** Module-level wrapper to sync drift empty state from outside initDriftPage. */
export function syncDriftEmptyState(show: boolean, message?: string): void {
    _syncDriftEmptyState(show, message);
}

/** Returns the inner syncDriftEmptyState setter for use in initDriftPage. */
export function setSyncDriftEmptyState(fn: (show: boolean, message?: string) => void): void {
    _syncDriftEmptyState = fn;
}

// ── Module-level ECharts cache (issue #3: avoid re-importing on every page visit) ──
let _echartsModule: typeof import('echarts') | null = null;

export async function getECharts(): Promise<typeof import('echarts')> {
    if (!_echartsModule) {
        _echartsModule = await import('echarts');
    }
    return _echartsModule;
}

/** Returns the current ECharts module directly (for internal use in driftPage). */
export function getEChartsModule(): typeof import('echarts') | null {
    return _echartsModule;
}

// Exported for test isolation: reset the cache between test runs so the echarts
// mock is re-established rather than the real module being reused.
export function _setEchartsModule(m: typeof import('echarts') | null): void {
    _echartsModule = m;
}

// ── Request task factory (lifecycle-owned) ─────────────────────────────────────────

export interface DriftComputeTaskOptions {
    setLoading: (loading: boolean) => void;
    onError: (message: string) => void;
    statusEl?: HTMLElement | null;
    emptyStateEl?: HTMLElement | null;
}

/** Creates a drift compute request task. */
export function createDriftComputeTask(options: DriftComputeTaskOptions) {
    return createRequestTask({
        setLoading: options.setLoading,
        onError: options.onError,
    });
}

// ── Export helpers (owned by runtime) ─────────────────────────────────────────────

export function exportDriftCsv(responsesByColumn: Map<string, unknown>): void {
    if (responsesByColumn.size === 0) return;
    const rows: string[] = [
        'column,window,start_ms,end_ms,count,mean,std,median,ks_stat,ks_pvalue,es_stat,es_pvalue,wasserstein,psi,drift_level',
    ];
    responsesByColumn.forEach((resp: any, column: string) => {
        resp.windows.forEach((w: any) => {
            rows.push([
                column,
                w.label,
                w.start_ms,
                w.end_ms,
                w.count,
                isFinite(w.mean) ? w.mean.toFixed(6) : '',
                isFinite(w.std) ? w.std.toFixed(6) : '',
                isFinite(w.quantiles[2]) ? w.quantiles[2].toFixed(6) : '',
                w.ks_stat.toFixed(6),
                w.ks_pvalue.toFixed(6),
                isFinite(w.es_stat) ? w.es_stat.toFixed(6) : '',
                isFinite(w.es_pvalue) ? w.es_pvalue.toFixed(6) : '',
                w.wasserstein.toFixed(6),
                w.psi.toFixed(6),
                w.drift_level,
            ].join(','));
        });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drift_multi_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportDriftJson(responsesByColumn: Map<string, unknown>): void {
    if (responsesByColumn.size === 0) return;
    const payload = {
        active_column: null as string | null,
        columns: Object.fromEntries(responsesByColumn.entries()),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drift_multi_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportTimelinePNG(
    timelineChart: { getDataURL?: (opts?: Record<string, unknown>) => string } | null,
    activeDetailColumn: string | null,
): void {
    if (timelineChart) exportEChartsPNG(timelineChart, `drift_timeline_${activeDetailColumn || 'chart'}.png`);
}

export function exportDetailPNG(
    detailChart: { getDataURL?: (opts?: Record<string, unknown>) => string } | null,
    activeDetailColumn: string | null,
): void {
    if (detailChart) exportEChartsPNG(detailChart, `drift_detail_${activeDetailColumn || 'chart'}.png`);
}

export function getDriftRuntime() {
    return driftRuntime;
}