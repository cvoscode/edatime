/**
 * Settings panel modal UI.
 *
 * Provides a tabbed interface for appearance, export, analytics, and workflow settings.
 */

import {
    type AppSettings,
    type ThemeMode,
    type LayoutDensity,
    type CorrelationMetric,
    type ColorScaleName,
    loadSettings,
    saveSettings,
    applyTheme,
    applyLayoutDensity,
    applyDefaultPalette,
    DEFAULT_SETTINGS,
} from '../utils/settings.js';
import { getSeriesPalette } from '../utils/seriesColors.js';
import { createModalController } from './shell/createModalController';
import { getDropdownValue, setDropdownValue } from './primitives/Dropdown.js';
import { initSettingsHelp } from './settingsHelp.js';

let currentSettings: AppSettings | null = null;
let draftSettings: AppSettings | null = null;
let activeTab = 'appearance';
let previewBaseline: Pick<AppSettings, 'theme' | 'layoutDensity'> | null = null;
let skipPreviewRevertOnClose = false;
let hasUnsavedChanges = false;

function syncApplyIndicator(): void {
    const indicator = document.getElementById('settings-apply-indicator');
    if (!indicator) return;
    indicator.hidden = !hasUnsavedChanges;
}

function markUnsavedChanges(): void {
    hasUnsavedChanges = true;
    syncApplyIndicator();
}

function clearUnsavedChanges(): void {
    hasUnsavedChanges = false;
    syncApplyIndicator();
}

const controller = createModalController({
    modalId: 'settings-modal',
    closeButtonIds: ['settings-close-btn', 'settings-cancel-btn'],
    onOpen: () => {
        currentSettings = loadSettings();
        draftSettings = { ...currentSettings };
        previewBaseline = {
            theme: currentSettings.theme,
            layoutDensity: currentSettings.layoutDensity,
        };
        skipPreviewRevertOnClose = false;
        clearUnsavedChanges();
        populateSettingsForm(draftSettings);
        setActiveTab('appearance');
    },
    onClose: () => {
        if (!skipPreviewRevertOnClose && previewBaseline) {
            applyTheme(previewBaseline.theme);
            applyLayoutDensity(previewBaseline.layoutDensity);
        }
        currentSettings = null;
        draftSettings = null;
        previewBaseline = null;
        skipPreviewRevertOnClose = false;
        clearUnsavedChanges();
    },
});

/** Open the settings modal. */
export function openSettingsModal(): void {
    controller.open();
}

/** Close the settings modal. */
export function closeSettingsModal(): void {
    controller.close();
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

    // Analytics tab
    setSelectValue('settings-correlation', settings.defaultCorrelationMetric);

    // Timeseries tab
    setCheckboxValue('settings-draw-auto-reset', settings.drawAutoReset);
    setSelectValue('settings-color-scale', settings.colorScale);
    setCheckboxValue('settings-sidebar-collapsed', settings.sidebarCollapsed);

    // Render palette preview
    renderPalettePreview(settings.defaultPalette);
}

/** Collect form values into a settings object. */
function collectSettingsFromForm(): AppSettings {
    return {
        theme: getSelectValue('settings-theme') as ThemeMode || DEFAULT_SETTINGS.theme,
        layoutDensity: getSelectValue('settings-layout') as LayoutDensity || DEFAULT_SETTINGS.layoutDensity,
        defaultPalette: (getSelectValue('settings-palette') as AppSettings['defaultPalette']) || DEFAULT_SETTINGS.defaultPalette,
        defaultCorrelationMetric: getSelectValue('settings-correlation') as CorrelationMetric || DEFAULT_SETTINGS.defaultCorrelationMetric,
        drawAutoReset: getCheckboxValue('settings-draw-auto-reset'),
        colorScale: getSelectValue('settings-color-scale') as ColorScaleName || DEFAULT_SETTINGS.colorScale,
        sidebarCollapsed: getCheckboxValue('settings-sidebar-collapsed'),
    };
}

function syncDraftSettings(): AppSettings {
    draftSettings = collectSettingsFromForm();
    return draftSettings;
}

/** Apply settings and close modal. */
function applySettings(): void {
    const settings = syncDraftSettings();
    saveSettings(settings);

    // Apply immediately
    applyTheme(settings.theme);
    applyLayoutDensity(settings.layoutDensity);

    applyDefaultPalette(settings.defaultPalette);

    currentSettings = { ...settings };
    skipPreviewRevertOnClose = true;
    clearUnsavedChanges();
    closeSettingsModal();
}

/** Reset settings to defaults. */
function resetSettings(): void {
    draftSettings = { ...DEFAULT_SETTINGS };
    populateSettingsForm(draftSettings);
    applyTheme(draftSettings.theme);
    applyLayoutDensity(draftSettings.layoutDensity);
    markUnsavedChanges();
}

/** Render a preview of the selected color palette. */
function renderPalettePreview(paletteName: string): void {
    const container = document.getElementById('settings-palette-preview');
    if (!container) return;

    const colors = getSeriesPalette(paletteName);
    container.innerHTML = colors
        .map((color) => `<span class="palette-swatch" style="background:${color}" title="${color}"></span>`)
        .join('');
}

// ─── Helper functions ──────────────────────────────────────────────────────

function setSelectValue(id: string, value: string): void {
    setDropdownValue(id, value);
}

function getSelectValue(id: string): string {
    return getDropdownValue(id);
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
    // Page-level "?" help button. Idempotent so safe to call on every
    // settings-panel init.
    initSettingsHelp();
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
    document.getElementById('settings-palette')?.addEventListener('change', () => {
        const draft = syncDraftSettings();
        renderPalettePreview(draft.defaultPalette);
        markUnsavedChanges();
    });

    // Theme preview (live update as user changes)
    document.getElementById('settings-theme')?.addEventListener('change', () => {
        const draft = syncDraftSettings();
        applyTheme(draft.theme);
        markUnsavedChanges();
    });

    // Layout density preview
    document.getElementById('settings-layout')?.addEventListener('change', () => {
        const draft = syncDraftSettings();
        applyLayoutDensity(draft.layoutDensity);
        markUnsavedChanges();
    });

    document.getElementById('settings-correlation')?.addEventListener('change', markUnsavedChanges);
    document.getElementById('settings-draw-auto-reset')?.addEventListener('change', markUnsavedChanges);
    document.getElementById('settings-color-scale')?.addEventListener('change', markUnsavedChanges);
    document.getElementById('settings-sidebar-collapsed')?.addEventListener('change', markUnsavedChanges);

    // Settings button in header
    document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal);

    // Keyboard shortcut: Ctrl+,
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            openSettingsModal();
        }
    });
}
