/**
 * Application settings management.
 *
 * Handles user preferences for theme, layout, palettes, and chart behavior.
 * Settings are persisted to localStorage and survive across sessions.
 */

import { setResolvedTheme } from './theme.js';
import {
    normalizeCorrelationMetric,
    type CorrelationMetric,
} from './correlationModes.js';
import { isColorScaleName, type ColorScaleName } from './colorScales.js';
import {
    normalizeSeriesPaletteName,
    setActiveSeriesPalette,
    type SeriesPaletteName,
} from './seriesColors.js';
export { COLOR_SCALES, getColorFromScale, type ColorScaleName } from './colorScales.js';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type LayoutDensity = 'compact' | 'roomy' | 'spacious';
export type { CorrelationMetric } from './correlationModes.js';
export type PlotColorScaleKey = 'signals' | 'pairPlot' | 'correlationMatrix' | 'timeFrequency';

export type PlotColorScales = Record<PlotColorScaleKey, ColorScaleName>;

export interface AppSettings {
    // Appearance
    theme: ThemeMode;
    layoutDensity: LayoutDensity;
    defaultPalette: SeriesPaletteName;

    // Analytics
    defaultCorrelationMetric: CorrelationMetric;

    // Chart preferences
    drawAutoReset: boolean;
    plotColorScales: PlotColorScales;
    sidebarCollapsed: boolean;
}

export const DEFAULT_PLOT_COLOR_SCALES: PlotColorScales = {
    signals: 'viridis',
    pairPlot: 'viridis',
    correlationMatrix: 'coolwarm',
    timeFrequency: 'viridis',
};

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    layoutDensity: 'spacious',
    defaultPalette: 'default',
    defaultCorrelationMetric: 'pearson_raw',
    drawAutoReset: false,
    plotColorScales: { ...DEFAULT_PLOT_COLOR_SCALES },
    sidebarCollapsed: false,
};

const STORAGE_KEY = 'edatime-settings';

function defaultSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, plotColorScales: { ...DEFAULT_PLOT_COLOR_SCALES } };
}

/** Load settings from localStorage, falling back to defaults. */
export function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultSettings();
        const parsed = JSON.parse(raw) as Partial<AppSettings> & { colorScale?: unknown };
        const legacyScale = isColorScaleName(String(parsed.colorScale ?? ''))
            ? parsed.colorScale as ColorScaleName
            : DEFAULT_PLOT_COLOR_SCALES.signals;
        const storedScales = parsed.plotColorScales;
        const plotColorScales = (Object.keys(DEFAULT_PLOT_COLOR_SCALES) as PlotColorScaleKey[])
            .reduce<PlotColorScales>((resolved, key) => {
                const stored = storedScales?.[key];
                const fallback = key === 'correlationMatrix' ? DEFAULT_PLOT_COLOR_SCALES[key] : legacyScale;
                resolved[key] = isColorScaleName(String(stored ?? '')) ? stored! : fallback;
                return resolved;
            }, { ...DEFAULT_PLOT_COLOR_SCALES });
        return {
            theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
            layoutDensity: parsed.layoutDensity ?? DEFAULT_SETTINGS.layoutDensity,
            defaultPalette: normalizeSeriesPaletteName(parsed.defaultPalette),
            defaultCorrelationMetric: normalizeCorrelationMetric(parsed.defaultCorrelationMetric),
            drawAutoReset: parsed.drawAutoReset ?? DEFAULT_SETTINGS.drawAutoReset,
            plotColorScales,
            sidebarCollapsed: parsed.sidebarCollapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
        };
    } catch {
        return defaultSettings();
    }
}

/** Save settings to localStorage. */
export function saveSettings(settings: AppSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        document.dispatchEvent(new CustomEvent<AppSettings>('edatime:settings-changed', { detail: settings }));
    } catch {
        // quota exceeded — silent
    }
}

/** Resolve the continuous scale owned by one visualization. */
export function getPlotColorScale(plot: PlotColorScaleKey): ColorScaleName {
    return loadSettings().plotColorScales[plot] ?? DEFAULT_PLOT_COLOR_SCALES[plot];
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
