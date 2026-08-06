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
export type SpectrogramPointLimit = 16_384 | 32_768 | 65_536;
export type { CorrelationMetric } from './correlationModes.js';
export type PlotColorScaleKey = 'signals' | 'pairPlot' | 'correlationMatrix' | 'timeFrequency';

export type PlotColorScales = Record<PlotColorScaleKey, ColorScaleName>;

export const MIN_INLINE_EXPORT_ROWS = 1_000;
export const MIN_PARQUET_EXPORT_ROWS = 10_000;
export const DEFAULT_INLINE_EXPORT_ROWS = 100_000;
export const DEFAULT_PARQUET_EXPORT_ROWS = 1_000_000;

export interface AppSettings {
    // Appearance
    theme: ThemeMode;
    layoutDensity: LayoutDensity;
    defaultPalette: SeriesPaletteName;

    // Analytics
    defaultCorrelationMetric: CorrelationMetric;
    spectrogramMaxPoints: SpectrogramPointLimit;

    // Chart preferences
    drawAutoReset: boolean;
    plotColorScales: PlotColorScales;
    sidebarCollapsed: boolean;

    // Export preferences
    inlineExportRowLimit: number;
    parquetExportRowLimit: number;
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
    spectrogramMaxPoints: 32_768,
    drawAutoReset: false,
    plotColorScales: { ...DEFAULT_PLOT_COLOR_SCALES },
    sidebarCollapsed: false,
    inlineExportRowLimit: DEFAULT_INLINE_EXPORT_ROWS,
    parquetExportRowLimit: DEFAULT_PARQUET_EXPORT_ROWS,
};

const STORAGE_KEY = 'edatime-settings';

function defaultSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, plotColorScales: { ...DEFAULT_PLOT_COLOR_SCALES } };
}

export function normalizeSpectrogramPointLimit(value: unknown): SpectrogramPointLimit {
    const numeric = Number(value);
    return numeric === 16_384 || numeric === 32_768 || numeric === 65_536
        ? numeric
        : DEFAULT_SETTINGS.spectrogramMaxPoints;
}

/**
 * Clamp an export row-limit candidate to a positive integer no smaller
 * than the supplied floor. Non-finite values fall back to the floor.
 */
export function normalizeExportRowLimit(value: unknown, floor: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return floor;
    return Math.max(floor, Math.round(numeric));
}

export interface ExportRowLimits {
    inline: number;
    parquet: number;
}

/**
 * Read the configured export row caps. Always returns positive integers;
 * falls back to the defaults when nothing is persisted or the stored
 * value is not a positive integer.
 */
export function getExportRowLimits(): ExportRowLimits {
    const settings = loadSettings();
    return {
        inline: settings.inlineExportRowLimit || DEFAULT_INLINE_EXPORT_ROWS,
        parquet: settings.parquetExportRowLimit || DEFAULT_PARQUET_EXPORT_ROWS,
    };
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
            spectrogramMaxPoints: normalizeSpectrogramPointLimit(parsed.spectrogramMaxPoints),
            drawAutoReset: parsed.drawAutoReset ?? DEFAULT_SETTINGS.drawAutoReset,
            plotColorScales,
            sidebarCollapsed: parsed.sidebarCollapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
            inlineExportRowLimit: normalizeExportRowLimit(parsed.inlineExportRowLimit, DEFAULT_INLINE_EXPORT_ROWS),
            parquetExportRowLimit: normalizeExportRowLimit(parsed.parquetExportRowLimit, DEFAULT_PARQUET_EXPORT_ROWS),
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
