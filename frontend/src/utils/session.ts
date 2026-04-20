/**
 * Session save / restore for EdaTime.
 *
 * Serialises the user's analysis state (selected columns, zoom, filters,
 * chart settings, page, scatter choices, etc.) to JSON.
 * Provides localStorage auto-save and manual JSON export/import.
 */

import { appState } from '../state.js';
import { toast } from './toast.js';

const STORAGE_KEY = 'edatime-session';

/** The serialisable subset of appState. */
export interface SessionSnapshot {
    version: 1;
    timestamp: number;
    page: string;
    selectedCols: string[];
    seriesColors: Record<string, string>;
    columnRanges: Record<string, { from: number; to: number }>;
    adaptiveLineFilters: Array<{
        column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean;
    }>;
    currentStart: number | null;
    currentEnd: number | null;
    selectedColorColumn: string | null;
    chartText: { title: string; xLabel: string; yLabel: string };
    rollingEnabled: boolean;
    rollingWindow: number;
    anomalyEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    scatterX: string;
    scatterY: string;
    scatterColorColumn: string;
    scatterRenderMode: string;
    theme: string;
}

function currentPage(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement)?.dataset?.pageName || 'upload';
}

function readSelect(id: string): string {
    return (document.getElementById(id) as HTMLSelectElement | null)?.value || '';
}

/** Capture the current analysis state as a serialisable snapshot. */
export function captureSession(): SessionSnapshot {
    return {
        version: 1,
        timestamp: Date.now(),
        page: currentPage(),
        selectedCols: [...appState.selectedCols],
        seriesColors: { ...appState.seriesColors },
        columnRanges: { ...appState.columnRanges },
        adaptiveLineFilters: appState.adaptiveLineFilters.map((f) => ({ ...f })),
        currentStart: appState.currentStart,
        currentEnd: appState.currentEnd,
        selectedColorColumn: appState.selectedColorColumn,
        chartText: { ...appState.chartText },
        rollingEnabled: appState.rollingEnabled,
        rollingWindow: appState.rollingWindow,
        anomalyEnabled: appState.anomalyEnabled,
        anomalyMethod: appState.anomalyMethod,
        anomalyThreshold: appState.anomalyThreshold,
        scatterX: readSelect('scatter-x-col'),
        scatterY: readSelect('scatter-y-col'),
        scatterColorColumn: readSelect('scatter-color-column'),
        scatterRenderMode: readSelect('scatter-render-mode'),
        theme: document.documentElement.getAttribute('data-theme') || 'dark',
    };
}

/** Restore appState from a snapshot. Does NOT trigger re-renders — caller should. */
export function applySession(snap: SessionSnapshot): void {
    if (!snap || snap.version !== 1) return;

    appState.selectedCols = Array.isArray(snap.selectedCols) ? snap.selectedCols : [];
    if (snap.seriesColors) appState.seriesColors = { ...snap.seriesColors };
    if (snap.columnRanges) appState.columnRanges = { ...snap.columnRanges };
    if (Array.isArray(snap.adaptiveLineFilters)) appState.adaptiveLineFilters = snap.adaptiveLineFilters.map((f) => ({ ...f }));
    if (Number.isFinite(snap.currentStart)) appState.currentStart = snap.currentStart;
    if (Number.isFinite(snap.currentEnd)) appState.currentEnd = snap.currentEnd;
    if (snap.selectedColorColumn !== undefined) appState.selectedColorColumn = snap.selectedColorColumn;
    if (snap.chartText) appState.chartText = { ...snap.chartText };
    if (snap.rollingEnabled !== undefined) appState.rollingEnabled = snap.rollingEnabled;
    if (Number.isFinite(snap.rollingWindow)) appState.rollingWindow = snap.rollingWindow;
    if (snap.anomalyEnabled !== undefined) appState.anomalyEnabled = snap.anomalyEnabled;
    if (snap.anomalyMethod) appState.anomalyMethod = snap.anomalyMethod;
    if (Number.isFinite(snap.anomalyThreshold)) appState.anomalyThreshold = snap.anomalyThreshold;

    // Restore scatter dropdowns
    const setSelect = (id: string, val: string) => {
        const el = document.getElementById(id) as HTMLSelectElement | null;
        if (el && val) el.value = val;
    };
    setSelect('scatter-x-col', snap.scatterX);
    setSelect('scatter-y-col', snap.scatterY);
    setSelect('scatter-color-column', snap.scatterColorColumn);
    setSelect('scatter-render-mode', snap.scatterRenderMode);

    // Restore theme
    if (snap.theme === 'light' || snap.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', snap.theme);
        localStorage.setItem('edatime-theme', snap.theme);
    }

    // Navigate to the saved page
    if (snap.page) {
        const btn = document.querySelector(`.sidebar .nav-item[data-page="${snap.page}"]`) as HTMLElement | null;
        btn?.click();
    }
}

// ─── localStorage persistence ───────────────────────────────────────────────

export function autoSaveSession(): void {
    try {
        const snap = captureSession();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch { /* quota exceeded — silent */ }
}

export function autoRestoreSession(): SessionSnapshot | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw) as SessionSnapshot;
        if (snap?.version !== 1) return null;
        return snap;
    } catch {
        return null;
    }
}

export function clearSavedSession(): void {
    localStorage.removeItem(STORAGE_KEY);
}

// ─── JSON file export / import ──────────────────────────────────────────────

export function exportSessionToFile(): void {
    const snap = captureSession();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edatime-session-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Session exported', 'success');
}

export function importSessionFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const snap = JSON.parse(reader.result as string) as SessionSnapshot;
                if (snap?.version !== 1) throw new Error('Invalid session file');
                applySession(snap);
                toast('Session restored from file', 'success');
                // Trigger re-render by dispatching custom event
                window.dispatchEvent(new CustomEvent('edatime:session-restored'));
            } catch (e: any) {
                toast(`Failed to import session: ${e.message}`, 'error');
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

// ─── Auto-save on navigation / filter changes ───────────────────────────────

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function initAutoSave(): void {
    const debouncedSave = () => {
        if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
        _autoSaveTimer = setTimeout(autoSaveSession, 2000);
    };

    window.addEventListener('edatime:page-change', debouncedSave);
    window.addEventListener('edatime:column-filters-change', debouncedSave);
    window.addEventListener('edatime:adaptive-filters-change', debouncedSave);
    window.addEventListener('beforeunload', autoSaveSession);
}
