import { initUploadPanel } from '../ui/upload.js';
import { initColumnProfilesGrid } from '../ui/profile.js';
import {
    initAnalysisControls,
    initChartPageFilterGesture,
    initPages,
} from '../ui/toolbar.js';
import { initColumnFilterModal } from '../ui/columns.js';
import { initHashRouting } from '../utils/router.js';
import { initCommandPalette, openPalette, registerCommands } from '../utils/palette.js';
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

        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            if (key === '1') { event.preventDefault(); deps.showPage('upload'); return; }
            if (key === '2') { event.preventDefault(); deps.showPage('timeseries'); return; }
            if (key === '3') { event.preventDefault(); deps.showPage('scatter'); return; }
            if (key === '4') { event.preventDefault(); deps.showPage('scattermatrix'); return; }
            if (key === '6') { event.preventDefault(); deps.showPage('fft'); return; }
            if (key === '7') { event.preventDefault(); deps.showPage('heatmap'); return; }
            if (key === '8') { event.preventDefault(); deps.showPage('spectrogram'); return; }
            if (key === '9') { event.preventDefault(); deps.showPage('causal'); return; }
            if (key === '0') { event.preventDefault(); deps.showPage('drift'); return; }
        }

        if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        if (key === 'r' && currentPageName() === 'timeseries') { event.preventDefault(); deps.resetZoom(); return; }
        if (key === 'z' && currentPageName() === 'timeseries') { event.preventDefault(); deps.zoomOut(); return; }
        if (key === 'c' && currentPageName() === 'timeseries') { event.preventDefault(); document.getElementById('adaptive-clear-btn')?.click?.(); return; }
        if (key === 'e') {
            event.preventDefault();
            if (currentPageName() === 'scatter') document.getElementById('scatter-export-csv-btn')?.click?.();
            else (window as any).__edatime?.exportChartFilteredData?.('csv');
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
    registerCommands([
        { id: 'nav-upload', label: 'Go to Upload', shortcut: 'Alt+1', category: 'Navigation', action: () => deps.showPage('upload') },
        { id: 'nav-timeseries', label: 'Go to Timeseries', shortcut: 'Alt+2', category: 'Navigation', action: () => deps.showPage('timeseries') },
        { id: 'nav-scatter', label: 'Go to Scatter', shortcut: 'Alt+3', category: 'Navigation', action: () => deps.showPage('scatter') },
        { id: 'nav-matrix', label: 'Go to Scatter Matrix', shortcut: 'Alt+4', category: 'Navigation', action: () => deps.showPage('scattermatrix') },
        { id: 'nav-fft', label: 'Go to FFT / PSD', shortcut: 'Alt+6', category: 'Navigation', action: () => deps.showPage('fft') },
        { id: 'nav-heatmap', label: 'Go to Heatmap', shortcut: 'Alt+7', category: 'Navigation', action: () => deps.showPage('heatmap') },
        { id: 'nav-spectrogram', label: 'Go to Spectrogram', shortcut: 'Alt+8', category: 'Navigation', action: () => deps.showPage('spectrogram') },
        { id: 'nav-causal', label: 'Go to Causal', shortcut: 'Alt+9', category: 'Navigation', action: () => deps.showPage('causal') },
        { id: 'nav-drift', label: 'Go to Drift Analysis', shortcut: 'Alt+0', category: 'Navigation', action: () => deps.showPage('drift') },
        { id: 'chart-reset', label: 'Reset zoom', shortcut: 'Shift+R', category: 'Chart', action: deps.resetZoom },
        { id: 'chart-zoomout', label: 'Zoom out one level', shortcut: 'Shift+Z', category: 'Chart', action: deps.zoomOut },
        { id: 'chart-clear-af', label: 'Clear adaptive filters', shortcut: 'Shift+C', category: 'Chart', action: () => document.getElementById('adaptive-clear-btn')?.click?.() },
        { id: 'export-csv', label: 'Export chart data as CSV', shortcut: 'Shift+E', category: 'Export', action: () => (window as any).__edatime?.exportChartFilteredData?.('csv') },
        { id: 'export-json', label: 'Export chart data as JSON', category: 'Export', action: () => (window as any).__edatime?.exportChartFilteredData?.('json') },
        { id: 'export-png', label: 'Export chart as PNG', category: 'Export', action: () => (window as any).__edatime?.chart?.exportPNG?.() },
        { id: 'export-parquet', label: 'Export filtered data as Parquet', category: 'Export', action: () => document.getElementById('export-parquet-btn')?.click?.() },
        { id: 'session-save', label: 'Export session to file', category: 'Session', action: exportSessionToFile },
        { id: 'session-load', label: 'Import session from file', category: 'Session', action: importSessionFromFile },
        { id: 'provenance', label: 'Show analysis context panel', shortcut: 'Ctrl+I', category: 'Analysis', action: toggleProvenance },
        { id: 'cmd-palette', label: 'Open command palette', shortcut: 'Ctrl+K', category: 'Analysis', action: openPalette },
        { id: 'settings', label: 'Open settings', shortcut: 'Ctrl+,', category: 'Analysis', action: openSettingsModal },
        { id: 'workflow-enable', label: 'Enable guided workflow', category: 'Analysis', action: enableGuidedWorkflow },
        { id: 'workflow-disable', label: 'Hide guided workflow', category: 'Analysis', action: disableGuidedWorkflow },
        { id: 'workflow-next', label: 'Go to next guided step', category: 'Analysis', action: goToNextGuidedStep },
    ]);
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