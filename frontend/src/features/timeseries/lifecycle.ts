/** Timeseries feature lifecycle and page-activation owner. */

import { createPageRuntime } from '../../platform/pageRuntime.js';

export interface TimeseriesLifecycleDeps {
    initFeature: () => void;
    ensureReady: () => Promise<void>;
}

export function createTimeseriesLifecycle(deps: TimeseriesLifecycleDeps) {
    return createPageRuntime({
        page: 'timeseries',
        emptyStateRootId: 'timeseries-empty-state',
        init: () => deps.initFeature(),
        onVisible: () => { void deps.ensureReady(); },
    });
}
