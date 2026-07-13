/**
 * Shared discrete series-color policy used across every chart surface.
 * It owns the persisted palette choices, active palette, and per-column
 * overrides; renderers must consume its resolver rather than maintain a
 * page-local palette.
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
 * Named palette choices exposed by Settings. Every chart renderer and chip
 * uses the selected palette through `getActiveSeriesPalette` or
 * `getSeriesColor`, so a setting applies consistently to primary and
 * fallback renderers.
 */
export const SERIES_PALETTES = {
    default: [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
        '#9467bd', '#8c564b', '#e377c2', '#17becf',
        '#bcbd22', '#393b79', '#637939', '#7f7f7f',
    ],
    ocean: ['#00b4d8', '#0077b6', '#03045e', '#90e0ef', '#48cae4', '#023e8a'],
    sunset: ['#ff7b00', '#ff8800', '#ff9500', '#ffa200', '#ffaa00', '#ffb700'],
    forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7'],
    monochrome: ['#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#6c757d'],
    neon: ['#ff00ff', '#00ffff', '#ff0080', '#80ff00', '#8000ff', '#00ff80'],
} as const;

export type SeriesPaletteName = keyof typeof SERIES_PALETTES;

let activePaletteName: SeriesPaletteName = 'default';

export function isSeriesPaletteName(value: unknown): value is SeriesPaletteName {
    return typeof value === 'string' && value in SERIES_PALETTES;
}

export function normalizeSeriesPaletteName(value: unknown): SeriesPaletteName {
    return isSeriesPaletteName(value) ? value : 'default';
}

export function getSeriesPalette(name: unknown): readonly string[] {
    return SERIES_PALETTES[normalizeSeriesPaletteName(name)];
}

export function setActiveSeriesPalette(name: unknown): SeriesPaletteName {
    activePaletteName = normalizeSeriesPaletteName(name);
    return activePaletteName;
}

export function getActiveSeriesPalette(): readonly string[] {
    return SERIES_PALETTES[activePaletteName];
}

/**
 * Optional semantic accent used for the ETTm2-style "target" column (OT)
 * when `getDefaultTimeseriesColumns` decides the dataset has a canonical
 * target column. Distinct from the default active palette.
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
 * Returns the custom color if set, otherwise cycles through the active palette.
 */
export function getSeriesColor(column: string, fallbackIndex = 0): string {
    const name = String(column || '').trim();
    const custom = normalizeSeriesColor(uiState.seriesColors?.[name]);
    if (custom) return custom;
    const palette = getActiveSeriesPalette();
    return palette[Math.abs(fallbackIndex) % palette.length]!;
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
