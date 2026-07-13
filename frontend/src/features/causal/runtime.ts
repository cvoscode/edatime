/**
 * causal/runtime — page lifecycle registration and runtime wiring.
 *
 * Sets up the analysis page runtime for the causal page, handling:
 *   - Page lifecycle registration via createAnalysisPageRuntime
 *   - Empty-state synchronization
 *   - Status/progress wiring (delegated to statusView)
 */

import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import {
    disposeCausalStatusLifecycle,
    initCausalStatusLifecycle,
    syncCausalEmptyState,
} from './statusView.js';
import { _selectedColumns } from './selectionState.js';

/** Module-level runtime handle for the causal page lifecycle. */
let causalRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let disposeCausalRuntime: (() => void) | null = null;

/** Module-level wrapper to sync causal empty state from outside initCausalPage. */
let _syncCausalEmptyState: (count: number) => void = (_count: number) => { };

export function getCausalRuntime(): ReturnType<typeof createAnalysisPageRuntime> | null {
    return causalRuntime;
}

export function getSyncCausalEmptyState(): (count: number) => void {
    return _syncCausalEmptyState;
}

/** Bootstrap and mount the Causal page runtime. */
export function initCausalPageRuntime(): ReturnType<typeof createAnalysisPageRuntime> {
    if (causalRuntime) return causalRuntime;

    initCausalStatusLifecycle();
    _syncCausalEmptyState = syncCausalEmptyState;

    causalRuntime = createAnalysisPageRuntime({
        page: 'causal',
        emptyStateRootId: 'causal-empty-state',
        bindExportsOnInit: false,
        init() {
            _syncCausalEmptyState(_selectedColumns.size);
        },
        onEveryPageChange() {
            _syncCausalEmptyState(_selectedColumns.size);
        },
    });

    disposeCausalRuntime = causalRuntime.mount();
    return causalRuntime;
}

/** Release the Causal feature lifecycle for a remounted application root. */
export function disposeCausalPageRuntime(): void {
    disposeCausalRuntime?.();
    disposeCausalRuntime = null;
    causalRuntime = null;
    _syncCausalEmptyState = () => { };
    disposeCausalStatusLifecycle();
}

/** Bootstrap call for the lazy Causal feature. */
initCausalPageRuntime();
