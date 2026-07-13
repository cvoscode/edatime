/**
 * drift/runtime.ts — Drift page lifecycle, loading, and export ownership.
 *
 * Exports:
 *   - syncDriftEmptyState() — module-level wrapper for empty state sync
 *   - _setEchartsModule() — test isolation hook for ECharts mock reset
 */

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
