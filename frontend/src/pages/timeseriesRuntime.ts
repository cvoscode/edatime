/**
 * Canonical Timeseries page lifecycle owner.
 * Uses shared page-runtime vocabulary (createPageRuntime) to own Timeseries
 * activation and page-change wiring. Replaces the inline edatime:page-change
 * listener that currently lives in app.ts::initializeDatasetUi.
 */

import { createPageRuntime } from './shared/pageRuntime.js';

export interface TimeseriesRuntimeDeps {
    initFeature: () => void;
    ensureReady: () => Promise<void>;
}

export function createTimeseriesRuntime(deps: TimeseriesRuntimeDeps) {
    return createPageRuntime({
        page: 'timeseries',
        emptyStateRootId: 'timeseries-empty-state',
        init: () => deps.initFeature(),
        onVisible: () => {
            void deps.ensureReady();
        },
    });
}