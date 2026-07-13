/** Feature-local event contract for opening the mounted column-filter modal. */

export const OPEN_COLUMN_FILTER_EVENT = 'edatime:timeseries-open-column-filter';

export function canOpenColumnFilter(): boolean {
    return document.getElementById('column-filter-modal')?.dataset.bound === '1';
}

/** Requests that the currently mounted Timeseries modal opens for a column. */
export function requestColumnFilterOpen(column: string | null): boolean {
    if (!canOpenColumnFilter()) return false;
    document.dispatchEvent(new CustomEvent<{ column: string | null }>(OPEN_COLUMN_FILTER_EVENT, {
        detail: { column },
    }));
    return true;
}
