import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./shell/themeToggle.js', () => ({ initThemeToggle: vi.fn() }));
vi.mock('./shell/a11yNormalization.js', () => ({ normalizeFormControlAccessibility: vi.fn() }));
vi.mock('./shell/homeNavigation.js', () => ({ wireHomeNavigationCards: vi.fn() }));
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

beforeEach(() => {
    vi.clearAllMocks();
    (window as Window & { __edatime?: Record<string, unknown> }).__edatime = {};
});

describe('shell bootstrap', () => {
    it('initializes only core shell services eagerly', async () => {
        const deps = {
            showPage: vi.fn(),
            ensurePageModuleLoaded: vi.fn(),
            registerCleanup: vi.fn(),
        };
        const { initAppShell } = await import('./shell.js');
        initAppShell(deps as any);

        const { initUploadPanel } = await import('../ui/upload.js');
        const { initAnalyticsDrawer } = await import('../ui/analyticsDrawer.js');
        expect(initUploadPanel).not.toHaveBeenCalled();
        expect(initAnalyticsDrawer).not.toHaveBeenCalled();

        expect((window as any).__edatime.ensureSubsystem).toBeTypeOf('function');
    });

    it('delegates to core shell modules without eagerly wiring deferred subsystems', async () => {
        const { initThemeToggle } = await import('./shell/themeToggle.js');
        const { normalizeFormControlAccessibility } = await import('./shell/a11yNormalization.js');
        const { wireHomeNavigationCards } = await import('./shell/homeNavigation.js');

        const deps = {
            showPage: vi.fn(),
            ensurePageModuleLoaded: vi.fn(),
            registerCleanup: vi.fn(),
        };
        const { initAppShell } = await import('./shell.js');
        initAppShell(deps as any);

        expect(normalizeFormControlAccessibility).toHaveBeenCalledTimes(1);
        expect(initThemeToggle).toHaveBeenCalledTimes(1);
        expect(wireHomeNavigationCards).toHaveBeenCalledWith(deps.showPage);
    });

    it('keeps navigation dependencies explicit instead of publishing them on window', async () => {
        const { initAppShell } = await import('./shell.js');
        const deps = {
            showPage: vi.fn(),
            ensurePageModuleLoaded: vi.fn(),
            registerCleanup: vi.fn(),
        };
        initAppShell(deps as any);
        const bridge = (window as any).__edatime;
        expect(bridge).toBeTruthy();
        expect(bridge.ensureSubsystem).toBeTypeOf('function');
        expect(bridge.ensurePageModuleLoaded).toBeUndefined();
        expect(bridge.showPage).toBeUndefined();
    });
});
