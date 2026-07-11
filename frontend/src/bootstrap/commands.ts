/**
 * Command palette definitions.
 *
 * Extracted from bootstrap/appShell.ts to reduce its scope.
 */

import type { PaletteCommand } from '../utils/palette.js';

export type CommandDeps = {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
    exportChartPng?: () => void;
    openCommands?: () => void | Promise<void>;
    openSettings?: () => void | Promise<void>;
    ensureTimeseriesShell?: () => void | Promise<void>;
};

export interface CommandDefinition {
    id: string;
    label: string;
    shortcut?: string;
    category: PaletteCommand['category'];
    action: (deps: CommandDeps) => void | Promise<void>;
    keyboard?: { key: string; alt?: boolean; shift?: boolean; page?: string };
}

function triggerAdaptiveFilterClear(): void {
    document.getElementById('adaptive-clear-btn')?.click?.();
}

async function exportSession(): Promise<void> {
    const { exportSessionToFile } = await import('../utils/session.js');
    exportSessionToFile();
}

async function importSession(): Promise<void> {
    const { importSessionFromFile } = await import('../utils/session.js');
    importSessionFromFile();
}

export const APP_COMMAND_DEFINITIONS: ReadonlyArray<CommandDefinition> = [
    { id: 'nav-upload', label: 'Go to Upload', shortcut: 'Alt+1', category: 'Navigation', action: (deps) => deps.showPage('upload'), keyboard: { key: '1', alt: true } },
    { id: 'nav-timeseries', label: 'Go to Timeseries', shortcut: 'Alt+2', category: 'Navigation', action: (deps) => deps.showPage('timeseries'), keyboard: { key: '2', alt: true } },
    { id: 'nav-scatter', label: 'Go to Scatter', shortcut: 'Alt+3', category: 'Navigation', action: (deps) => deps.showPage('scatter'), keyboard: { key: '3', alt: true } },
    { id: 'nav-matrix', label: 'Go to Scatter Matrix', shortcut: 'Alt+4', category: 'Navigation', action: (deps) => deps.showPage('scattermatrix'), keyboard: { key: '4', alt: true } },
    { id: 'nav-fft', label: 'Go to FFT / PSD', shortcut: 'Alt+6', category: 'Navigation', action: (deps) => deps.showPage('fft'), keyboard: { key: '6', alt: true } },
    { id: 'nav-heatmap', label: 'Go to Correlations', shortcut: 'Alt+7', category: 'Navigation', action: (deps) => deps.showPage('correlations'), keyboard: { key: '7', alt: true } },
    { id: 'nav-spectrogram', label: 'Go to Spectrogram', shortcut: 'Alt+8', category: 'Navigation', action: (deps) => deps.showPage('spectrogram'), keyboard: { key: '8', alt: true } },
    { id: 'nav-causal', label: 'Go to Causal', shortcut: 'Alt+9', category: 'Navigation', action: (deps) => deps.showPage('causal'), keyboard: { key: '9', alt: true } },
    { id: 'nav-drift', label: 'Go to Drift Analysis', shortcut: 'Alt+0', category: 'Navigation', action: (deps) => deps.showPage('drift'), keyboard: { key: '0', alt: true } },
    { id: 'chart-reset', label: 'Reset zoom', shortcut: 'Shift+R', category: 'Chart', action: (deps) => deps.resetZoom(), keyboard: { key: 'r', shift: true, page: 'timeseries' } },
    { id: 'chart-zoomout', label: 'Zoom out one level', shortcut: 'Shift+Z', category: 'Chart', action: (deps) => deps.zoomOut(), keyboard: { key: 'z', shift: true, page: 'timeseries' } },
    { id: 'chart-clear-af', label: 'Clear adaptive filters', shortcut: 'Shift+C', category: 'Chart', action: () => triggerAdaptiveFilterClear(), keyboard: { key: 'c', shift: true, page: 'timeseries' } },
    { id: 'export-csv', label: 'Export chart data as CSV', shortcut: 'Shift+E', category: 'Export', action: (deps) => deps.exportFilteredCsv() },
    { id: 'export-json', label: 'Export chart data as JSON', category: 'Export', action: (deps) => deps.exportFilteredJson() },
    { id: 'export-png', label: 'Export chart as PNG', category: 'Export', action: (deps) => deps.exportChartPng?.() },
    { id: 'export-parquet', label: 'Export filtered data as Parquet', category: 'Export', action: () => document.getElementById('export-data-parquet-btn')?.click?.() },
    {
        id: 'session-save',
        label: 'Export session to file',
        category: 'Session',
        action: () => exportSession(),
    },
    {
        id: 'session-load',
        label: 'Import session from file',
        category: 'Session',
        action: () => importSession(),
    },
    {
        id: 'provenance',
        label: 'Show analysis context panel',
        shortcut: 'Ctrl+I',
        category: 'Analysis',
        action: async (deps) => {
            await deps.ensureTimeseriesShell?.();
            const { toggleProvenance } = await import('../utils/provenance.js');
            toggleProvenance();
        },
    },
    {
        id: 'cmd-palette',
        label: 'Open command palette',
        shortcut: 'Ctrl+K',
        category: 'Analysis',
        action: async (deps) => {
            await deps.openCommands?.();
        },
    },
    {
        id: 'settings',
        label: 'Open settings',
        shortcut: 'Ctrl+,',
        category: 'Analysis',
        action: async (deps) => {
            await deps.openSettings?.();
        },
    },
    {
        id: 'workflow-enable',
        label: 'Enable guided workflow',
        category: 'Analysis',
        action: async (deps) => {
            await deps.ensureTimeseriesShell?.();
            const { enableGuidedWorkflow } = await import('../ui/guidedWorkflow.js');
            enableGuidedWorkflow();
        },
    },
    {
        id: 'workflow-disable',
        label: 'Hide guided workflow',
        category: 'Analysis',
        action: async (deps) => {
            await deps.ensureTimeseriesShell?.();
            const { disableGuidedWorkflow } = await import('../ui/guidedWorkflow.js');
            disableGuidedWorkflow();
        },
    },
    {
        id: 'workflow-next',
        label: 'Go to next guided step',
        category: 'Analysis',
        action: async (deps) => {
            await deps.ensureTimeseriesShell?.();
            const { goToNextGuidedStep } = await import('../ui/guidedWorkflow.js');
            goToNextGuidedStep();
        },
    },
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

export async function registerAppCommands(deps: CommandDeps): Promise<void> {
    const { registerCommands } = await import('../utils/palette.js');
    registerCommands(buildPaletteCommands(deps));
}
