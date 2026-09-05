import type { PendingAdaptivePoint } from '../../types/store.js';

/** Transient controls and an unfinished drawing, owned by the Timeseries feature. */
export const timeseriesInteraction = {
    filterText: '',
    adaptiveFilterColumn: null as string | null,
    pendingAdaptivePoint: null as PendingAdaptivePoint | null,
};

export function setFilterText(text: string): void { timeseriesInteraction.filterText = text; }
export function setAdaptiveFilterColumn(column: string | null): void { timeseriesInteraction.adaptiveFilterColumn = column; }
export function setPendingAdaptivePoint(point: PendingAdaptivePoint | null): void {
    timeseriesInteraction.pendingAdaptivePoint = point ? { ...point } : null;
}
export function resetTimeseriesInteraction(): void {
    setFilterText('');
    setAdaptiveFilterColumn(null);
    setPendingAdaptivePoint(null);
}
