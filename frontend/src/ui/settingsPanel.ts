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
    type PlotColorScaleKey,
    loadSettings,
    saveSettings,
    applyTheme,
    applyLayoutDensity,
    applyDefaultPalette,
    DEFAULT_SETTINGS,
    MIN_INLINE_EXPORT_ROWS,
    MIN_PARQUET_EXPORT_ROWS,
    normalizeSpectrogramPointLimit,
    normalizeExportRowLimit,
} from '../utils/settings.js';
import { getSeriesPalette } from '../utils/seriesColors.js';
import { paletteForColorScale } from '../utils/colorScales.js';
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
    setSelectValue('settings-spectrogram-max-points', String(settings.spectrogramMaxPoints));

    // Plot colors tab
    setSelectValue('settings-scale-signals', settings.plotColorScales.signals);
    setSelectValue('settings-scale-pair-plot', settings.plotColorScales.pairPlot);
    setSelectValue('settings-scale-correlation', settings.plotColorScales.correlationMatrix);
    setSelectValue('settings-scale-time-frequency', settings.plotColorScales.timeFrequency);

    // Timeseries tab
    setCheckboxValue('settings-draw-auto-reset', settings.drawAutoReset);
    setCheckboxValue('settings-sidebar-collapsed', settings.sidebarCollapsed);

    // Export tab
    setInputValue('settings-inline-export-row-limit', String(settings.inlineExportRowLimit));
    setInputValue('settings-parquet-export-row-limit', String(settings.parquetExportRowLimit));

    // Render palette preview
    renderPalettePreview(settings.defaultPalette);
    renderPlotScalePreviews(settings.plotColorScales);
}

/** Collect form values into a settings object. */
function collectSettingsFromForm(): AppSettings {
    return {
        theme: getSelectValue('settings-theme') as ThemeMode || DEFAULT_SETTINGS.theme,
        layoutDensity: getSelectValue('settings-layout') as LayoutDensity || DEFAULT_SETTINGS.layoutDensity,
        defaultPalette: (getSelectValue('settings-palette') as AppSettings['defaultPalette']) || DEFAULT_SETTINGS.defaultPalette,
        defaultCorrelationMetric: getSelectValue('settings-correlation') as CorrelationMetric || DEFAULT_SETTINGS.defaultCorrelationMetric,
        spectrogramMaxPoints: normalizeSpectrogramPointLimit(getSelectValue('settings-spectrogram-max-points')),
        drawAutoReset: getCheckboxValue('settings-draw-auto-reset'),
        plotColorScales: {
            signals: getSelectValue('settings-scale-signals') as ColorScaleName || DEFAULT_SETTINGS.plotColorScales.signals,
            pairPlot: getSelectValue('settings-scale-pair-plot') as ColorScaleName || DEFAULT_SETTINGS.plotColorScales.pairPlot,
            correlationMatrix: getSelectValue('settings-scale-correlation') as ColorScaleName || DEFAULT_SETTINGS.plotColorScales.correlationMatrix,
            timeFrequency: getSelectValue('settings-scale-time-frequency') as ColorScaleName || DEFAULT_SETTINGS.plotColorScales.timeFrequency,
        },
        sidebarCollapsed: getCheckboxValue('settings-sidebar-collapsed'),
        inlineExportRowLimit: normalizeExportRowLimit(
            getInputValue('settings-inline-export-row-limit'),
            MIN_INLINE_EXPORT_ROWS,
        ),
        parquetExportRowLimit: normalizeExportRowLimit(
            getInputValue('settings-parquet-export-row-limit'),
            MIN_PARQUET_EXPORT_ROWS,
        ),
    };
}

function syncDraftSettings(): AppSettings {
    draftSettings = collectSettingsFromForm();
    return draftSettings;
}

/** Apply settings and close modal. */
function applySettings(): void {
    const settings = syncDraftSettings();
    // Apply runtime choices before persisting. Saving emits the shared
    // settings-changed event, so every chart sees the new palette state.
    applyTheme(settings.theme);
    applyLayoutDensity(settings.layoutDensity);
    applyDefaultPalette(settings.defaultPalette);
    saveSettings(settings);

    currentSettings = { ...settings };
    skipPreviewRevertOnClose = true;
    clearUnsavedChanges();
    closeSettingsModal();
}

/** Reset settings to defaults. */
function resetSettings(): void {
    draftSettings = { ...DEFAULT_SETTINGS, plotColorScales: { ...DEFAULT_SETTINGS.plotColorScales } };
    populateSettingsForm(draftSettings);
    applyTheme(draftSettings.theme);
    applyLayoutDensity(draftSettings.layoutDensity);
    markUnsavedChanges();
}

function renderPlotScalePreviews(scales: AppSettings['plotColorScales']): void {
    (Object.keys(scales) as PlotColorScaleKey[]).forEach((plot) => {
        const preview = document.querySelector<HTMLElement>(`[data-scale-preview="${plot}"]`);
        if (!preview) return;
        const colors = paletteForColorScale(scales[plot]);
        preview.style.background = `linear-gradient(90deg, ${colors.join(',')})`;
    });
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
let disposeSettingsPanel: (() => void) | null = null;

export function initSettingsPanel(): () => void {
    if (disposeSettingsPanel) return disposeSettingsPanel;
    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal };
    // Page-level "?" help button. Idempotent so safe to call on every
    // settings-panel init.
    const disposeSettingsHelp = initSettingsHelp();
    // Apply button
    document.getElementById('settings-apply-btn')?.addEventListener('click', applySettings, listenerOptions);

    // Reset button
    document.getElementById('settings-reset-btn')?.addEventListener('click', resetSettings, listenerOptions);

    // Tab switching
    document.querySelectorAll<HTMLElement>('.settings-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) setActiveTab(tab);
        }, listenerOptions);
    });

    // Palette preview update
    document.getElementById('settings-palette')?.addEventListener('change', () => {
        const draft = syncDraftSettings();
        renderPalettePreview(draft.defaultPalette);
        markUnsavedChanges();
    }, listenerOptions);

    // Theme preview (live update as user changes)
    document.getElementById('settings-theme')?.addEventListener('change', () => {
        const draft = syncDraftSettings();
        applyTheme(draft.theme);
        markUnsavedChanges();
    }, listenerOptions);

    // Layout density preview
    document.getElementById('settings-layout')?.addEventListener('change', () => {
        const draft = syncDraftSettings();
        applyLayoutDensity(draft.layoutDensity);
        markUnsavedChanges();
    }, listenerOptions);

    document.getElementById('settings-correlation')?.addEventListener('change', markUnsavedChanges, listenerOptions);
    document.getElementById('settings-spectrogram-max-points')?.addEventListener('change', markUnsavedChanges, listenerOptions);
    document.getElementById('settings-draw-auto-reset')?.addEventListener('change', markUnsavedChanges, listenerOptions);
    document.querySelectorAll<HTMLElement>('[data-plot-color-scale]').forEach((select) => {
        select.addEventListener('change', () => {
            const draft = syncDraftSettings();
            renderPlotScalePreviews(draft.plotColorScales);
            markUnsavedChanges();
        }, listenerOptions);
    });
    document.getElementById('settings-sidebar-collapsed')?.addEventListener('change', markUnsavedChanges, listenerOptions);

    // Settings button in header
    document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal, listenerOptions);

    // Keyboard shortcut: Ctrl+,
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            openSettingsModal();
        }
    }, listenerOptions);

    const dispose = () => {
        abortController.abort();
        disposeSettingsHelp();
        controller.dispose();
        if (disposeSettingsPanel === dispose) disposeSettingsPanel = null;
    };
    disposeSettingsPanel = dispose;
    return dispose;
}
