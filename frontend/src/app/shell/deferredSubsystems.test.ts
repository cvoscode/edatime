import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    initSettingsPanel: vi.fn(),
    openSettingsModal: vi.fn(),
    initCommandPalette: vi.fn(),
    openPalette: vi.fn(),
    registerAppCommands: vi.fn(),
    initAnalyticsDrawer: vi.fn(),
    initAnalyticsListeners: vi.fn(),
    initAnnotations: vi.fn(),
    initAnnotationPanel: vi.fn(),
    initGuidedWorkflow: vi.fn(),
    initOutlierModal: vi.fn(),
    initTransformModal: vi.fn(),
    initProvenance: vi.fn(),
    initAnalysisControls: vi.fn(),
    initChartPageFilterGesture: vi.fn(),
    initTimeseriesHelp: vi.fn(),
}));

vi.mock('../../ui/settingsPanel.js', () => ({
    initSettingsPanel: mocks.initSettingsPanel,
    openSettingsModal: mocks.openSettingsModal,
}));
vi.mock('../../utils/palette.js', () => ({
    initCommandPalette: mocks.initCommandPalette,
    openPalette: mocks.openPalette,
}));
vi.mock('../../bootstrap/commands.js', () => ({ registerAppCommands: mocks.registerAppCommands }));
vi.mock('../../ui/analyticsDrawer.js', () => ({ initAnalyticsDrawer: mocks.initAnalyticsDrawer }));
vi.mock('../../bootstrap/analyticsOverlay.js', () => ({ initAnalyticsListeners: mocks.initAnalyticsListeners }));
vi.mock('../../chart/annotations.js', () => ({ initAnnotations: mocks.initAnnotations }));
vi.mock('../../ui/annotationPanel.js', () => ({ initAnnotationPanel: mocks.initAnnotationPanel }));
vi.mock('../../features/home/index.js', () => ({ initGuidedWorkflow: mocks.initGuidedWorkflow }));
vi.mock('../../features/dataMutation/index.js', () => ({
    initOutlierModal: mocks.initOutlierModal,
    initTransformModal: mocks.initTransformModal,
}));
vi.mock('../../utils/provenance.js', () => ({ initProvenance: mocks.initProvenance }));
vi.mock('../../ui/toolbar.js', () => ({
    initAnalysisControls: mocks.initAnalysisControls,
}));
vi.mock('../../features/timeseries/index.js', () => ({
    initChartPageFilterGesture: mocks.initChartPageFilterGesture,
    initTimeseriesHelp: mocks.initTimeseriesHelp,
}));

import {
    createDeferredSubsystemRegistry,
    type DeferredShellDeps,
} from './deferredSubsystems.js';

function createDeps(): DeferredShellDeps {
    return {
        showPage: vi.fn(),
        ensurePageModuleLoaded: vi.fn(),
        fetchAndRender: vi.fn(),
        fetchAndRenderAnalytics: vi.fn(async () => {}),
        exportFilteredCsv: vi.fn(),
        exportFilteredJson: vi.fn(),
        exportChartPng: vi.fn(),
        refreshDatasetAfterMutation: vi.fn(async () => {}),
        buildTimeseriesColumns: vi.fn(),
        buildTimeseriesRanges: vi.fn(),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        updateAnalysisYRange: vi.fn(),
        registerCleanup: vi.fn(),
        workspace: { getSnapshot: vi.fn(), setFilters: vi.fn(), setViewport: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
    };
}

describe('deferred shell subsystems', () => {
    afterEach(() => {
        mocks.initSettingsPanel.mockClear();
        mocks.openSettingsModal.mockClear();
        mocks.initCommandPalette.mockClear();
        mocks.openPalette.mockClear();
        mocks.registerAppCommands.mockClear();
        mocks.initAnalyticsDrawer.mockClear();
        mocks.initAnalyticsListeners.mockClear();
        mocks.initAnnotations.mockClear();
        mocks.initAnnotationPanel.mockClear();
        mocks.initGuidedWorkflow.mockClear();
        mocks.initOutlierModal.mockClear();
        mocks.initTransformModal.mockClear();
        mocks.initProvenance.mockClear();
        mocks.initAnalysisControls.mockClear();
        mocks.initChartPageFilterGesture.mockClear();
        mocks.initTimeseriesHelp.mockClear();
    });

    it('initializes the settings panel once and opens it through the registry', async () => {
        const deps = createDeps();
        const registry = createDeferredSubsystemRegistry();
        await Promise.all([registry.openSettings(deps), registry.openSettings(deps)]);

        expect(mocks.initSettingsPanel).toHaveBeenCalledTimes(1);
        expect(mocks.openSettingsModal).toHaveBeenCalledTimes(2);
    });

    it('keeps initialization state scoped to the owning shell registry', async () => {
        const deps = createDeps();
        const firstShell = createDeferredSubsystemRegistry();
        const secondShell = createDeferredSubsystemRegistry();

        await firstShell.ensureSettingsPanel(deps);
        await secondShell.ensureSettingsPanel(deps);

        expect(mocks.initSettingsPanel).toHaveBeenCalledTimes(2);
    });

    it('loads command dependencies once, opens the palette, and forwards only the command dependencies they need', async () => {
        const deps = createDeps();
        const registry = createDeferredSubsystemRegistry();
        await registry.openCommands(deps);
        await registry.openCommands(deps);

        expect(mocks.initCommandPalette).toHaveBeenCalledTimes(1);
        expect(mocks.registerAppCommands).toHaveBeenCalledTimes(1);
        expect(mocks.registerAppCommands).toHaveBeenCalledWith({
            showPage: deps.showPage,
            zoomOut: deps.zoomOut,
            resetZoom: deps.resetZoom,
            exportFilteredCsv: deps.exportFilteredCsv,
            exportFilteredJson: deps.exportFilteredJson,
            exportChartPng: deps.exportChartPng,
            openCommands: expect.any(Function),
            openSettings: expect.any(Function),
            ensureTimeseriesShell: expect.any(Function),
        });
        expect(mocks.openPalette).toHaveBeenCalledTimes(2);
    });

    it('wires analytics listeners to the explicit fetch callback instead of the window bridge', async () => {
        const deps = createDeps();
        const registry = createDeferredSubsystemRegistry();
        (window as Window & { __edatime?: Record<string, unknown> }).__edatime = {};

        await registry.ensureTimeseriesShell(deps);

        expect(mocks.initAnalyticsListeners).toHaveBeenCalledWith(expect.any(Function), deps.workspace);

        const callback = mocks.initAnalyticsListeners.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
        await callback?.();

        expect(deps.fetchAndRenderAnalytics).toHaveBeenCalledTimes(1);
    });

    it('initializes Timeseries feature controls through its public surface', async () => {
        const deps = createDeps();
        const registry = createDeferredSubsystemRegistry();

        await registry.ensureTimeseriesShell(deps);

        expect(mocks.initAnalysisControls).toHaveBeenCalledWith(
            deps.fetchAndRender,
            deps.zoomOut,
            deps.resetZoom,
            deps.workspace,
        );
        expect(mocks.initChartPageFilterGesture).toHaveBeenCalledTimes(1);
        expect(mocks.initTimeseriesHelp).toHaveBeenCalledTimes(1);
    });
});
