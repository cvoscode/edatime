import { initUploadPanel } from '../ui/upload.js';
import { initColumnProfilesGrid } from '../ui/profile.js';
import {
    initAnalysisControls,
    initChartPageFilterGesture,
    initPages,
} from '../ui/toolbar.js';
import { initColumnFilterModal } from '../ui/columns.js';
import { initHashRouting } from '../utils/router.js';
import { initCommandPalette } from '../utils/palette.js';
import { initProvenance } from '../utils/provenance.js';
import { initSettings } from '../utils/settings.js';
import { initSettingsPanel } from '../ui/settingsPanel.js';
import { initAnnotations } from '../chart/annotations.js';
import { initAnnotationPanel } from '../ui/annotationPanel.js';
import { disableGuidedWorkflow, enableGuidedWorkflow, goToNextGuidedStep, initGuidedWorkflow } from '../ui/guidedWorkflow.js';
import { initOutlierModal, initTransformModal } from '../ui/dataMutationModals.js';

import { APP_COMMAND_DEFINITIONS, registerAppCommands } from './commands.js';
import { initKeyboardShortcuts } from './shortcuts.js';

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

// Theme toggle — kept here so it stays close to initAppShell
function initThemeToggle(): void {
    const btn = document.getElementById('theme-toggle-btn');
    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');
    if (!btn) return;

    const savedTheme = localStorage.getItem('edatime-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        if (savedTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (iconDark) iconDark.hidden = true;
            if (iconLight) iconLight.hidden = false;
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (iconDark) iconDark.hidden = false;
            if (iconLight) iconLight.hidden = true;
        }
    } else if (prefersDark) {
        if (iconDark) iconDark.hidden = false;
        if (iconLight) iconLight.hidden = true;
    } else {
        if (iconDark) iconDark.hidden = false;
        if (iconLight) iconLight.hidden = true;
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const manualPreference = localStorage.getItem('edatime-theme');
        if (manualPreference) return;
        if (e.matches) {
            document.documentElement.removeAttribute('data-theme');
            if (iconDark) iconDark.hidden = false;
            if (iconLight) iconLight.hidden = true;
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            if (iconDark) iconDark.hidden = true;
            if (iconLight) iconLight.hidden = false;
        }
    });

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

function wireHomeNavigationCards(showPage: (pageName: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
        element.addEventListener('click', () => {
            const target = element.dataset.homeNav;
            if (target) showPage(target);
        });
    });
}

function wireSampleDatasetCards(showPage: (pageName: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-sample-dataset]').forEach((element) => {
        element.addEventListener('click', () => {
            const dataset = element.dataset.sampleDataset;
            if (dataset) {
                loadSampleDataset(dataset, showPage);
            }
        });
    });
}

function generateSinusoidalCsv(): string {
    const rows = ['timestamp,temperature,humidity,pressure'];
    const start = new Date('2024-01-01T00:00:00Z').getTime();
    const end = new Date('2024-01-08T00:00:00Z').getTime();
    const interval = 15 * 60 * 1000; // 15 min
    for (let t = start; t < end; t += interval) {
        const temp = 20 + 5 * Math.sin((t - start) / (3600 * 1000)) + (Math.random() - 0.5) * 0.5;
        const hum = 50 + 20 * Math.sin((t - start) / (7200 * 1000)) + (Math.random() - 0.5) * 2;
        const pres = 1013 + 5 * Math.sin((t - start) / (5400 * 1000)) + (Math.random() - 0.5) * 0.3;
        rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)}`);
    }
    return rows.join('\n');
}

function generateWeatherCsv(): string {
    const rows = ['timestamp,temperature,humidity,pressure,wind_speed'];
    const start = new Date('2024-03-01T00:00:00Z').getTime();
    const end = new Date('2024-03-08T00:00:00Z').getTime();
    const interval = 10 * 60 * 1000; // 10 min
    for (let t = start; t < end; t += interval) {
        const hour = new Date(t).getUTCHours();
        const dayFactor = Math.sin((t - start) / (86400 * 1000));
        const temp = 15 + 8 * dayFactor + 3 * Math.sin(hour * Math.PI / 12) + (Math.random() - 0.5) * 0.5;
        const hum = 60 + 15 * Math.cos((t - start) / (43200 * 1000)) + (Math.random() - 0.5) * 3;
        const pres = 1010 + 8 * dayFactor + (Math.random() - 0.5) * 0.5;
        const wind = 5 + 3 * Math.abs(Math.sin((t - start) / (21600 * 1000))) + (Math.random() - 0.5) * 1;
        rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)},${wind.toFixed(3)}`);
    }
    return rows.join('\n');
}

async function loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void> {
    const { toast } = await import('../utils/toast.js');

    if (datasetId === 'ettm2') {
        const dismissLoading = toast('Loading ETTm2 sample dataset\u2026', 'info', 0);

        // Fetch the static sample file from the backend
        let file: File;
        try {
            const res = await fetch(`/api/sample/ETTm2.csv`);
            if (!res.ok) throw new Error(`Failed to fetch ETTm2.csv: ${res.status}`);
            const blob = await res.blob();
            file = new File([blob], 'ETTm2.csv', { type: 'text/csv' });
        } catch (err) {
            dismissLoading();
            toast(`Could not load ETTm2: ${err}`, 'error');
            return;
        }

        // Navigate to upload page (using showPage to properly update CSS display and hash routing)
        const homePage = document.getElementById('page-home');
        if (homePage) homePage.hidden = true;
        // showPage('upload') will handle making the upload page visible
        showPage('upload');

        // Wait one tick for the upload panel to become visible, then wire the file in
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            dismissLoading();
        } else {
            dismissLoading();
            toast('Upload panel not ready. Please navigate to Upload and drop the file manually.', 'error');
        }
    } else if (datasetId === 'sinusoidal') {
        const dismissLoading = toast('Loading Sinusoidal Waves sample dataset\u2026', 'info', 0);
        const file = new File([generateSinusoidalCsv()], 'sinusoidal.csv', { type: 'text/csv' });
        const homePage = document.getElementById('page-home');
        if (homePage) homePage.hidden = true;
        showPage('upload');
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            dismissLoading();
        } else {
            dismissLoading();
            toast('Upload panel not ready.', 'error');
        }
    } else if (datasetId === 'weather') {
        const dismissLoading = toast('Loading Weather Patterns sample dataset\u2026', 'info', 0);
        const file = new File([generateWeatherCsv()], 'weather.csv', { type: 'text/csv' });
        const homePage = document.getElementById('page-home');
        if (homePage) homePage.hidden = true;
        showPage('upload');
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            dismissLoading();
        } else {
            dismissLoading();
            toast('Upload panel not ready.', 'error');
        }
    }
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
    wireSampleDatasetCards(deps.showPage);
    initUploadPanel(deps.hydrateColumnProfiles, deps.renderColumnProfilesGrid);
    initColumnProfilesGrid();
    initAnalysisControls(deps.fetchAndRender);
    initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange);
    initChartPageFilterGesture();
    initKeyboardShortcuts(deps, APP_COMMAND_DEFINITIONS);
    initCommandPalette();
    initProvenance();
    registerAppCommands(deps);
    initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    deps.initAnalyticsListeners();
}