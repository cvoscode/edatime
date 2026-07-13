/**
 * Application shell orchestrator.
 *
 * The shell is split into two layers:
 *   - `shell/core.ts` — always-on setup: theme, settings, a11y, hash routing,
 *     navigation cards, keyboard help button. Cheap, no chart / arrow / scatter
 *     dependencies.
 *   - `shell/deferredSubsystems.ts` — heavier UI subsystems loaded lazily the
 *     first time they are needed (upload panel, analytics, annotations,
 *     guided workflow, transform / outlier modals, provenance, command
 *     palette, keyboard shortcuts, sample dataset cards, etc.).
 *
 * `initAppShell` only wires the always-on layer plus the small deferred
 * subsystem contract used by navigation and command surfaces. The shell never
 * imports the underlying heavy modules directly; it only knows their
 * contracts.
 */

import { initShellCore } from './shell/core.js';
import { createDeferredSubsystemRegistry, type DeferredShellDeps } from './shell/deferredSubsystems.js';
import { createGlobalShortcuts } from './shell/globalShortcuts.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface AppShellDeps {
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    ensureDatasetReady: () => Promise<void>;
    showPage: (pageName: string) => void;
    fetchAndRender: () => void;
    fetchAndRenderAnalytics: () => Promise<void>;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
    exportChartPng: () => void;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    requestAnnotationOverlayRender: () => void;
    buildTimeseriesColumns: () => void;
    buildTimeseriesRanges: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    registerCleanup: (cleanup: () => void) => void;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters' | 'setViewport' | 'subscribe'>;
}

export interface AppShell {
    openCommands(): Promise<void>;
    openSettings(): Promise<void>;
}

export function initAppShell(deps: AppShellDeps): AppShell {
    // Build the deferred-shell contract once and let callers request
    // subsystems on demand. The shell does not eagerly load any of
    // them at startup; pages and user actions trigger the loads.
    const deferred: DeferredShellDeps = {
        showPage: deps.showPage,
        ensurePageModuleLoaded: deps.ensurePageModuleLoaded,
        fetchAndRender: deps.fetchAndRender,
        fetchAndRenderAnalytics: deps.fetchAndRenderAnalytics,
        exportFilteredCsv: deps.exportFilteredCsv,
        exportFilteredJson: deps.exportFilteredJson,
        exportChartPng: deps.exportChartPng,
        refreshDatasetAfterMutation: deps.refreshDatasetAfterMutation,
        buildTimeseriesColumns: deps.buildTimeseriesColumns,
        buildTimeseriesRanges: deps.buildTimeseriesRanges,
        zoomOut: deps.zoomOut,
        resetZoom: deps.resetZoom,
        updateAnalysisYRange: deps.updateAnalysisYRange,
        requestAnnotationOverlayRender: deps.requestAnnotationOverlayRender,
        registerCleanup: deps.registerCleanup,
        workspace: deps.workspace,
    };
    const deferredSubsystems = createDeferredSubsystemRegistry();
    const ensureSubsystem = async (name: string): Promise<void> => {
        switch (name) {
            case 'upload':
                return deferredSubsystems.ensureUploadSubsystems(deferred);
            case 'home':
                return deferredSubsystems.ensureHomeSubsystems(deferred);
            case 'timeseries-shell':
                return deferredSubsystems.ensureTimeseriesShell(deferred);
            case 'settings':
                return deferredSubsystems.ensureSettingsPanel(deferred);
            case 'commands':
                return deferredSubsystems.ensureCommands(deferred);
            default:
                throw new Error(`Unknown deferred subsystem: ${name}`);
        }
    };

    // Keep this layer cheap — see `shell/core.ts` for details.
    deps.registerCleanup(initShellCore({
        showPage: deps.showPage,
        navigation: {
            ensureDatasetReady: deps.ensureDatasetReady,
            ensurePageModuleLoaded: deps.ensurePageModuleLoaded,
            ensureSubsystem,
            openSettings: async () => deferredSubsystems.openSettings(deferred),
        },
    }));

    const globalShortcuts = createGlobalShortcuts();
    deps.registerCleanup(globalShortcuts.mount({
        showPage: deps.showPage,
        openCommands: () => deferredSubsystems.openCommands(deferred),
        openSettings: () => deferredSubsystems.openSettings(deferred),
    }));

    return {
        openCommands: () => deferredSubsystems.openCommands(deferred),
        openSettings: () => deferredSubsystems.openSettings(deferred),
    };
}
