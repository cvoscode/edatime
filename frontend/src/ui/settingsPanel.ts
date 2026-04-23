/**
 * Settings panel modal UI.
 *
 * Provides a tabbed interface for appearance, export, analytics, and workflow settings.
 */

import {
    type AppSettings,
    type ThemeMode,
    type LayoutDensity,
    type ExportFormat,
    type CorrelationMetric,
    loadSettings,
    saveSettings,
    applyTheme,
    applyLayoutDensity,
    CHART_PALETTES,
    DEFAULT_SETTINGS,
} from '../utils/settings.js';
import { SERIES_COLORS, appState } from '../state.js';

let currentSettings: AppSettings | null = null;
let activeTab = 'appearance';

/** Open the settings modal. */
export function openSettingsModal(): void {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    currentSettings = loadSettings();
    populateSettingsForm(currentSettings);
    setActiveTab('appearance');
    modal.hidden = false;
}

/** Close the settings modal. */
export function closeSettingsModal(): void {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = true;
    currentSettings = null;
}

/** Set the active tab in the settings modal. */
function setActiveTab(tab: string): void {
    activeTab = tab;

    // Update tab buttons
    document.querySelectorAll<HTMLElement>('.settings-tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab panels
    document.querySelectorAll<HTMLElement>('.settings-tab-panel').forEach((panel) => {
        panel.hidden = panel.dataset.tab !== tab;
    });
}

/** Populate form fields from settings object. */
function populateSettingsForm(settings: AppSettings): void {
    // Appearance tab
    setSelectValue('settings-theme', settings.theme);
    setSelectValue('settings-layout', settings.layoutDensity);
    setSelectValue('settings-palette', settings.defaultPalette);

    // Export tab
    setSelectValue('settings-export-format', settings.defaultExportFormat);
    setCheckboxValue('settings-white-bg', settings.whiteBackgroundExport);

    // Analytics tab
    setSelectValue('settings-correlation', settings.defaultCorrelationMetric);

    // Causal tab
    setSelectValue('settings-causal-method', settings.defaultCausalMethod);
    setInputValue('settings-tau-max', settings.defaultTauMax.toString());

    // Spectral tab
    setSelectValue('settings-fft-preset', settings.defaultFftPreset);

    // Render palette preview
    renderPalettePreview(settings.defaultPalette);
}

/** Collect form values into a settings object. */
function collectSettingsFromForm(): AppSettings {
    return {
        theme: getSelectValue('settings-theme') as ThemeMode || DEFAULT_SETTINGS.theme,
        layoutDensity: getSelectValue('settings-layout') as LayoutDensity || DEFAULT_SETTINGS.layoutDensity,
        defaultPalette: getSelectValue('settings-palette') || DEFAULT_SETTINGS.defaultPalette,
        defaultExportFormat: getSelectValue('settings-export-format') as ExportFormat || DEFAULT_SETTINGS.defaultExportFormat,
        whiteBackgroundExport: getCheckboxValue('settings-white-bg'),
        defaultCorrelationMetric: getSelectValue('settings-correlation') as CorrelationMetric || DEFAULT_SETTINGS.defaultCorrelationMetric,
        defaultCausalMethod: getSelectValue('settings-causal-method') || DEFAULT_SETTINGS.defaultCausalMethod,
        defaultTauMax: parseInt(getInputValue('settings-tau-max'), 10) || DEFAULT_SETTINGS.defaultTauMax,
        defaultFftPreset: getSelectValue('settings-fft-preset') || DEFAULT_SETTINGS.defaultFftPreset,
    };
}

/** Apply settings and close modal. */
function applySettings(): void {
    const settings = collectSettingsFromForm();
    saveSettings(settings);

    // Apply immediately
    applyTheme(settings.theme);
    applyLayoutDensity(settings.layoutDensity);

    // Update global palette if changed
    if (CHART_PALETTES[settings.defaultPalette]) {
        const palette = CHART_PALETTES[settings.defaultPalette];
        // Update SERIES_COLORS in-place
        SERIES_COLORS.length = 0;
        SERIES_COLORS.push(...palette);
    }

    closeSettingsModal();
}

/** Reset settings to defaults. */
function resetSettings(): void {
    currentSettings = { ...DEFAULT_SETTINGS };
    populateSettingsForm(currentSettings);
}

/** Render a preview of the selected color palette. */
function renderPalettePreview(paletteName: string): void {
    const container = document.getElementById('settings-palette-preview');
    if (!container) return;

    const colors = CHART_PALETTES[paletteName] || CHART_PALETTES.default;
    container.innerHTML = colors
        .map((color) => `<span class="palette-swatch" style="background:${color}" title="${color}"></span>`)
        .join('');
}

// ─── Helper functions ──────────────────────────────────────────────────────

function setSelectValue(id: string, value: string): void {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    if (el) el.value = value;
}

function getSelectValue(id: string): string {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    return el?.value || '';
}

function setInputValue(id: string, value: string): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = value;
}

function getInputValue(id: string): string {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el?.value || '';
}

function setCheckboxValue(id: string, checked: boolean): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.checked = checked;
}

function getCheckboxValue(id: string): boolean {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el?.checked || false;
}

// ─── Initialization ────────────────────────────────────────────────────────

/** Initialize the settings panel event handlers. */
export function initSettingsPanel(): void {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // Close button
    document.getElementById('settings-close-btn')?.addEventListener('click', closeSettingsModal);
    document.getElementById('settings-cancel-btn')?.addEventListener('click', closeSettingsModal);

    // Backdrop click to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSettingsModal();
    });

    // Apply button
    document.getElementById('settings-apply-btn')?.addEventListener('click', applySettings);

    // Reset button
    document.getElementById('settings-reset-btn')?.addEventListener('click', resetSettings);

    // Tab switching
    document.querySelectorAll<HTMLElement>('.settings-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) setActiveTab(tab);
        });
    });

    // Palette preview update
    document.getElementById('settings-palette')?.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value;
        renderPalettePreview(value);
    });

    // Theme preview (live update as user changes)
    document.getElementById('settings-theme')?.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value as ThemeMode;
        applyTheme(value);
    });

    // Layout density preview
    document.getElementById('settings-layout')?.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value as LayoutDensity;
        applyLayoutDensity(value);
    });

    // Settings button in header
    document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal);

    // Keyboard shortcut: Ctrl+,
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            openSettingsModal();
        }
    });
}
