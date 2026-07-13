/**
 * eventHelpers — shared DOM event helpers used across the app.
 * Lives in ui/* since it deals with DOM event dispatch.
 */

/**
 * Dispatch edatime:adaptive-filters-change whenever the adaptive
 * line filter count changes. The feature that owns the WorkspaceStore
 * supplies the count, keeping reusable UI independent of query state.
 */
export function emitAdaptiveFiltersChange(count = 0): void {
    window.dispatchEvent(new CustomEvent('edatime:adaptive-filters-change', {
        detail: { count },
    }));
}
