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

    // Timeseries chart preferences
    drawAutoReset: boolean;
    colorScale: ColorScaleName;
    sidebarCollapsed: boolean;
    analyticsDrawerOpen: boolean;
}

export type ColorScaleName = 'viridis' | 'plasma' | 'magma' | 'coolwarm' | 'inferno';

/** Perceptually uniform colormaps for continuous color-by gradients. */
export const COLOR_SCALES: Record<ColorScaleName, string[]> = {
    viridis: [
        '#440154','#482878','#3e4a89','#31688e','#26838f','#1f9d89','#35b779','#6ece58','#b5de2b','#fde725',
    ],
    plasma: [
        '#0d0887','#5302a3','#8b0aa5','#b83289','#e16462','#fca636','#f0f921',
    ],
    magma: [
        '#000004','#1b0c41','#4a0c6b','#781c6d','#a52c60','#cf4446','#f26b1d','#fca50a','#fca636','#fde725',
    ],
    coolwarm: [
        '#3b4cc0','#6786d1','#9eb2de','#c9d3e8','#f7f7f7','#f4a582','#d6605a','#b2182b',
    ],
    inferno: [
        '#000004','#1b0c41','#4a0c6b','#781c6d','#a52c60','#cf4446','#fca636','#fca50a','#fde725',
    ],
};

/** Interpolate a COLOR_SCALE array to get a color for a normalized value v ∈ [0, 1]. */
export function getColorFromScale(v: number, scaleName: ColorScaleName): string {
    const colors = COLOR_SCALES[scaleName] ?? COLOR_SCALES.viridis;
    const idx = Math.min(Math.max(v, 0), 1) * (colors.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const t = idx - lo;
    return blendHex(colors[lo], colors[hi], t);
}

function blendHex(a: string, b: string, t: number): string {
    const ah = a.replace('#', '');
    const bh = b.replace('#', '');
    const ar = parseInt(ah.slice(0, 2), 16);
    const ag = parseInt(ah.slice(2, 4), 16);
    const ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16);
    const bg = parseInt(bh.slice(2, 4), 16);
    const bb = parseInt(bh.slice(4, 6), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bv = Math.round(ab + (bb - ab) * t);
    return '#' + [r, g, bv].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    layoutDensity: 'spacious',
    defaultPalette: 'default',
    defaultExportFormat: 'csv',
    whiteBackgroundExport: false,
    defaultCorrelationMetric: 'pearson',
    defaultCausalMethod: 'pcmci',
    defaultTauMax: 5,
    defaultFftPreset: 'auto',
    drawAutoReset: false,
    colorScale: 'viridis',
    sidebarCollapsed: false,
    analyticsDrawerOpen: false,
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
