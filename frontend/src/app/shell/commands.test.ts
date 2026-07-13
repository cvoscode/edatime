import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    registerCommands: vi.fn(),
    toggleProvenance: vi.fn(),
    exportSessionToFile: vi.fn(),
    importSessionFromFile: vi.fn(),
    enableGuidedWorkflow: vi.fn(),
    disableGuidedWorkflow: vi.fn(),
    goToNextGuidedStep: vi.fn(),
}));

vi.mock('../../utils/palette.js', () => ({ registerCommands: mocks.registerCommands }));
vi.mock('../../utils/provenance.js', () => ({ toggleProvenance: mocks.toggleProvenance }));
vi.mock('../../utils/session.js', () => ({
    exportSessionToFile: mocks.exportSessionToFile,
    importSessionFromFile: mocks.importSessionFromFile,
}));
vi.mock('../../features/home/index.js', () => ({
    disableGuidedWorkflow: mocks.disableGuidedWorkflow,
    enableGuidedWorkflow: mocks.enableGuidedWorkflow,
    goToNextGuidedStep: mocks.goToNextGuidedStep,
}));

describe('shell command registry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<button id="adaptive-clear-btn" type="button"></button>';
    });

    it('registers command-palette entries with their supported actions', async () => {
        const { registerAppCommands } = await import('./commands.js');
        const showPage = vi.fn();
        const zoomOut = vi.fn();
        const resetZoom = vi.fn();
        const exportChartFilteredData = vi.fn();
        const exportChartPng = vi.fn();
        const openCommands = vi.fn(async () => {});
        const openSettings = vi.fn(async () => {});
        const ensureTimeseriesShell = vi.fn(async () => {});

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
        const commands = mocks.registerCommands.mock.calls[0][0] as Array<{ id: string; action: () => void | Promise<void> }>;

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

        expect(showPage).toHaveBeenCalledWith('correlations');
        expect(resetZoom).toHaveBeenCalledTimes(1);
        expect(zoomOut).toHaveBeenCalledTimes(1);
        expect(exportChartFilteredData).toHaveBeenCalledWith('csv');
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
});
