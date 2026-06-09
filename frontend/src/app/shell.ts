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
 * `initAppShell` only wires the always-on layer plus a `window.__edatime`
 * bridge. All deferred subsystems are pulled in via the small `ensure*`
 * helpers from `deferredSubsystems.ts`. The shell never imports the
 * underlying heavy modules directly; it only knows their contracts.
 */

import { initShellCore } from './shell/core.js';
import {
    ensureHomeSubsystems,
    ensureUploadSubsystems,
    ensureTimeseriesShell,
    ensureSettingsPanel,
    ensureCommands,
    type DeferredShellDeps,
} from './shell/deferredSubsystems.js';

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
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    registerCleanup: (cleanup: () => void) => void;
}

export function initAppShell(deps: AppShellDeps): void {
    // Always-on bridge. Keep this cheap — see `shell/core.ts` for details.
    initShellCore({ showPage: deps.showPage });

    // Lightweight global bridge used by command palette, tests, and
    // utility hooks. We intentionally do not import the heavy
    // subsystems here; they remain behind deferred loaders.
    (window as unknown as { __edatime: Record<string, unknown> }).__edatime = (window as unknown as { __edatime: Record<string, unknown> }).__edatime || {};
    (window as unknown as { __edatime: { ensurePageModuleLoaded?: typeof deps.ensurePageModuleLoaded } }).__edatime.ensurePageModuleLoaded = deps.ensurePageModuleLoaded;

    // Build the deferred-shell contract once and let callers request
    // subsystems on demand. The shell does not eagerly load any of
    // them at startup; pages and user actions trigger the loads.
    const deferred: DeferredShellDeps = {
        showPage: deps.showPage,
        ensurePageModuleLoaded: deps.ensurePageModuleLoaded,
        fetchAndRender: deps.fetchAndRender,
        refreshDatasetAfterMutation: deps.refreshDatasetAfterMutation,
        buildTimeseriesColumns: deps.buildTimeseriesColumns,
        buildTimeseriesRanges: deps.buildTimeseriesRanges,
        zoomOut: deps.zoomOut,
        resetZoom: deps.resetZoom,
        updateAnalysisYRange: deps.updateAnalysisYRange,
        registerCleanup: deps.registerCleanup,
    };

    // Expose the deferred loaders on the global so pages and other
    // entrypoints can opt-in to specific subsystems without importing
    // the shell directly.
    (window as unknown as { __edatime: { ensureSubsystem?: (name: string) => Promise<void> } }).__edatime.ensureSubsystem = async (name: string) => {
        switch (name) {
            case 'upload':
                return ensureUploadSubsystems(deferred);
            case 'home':
                return ensureHomeSubsystems(deferred);
            case 'timeseries-shell':
                return ensureTimeseriesShell(deferred);
            case 'settings':
                return ensureSettingsPanel(deferred);
            case 'commands':
                return ensureCommands(deferred);
            default:
                throw new Error(`Unknown deferred subsystem: ${name}`);
        }
    };
}
