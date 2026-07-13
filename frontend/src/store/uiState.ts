/**
 * uiState — filter controls, column selection, range state, profile grid.
 *
 * Consumed by columns.ts, toolbar.ts, profile.ts, upload.ts, and page controllers.
 */

import type { PendingAdaptivePoint, ProfileGridSort } from '../types/store.js';
import { emitStoreEvent } from './events.js';

/**
 * Profile-grid category filter — `'all'` (default), `'numeric'`, or
 * `'datetime'`. See `usage_issue.md` §6.6.
 */
export type ProfileFilterCategory = 'all' | 'numeric' | 'datetime';

export interface UiState {
    filterText: string;
    adaptiveFilterColumn: string | null;
    pendingAdaptivePoint: PendingAdaptivePoint | null;
    seriesColors: Record<string, string>;
    profileFilterText: string;
    /** Category filter for the column-profile grid. `'all'` keeps the
     *  legacy behaviour; `'numeric'` / `'datetime'` restrict the rows. */
    profileFilterCategory: ProfileFilterCategory;
    previewSelectedColumns: string[];
    previewTimeColumn: string | null;
    profileGridBound: boolean;
    profileGridHeaderBound: boolean;
    profileGridSort: ProfileGridSort;
    profileGridColWidths: number[];
}

export const uiState: UiState = {
    filterText: '',
    adaptiveFilterColumn: null,
    pendingAdaptivePoint: null,
    seriesColors: {},
    profileFilterText: '',
    profileFilterCategory: 'all',
    previewSelectedColumns: [],
    previewTimeColumn: null,
    profileGridBound: false,
    profileGridHeaderBound: false,
    profileGridSort: { key: 'name', dir: 'asc' },
    profileGridColWidths: [56, 220, 120, 140, 100, 130, 130, 260],
};

export function setAdaptiveFilterColumn(col: string | null): void {
    const previous = uiState.adaptiveFilterColumn;
    uiState.adaptiveFilterColumn = col;
    emitStoreEvent('ui:adaptiveFilterColumn', { previous, next: col });
}

export function setPendingAdaptivePoint(point: PendingAdaptivePoint | null): void {
    const previous = uiState.pendingAdaptivePoint;
    uiState.pendingAdaptivePoint = point ? { ...point } : null;
    emitStoreEvent('ui:pendingAdaptivePoint', { previous, next: uiState.pendingAdaptivePoint });
}

export function setSeriesColors(colors: Record<string, string>): void {
    const previous = uiState.seriesColors;
    uiState.seriesColors = { ...colors };
    emitStoreEvent('ui:seriesColors', { previous, next: uiState.seriesColors });
}

export function setFilterText(text: string): void {
    const previous = uiState.filterText;
    uiState.filterText = text;
    emitStoreEvent('ui:filterText', { previous, next: text });
}

export function setProfileFilterText(text: string): void {
    const previous = uiState.profileFilterText;
    uiState.profileFilterText = text;
    emitStoreEvent('ui:profileFilterText', { previous, next: text });
}

export function setProfileFilterCategory(category: ProfileFilterCategory): void {
    const normalized: ProfileFilterCategory = (['all', 'numeric', 'datetime'] as const).includes(category)
        ? category
        : 'all';
    const previous = uiState.profileFilterCategory;
    uiState.profileFilterCategory = normalized;
    emitStoreEvent('ui:profileFilterCategory', { previous, next: normalized });
}

export function setPreviewSelectedColumns(cols: string[]): void {
    const previous = uiState.previewSelectedColumns;
    uiState.previewSelectedColumns = [...cols];
    emitStoreEvent('ui:previewSelectedColumns', { previous, next: uiState.previewSelectedColumns });
}

export function setPreviewTimeColumn(col: string | null): void {
    const previous = uiState.previewTimeColumn;
    uiState.previewTimeColumn = col;
    emitStoreEvent('ui:previewTimeColumn', { previous, next: col });
}

export function setProfileGridSort(sort: ProfileGridSort): void {
    const previous = uiState.profileGridSort;
    uiState.profileGridSort = { ...sort };
    emitStoreEvent('ui:profileGridSort', { previous, next: uiState.profileGridSort });
}

export function setProfileGridColWidths(widths: number[]): void {
    const previous = uiState.profileGridColWidths;
    uiState.profileGridColWidths = [...widths];
    emitStoreEvent('ui:profileGridColWidths', { previous, next: uiState.profileGridColWidths });
}

export function setProfileGridBound(bound: boolean): void {
    const previous = uiState.profileGridBound;
    uiState.profileGridBound = bound;
    emitStoreEvent('ui:profileGridBound', { previous, next: bound });
}

export function setProfileGridHeaderBound(bound: boolean): void {
    const previous = uiState.profileGridHeaderBound;
    uiState.profileGridHeaderBound = bound;
    emitStoreEvent('ui:profileGridHeaderBound', { previous, next: bound });
}
