import { describe, expect, it, vi } from 'vitest';

vi.mock('../ui/upload.js', () => ({ initUploadPanel: vi.fn() }));
vi.mock('../ui/profile.js', () => ({ initColumnProfilesGrid: vi.fn() }));
vi.mock('../ui/toolbar.js', () => ({
    initAnalysisControls: vi.fn(),
    initChartPageFilterGesture: vi.fn(),
    initPages: vi.fn(),
}));
vi.mock('../ui/columns.js', () => ({ initColumnFilterModal: vi.fn(), buildRangeControls: vi.fn() }));
vi.mock('../utils/router.js', () => ({ initHashRouting: vi.fn() }));
vi.mock('../utils/palette.js', () => ({
    initCommandPalette: vi.fn(),
    openPalette: vi.fn(),
    registerCommands: vi.fn(),
}));
vi.mock('../utils/provenance.js', () => ({ initProvenance: vi.fn() }));
vi.mock('../utils/settings.js', () => ({ initSettings: vi.fn(), getSetting: vi.fn() }));
vi.mock('../ui/settingsPanel.js', () => ({ initSettingsPanel: vi.fn() }));
vi.mock('../chart/annotations.js', () => ({ initAnnotations: vi.fn() }));
vi.mock('../ui/annotationPanel.js', () => ({ initAnnotationPanel: vi.fn() }));
vi.mock('../ui/guidedWorkflow.js', () => ({ initGuidedWorkflow: vi.fn() }));
vi.mock('../ui/analyticsDrawer.js', () => ({ initAnalyticsDrawer: vi.fn() }));
vi.mock('../ui/dataMutationModals.js', () => ({
    initOutlierModal: vi.fn(),
    initTransformModal: vi.fn(),
}));
vi.mock('../bootstrap/commands.js', () => ({
    APP_COMMAND_DEFINITIONS: [],
    registerAppCommands: vi.fn(),
}));
vi.mock('../bootstrap/shortcuts.js', () => ({ initKeyboardShortcuts: vi.fn() }));

describe('shell bootstrap', () => {
    it('initializes global shell services without owning feature-specific behavior', async () => {
        const deps = {
            showPage: vi.fn(),
            ensurePageModuleLoaded: vi.fn(),
            initAnalyticsListeners: vi.fn(),
            registerCleanup: vi.fn(),
        };
        const { initAppShell } = await import('./shell.js');
        initAppShell(deps as any);
        expect(deps.initAnalyticsListeners).toHaveBeenCalledTimes(1);
    });
});
