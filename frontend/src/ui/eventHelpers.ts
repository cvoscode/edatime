/**
 * eventHelpers — shared DOM event helpers used across the app.
 * Lives in ui/* since it deals with DOM event dispatch.
 */

import { appState } from '../store/appStateCompat.js';

/**
 * Dispatch edatime:adaptive-filters-change whenever the adaptive
 * line filter count changes. Used by toolbar and analysis controls.
 */
export function emitAdaptiveFiltersChange(): void {
    window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change', {
        detail: { count: (appState.adaptiveLineFilters || []).length },
    }));
}