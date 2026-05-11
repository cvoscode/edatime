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
    ProfileColumnDef,
    ProfileGridSort,
    SeriesData,
    YMode,
    ZoomEntry,
} from './types.js';
import { formatTwoDecimals } from './formatUtils.js';
import { escapeHtml } from './utils/dom.js';
import { appStateComposite as appState } from './store/index.js';

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
    store,
    appStateComposite as appState, // rename so `import { appState }` still works
} from './store/index.js';

// ─── Colour palette (matches CSS) ──────────────────────────────────────────
export const SERIES_COLORS: string[] = [
    '#00d4ff', '#6c63ff', '#00c896', '#f5a623', '#ff4a6e', '#c77dff',
];

// ─── Profile grid constants ────────────────────────────────────────────────
export const PROFILE_ROW_HEIGHT = 38;
export const PROFILE_OVERSCAN = 8;
export const PROFILE_COLUMNS: ProfileColumnDef[] = [
    { key: 'selected', label: '', minWidth: 56, defaultWidth: 56, sortable: false },
    { key: 'name', label: 'Name', minWidth: 160, defaultWidth: 220, sortable: true },
    { key: 'dtype', label: 'Type', minWidth: 110, defaultWidth: 120, sortable: true },
    { key: 'nonNullCount', label: 'Non-Null', minWidth: 130, defaultWidth: 140, sortable: true },
    { key: 'nullCount', label: 'Null', minWidth: 90, defaultWidth: 100, sortable: true },
    { key: 'min', label: 'Min', minWidth: 120, defaultWidth: 130, sortable: true },
    { key: 'max', label: 'Max', minWidth: 120, defaultWidth: 130, sortable: true },
    { key: 'histCounts', label: 'Distribution', minWidth: 220, defaultWidth: 260, sortable: false },
];

export function getDefaultProfileColumnWidths(): number[] {
    return PROFILE_COLUMNS.map((col) => col.defaultWidth);
}

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

// ─── Format helpers (used in multiple modules) ─────────────────────────────

export function formatAnalysisTime(tsMs: number): string {
    if (!Number.isFinite(tsMs)) return '—';
    return new Date(tsMs).toLocaleString();
}

export const formatAnalysisNumber = formatTwoDecimals;

export function formatCount(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '0';
    return Math.round(n).toLocaleString();
}

export function isTemporalDtype(dtype: string): boolean {
    const dt = String(dtype || '').toLowerCase();
    return dt.includes('datetime') || dt === 'date' || dt.startsWith('date[');
}

export function normalizeDtypeLabel(dtype: string): string {
    if (isTemporalDtype(dtype)) return 'datetime[ns]';
    return String(dtype || '');
}

export function formatProfileValue(value: unknown, dtype: string): string {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const numeric = Number(value);
    if (isTemporalDtype(dtype)) {
        const d = new Date(numeric);
        if (!Number.isFinite(d.getTime())) return '—';
        return d.toLocaleString();
    }
    return formatAnalysisNumber(numeric);
}

export function formatToDatetimeLocal(ms: number): string {
    const value = Number(ms);
    if (!Number.isFinite(value)) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function toFiniteNumberOrNull(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function computeBounds(values: ArrayLike<number>): { min: number; max: number } | null {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
}

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
    for (const col of appState.selectedCols) {
        const values = dataObj.values?.[col];
        if (!values || values.length === 0) continue;
        if (!appState.columnRanges[col]) {
            const bounds = computeBounds(values);
            if (!bounds) continue;
            appState.columnRanges[col] = { from: bounds.min, to: bounds.max };
        }
    }
}

export function buildAdaptiveLineY(filter: AdaptiveLineFilter, tsMs: number): number | null {
    const x1 = Number(filter?.x1);
    const x2 = Number(filter?.x2);
    const y1 = Number(filter?.y1);
    const y2 = Number(filter?.y2);
    const x = Number(tsMs);
    if (
        !Number.isFinite(x1) || !Number.isFinite(x2) ||
        !Number.isFinite(y1) || !Number.isFinite(y2) ||
        !Number.isFinite(x) || x1 === x2
    ) {
        return null;
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    if (x < minX || x > maxX) return null;
    const slope = (y2 - y1) / (x2 - x1);
    return y1 + (x - x1) * slope;
}

function passesAdaptiveLineFilters(
    tsMs: number,
    valuesByColumn: Record<string, number | undefined>,
): boolean {
    const filters = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters : [];
    for (const filter of filters) {
        const column = String(filter?.column || '');
        if (!column) continue;
        const y = Number(valuesByColumn?.[column]);
        if (!Number.isFinite(y)) return false;

        const lineY = buildAdaptiveLineY(filter, tsMs);
        if (!Number.isFinite(lineY)) continue;

        const keepAbove = !!filter.keepAbove;
        if (keepAbove) {
            if (y < lineY!) return false;
        } else if (y > lineY!) {
            return false;
        }
    }
    return true;
}

export function buildAdaptiveLineFiltersForQuery(): AdaptiveLineFilter[] {
    return (appState.adaptiveLineFilters || [])
        .map((filter) => ({
            column: filter.column,
            x1: Number(filter.x1),
            y1: Number(filter.y1),
            x2: Number(filter.x2),
            y2: Number(filter.y2),
            keepAbove: !!filter.keepAbove,
        }))
        .filter(
            (filter): filter is AdaptiveLineFilter =>
                !!filter.column &&
                Number.isFinite(filter.x1) &&
                Number.isFinite(filter.y1) &&
                Number.isFinite(filter.x2) &&
                Number.isFinite(filter.y2) &&
                filter.x1 !== filter.x2,
        );
}

export function applyColumnRanges(dataObj: DataObject): FilteredDataObject {
    const filtered: FilteredDataObject = { ...dataObj, series: {}, colorByColumn: {} };
    const lineFilters = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters : [];

    // Pre-compute the set of columns needed for adaptive filter evaluation (once, outside loops)
    const neededColumns: string[] = lineFilters.length > 0
        ? [...new Set([...(appState.selectedCols || []), ...lineFilters.map((f) => f.column)])]
        : [];

    for (const col of appState.selectedCols) {
        const yValues = dataObj.values?.[col];
        if (!yValues) continue;

        const range = appState.columnRanges[col];
        const xs: number[] = [];
        const ys: number[] = [];
        const colorValues: (number | string | null)[] = [];

        for (let i = 0; i < yValues.length; i++) {
            const y = yValues[i];
            const ts = dataObj.ts?.[i];
            if (!Number.isFinite(y)) continue;
            if (!Number.isFinite(ts)) continue;
            if (range && (y < range.from || y > range.to)) continue;

            if (lineFilters.length > 0) {
                const valuesByColumn: Record<string, number | undefined> = {};
                for (const name of neededColumns) {
                    valuesByColumn[name] = dataObj.values?.[name]?.[i];
                }
                if (!passesAdaptiveLineFilters(ts, valuesByColumn)) continue;
            }

            xs.push(ts);
            ys.push(y);
            if (Array.isArray(dataObj.color)) {
                colorValues.push(dataObj.color[i]);
            }
        }

        filtered.series[col] = {
            x: Float64Array.from(xs),
            y: Float64Array.from(ys),
        };
        if (Array.isArray(dataObj.color)) {
            filtered.colorByColumn[col] = colorValues;
        }
    }
    return filtered;
}
