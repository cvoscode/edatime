/**
 * Deferred shell subsystems.
 *
 * Houses heavier UI subsystems that should not block the initial app
 * chunk: upload panel, analytics drawer / listeners, annotations, guided
 * workflow, transform & outlier modals, provenance, the column profile
 * grid, command palette, sample dataset cards, analysis controls, and
 * keyboard shortcuts. Subsystems are loaded on demand where that creates a
 * real chunk boundary; modules already owned by startup are imported normally
 * so Rollup does not warn about fake-lazy imports.
 *
 * The contract is intentionally small: every initializer receives only
 * the dependencies it actually needs (see `DeferredShellDeps`).
 */

export interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface DeferredShellDeps {
    showPage: (pageName: string) => void;
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    fetchAndRender: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    buildTimeseriesColumns: () => void;
    buildTimeseriesRanges: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    registerCleanup: (cleanup: () => void) => void;
}

type Initializer = (deps: DeferredShellDeps) => void | Promise<void>;

interface SubsystemEntry {
    init: Initializer;
    loaded: boolean;
    pending: Promise<void> | null;
}

type CommandDeps = {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
};

const SUBSYSTEMS: Record<string, SubsystemEntry> = {};

function registerSubsystem(name: string, init: Initializer): void {
    if (!SUBSYSTEMS[name]) {
        SUBSYSTEMS[name] = { init, loaded: false, pending: null };
    }
}

async function ensureSubsystem(name: string, deps: DeferredShellDeps): Promise<void> {
    const entry = SUBSYSTEMS[name];
    if (!entry) {
        throw new Error(`Unknown deferred subsystem: ${name}`);
    }
    if (entry.loaded) return;
    if (entry.pending) return entry.pending;
    entry.pending = Promise.resolve(entry.init(deps))
        .then(() => {
            entry.loaded = true;
        })
        .finally(() => {
            entry.pending = null;
        });
    return entry.pending;
}

/* ── Subsystem registrations ─────────────────────────────────────────────── */

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

registerSubsystem('analytics-listeners', async () => {
    const { initAnalyticsListeners } = await import('../../bootstrap/analyticsOverlay.js');
    initAnalyticsListeners(() => Promise.resolve(
        (window as unknown as { __edatime?: { runAnalytics?: () => Promise<void> } }).__edatime?.runAnalytics?.(),
    ));
});

registerSubsystem('annotation-subsystems', async () => {
    const { initAnnotations } = await import('../../chart/annotations.js');
    const { initAnnotationPanel } = await import('../../ui/annotationPanel.js');
    initAnnotations();
    initAnnotationPanel();
});

registerSubsystem('guided-workflow', async () => {
    const { initGuidedWorkflow } = await import('../../ui/guidedWorkflow.js');
    initGuidedWorkflow();
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
    const { initSettingsPanel, openSettingsModal } = await import('../../ui/settingsPanel.js');
    initSettingsPanel();
    (window as unknown as { __edatime?: { openSettingsModal?: () => void } }).__edatime = (window as unknown as { __edatime?: { openSettingsModal?: () => void } }).__edatime || {};
    (window as unknown as { __edatime?: { openSettingsModal?: () => void } }).__edatime!.openSettingsModal = openSettingsModal;
});

registerSubsystem('analysis-controls', async (deps) => {
    const { initAnalysisControls, initChartPageFilterGesture } = await import('../../ui/toolbar.js');
    initAnalysisControls(deps.fetchAndRender);
    initChartPageFilterGesture();
});

registerSubsystem('command-palette', async () => {
    const { initCommandPalette, openPalette } = await import('../../utils/palette.js');
    initCommandPalette();
    (window as unknown as { __edatime?: { openPalette?: () => void } }).__edatime = (window as unknown as { __edatime?: { openPalette?: () => void } }).__edatime || {};
    (window as unknown as { __edatime?: { openPalette?: () => void } }).__edatime!.openPalette = openPalette;
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
    };
    await registerAppCommands(commandDeps);
});

/* ── Public API ──────────────────────────────────────────────────────────── */

export async function ensureUploadSubsystems(deps: DeferredShellDeps): Promise<void> {
    await ensureSubsystem('upload-panel', deps);
    await ensureSubsystem('column-profiles', deps);
}

export async function ensureTimeseriesShell(deps: DeferredShellDeps): Promise<void> {
    await ensureSubsystem('analysis-controls', deps);
    await ensureSubsystem('analytics-overlay', deps);
    await ensureSubsystem('analytics-listeners', deps);
    await ensureSubsystem('annotation-subsystems', deps);
    await ensureSubsystem('guided-workflow', deps);
    await ensureSubsystem('workflow-modals', deps);
    await ensureSubsystem('provenance', deps);
}

export async function ensureSettingsPanel(deps: DeferredShellDeps): Promise<void> {
    await ensureSubsystem('settings-panel', deps);
}

export async function ensureCommands(deps: DeferredShellDeps): Promise<void> {
    await ensureSubsystem('command-palette', deps);
    await ensureSubsystem('app-commands', deps);
}

export async function ensureHomeSubsystems(deps: DeferredShellDeps): Promise<void> {
    await ensureSubsystem('sample-datasets', deps);
}

export async function ensureAll(deps: DeferredShellDeps): Promise<void> {
    await ensureHomeSubsystems(deps);
    await ensureUploadSubsystems(deps);
    await ensureTimeseriesShell(deps);
    await ensureSettingsPanel(deps);
    await ensureCommands(deps);
}

/**
 * Reset the registry (used in tests).
 */
export function _resetDeferredSubsystems(): void {
    for (const pokey of Object.keys(SUBSYSTEMS)) {
        SUBSYSTEMS[pokey].loaded = false;
        SUBSYSTEMS[pokey].pending = null;
    }
}
