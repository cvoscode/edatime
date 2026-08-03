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
import { datasetState } from '../store/datasetState.js';

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

function hslToHex(hue: number, saturation: number, lightness: number): string {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const section = ((hue % 360) + 360) % 360 / 60;
    const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
    const [red, green, blue] = section < 1 ? [chroma, intermediate, 0]
        : section < 2 ? [intermediate, chroma, 0]
            : section < 3 ? [0, chroma, intermediate]
                : section < 4 ? [0, intermediate, chroma]
                    : section < 5 ? [intermediate, 0, chroma]
                        : [chroma, 0, intermediate];
    const match = l - chroma / 2;
    const channel = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, '0');
    return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * Return a scalable initial color for a canonical dataset-column slot.
 * The configured palette supplies its native colors first. Additional slots
 * use golden-angle hues and independent saturation/lightness steps, avoiding
 * palette wraparound while remaining deterministic for arbitrarily wide data.
 */
export function getSeriesScaleColor(index: number): string {
    const slot = Math.max(0, Math.trunc(index));
    const palette = getActiveSeriesPalette();
    if (slot < palette.length) return palette[slot]!;

    const overflow = slot - palette.length;
    const paletteSeed = activePaletteName.split('').reduce(
        (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
        2166136261,
    );
    const hue = (paletteSeed % 360 + overflow * 137.507764) % 360;
    const saturationStep = (overflow * 0.38196601125) % 1;
    const lightnessStep = (overflow * 0.61803398875) % 1;
    const saturation = activePaletteName === 'monochrome' ? 4 : 62 + saturationStep * 25;
    const lightness = activePaletteName === 'monochrome'
        ? 18 + lightnessStep * 72
        : 42 + lightnessStep * 24;
    return hslToHex(hue, saturation, lightness);
}

/**
 * Resolve the canonical identity color for a data column.
 *
 * Chip overrides are authoritative. Unconfigured columns use a stable hash of
 * its canonical dataset slot, so filtering, reordering, or selecting a subset
 * cannot change the color seen by chips, raw traces, hulls, legends, or exports.
 * A user-selected chip color always overrides that initial scale assignment.
 */
export function getColumnSeriesColor(column: string): string {
    const name = String(column || '').trim();
    const custom = normalizeSeriesColor(uiState.seriesColors?.[name]);
    if (custom) return custom;
    const datasetIndex = datasetState.numericCols.indexOf(name);
    if (datasetIndex >= 0) return getSeriesScaleColor(datasetIndex);

    // Derived/non-dataset traces still need a stable slot without depending on
    // the current selection order.
    let hash = 2166136261;
    for (let index = 0; index < name.length; index++) {
        hash ^= name.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return getSeriesScaleColor(hash >>> 0);
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
