/**
 * causal/runtime — page lifecycle registration and runtime wiring.
 *
 * Sets up the analysis page runtime for the causal page, handling:
 *   - Page lifecycle registration via createAnalysisPageRuntime
 *   - Empty-state synchronization
 *   - Status/progress wiring (delegated to statusView)
 */

import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { syncCausalEmptyState } from './statusView.js';
import { _selectedColumns } from './selectionState.js';

/** Module-level runtime handle for the causal page lifecycle. */
let causalRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;

/** Module-level wrapper to sync causal empty state from outside initCausalPage. */
let _syncCausalEmptyState: (count: number) => void = (_count: number) => { };

export function getCausalRuntime(): ReturnType<typeof createAnalysisPageRuntime> | null {
    return causalRuntime;
}

export function getSyncCausalEmptyState(): (count: number) => void {
    return _syncCausalEmptyState;
}

/** Bootstrap the causal page runtime. Must happen BEFORE the first edatime:page-change
 *  'causal' event so that the runtime's event listener is registered before any
 *  page-change handlers. */
export function initCausalPageRuntime(): void {
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
}

/** Bootstrap call — must happen BEFORE the first edatime:page-change 'causal' event. */
initCausalPageRuntime();
