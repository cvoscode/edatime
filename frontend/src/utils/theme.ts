/**
 * Shared resolved-theme helper for non-CSS rendering (ChartGPU, ECharts, Canvas).
 *
 * Settings owns the persisted user preference (dark | light | auto). This module
 * is the single source of truth for the effective theme applied to the document
 * and for chart-adjacent renderers that cannot read CSS custom properties from
 * inside a canvas.
 *
 * Rules:
 *  - ResolvedTheme is always exactly 'dark' or 'light'. The 'auto' preference is
 *    resolved against `prefers-color-scheme` once and then materialised.
 *  - The DOM `data-theme` attribute is always set to the resolved theme, so both
 *    light and dark have an explicit attribute on the root.
 *  - Subscribers can register a listener via `onThemeChange`; the helper fires
 *    the listener whenever the resolved theme changes (initial apply included).
 */

import { loadSettings } from './settings.js';

export type ResolvedTheme = 'dark' | 'light';

const THEME_ATTR = 'data-theme';

let _current: ResolvedTheme = readCurrentFromDom();

type ThemeListener = (theme: ResolvedTheme) => void;
const _listeners = new Set<ThemeListener>();

function readCurrentFromDom(): ResolvedTheme {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.getAttribute(THEME_ATTR) === 'light' ? 'light' : 'dark';
}

function emit(theme: ResolvedTheme): void {
    if (_current === theme) return;
    _current = theme;
    for (const fn of _listeners) {
        try {
            fn(theme);
        } catch {
            // listeners must not throw into the global theme pipeline
        }
    }
}

/** Read the currently resolved theme (defaults to 'dark' in non-browser contexts). */
export function getResolvedTheme(): ResolvedTheme {
    return _current;
}

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function onThemeChange(listener: ThemeListener): () => void {
    _listeners.add(listener);
    // Fire immediately so initial colour reads are aligned with the actual theme.
    try {
        listener(_current);
    } catch {
        // ignore
    }
    return () => {
        _listeners.delete(listener);
    };
}

/**
 * Apply the persisted settings theme to the document and notify subscribers.
 *
 * Safe to call repeatedly; idempotent and inexpensive. `auto` is resolved against
 * the current `prefers-color-scheme` value (or 'dark' when no media query matches).
 */
export function applyResolvedThemeFromSettings(): ResolvedTheme {
    if (typeof document === 'undefined') return 'dark';
    const settings = loadSettings();
    const raw = settings.theme;
    let next: ResolvedTheme;
    if (raw === 'light') {
        next = 'light';
    } else if (raw === 'dark') {
        next = 'dark';
    } else {
        // 'auto' — fall back to media query, defaulting to dark.
        const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-color-scheme: light)')
            : null;
        next = mql && mql.matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute(THEME_ATTR, next);
    emit(next);
    return next;
}

/**
 * Force a specific resolved theme (used by the header toggle which must produce
 * an explicit `light` or `dark` and persist it as the user's preference).
 */
export function setResolvedTheme(theme: ResolvedTheme): ResolvedTheme {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute(THEME_ATTR, theme);
    }
    emit(theme);
    return theme;
}

/* ── Chart palette ───────────────────────────────────────────────────────── */

export interface ChartPalette {
    background: string;
    text: string;
    textDim: string;
    textMuted: string;
    border: string;
    borderHi: string;
    surface: string;
    surfaceElevated: string;
    accent: string;
    cyan: string;
    danger: string;
    success: string;
    warning: string;
    overlayBackdrop: string;
    kbdBg: string;
    kbdBorder: string;
    strongOnBrand: string;
    // Marginals / density / KDE
    marginalFill: string;
    marginalStroke: string;
    scatterPoint: string;
    // Annotation / overlay accents
    pendingPoint: string;
    pendingPointBorder: string;
    anomalyFill: string;
    anomalyStroke: string;
    keepAboveStroke: string;
    keepBelowStroke: string;
    rollingBandOuter: string;
    rollingBandInner: string;
    rollingMeanStroke: string;
    annotationLabel: string;
    annotationLabelDark: string;
    referenceStroke: string;
    referenceFill: string;
    dangerFill: string;
}

const DARK_PALETTE: ChartPalette = {
    background: '#0B0F14',
    text: '#C8D2DC',
    textDim: '#8291A4',
    textMuted: '#748394',
    border: '#263340',
    borderHi: '#354656',
    surface: '#10171F',
    surfaceElevated: '#18222D',
    accent: '#2F9BFF',
    cyan: '#20BFAF',
    danger: '#E06C75',
    success: '#3FB984',
    warning: '#E5A84B',
    overlayBackdrop: 'rgba(8, 11, 20, 0.72)',
    kbdBg: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
    kbdBorder: 'rgba(255, 255, 255, 0.15)',
    strongOnBrand: '#FFFFFF',
    marginalFill: 'rgba(74, 158, 255, 0.22)',
    marginalStroke: 'rgba(74, 158, 255, 0.95)',
    scatterPoint: '#4a9eff',
    pendingPoint: 'rgba(0, 212, 255, 0.95)',
    pendingPointBorder: 'rgba(255, 255, 255, 0.9)',
    anomalyFill: 'rgba(255, 74, 110, 0.15)',
    anomalyStroke: 'rgba(255, 74, 110, 0.5)',
    keepAboveStroke: 'rgba(0, 200, 150, 0.95)',
    keepBelowStroke: 'rgba(255, 74, 110, 0.95)',
    rollingBandOuter: 'rgba(100, 180, 255, 0.22)',
    rollingBandInner: 'rgba(100, 180, 255, 0.38)',
    rollingMeanStroke: 'rgba(180, 220, 255, 0.90)',
    annotationLabel: 'rgba(255, 255, 255, 0.95)',
    annotationLabelDark: 'rgba(255, 255, 255, 0.95)',
    referenceStroke: 'rgba(0, 168, 255, 0.85)',
    referenceFill: 'rgba(0, 168, 255, 0.18)',
    dangerFill: 'rgba(249,115,22,0.18)',
};

const LIGHT_PALETTE: ChartPalette = {
    background: '#FFFFFF',
    text: '#334155',
    textDim: '#64748B',
    textMuted: '#687789',
    border: '#CDD6E0',
    borderHi: '#AAB8C5',
    surface: '#FFFFFF',
    surfaceElevated: '#F8FAFC',
    accent: '#006FB8',
    cyan: '#0097A7',
    danger: '#DE350B',
    success: '#00875A',
    warning: '#FF991F',
    overlayBackdrop: 'rgba(15, 23, 42, 0.32)',
    kbdBg: 'linear-gradient(180deg, rgba(15,23,42,0.06) 0%, rgba(15,23,42,0.02) 100%)',
    kbdBorder: 'rgba(15, 23, 42, 0.18)',
    strongOnBrand: '#FFFFFF',
    marginalFill: 'rgba(0, 120, 212, 0.18)',
    marginalStroke: 'rgba(0, 120, 212, 0.95)',
    scatterPoint: '#0078D4',
    pendingPoint: 'rgba(0, 120, 212, 0.95)',
    pendingPointBorder: 'rgba(255, 255, 255, 0.95)',
    anomalyFill: 'rgba(222, 53, 11, 0.12)',
    anomalyStroke: 'rgba(222, 53, 11, 0.55)',
    keepAboveStroke: 'rgba(0, 135, 90, 0.95)',
    keepBelowStroke: 'rgba(222, 53, 11, 0.95)',
    rollingBandOuter: 'rgba(0, 120, 212, 0.16)',
    rollingBandInner: 'rgba(0, 120, 212, 0.30)',
    rollingMeanStroke: 'rgba(0, 120, 212, 0.95)',
    annotationLabel: 'rgba(15, 23, 42, 0.95)',
    annotationLabelDark: 'rgba(15, 23, 42, 0.95)',
    referenceStroke: 'rgba(0, 120, 212, 0.95)',
    referenceFill: 'rgba(0, 120, 212, 0.18)',
    dangerFill: 'rgba(222, 53, 11, 0.16)',
};

let _palette: ChartPalette = _current === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
onThemeChange((theme) => {
    _palette = theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
});

/** Get the chart palette for the currently resolved theme. */
export function getChartPalette(): ChartPalette {
    return _palette;
}

/** Convenience helper: return the palette entry for a single semantic key. */
export function getPaletteColor<K extends keyof ChartPalette>(key: K): ChartPalette[K] {
    return _palette[key];
}
