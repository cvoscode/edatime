/**
 * Deferred shell subsystems.
 *
 * A shell owns one registry for its lifetime. Each subsystem is imported and
 * initialized at most once for that shell, while failures remain retryable.
 * Keeping the registry instance-scoped prevents initialization state leaking
 * between independently mounted app roots and makes the lazy boundary explicit.
 */

import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

export interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface DeferredShellDeps {
    showPage: (pageName: string) => void;
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    fetchAndRender: () => void;
    fetchAndRenderAnalytics: () => Promise<void>;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
    exportChartPng: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    buildTimeseriesColumns: () => void;
    buildTimeseriesRanges: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'setViewport' | 'subscribe'>;
}

export interface DeferredSubsystemRegistry {
    ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void>;
    ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void>;
    ensureSettingsPanel(deps: DeferredShellDeps): Promise<void>;
    openSettings(deps: DeferredShellDeps): Promise<void>;
    ensureCommands(deps: DeferredShellDeps): Promise<void>;
    openCommands(deps: DeferredShellDeps): Promise<void>;
    ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void>;
    ensureAll(deps: DeferredShellDeps): Promise<void>;
}

type Initializer = (deps: DeferredShellDeps) => void | Promise<void>;

interface SubsystemEntry {
    init: Initializer;
    loaded: boolean;
    pending: Promise<void> | null;
}

type CommandDeps = Pick<
    DeferredShellDeps,
    'showPage' | 'zoomOut' | 'resetZoom' | 'exportFilteredCsv' | 'exportFilteredJson' | 'exportChartPng'
> & {
    openCommands: () => Promise<void>;
    openSettings: () => Promise<void>;
    ensureTimeseriesShell: () => Promise<void>;
};

export function createDeferredSubsystemRegistry(): DeferredSubsystemRegistry {
    const subsystems: Record<string, SubsystemEntry> = {};
    let openSettingsModal: (() => void) | null = null;
    let openPalette: (() => void) | null = null;

    function registerSubsystem(name: string, init: Initializer): void {
        subsystems[name] = { init, loaded: false, pending: null };
    }

    async function ensureSubsystem(name: string, deps: DeferredShellDeps): Promise<void> {
        const entry = subsystems[name];
        if (!entry) throw new Error(`Unknown deferred subsystem: ${name}`);
        if (entry.loaded) return;
        if (entry.pending) return entry.pending;

        entry.pending = Promise.resolve(entry.init(deps))
            .then(() => { entry.loaded = true; })
            .finally(() => { entry.pending = null; });
        return entry.pending;
    }

    registerSubsystem('upload-panel', async (deps) => {
        const profileModule = await import('../../ui/profile.js');
        const { initUploadPanel } = await import('../../ui/upload.js');
        initUploadPanel(profileModule.hydrateColumnProfiles, profileModule.renderColumnProfilesGrid, {
            buildColumnToggles: deps.buildTimeseriesColumns,
            buildRangeControls: deps.buildTimeseriesRanges,
            refreshDatasetAfterMutation: () => deps.refreshDatasetAfterMutation(),
        });
    });

    registerSubsystem('column-profiles', async () => {
        const { initColumnProfilesGrid } = await import('../../ui/profile.js');
        initColumnProfilesGrid();
    });

    registerSubsystem('analytics-overlay', async () => {
        const { initAnalyticsDrawer } = await import('../../ui/analyticsDrawer.js');
        initAnalyticsDrawer();
    });

    registerSubsystem('analytics-listeners', async (deps) => {
        const { initAnalyticsListeners } = await import('../../bootstrap/analyticsOverlay.js');
        initAnalyticsListeners(deps.fetchAndRenderAnalytics, deps.workspace);
    });

    registerSubsystem('annotation-subsystems', async () => {
        const { initAnnotations } = await import('../../chart/annotations.js');
        const { initAnnotationPanel } = await import('../../ui/annotationPanel.js');
        initAnnotations();
        initAnnotationPanel();
    });

    registerSubsystem('guided-workflow', async (deps) => {
        const { initGuidedWorkflow } = await import('../../ui/guidedWorkflow.js');
        initGuidedWorkflow({ workspace: deps.workspace, registerCleanup: deps.registerCleanup });
    });

    registerSubsystem('workflow-modals', async (deps) => {
        const { initOutlierModal, initTransformModal } = await import('../../ui/dataMutationModals.js');
        initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
        initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    });

    registerSubsystem('provenance', async () => {
        const { initProvenance } = await import('../../utils/provenance.js');
        initProvenance();
    });

    registerSubsystem('settings-panel', async () => {
        const settingsPanel = await import('../../ui/settingsPanel.js');
        settingsPanel.initSettingsPanel();
        openSettingsModal = settingsPanel.openSettingsModal;
    });

    registerSubsystem('analysis-controls', async (deps) => {
        const { initAnalysisControls, initChartPageFilterGesture } = await import('../../ui/toolbar.js');
        initAnalysisControls(deps.fetchAndRender, deps.zoomOut, deps.resetZoom, deps.workspace);
        initChartPageFilterGesture();
    });

    registerSubsystem('command-palette', async () => {
        const palette = await import('../../utils/palette.js');
        palette.initCommandPalette();
        openPalette = palette.openPalette;
    });

    registerSubsystem('sample-datasets', async (deps) => {
        const { wireSampleDatasetCards } = await import('./sampleDatasets.js');
        wireSampleDatasetCards(deps.showPage, () => deps.refreshDatasetAfterMutation());
    });

    registerSubsystem('app-commands', async (deps) => {
        const { registerAppCommands } = await import('../../bootstrap/commands.js');
        const commandDeps: CommandDeps = {
            showPage: deps.showPage,
            zoomOut: deps.zoomOut,
            resetZoom: deps.resetZoom,
            exportFilteredCsv: deps.exportFilteredCsv,
            exportFilteredJson: deps.exportFilteredJson,
            exportChartPng: deps.exportChartPng,
            openCommands: () => openCommands(deps),
            openSettings: () => openSettings(deps),
            ensureTimeseriesShell: () => ensureTimeseriesShell(deps),
        };
        await registerAppCommands(commandDeps);
    });

    async function ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void> {
        await ensureSubsystem('upload-panel', deps);
        await ensureSubsystem('column-profiles', deps);
    }

    async function ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void> {
        await ensureSubsystem('analysis-controls', deps);
        await ensureSubsystem('analytics-overlay', deps);
        await ensureSubsystem('analytics-listeners', deps);
        await ensureSubsystem('annotation-subsystems', deps);
        await ensureSubsystem('guided-workflow', deps);
        await ensureSubsystem('workflow-modals', deps);
        await ensureSubsystem('provenance', deps);
    }

    async function ensureSettingsPanel(deps: DeferredShellDeps): Promise<void> {
        await ensureSubsystem('settings-panel', deps);
    }

    async function openSettings(deps: DeferredShellDeps): Promise<void> {
        await ensureSettingsPanel(deps);
        openSettingsModal?.();
    }

    async function ensureCommands(deps: DeferredShellDeps): Promise<void> {
        await ensureSubsystem('command-palette', deps);
        await ensureSubsystem('app-commands', deps);
    }

    async function openCommands(deps: DeferredShellDeps): Promise<void> {
        await ensureCommands(deps);
        openPalette?.();
    }

    async function ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void> {
        await ensureSubsystem('sample-datasets', deps);
    }

    async function ensureAll(deps: DeferredShellDeps): Promise<void> {
        await ensureHomeSubsystems(deps);
        await ensureUploadSubsystems(deps);
        await ensureTimeseriesShell(deps);
        await ensureSettingsPanel(deps);
        await ensureCommands(deps);
    }

    return {
        ensureUploadSubsystems,
        ensureTimeseriesShell,
        ensureSettingsPanel,
        openSettings,
        ensureCommands,
        openCommands,
        ensureHomeSubsystems,
        ensureAll,
    };
}
