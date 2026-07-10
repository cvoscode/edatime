/**
 * Transitional adapter from the legacy global store to WorkspaceStore.
 *
 * It gives new feature controllers one complete, instance-scoped view of the
 * cross-feature intent while existing controllers are migrated one by one.
 * Keep all legacy-store imports here so feature code can depend on workspace
 * state alone.
 */

import { chartState, store, uiState } from '../store/index.js';
import type { WorkspaceStore } from './workspaceStore.js';

export interface LegacyIntentBridge {
    dispose(): void;
}

export function bridgeLegacyIntent(workspace: Pick<WorkspaceStore, 'setSelection' | 'setFilters' | 'setViewport'>): LegacyIntentBridge {
    let disposed = false;

    const syncSelection = () => {
        workspace.setSelection(uiState.selectedCols ?? [], uiState.selectedColorColumn ?? null);
    };
    const syncFilters = () => {
        workspace.setFilters({
            columnRanges: uiState.columnRanges ?? {},
            adaptiveLines: uiState.adaptiveLineFilters ?? [],
        });
    };
    const syncViewport = () => {
        workspace.setViewport({
            xMin: chartState.currentStart ?? null,
            xMax: chartState.currentEnd ?? null,
            yMin: null,
            yMax: null,
        });
    };

    syncSelection();
    syncFilters();
    syncViewport();

    const unsubscribers = [
        store.subscribe('ui:selectedCols', syncSelection),
        store.subscribe('ui:selectedColorColumn', syncSelection),
        store.subscribe('ui:columnRanges', syncFilters),
        store.subscribe('ui:adaptiveLineFilters', syncFilters),
        store.subscribe('chart:viewport', syncViewport),
    ];

    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const unsubscribe of unsubscribers) unsubscribe();
        },
    };
}
