import { initUploadPanel } from '../ui/upload.js';
import { initColumnProfilesGrid } from '../ui/profile.js';
import {
    initAnalysisControls,
    initChartPageFilterGesture,
    initPages,
} from '../ui/toolbar.js';
import { initColumnFilterModal } from '../ui/columns.js';
import { initHashRouting } from '../utils/router.js';
import { initCommandPalette, openPalette, registerCommands, type PaletteCommand } from '../utils/palette.js';
import { initProvenance, toggleProvenance } from '../utils/provenance.js';
import { initSettings } from '../utils/settings.js';
import { initSettingsPanel, openSettingsModal } from '../ui/settingsPanel.js';
import { initAnnotations } from '../chart/annotations.js';
import { initAnnotationPanel } from '../ui/annotationPanel.js';
import { disableGuidedWorkflow, enableGuidedWorkflow, goToNextGuidedStep, initGuidedWorkflow } from '../ui/guidedWorkflow.js';
import { exportSessionToFile, importSessionFromFile } from '../utils/session.js';
import { initOutlierModal, initTransformModal } from '../ui/dataMutationModals.js';

interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface AppShellDeps {
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    showPage: (pageName: string) => void;
    fetchAndRender: () => void;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    initAnalyticsListeners: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    hydrateColumnProfiles: (...args: any[]) => void;
    renderColumnProfilesGrid: (...args: any[]) => void;
    registerCleanup: (cleanup: () => void) => void;
}

type AppCommandDeps = Pick<AppShellDeps, 'showPage' | 'zoomOut' | 'resetZoom'>;

interface KeyboardShortcutDefinition {
    key: string;
    alt?: boolean;
    shift?: boolean;
    page?: string;
    action: (deps: AppCommandDeps) => void;
}

interface AppCommandDefinition {
    id: string;
    label: string;
    shortcut?: string;
    category: PaletteCommand['category'];
    action: (deps: AppCommandDeps) => void;
    keyboard?: Omit<KeyboardShortcutDefinition, 'action'>;
}

function exportChartFilteredData(format: 'csv' | 'json'): void {
    (window as any).__edatime?.exportChartFilteredData?.(format);
}

function triggerAdaptiveFilterClear(): void {
    document.getElementById('adaptive-clear-btn')?.click?.();
}

function triggerActivePageCsvExport(): void {
    if (currentPageName() === 'scatter') {
        document.getElementById('scatter-export-csv-btn')?.click?.();
        return;
    }
    exportChartFilteredData('csv');
}

const APP_COMMAND_DEFINITIONS: ReadonlyArray<AppCommandDefinition> = [
    { id: 'nav-upload', label: 'Go to Upload', shortcut: 'Alt+1', category: 'Navigation', action: (deps) => deps.showPage('upload'), keyboard: { key: '1', alt: true } },
    { id: 'nav-timeseries', label: 'Go to Timeseries', shortcut: 'Alt+2', category: 'Navigation', action: (deps) => deps.showPage('timeseries'), keyboard: { key: '2', alt: true } },
    { id: 'nav-scatter', label: 'Go to Scatter', shortcut: 'Alt+3', category: 'Navigation', action: (deps) => deps.showPage('scatter'), keyboard: { key: '3', alt: true } },
    { id: 'nav-matrix', label: 'Go to Scatter Matrix', shortcut: 'Alt+4', category: 'Navigation', action: (deps) => deps.showPage('scattermatrix'), keyboard: { key: '4', alt: true } },
    { id: 'nav-fft', label: 'Go to FFT / PSD', shortcut: 'Alt+6', category: 'Navigation', action: (deps) => deps.showPage('fft'), keyboard: { key: '6', alt: true } },
    { id: 'nav-heatmap', label: 'Go to Heatmap', shortcut: 'Alt+7', category: 'Navigation', action: (deps) => deps.showPage('heatmap'), keyboard: { key: '7', alt: true } },
    { id: 'nav-spectrogram', label: 'Go to Spectrogram', shortcut: 'Alt+8', category: 'Navigation', action: (deps) => deps.showPage('spectrogram'), keyboard: { key: '8', alt: true } },
    { id: 'nav-causal', label: 'Go to Causal', shortcut: 'Alt+9', category: 'Navigation', action: (deps) => deps.showPage('causal'), keyboard: { key: '9', alt: true } },
    { id: 'nav-drift', label: 'Go to Drift Analysis', shortcut: 'Alt+0', category: 'Navigation', action: (deps) => deps.showPage('drift'), keyboard: { key: '0', alt: true } },
    { id: 'chart-reset', label: 'Reset zoom', shortcut: 'Shift+R', category: 'Chart', action: (deps) => deps.resetZoom(), keyboard: { key: 'r', shift: true, page: 'timeseries' } },
    { id: 'chart-zoomout', label: 'Zoom out one level', shortcut: 'Shift+Z', category: 'Chart', action: (deps) => deps.zoomOut(), keyboard: { key: 'z', shift: true, page: 'timeseries' } },
    { id: 'chart-clear-af', label: 'Clear adaptive filters', shortcut: 'Shift+C', category: 'Chart', action: () => triggerAdaptiveFilterClear(), keyboard: { key: 'c', shift: true, page: 'timeseries' } },
    { id: 'export-csv', label: 'Export chart data as CSV', shortcut: 'Shift+E', category: 'Export', action: () => exportChartFilteredData('csv') },
    { id: 'export-json', label: 'Export chart data as JSON', category: 'Export', action: () => exportChartFilteredData('json') },
    { id: 'export-png', label: 'Export chart as PNG', category: 'Export', action: () => (window as any).__edatime?.chart?.exportPNG?.() },
    { id: 'export-parquet', label: 'Export filtered data as Parquet', category: 'Export', action: () => document.getElementById('export-parquet-btn')?.click?.() },
    { id: 'session-save', label: 'Export session to file', category: 'Session', action: () => exportSessionToFile() },
    { id: 'session-load', label: 'Import session from file', category: 'Session', action: () => importSessionFromFile() },
    { id: 'provenance', label: 'Show analysis context panel', shortcut: 'Ctrl+I', category: 'Analysis', action: () => toggleProvenance() },
    { id: 'cmd-palette', label: 'Open command palette', shortcut: 'Ctrl+K', category: 'Analysis', action: () => openPalette() },
    { id: 'settings', label: 'Open settings', shortcut: 'Ctrl+,', category: 'Analysis', action: () => openSettingsModal() },
    { id: 'workflow-enable', label: 'Enable guided workflow', category: 'Analysis', action: () => enableGuidedWorkflow() },
    { id: 'workflow-disable', label: 'Hide guided workflow', category: 'Analysis', action: () => disableGuidedWorkflow() },
    { id: 'workflow-next', label: 'Go to next guided step', category: 'Analysis', action: () => goToNextGuidedStep() },
];

const KEYBOARD_ONLY_SHORTCUTS: ReadonlyArray<KeyboardShortcutDefinition> = [
    { key: 'e', shift: true, action: () => triggerActivePageCsvExport() },
];

function buildPaletteCommands(deps: AppCommandDeps): PaletteCommand[] {
    return APP_COMMAND_DEFINITIONS.map((definition) => ({
        id: definition.id,
        label: definition.label,
        shortcut: definition.shortcut,
        category: definition.category,
        action: () => definition.action(deps),
    }));
}

function matchesKeyboardShortcut(
    shortcut: Pick<KeyboardShortcutDefinition, 'key' | 'alt' | 'shift' | 'page'>,
    key: string,
    pageName: string,
    options: Pick<KeyboardShortcutDefinition, 'alt' | 'shift'>,
): boolean {
    return shortcut.key === key
        && Boolean(shortcut.alt) === Boolean(options.alt)
        && Boolean(shortcut.shift) === Boolean(options.shift)
        && (!shortcut.page || shortcut.page === pageName);
}

function findMatchingKeyboardShortcut(
    key: string,
    pageName: string,
    options: Pick<KeyboardShortcutDefinition, 'alt' | 'shift'>,
): KeyboardShortcutDefinition | undefined {
    const commandShortcut = APP_COMMAND_DEFINITIONS.find((definition) => {
        const keyboard = definition.keyboard;
        return keyboard && matchesKeyboardShortcut(keyboard, key, pageName, options);
    });
    if (commandShortcut?.keyboard) {
        return {
            ...commandShortcut.keyboard,
            action: commandShortcut.action,
        };
    }
    return KEYBOARD_ONLY_SHORTCUTS.find((shortcut) => matchesKeyboardShortcut(shortcut, key, pageName, options));
}

function initThemeToggle(): void {
    const btn = document.getElementById('theme-toggle-btn');
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (!btn) return;

    const saved = localStorage.getItem('edatime-theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (iconDark) iconDark.hidden = true;
        if (iconLight) iconLight.hidden = false;
    }

    btn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('edatime-theme', 'dark');
            if (iconDark) iconDark.hidden = false;
            if (iconLight) iconLight.hidden = true;
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('edatime-theme', 'light');
            if (iconDark) iconDark.hidden = true;
            if (iconLight) iconLight.hidden = false;
        }
    });
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function currentPageName(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement | null)?.dataset?.pageName || 'upload';
}

function humanizeControlId(id: string): string {
    return String(id || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeFormControlAccessibility(): void {
    const controls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
    controls.forEach((control) => {
        if (!control.name && control.id) {
            control.name = control.id;
        }

        if (control.getAttribute('aria-label')) return;

        const labelledByText = Array.from(control.labels || [])
            .map((label) => label.textContent?.replace(/\s+/g, ' ').trim() || '')
            .filter(Boolean)
            .join(' ');
        const placeholder = control.getAttribute('placeholder') || '';
        const title = control.getAttribute('title') || '';
        const fallback = humanizeControlId(control.id) || (control.type === 'file' ? 'Upload file' : 'Form field');
        const derived = labelledByText || placeholder || title || fallback;
        if (derived) {
            control.setAttribute('aria-label', derived);
        }
    });
}

export function initKeyboardShortcuts(deps: Pick<AppShellDeps, 'showPage' | 'zoomOut' | 'resetZoom' | 'registerCleanup'>): void {
    if ((window as any).__edatime?.keyboardShortcutsBound) return;
    (window as any).__edatime = (window as any).__edatime || {};

    const onKeydown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || isTypingTarget(event.target)) return;
        const key = String(event.key || '').toLowerCase();
        const pageName = currentPageName();

        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            const shortcut = findMatchingKeyboardShortcut(key, pageName, { alt: true, shift: false });
            if (shortcut) {
                event.preventDefault();
                shortcut.action(deps);
                return;
            }
        }

        if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const shortcut = findMatchingKeyboardShortcut(key, pageName, { alt: false, shift: true });
        if (shortcut) {
            event.preventDefault();
            shortcut.action(deps);
        }
    };

    window.addEventListener('keydown', onKeydown);
    deps.registerCleanup(() => window.removeEventListener('keydown', onKeydown));
    (window as any).__edatime.keyboardShortcutsBound = true;
}

function wireHomeNavigationCards(showPage: (pageName: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
        element.addEventListener('click', () => {
            const target = element.dataset.homeNav;
            if (target) showPage(target);
        });
    });
}

export function registerAppCommands(deps: Pick<AppShellDeps, 'showPage' | 'zoomOut' | 'resetZoom'>): void {
    registerCommands(buildPaletteCommands(deps));
}

export function initAppShell(deps: AppShellDeps): void {
    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.ensurePageModuleLoaded = deps.ensurePageModuleLoaded;
    normalizeFormControlAccessibility();

    initPages();
    initHashRouting();
    initSettings();
    initAnnotations();
    initAnnotationPanel();
    initGuidedWorkflow();
    initThemeToggle();
    initSettingsPanel();
    wireHomeNavigationCards(deps.showPage);
    initUploadPanel(deps.hydrateColumnProfiles, deps.renderColumnProfilesGrid);
    initColumnProfilesGrid();
    initAnalysisControls(deps.fetchAndRender);
    initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange);
    initChartPageFilterGesture();
    initKeyboardShortcuts(deps);
    initCommandPalette();
    initProvenance();
    registerAppCommands(deps);
    initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    deps.initAnalyticsListeners();
}