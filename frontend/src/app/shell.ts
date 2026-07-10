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
import { createDeferredSubsystemRegistry, type DeferredShellDeps } from './shell/deferredSubsystems.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

interface RefreshDatasetOptions {
    selectedColumn?: string;
}

export interface AppShellDeps {
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    ensureDatasetReady: () => Promise<void>;
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
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>;
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
        refreshDatasetAfterMutation: deps.refreshDatasetAfterMutation,
        buildTimeseriesColumns: deps.buildTimeseriesColumns,
        buildTimeseriesRanges: deps.buildTimeseriesRanges,
        zoomOut: deps.zoomOut,
        resetZoom: deps.resetZoom,
        updateAnalysisYRange: deps.updateAnalysisYRange,
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

    // Lightweight global bridge used by command palette, tests, and
    // utility hooks. We intentionally do not import the heavy
    // subsystems here; they remain behind deferred loaders.
    //
    // IMPORTANT: this bridge MUST be installed BEFORE `initShellCore`
    // runs. `initShellCore` calls `initPages()` which immediately
    // invokes `showPage(getHashPage() ?? 'home')`. The very first
    // `showPage('home')` calls `ensureSubsystem('home')`, which wires
    // the home-page sample-dataset click handlers. If we attach the
    // bridge after `initShellCore` returns, that first `ensureSubsystem`
    // call no-ops via the optional chain, and the sample-dataset cards
    // stay unbound on first paint. (See audit issue 1.1.)
    const win = window as unknown as {
        __edatime: Record<string, unknown> & {
            ensurePageModuleLoaded?: typeof deps.ensurePageModuleLoaded;
            ensureSubsystem?: (name: string) => Promise<void>;
            showPage?: typeof deps.showPage;
        };
    };
    win.__edatime = win.__edatime || {};
    win.__edatime.ensureSubsystem = ensureSubsystem;

    // Always-on bridge. Keep this cheap — see `shell/core.ts` for details.
    initShellCore({
        showPage: deps.showPage,
        navigation: {
            ensureDatasetReady: deps.ensureDatasetReady,
            ensurePageModuleLoaded: deps.ensurePageModuleLoaded,
            ensureSubsystem,
            openSettings: async () => deferredSubsystems.openSettings(deferred),
        },
    });

    return {
        openCommands: () => deferredSubsystems.openCommands(deferred),
        openSettings: () => deferredSubsystems.openSettings(deferred),
    };
}
