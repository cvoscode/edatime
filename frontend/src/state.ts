/**
 * Centralised application state and helpers.
 *
 * State is now split into focused sub-states under src/store/:
 *   chartState     — viewport, chart instance, zoom history
 *   analyticsState — rolling bands, anomaly overlays, spectral filter
 *   uiState        — column selection, ranges, adaptive filters, colors
 *   datasetState   — metadata, column profiles, numeric cols
 *   scatterState   — scatter page state
 *
 * Legacy `appState` is a backward-compatible composite that delegates to
 * the sub-states. New code should import from store/ directly.
 */

import type {
    AdaptiveLineFilter,
    AppStateType,
    ChartTextOverlays,
    ColumnRange,
    DataObject,
    FilteredDataObject,
    PendingAdaptivePoint,
    SeriesData,
    YMode,
    ZoomEntry,
} from './types.js';
import { escapeHtml } from './utils/dom.js';
import { appStateComposite as appState } from './store/index.js';
import {
    applyColumnRangesToData,
    buildAdaptiveLineFiltersForQueryState,
    buildAdaptiveLineY as buildAdaptiveLineYImpl,
    computeBounds as computeBoundsImpl,
    ensureRangeStateFromDataState,
} from './services/timeseries/filtering.js';
import { setColumnRanges } from './store/uiState.js';
import { SERIES_COLORS } from './utils/seriesColors.js';

// ─── Re-export sub-states for backward compatibility ────────────────────────
// All modules importing from here get the composite appState + helpers.
// New modules should import directly from './store/index.js'.

// ─── Re-export sub-states for backward compatibility ────────────────────────
// All modules importing from here get helpers + the composite appState.
// New modules should import directly from './store/index.js'.

export {
    chartState,
    analyticsState,
    uiState,
    datasetState,
    scatterState,
    runtimeState,
    store,
    appStateComposite as appState, // rename so `import { appState }` still works
} from './store/index.js';

export { SERIES_COLORS } from './utils/seriesColors.js';

export {
    getDefaultProfileColumnWidths,
    PROFILE_COLUMNS,
    PROFILE_OVERSCAN,
    PROFILE_ROW_HEIGHT,
} from './services/profile/profile.js';

// ─── App state singleton (DEPRECATED) ──────────────────────────────────────
//
// DEPRECATED: Direct mutation of appState fields is discouraged.
// Prefer importing and mutating the focused sub-states:
//   import { chartState }  from './store/chartState.js';  // viewport, chart
//   import { uiState }      from './store/uiState.js';      // selectedCols, filters
//   import { datasetState } from './store/datasetState.js'; // metadata, numericCols
//   import { analyticsState } from './store/analyticsState.js'; // rolling, anomaly
//   import { scatterState } from './store/scatterState.js'; // scatter page
//
// The actual appState object is now the appStateComposite exported from
// './store/index.js'. The local AppStateType definition below is kept only
// so TypeScript can verify the shape; the object itself is the composite.

// Interactive debugging from DevTools.
window.__edatime = window.__edatime || {};
// requestAnimationFrame may have already set __edatime.state via another module.
try {
    Object.defineProperty(window.__edatime, 'state', { get: () => appState });
} catch (_) {
    // Already defined — leave it alone.
}
window.__edatime.DEBUG = true;

// ─── Series color helpers ──────────────────────────────────────────────────

export function normalizeSeriesColor(value: unknown): string | null {
    const text = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

export function getSeriesColor(column: string, fallbackIndex = 0): string {
    const name = String(column || '').trim();
    const custom = normalizeSeriesColor(appState.seriesColors?.[name]);
    if (custom) return custom;
    return SERIES_COLORS[Math.abs(fallbackIndex) % SERIES_COLORS.length];
}

export function setSeriesColor(column: string, value: string): string | null {
    const name = String(column || '').trim();
    const normalized = normalizeSeriesColor(value);
    if (!name || !normalized) return null;
    appState.seriesColors = {
        ...(appState.seriesColors || {}),
        [name]: normalized,
    };
    return normalized;
}

export {
    formatAnalysisNumber,
    formatAnalysisTime,
    formatCount,
    formatProfileValue,
    formatToDatetimeLocal,
    isTemporalDtype,
    normalizeDtypeLabel,
    toFiniteNumberOrNull,
} from './utils/format.js';
export const computeBounds = computeBoundsImpl;
export const buildAdaptiveLineY = buildAdaptiveLineYImpl;

// ─── Metadata helpers ──────────────────────────────────────────────────────

export function setMetaText(text: string): void {
    const el = document.getElementById('stat-rows');
    if (el) el.textContent = text; // Use textContent to prevent XSS
}

export function buildMetaBar(metadata: { total_rows?: number } | null): void {
    const rows = metadata?.total_rows?.toLocaleString() ?? '—';
    const cols = metadata ? String(appState.numericCols?.length ?? 0) : '—';

    const el = document.getElementById('header-meta');
    if (el) {
        el.innerHTML = `
      <div class="meta-stat live"><strong>${rows}</strong> rows</div>
      <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
    `;
    }
}

export function sanitizeSelectedColumns(): void {
    const blockedNames = new Set(['ts', 'timestamp', 'time']);
    const datetimeCols = new Set(
        (appState.metadata?.columns || [])
            .filter((col) => /date|time/i.test(String(col?.dtype || '')))
            .map((col) => String(col?.name || '').toLowerCase()),
    );

    const validColNames = new Set(
        (appState.metadata?.columns || []).map((c) => String(c?.name || '').trim()),
    );

    appState.selectedCols = (appState.selectedCols || []).filter((col) => {
        const name = String(col || '').trim();
        if (!name) return false;
        const lower = name.toLowerCase();
        if (blockedNames.has(lower)) return false;
        if (datetimeCols.has(lower)) return false;
        // Only keep columns that exist in the current dataset
        if (!validColNames.has(name)) return false;
        return true;
    });
}

// ─── Column range filtering ────────────────────────────────────────────────

export function ensureRangeStateFromData(dataObj: DataObject): void {
    const next = ensureRangeStateFromDataState(
        dataObj,
        appState.selectedCols || [],
        appState.columnRanges || {},
    );
    if (next !== appState.columnRanges) setColumnRanges(next);
}

export function buildAdaptiveLineFiltersForQuery(): AdaptiveLineFilter[] {
    return buildAdaptiveLineFiltersForQueryState(appState.adaptiveLineFilters || []);
}

export function applyColumnRanges(dataObj: DataObject): FilteredDataObject {
    return applyColumnRangesToData(
        dataObj,
        appState.selectedCols || [],
        appState.columnRanges || {},
        appState.adaptiveLineFilters || [],
    );
}
