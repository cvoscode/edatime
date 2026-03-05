/**
 * Centralised application state and helpers.
 *
 * Every UI module imports this single `appState` object so that state
 * mutations are visible across the application without passing references.
 */

// ─── Colour palette (matches CSS) ──────────────────────────────────────────
export const SERIES_COLORS = [
    '#00d4ff', '#6c63ff', '#00c896', '#f5a623', '#ff4a6e', '#c77dff',
];

// ─── Profile grid constants ────────────────────────────────────────────────
export const PROFILE_ROW_HEIGHT = 38;
export const PROFILE_OVERSCAN = 8;
export const PROFILE_COLUMNS = [
    { key: 'name',         minWidth: 160, defaultWidth: 220, sortable: true },
    { key: 'dtype',        minWidth: 110, defaultWidth: 120, sortable: true },
    { key: 'nonNullCount', minWidth: 130, defaultWidth: 140, sortable: true },
    { key: 'nullCount',    minWidth: 90,  defaultWidth: 100, sortable: true },
    { key: 'min',          minWidth: 120, defaultWidth: 130, sortable: true },
    { key: 'max',          minWidth: 120, defaultWidth: 130, sortable: true },
    { key: 'histCounts',   minWidth: 220, defaultWidth: 260, sortable: false },
];

export function getDefaultProfileColumnWidths() {
    return PROFILE_COLUMNS.map((col) => col.defaultWidth);
}

// ─── App state singleton ───────────────────────────────────────────────────
export const appState = {
    metadata: null,
    numericCols: [],
    columnProfiles: [],
    profileFilterText: '',
    filterText: '',
    selectedCols: [],
    columnRanges: {},
    lastFetchedData: null,
    currentStart: null,
    currentEnd: null,
    chart: null,
    fetchDebounceId: null,
    analysisBound: false,
    refetchOnZoom: true,
    initialView: null,
    zoomHistory: [],
    pendingYMode: 'fit',
    pendingRestoreY: null,
    profileGridBound: false,
    profileGridHeaderBound: false,
    profileGridSort: { key: 'name', dir: 'asc' },
    profileGridColWidths: [220, 120, 140, 100, 130, 130, 260],
    chartText: { title: '', xLabel: '', yLabel: '' },
};

// Interactive debugging from DevTools.
window.__edatime = window.__edatime || {};
Object.defineProperty(window.__edatime, 'state', { get: () => appState });
window.__edatime.DEBUG = true;

// ─── Format helpers (used in multiple modules) ─────────────────────────────

export function formatAnalysisTime(tsMs) {
    if (!Number.isFinite(tsMs)) return '—';
    return new Date(tsMs).toLocaleString();
}

export function formatAnalysisNumber(value) {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '0';
    return Math.round(n).toLocaleString();
}

export function isTemporalDtype(dtype) {
    const dt = String(dtype || '').toLowerCase();
    return dt.includes('datetime') || dt === 'date' || dt.startsWith('date[');
}

export function normalizeDtypeLabel(dtype) {
    if (isTemporalDtype(dtype)) return 'datetime[ns]';
    return String(dtype || '');
}

export function formatProfileValue(value, dtype) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const numeric = Number(value);
    if (isTemporalDtype(dtype)) {
        const d = new Date(numeric);
        if (!Number.isFinite(d.getTime())) return '—';
        return d.toLocaleString();
    }
    return formatAnalysisNumber(numeric);
}

export function formatToDatetimeLocal(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value)) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';

    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function toFiniteNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function computeBounds(values) {
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

export function setMetaText(text) {
    const el = document.getElementById('stat-rows');
    if (el) el.innerHTML = text;
}

export function buildMetaBar(metadata) {
    const rows = metadata.total_rows?.toLocaleString() ?? '?';
    const cols = appState.numericCols?.length ?? 0;
    const series = appState.selectedCols.join(', ') || '—';
    document.getElementById('header-meta').innerHTML = `
        <div class="meta-stat live"><strong>${rows}</strong> rows</div>
        <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
        <div class="meta-stat">Plotting <strong>${series}</strong></div>
    `;
}

export function sanitizeSelectedColumns() {
    const blockedNames = new Set(['ts', 'timestamp', 'time']);
    const datetimeCols = new Set(
        (appState.metadata?.columns || [])
            .filter((col) => /date|time/i.test(String(col?.dtype || '')))
            .map((col) => String(col?.name || '').toLowerCase())
    );

    appState.selectedCols = (appState.selectedCols || []).filter((col) => {
        const name = String(col || '').trim();
        if (!name) return false;
        const lower = name.toLowerCase();
        if (blockedNames.has(lower)) return false;
        if (datetimeCols.has(lower)) return false;
        return true;
    });

    if (appState.selectedCols.length === 0) {
        const fallback = (appState.numericCols || []).find((col) => {
            const lower = String(col || '').toLowerCase();
            return !blockedNames.has(lower) && !datetimeCols.has(lower);
        });
        if (fallback) appState.selectedCols = [fallback];
    }
}

// ─── Column range filtering ────────────────────────────────────────────────

export function ensureRangeStateFromData(dataObj) {
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

export function applyColumnRanges(dataObj) {
    const filtered = { ...dataObj, series: {} };
    for (const col of appState.selectedCols) {
        const yValues = dataObj.values?.[col];
        if (!yValues) continue;

        const range = appState.columnRanges[col];
        if (!range) {
            filtered.series[col] = { x: dataObj.ts, y: yValues };
            continue;
        }

        const xs = [];
        const ys = [];
        for (let i = 0; i < yValues.length; i++) {
            const y = yValues[i];
            if (!Number.isFinite(y)) continue;
            if (y < range.from || y > range.to) continue;
            xs.push(dataObj.ts[i]);
            ys.push(y);
        }

        filtered.series[col] = {
            x: Float64Array.from(xs),
            y: Float64Array.from(ys),
        };
    }
    return filtered;
}
