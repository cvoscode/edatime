/**
 * Application settings management.
 *
 * Handles user preferences for theme, layout, default palettes, export formats, etc.
 * Settings are persisted to localStorage and survive across sessions.
 */

export type ThemeMode = 'dark' | 'light' | 'auto';
export type LayoutDensity = 'compact' | 'spacious';
export type ExportFormat = 'png' | 'svg' | 'csv' | 'json' | 'parquet';
export type CorrelationMetric = 'pearson' | 'spearman';

export interface AppSettings {
    // Appearance
    theme: ThemeMode;
    layoutDensity: LayoutDensity;
    defaultPalette: string;  // palette name

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
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    layoutDensity: 'spacious',
    defaultPalette: 'default',
    defaultExportFormat: 'png',
    whiteBackgroundExport: false,
    defaultCorrelationMetric: 'pearson',
    defaultCausalMethod: 'pcmci',
    defaultTauMax: 5,
    defaultFftPreset: 'auto',
};

/** Predefined color palettes for charts */
export const CHART_PALETTES: Record<string, string[]> = {
    default: ['#00d4ff', '#6c63ff', '#00c896', '#f5a623', '#ff4a6e', '#c77dff'],
    ocean: ['#00b4d8', '#0077b6', '#03045e', '#90e0ef', '#48cae4', '#023e8a'],
    sunset: ['#ff7b00', '#ff8800', '#ff9500', '#ffa200', '#ffaa00', '#ffb700'],
    forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7'],
    monochrome: ['#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#6c757d'],
    neon: ['#ff00ff', '#00ffff', '#ff0080', '#80ff00', '#8000ff', '#00ff80'],
};

const STORAGE_KEY = 'edatime-settings';

/** Load settings from localStorage, falling back to defaults. */
export function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
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

/** Apply theme to the document based on settings. */
export function applyTheme(theme: ThemeMode): void {
    let effectiveTheme: 'dark' | 'light' = 'dark';

    if (theme === 'auto') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
        effectiveTheme = theme;
    }

    if (effectiveTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Update theme icons
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (iconDark) iconDark.hidden = effectiveTheme === 'light';
    if (iconLight) iconLight.hidden = effectiveTheme === 'dark';

    // Cache for session persistence
    localStorage.setItem('edatime-theme', effectiveTheme);
}

/** Apply layout density to the document. */
export function applyLayoutDensity(density: LayoutDensity): void {
    document.documentElement.setAttribute('data-layout', density);
}

/** Apply all settings at once. */
export function applyAllSettings(settings: AppSettings): void {
    applyTheme(settings.theme);
    applyLayoutDensity(settings.layoutDensity);
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
