/**
 * Application settings management.
 *
 * Handles user preferences for theme, layout, default palettes, export formats, etc.
 * Settings are persisted to localStorage and survive across sessions.
 */

import { setResolvedTheme } from './theme.js';
import {
    normalizeCorrelationMetric,
    type CorrelationMetric,
} from './correlationModes.js';
import type { ColorScaleName } from './colorScales.js';
import {
    normalizeSeriesPaletteName,
    setActiveSeriesPalette,
    type SeriesPaletteName,
} from './seriesColors.js';
export { COLOR_SCALES, getColorFromScale, type ColorScaleName } from './colorScales.js';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type LayoutDensity = 'compact' | 'roomy' | 'spacious';
export type ExportFormat = 'png' | 'svg' | 'csv' | 'json' | 'parquet';
export type { CorrelationMetric } from './correlationModes.js';

export interface AppSettings {
    // Appearance
    theme: ThemeMode;
    layoutDensity: LayoutDensity;
    defaultPalette: SeriesPaletteName;

    // Export
    defaultExportFormat: ExportFormat;
    whiteBackgroundExport: boolean;

    // Analytics
    defaultCorrelationMetric: CorrelationMetric;

    // Causal
    defaultCausalMethod: string;
    defaultTauMax: number;

    // Spectral (for Feature 9)
    defaultFftPreset: string;

    // Timeseries chart preferences
    drawAutoReset: boolean;
    colorScale: ColorScaleName;
    sidebarCollapsed: boolean;
    analyticsDrawerOpen: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    layoutDensity: 'spacious',
    defaultPalette: 'default',
    defaultExportFormat: 'csv',
    whiteBackgroundExport: false,
    defaultCorrelationMetric: 'pearson_raw',
    defaultCausalMethod: 'pcmci',
    defaultTauMax: 5,
    defaultFftPreset: 'auto',
    drawAutoReset: false,
    colorScale: 'viridis',
    sidebarCollapsed: false,
    analyticsDrawerOpen: false,
};

const STORAGE_KEY = 'edatime-settings';

/** Load settings from localStorage, falling back to defaults. */
export function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            defaultPalette: normalizeSeriesPaletteName(parsed.defaultPalette),
            defaultCorrelationMetric: normalizeCorrelationMetric(parsed.defaultCorrelationMetric),
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/** Save settings to localStorage. */
export function saveSettings(settings: AppSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // quota exceeded — silent
    }
}

/** Get a single setting value. */
export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    const settings = loadSettings();
    return settings[key];
}

/** Update a single setting and save. */
export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const settings = loadSettings();
    settings[key] = value;
    saveSettings(settings);
}

/**
 * Apply theme to the document based on settings.
 *
 * `data-theme` is always set explicitly to `light` or `dark` so that stylesheets
 * can rely on a deterministic attribute. The 'auto' mode is resolved against
 * the current `prefers-color-scheme` value.
 */
export function applyTheme(theme: ThemeMode): void {
    let effectiveTheme: 'dark' | 'light' = 'dark';

    if (theme === 'auto') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
        effectiveTheme = theme;
    }

    setResolvedTheme(effectiveTheme);

    // Update theme icons
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (iconDark) iconDark.hidden = effectiveTheme === 'light';
    if (iconLight) iconLight.hidden = effectiveTheme === 'dark';
}

/** Apply layout density to the document. */
export function applyLayoutDensity(density: LayoutDensity): void {
    document.documentElement.setAttribute('data-layout', density);
}

/** Apply the global discrete series palette used by every chart renderer. */
export function applyDefaultPalette(palette: SeriesPaletteName): void {
    setActiveSeriesPalette(palette);
}

/** Apply all settings at once. */
export function applyAllSettings(settings: AppSettings): void {
    applyTheme(settings.theme);
    applyLayoutDensity(settings.layoutDensity);
    applyDefaultPalette(settings.defaultPalette);
}

/** Initialize settings from storage and apply them. */
export function initSettings(): AppSettings {
    const settings = loadSettings();
    applyAllSettings(settings);

    // Listen for system theme changes when in auto mode
    if (settings.theme === 'auto') {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            const current = loadSettings();
            if (current.theme === 'auto') {
                applyTheme('auto');
            }
        });
    }

    return settings;
}
