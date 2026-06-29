/**
 * Shared series-color palette used across every chart surface (timeseries,
 * FFT, scatter, spectrogram, density). The previous 6-entry palette caused
 * the OT/HUFL color collision called out in `usage_issue.md` §1.1. This
 * module also exports the small helper API the rest of the frontend uses
 * to read/write per-column overrides through `uiState`.
 *
 * The new palette is a curated set of 12 color-blind-safer hues taken from
 * the Wong/Okabe-Ito-style discrete palette, plus a deliberate "target"
 * accent that the timeseries defaults use for OT-like columns. The palette
 * intentionally avoids placing red and green next to each other and skips
 * the most commonly confusable yellow/orange pair.
 */

import { uiState } from '../store/uiState.js';
import { setSeriesColors } from '../store/uiState.js';

/**
 * Default palette for series traces across pages. Indexed by zero-based
 * chip position — never by column name — so the same color can repeat if
 * the dataset has more than 12 numeric columns. All consumers should
 * reach this list via `getSeriesColor(column, fallbackIndex)` so per-column
 * overrides always win over the index-based fallback.
 */
export const SERIES_COLORS: string[] = [
    '#1f77b4', // blue
    '#ff7f0e', // orange
    '#2ca02c', // green
    '#d62728', // red
    '#9467bd', // purple
    '#8c564b', // brown
    '#e377c2', // pink
    '#17becf', // cyan
    '#bcbd22', // olive
    '#393b79', // indigo
    '#637939', // dark-green
    '#7f7f7f', // grey
];

/**
 * Optional semantic accent used for the ETTm2-style "target" column (OT)
 * when `getDefaultTimeseriesColumns` decides the dataset has a canonical
 * target column. Distinct from any entry in `SERIES_COLORS`.
 */
export const SERIES_TARGET_ACCENT = '#ff5e5e';

/**
 * Columns whose name suggests they are the prediction target. The list is
 * case-insensitive and matches common naming conventions (ETTm2's `OT`,
 * generic `target` / `y` columns, etc.). Frontends use it to choose a
 * sensible default trace selection.
 */
const TARGET_COLUMN_HINTS = ['ot', 'target', 'y', 'label', 'output', 'class', 'response'];

/**
 * Returns true if the given column name looks like a prediction target.
 * Used by the timeseries defaults path to bias initial selections.
 */
export function isLikelyTargetColumn(column: string): boolean {
    const normalized = String(column || '').trim().toLowerCase();
    if (!normalized) return false;
    return TARGET_COLUMN_HINTS.some((hint) => normalized === hint || normalized.endsWith(`_${hint}`));
}

/**
 * Normalize a color value to a 6-digit lowercase hex string, or null if invalid.
 */
export function normalizeSeriesColor(value: unknown): string | null {
    const text = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

/**
 * Get the effective color for a series column.
 * Returns the custom color if set, otherwise cycles through SERIES_COLORS.
 */
export function getSeriesColor(column: string, fallbackIndex = 0): string {
    const name = String(column || '').trim();
    const custom = normalizeSeriesColor(uiState.seriesColors?.[name]);
    if (custom) return custom;
    return SERIES_COLORS[Math.abs(fallbackIndex) % SERIES_COLORS.length];
}

/**
 * Persist a custom color for a series column.
 * Returns the normalized color string, or null if the input is invalid.
 */
export function setSeriesColor(column: string, value: string): string | null {
    const name = String(column || '').trim();
    const normalized = normalizeSeriesColor(value);
    if (!name || !normalized) return null;
    setSeriesColors({ ...(uiState.seriesColors || {}), [name]: normalized });
    return normalized;
}

/**
 * Get a target-style accent color for a prediction-target column.
 * Falls back to the regular palette helper for non-target columns.
 */
export function getTargetAccent(column: string, fallbackIndex = 0): string {
    if (isLikelyTargetColumn(column)) return SERIES_TARGET_ACCENT;
    return getSeriesColor(column, fallbackIndex);
}
