/**
 * Command palette definitions.
 *
 * Extracted from bootstrap/appShell.ts to reduce its scope.
 */

import type { PaletteCommand } from '../utils/palette.js';
import { registerCommands } from '../utils/palette.js';

export type CommandDeps = {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
};

export interface CommandDefinition {
    id: string;
    label: string;
    shortcut?: string;
    category: PaletteCommand['category'];
    action: (deps: CommandDeps) => void;
    keyboard?: { key: string; alt?: boolean; shift?: boolean; page?: string };
}

function exportChartFilteredData(format: 'csv' | 'json'): void {
    (window as any).__edatime?.exportChartFilteredData?.(format);
}

function triggerAdaptiveFilterClear(): void {
    document.getElementById('adaptive-clear-btn')?.click?.();
}

export const APP_COMMAND_DEFINITIONS: ReadonlyArray<CommandDefinition> = [
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
    { id: 'session-save', label: 'Export session to file', category: 'Session', action: () => import('../utils/session.js').then(({ exportSessionToFile }) => exportSessionToFile()) },
    { id: 'session-load', label: 'Import session from file', category: 'Session', action: () => import('../utils/session.js').then(({ importSessionFromFile }) => importSessionFromFile()) },
    { id: 'provenance', label: 'Show analysis context panel', shortcut: 'Ctrl+I', category: 'Analysis', action: () => import('../utils/provenance.js').then(({ toggleProvenance }) => toggleProvenance()) },
    { id: 'cmd-palette', label: 'Open command palette', shortcut: 'Ctrl+K', category: 'Analysis', action: () => import('../utils/palette.js').then(({ openPalette }) => openPalette()) },
    { id: 'settings', label: 'Open settings', shortcut: 'Ctrl+,', category: 'Analysis', action: () => import('../ui/settingsPanel.js').then(({ openSettingsModal }) => openSettingsModal()) },
    { id: 'workflow-enable', label: 'Enable guided workflow', category: 'Analysis', action: () => import('../ui/guidedWorkflow.js').then(({ enableGuidedWorkflow }) => enableGuidedWorkflow()) },
    { id: 'workflow-disable', label: 'Hide guided workflow', category: 'Analysis', action: () => import('../ui/guidedWorkflow.js').then(({ disableGuidedWorkflow }) => disableGuidedWorkflow()) },
    { id: 'workflow-next', label: 'Go to next guided step', category: 'Analysis', action: () => import('../ui/guidedWorkflow.js').then(({ goToNextGuidedStep }) => goToNextGuidedStep()) },
];

export function buildPaletteCommands(deps: CommandDeps): PaletteCommand[] {
    return APP_COMMAND_DEFINITIONS.map((definition) => ({
        id: definition.id,
        label: definition.label,
        shortcut: definition.shortcut,
        category: definition.category,
        action: () => definition.action(deps),
    }));
}

export function registerAppCommands(deps: CommandDeps): void {
    registerCommands(buildPaletteCommands(deps));
}
