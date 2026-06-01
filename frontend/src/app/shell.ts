import { initThemeToggle } from './shell/themeToggle.js';
import { normalizeFormControlAccessibility } from './shell/a11yNormalization.js';
import { wireHomeNavigationCards } from './shell/homeNavigation.js';
import { wireSampleDatasetCards } from './shell/sampleDatasets.js';

import { initUploadPanel } from '../ui/upload.js';
import { initColumnProfilesGrid } from '../ui/profile.js';
import {
    initAnalysisControls,
    initChartPageFilterGesture,
    initPages,
} from '../ui/toolbar.js';
import { initHashRouting } from '../utils/router.js';
import { initCommandPalette } from '../utils/palette.js';
import { initProvenance } from '../utils/provenance.js';
import { initSettings, getSetting } from '../utils/settings.js';
import { initAccessibilityShortcuts, showKeyboardShortcutsHelp } from '../utils/a11y.js';
import { initSettingsPanel } from '../ui/settingsPanel.js';
import { initAnalyticsDrawer } from '../ui/analyticsDrawer.js';
import { initAnnotations } from '../chart/annotations.js';
import { initAnnotationPanel } from '../ui/annotationPanel.js';
import { initGuidedWorkflow } from '../ui/guidedWorkflow.js';
import { initOutlierModal, initTransformModal } from '../ui/dataMutationModals.js';

import { APP_COMMAND_DEFINITIONS, registerAppCommands } from '../bootstrap/commands.js';
import { initKeyboardShortcuts } from '../bootstrap/shortcuts.js';

interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface AppShellDeps {
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    showPage: (pageName: string) => void;
    fetchAndRender: () => void;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    buildTimeseriesColumns: () => void;
    buildTimeseriesRanges: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    initAnalyticsListeners: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    hydrateColumnProfiles: (...args: any[]) => void;
    renderColumnProfilesGrid: (...args: any[]) => void;
    registerCleanup: (cleanup: () => void) => void;
}

export function initAppShell(deps: AppShellDeps): void {
    (window as any).__edatime = (window as any).__edatime || {};
    (window as any).__edatime.ensurePageModuleLoaded = deps.ensurePageModuleLoaded;
    normalizeFormControlAccessibility();

    initPages();
    initHashRouting();
    initSettings();
    initAnnotations();
    initAnnotationPanel();
    initGuidedWorkflow();
    initAnalyticsDrawer();
    initThemeToggle();
    initSettingsPanel();
    initAccessibilityShortcuts();

    document.getElementById('keyboard-help-btn')?.addEventListener('click', showKeyboardShortcutsHelp);

    const layout = document.querySelector('.app-layout') as HTMLElement | null;
    if (layout && getSetting('sidebarCollapsed')) {
        layout.classList.add('sidebar-collapsed');
    }
    wireHomeNavigationCards(deps.showPage);
    wireSampleDatasetCards(deps.showPage);
    initUploadPanel(deps.hydrateColumnProfiles, deps.renderColumnProfilesGrid, {
        buildColumnToggles: deps.buildTimeseriesColumns,
        buildRangeControls: deps.buildTimeseriesRanges,
    });
    initColumnProfilesGrid();
    initAnalysisControls(deps.fetchAndRender);
    initChartPageFilterGesture();
    initKeyboardShortcuts(deps, APP_COMMAND_DEFINITIONS);
    initCommandPalette();
    initProvenance();
    registerAppCommands(deps);
    initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation });
    deps.initAnalyticsListeners();
}
