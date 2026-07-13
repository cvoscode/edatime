import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    registerCommands: vi.fn(),
    openPalette: vi.fn(),
    toggleProvenance: vi.fn(),
    openSettingsModal: vi.fn(),
    exportSessionToFile: vi.fn(),
    importSessionFromFile: vi.fn(),
    enableGuidedWorkflow: vi.fn(),
    disableGuidedWorkflow: vi.fn(),
    goToNextGuidedStep: vi.fn(),
}));

vi.mock('../ui/upload.js', () => ({ initUploadPanel: vi.fn() }));
vi.mock('../features/upload/index.js', () => ({ initColumnProfilesGrid: vi.fn() }));
vi.mock('../ui/toolbar.js', () => ({
    initAnalysisControls: vi.fn(),
    initChartPageFilterGesture: vi.fn(),
    initPages: vi.fn(),
}));
vi.mock('../ui/columns.js', () => ({ initColumnFilterModal: vi.fn() }));
vi.mock('../utils/router.js', () => ({ initHashRouting: vi.fn() }));
vi.mock('../utils/palette.js', () => ({
    initCommandPalette: vi.fn(),
    openPalette: mocks.openPalette,
    registerCommands: mocks.registerCommands,
}));
vi.mock('../utils/provenance.js', () => ({
    initProvenance: vi.fn(),
    toggleProvenance: mocks.toggleProvenance,
}));
vi.mock('../utils/settings.js', () => ({ initSettings: vi.fn() }));
vi.mock('../ui/settingsPanel.js', () => ({
    initSettingsPanel: vi.fn(),
    openSettingsModal: mocks.openSettingsModal,
}));
vi.mock('../chart/annotations.js', () => ({ initAnnotations: vi.fn() }));
vi.mock('../ui/annotationPanel.js', () => ({ initAnnotationPanel: vi.fn() }));
vi.mock('../features/home/index.js', () => ({
    disableGuidedWorkflow: mocks.disableGuidedWorkflow,
    enableGuidedWorkflow: mocks.enableGuidedWorkflow,
    goToNextGuidedStep: mocks.goToNextGuidedStep,
    initGuidedWorkflow: vi.fn(),
}));
vi.mock('../utils/session.js', () => ({
    exportSessionToFile: mocks.exportSessionToFile,
    importSessionFromFile: mocks.importSessionFromFile,
}));
vi.mock('../ui/dataMutationModals.js', () => ({
    initOutlierModal: vi.fn(),
    initTransformModal: vi.fn(),
}));

function buildDom(page = 'timeseries'): void {
    document.body.innerHTML = `
        <div class="page" data-page-name="timeseries" ${page === 'timeseries' ? '' : 'hidden'}></div>
        <div class="page" data-page-name="scatter" ${page === 'scatter' ? '' : 'hidden'}></div>
        <button id="adaptive-clear-btn" type="button"></button>
        <button id="scatter-export-csv-btn" type="button"></button>
    `;
}

describe('appShell helpers', () => {
    const cleanups: Array<() => void> = [];

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        (window as any).__edatime = {};
    });

    afterEach(async () => {
        while (cleanups.length > 0) {
            cleanups.pop()?.();
        }
        // Reset the shortcuts module's _bound flag so tests are independent
        const { __resetKeyboardShortcutsForTest } = await import('./shortcuts.js');
        __resetKeyboardShortcutsForTest();
    });

    it('registers command palette entries with working actions', async () => {
        const { registerAppCommands } = await import('./commands.js');
        const showPage = vi.fn();
        const zoomOut = vi.fn();
        const resetZoom = vi.fn();
        const exportChartFilteredData = vi.fn();
        const exportChartPng = vi.fn();
        const openCommands = vi.fn(async () => { });
        const openSettings = vi.fn(async () => { });
        const ensureTimeseriesShell = vi.fn(async () => { });

        await registerAppCommands({
            showPage,
            zoomOut,
            resetZoom,
            exportFilteredCsv: () => exportChartFilteredData('csv'),
            exportFilteredJson: () => exportChartFilteredData('json'),
            exportChartPng,
            openCommands,
            openSettings,
            ensureTimeseriesShell,
        });

        expect(mocks.registerCommands).toHaveBeenCalledTimes(1);
        const commands = mocks.registerCommands.mock.calls[0][0] as Array<{ id: string; action: () => void }>;

        commands.find((command) => command.id === 'nav-heatmap')?.action();
        commands.find((command) => command.id === 'chart-reset')?.action();
        commands.find((command) => command.id === 'chart-zoomout')?.action();
        commands.find((command) => command.id === 'export-csv')?.action();
        commands.find((command) => command.id === 'export-png')?.action();
        await commands.find((command) => command.id === 'provenance')?.action();
        await commands.find((command) => command.id === 'workflow-enable')?.action();
        await commands.find((command) => command.id === 'workflow-disable')?.action();
        await commands.find((command) => command.id === 'workflow-next')?.action();
        await commands.find((command) => command.id === 'cmd-palette')?.action();
        await commands.find((command) => command.id === 'settings')?.action();
        await commands.find((command) => command.id === 'session-save')?.action();
        await commands.find((command) => command.id === 'session-load')?.action();

        expect(exportChartPng).toHaveBeenCalledTimes(1);
        expect(ensureTimeseriesShell).toHaveBeenCalledTimes(4);
        expect(mocks.toggleProvenance).toHaveBeenCalledTimes(1);
        expect(mocks.enableGuidedWorkflow).toHaveBeenCalledTimes(1);
        expect(mocks.disableGuidedWorkflow).toHaveBeenCalledTimes(1);
        expect(mocks.goToNextGuidedStep).toHaveBeenCalledTimes(1);
        expect(openCommands).toHaveBeenCalledTimes(1);
        expect(openSettings).toHaveBeenCalledTimes(1);
        expect(mocks.exportSessionToFile).toHaveBeenCalledTimes(1);
        expect(mocks.importSessionFromFile).toHaveBeenCalledTimes(1);
    });

    it('binds navigation and timeseries keyboard shortcuts', async () => {
        buildDom('timeseries');
        const { initKeyboardShortcuts } = await import('./shortcuts.js');
        const { APP_COMMAND_DEFINITIONS } = await import('./commands.js');
        const showPage = vi.fn();
        const zoomOut = vi.fn();
        const resetZoom = vi.fn();
        const cleanupFns: Array<() => void> = [];
        const exportChartFilteredData = vi.fn();
        const adaptiveClear = vi.fn();

        document.getElementById('adaptive-clear-btn')?.addEventListener('click', adaptiveClear);

        initKeyboardShortcuts({
            showPage,
            zoomOut,
            resetZoom,
            exportFilteredCsv: () => exportChartFilteredData('csv'),
            exportFilteredJson: () => exportChartFilteredData('json'),
            registerCleanup: (cleanup: () => void) => {
                cleanupFns.push(cleanup);
                cleanups.push(cleanup);
            },
        }, APP_COMMAND_DEFINITIONS);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: '7', altKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', shiftKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', shiftKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', shiftKey: true, bubbles: true }));

        expect(showPage).toHaveBeenCalledWith('correlations');
        expect(resetZoom).toHaveBeenCalledTimes(1);
        expect(zoomOut).toHaveBeenCalledTimes(1);
        expect(adaptiveClear).toHaveBeenCalledTimes(1);
        expect(exportChartFilteredData).toHaveBeenCalledWith('csv');
        expect((window as any).__edatime?.keyboardShortcutsBound).toBeUndefined();
        expect(cleanupFns).toHaveLength(1);
    });

    it('ignores typing targets and uses scatter export on the scatter page', async () => {
        buildDom('scatter');
        const { initKeyboardShortcuts } = await import('./shortcuts.js');
        const { APP_COMMAND_DEFINITIONS } = await import('./commands.js');
        const showPage = vi.fn();
        const zoomOut = vi.fn();
        const resetZoom = vi.fn();
        const scatterExport = vi.fn();
        const input = document.createElement('input');
        document.body.appendChild(input);
        const btn = document.getElementById('scatter-export-csv-btn');
        btn?.addEventListener('click', scatterExport);

        initKeyboardShortcuts({
            showPage,
            zoomOut,
            resetZoom,
            exportFilteredCsv: vi.fn(),
            exportFilteredJson: vi.fn(),
            registerCleanup: (cleanup: () => void) => cleanups.push(cleanup),
        }, APP_COMMAND_DEFINITIONS);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', shiftKey: true, bubbles: true }));

        expect(showPage).not.toHaveBeenCalled();
        expect(resetZoom).not.toHaveBeenCalled();
        expect(zoomOut).not.toHaveBeenCalled();
        // Shift+E triggers KEYBOARD_ONLY shortcut which calls triggerActivePageCsvExport
        // that dispatches a click event on #scatter-export-csv-btn
        const clickedBtn = btn;
        if (clickedBtn) {
            expect(scatterExport).toHaveBeenCalledTimes(1);
        } else {
            expect(scatterExport).not.toHaveBeenCalled();
        }
    });
});
