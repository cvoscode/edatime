/**
 * Deferred shell subsystems.
 *
 * A shell owns one registry for its lifetime. Each subsystem is imported and
 * initialized at most once for that shell, while failures remain retryable.
 * Keeping the registry instance-scoped prevents initialization state leaking
 * between independently mounted app roots and makes the lazy boundary explicit.
 */

import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import type { DataObject } from '../../types/api.js';

export interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface DeferredShellDeps {
    showPage: (pageName: string) => void;
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    fetchAndRender: () => void;
    fetchAndRenderAnalytics: () => Promise<void>;
    getCurrentTimeseriesData: () => DataObject | null;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
    exportChartPng: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    buildTimeseriesColumns: () => void;
    buildTimeseriesRanges: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    requestAnnotationOverlayRender: () => void;
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
        const profileModule = await import('../../features/upload/index.js');
        const { initUploadPanel } = await import('../../features/upload/index.js');
        const disposeUploadPanel = initUploadPanel(profileModule.hydrateColumnProfiles, profileModule.renderColumnProfilesGrid, {
            buildColumnToggles: deps.buildTimeseriesColumns,
            buildRangeControls: deps.buildTimeseriesRanges,
            refreshDatasetAfterMutation: () => deps.refreshDatasetAfterMutation(),
        });
        deps.registerCleanup(disposeUploadPanel);
        // Page-level "?" help button. The helper is idempotent so it's
        // safe to call from inside the upload-panel subsystem.
        const { initUploadHelp } = await import('../../features/upload/index.js');
        deps.registerCleanup(initUploadHelp());
    });

    registerSubsystem('column-profiles', async () => {
        const { initColumnProfilesGrid } = await import('../../features/upload/index.js');
        initColumnProfilesGrid();
    });

    registerSubsystem('analytics-overlay', async (deps) => {
        const { initAnalyticsDrawer } = await import('../../ui/analyticsDrawer.js');
        deps.registerCleanup(initAnalyticsDrawer());
    });

    registerSubsystem('analytics-listeners', async (deps) => {
        const { initAnalyticsListeners } = await import('../../features/timeseries/index.js');
        deps.registerCleanup(initAnalyticsListeners(
            deps.fetchAndRenderAnalytics,
            deps.workspace,
            deps.getCurrentTimeseriesData,
        ));
    });

    registerSubsystem('annotation-subsystems', async (deps) => {
        const { initAnnotations } = await import('../../chart/annotations.js');
        const { initAnnotationPanel } = await import('../../ui/annotationPanel.js');
        initAnnotations();
        deps.registerCleanup(initAnnotationPanel({
            requestOverlayRender: deps.requestAnnotationOverlayRender,
            getViewport: () => {
                const viewport = deps.workspace.getSnapshot().viewport;
                if (!viewport) return null;
                return { start: Number(viewport.xMin), end: Number(viewport.xMax) };
            },
        }));
    });

    registerSubsystem('guided-workflow', async (deps) => {
        const { initGuidedWorkflow } = await import('../../features/home/index.js');
        initGuidedWorkflow({ workspace: deps.workspace, registerCleanup: deps.registerCleanup });
    });

    registerSubsystem('workflow-modals', async (deps) => {
        const { initOutlierModal, initTransformModal } = await import('../../features/dataMutation/index.js');
        initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
        initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation, workspace: deps.workspace });
    });

    registerSubsystem('provenance', async (deps) => {
        const { initProvenance } = await import('../../utils/provenance.js');
        deps.registerCleanup(initProvenance(deps.workspace));
    });

    registerSubsystem('settings-panel', async (deps) => {
        const settingsPanel = await import('../../ui/settingsPanel.js');
        deps.registerCleanup(settingsPanel.initSettingsPanel());
        openSettingsModal = settingsPanel.openSettingsModal;
    });

    registerSubsystem('analysis-controls', async (deps) => {
        const { initAnalysisControls } = await import('../../ui/toolbar.js');
        const { initTimeseriesHelp } = await import('../../features/timeseries/index.js');
        initAnalysisControls(deps.fetchAndRender, deps.zoomOut, deps.resetZoom, deps.workspace);
        // Page-level "?" help button. The helper is idempotent so it's
        // safe to call from inside the analysis-controls subsystem.
        deps.registerCleanup(initTimeseriesHelp());
    });

    registerSubsystem('command-palette', async (deps) => {
        const palette = await import('../../utils/palette.js');
        deps.registerCleanup(palette.initCommandPalette());
        openPalette = palette.openPalette;
    });

    registerSubsystem('sample-datasets', async (deps) => {
        const { wireSampleDatasetCards } = await import('../../features/home/index.js');
        wireSampleDatasetCards(deps.showPage, () => deps.refreshDatasetAfterMutation());
    });

    registerSubsystem('page-help', async (deps) => {
        // Page-level "?" help buttons. The home page is wired here; the
        // other pages opt in by adding a "<pageId>-help-btn" trigger
        // and importing initPageHelp from their own page module. The
        // `initPageHelp` helper is idempotent, so calling it from
        // multiple subsystem loaders is safe.
        const { initHomePage } = await import('../../features/home/index.js');
        deps.registerCleanup(initHomePage());
    });

    registerSubsystem('app-commands', async (deps) => {
        const { registerAppCommands } = await import('./commands.js');
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
        await ensureSubsystem('page-help', deps);
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
