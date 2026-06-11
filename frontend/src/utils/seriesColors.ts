export const SERIES_COLORS: string[] = [
    '#00d4ff', '#6c63ff', '#00c896', '#f5a623', '#ff4a6e', '#c77dff',
];

import { uiState } from '../store/uiState.js';
import { setSeriesColors } from '../store/uiState.js';

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
