/**
 * uiState — filter controls, column selection, range state, profile grid.
 *
 * Consumed by columns.ts, toolbar.ts, profile.ts, upload.ts, and page controllers.
 */

import type { AdaptiveLineFilter, ColumnRange, PendingAdaptivePoint, ProfileGridSort } from '../types.js';
import { emitStoreEvent } from './events.js';

export interface UiState {
    filterText: string;
    selectedCols: string[];
    adaptiveFilterColumn: string | null;
    columnRanges: Record<string, ColumnRange>;
    adaptiveLineFilters: AdaptiveLineFilter[];
    pendingAdaptivePoint: PendingAdaptivePoint | null;
    seriesColors: Record<string, string>;
    selectedColorColumn: string | null;
    profileFilterText: string;
    previewSelectedColumns: string[];
    previewTimeColumn: string | null;
    profileGridBound: boolean;
    profileGridHeaderBound: boolean;
    profileGridSort: ProfileGridSort;
    profileGridColWidths: number[];
}

export const uiState: UiState = {
    filterText: '',
    selectedCols: [],
    adaptiveFilterColumn: null,
    columnRanges: {},
    adaptiveLineFilters: [],
    pendingAdaptivePoint: null,
    seriesColors: {},
    selectedColorColumn: null,
    profileFilterText: '',
    previewSelectedColumns: [],
    previewTimeColumn: null,
    profileGridBound: false,
    profileGridHeaderBound: false,
    profileGridSort: { key: 'name', dir: 'asc' },
    profileGridColWidths: [56, 220, 120, 140, 100, 130, 130, 260],
};

/* ── Series color helpers ───────────────────────────────── */

import { SERIES_COLORS } from '../utils/seriesColors.js';

function normalizeSeriesColor(value: unknown): string | null {
    const text = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

export function getSeriesColor(column: string, fallbackIndex = 0): string {
    const name = String(column || '').trim();
    const custom = normalizeSeriesColor(uiState.seriesColors?.[name]);
    if (custom) return custom;
    return SERIES_COLORS[Math.abs(fallbackIndex) % SERIES_COLORS.length];
}

export function setSeriesColor(column: string, value: string): string | null {
    const name = String(column || '').trim();
    const normalized = normalizeSeriesColor(value);
    if (!name || !normalized) return null;
    setSeriesColors({ ...uiState.seriesColors, [name]: normalized });
    return normalized;
}

/* ── Column selection mutations ──────────────────────────── */

export function setSelectedCols(cols: string[]): void {
    const previous = uiState.selectedCols;
    uiState.selectedCols = [...cols];
    emitStoreEvent('ui:selectedCols', { previous, next: uiState.selectedCols });
}

export function setAdaptiveFilterColumn(col: string | null): void {
    const previous = uiState.adaptiveFilterColumn;
    uiState.adaptiveFilterColumn = col;
    emitStoreEvent('ui:adaptiveFilterColumn', { previous, next: col });
}

export function setColumnRange(col: string, range: ColumnRange): void {
    const previous = uiState.columnRanges;
    uiState.columnRanges = { ...uiState.columnRanges, [col]: range };
    emitStoreEvent('ui:columnRanges', { previous, next: uiState.columnRanges });
}

export function clearColumnRange(col: string): void {
    const previous = uiState.columnRanges;
    const { [col]: _, ...rest } = uiState.columnRanges;
    uiState.columnRanges = rest;
    emitStoreEvent('ui:columnRanges', { previous, next: uiState.columnRanges });
}

export function setColumnRanges(ranges: Record<string, ColumnRange>): void {
    const previous = uiState.columnRanges;
    uiState.columnRanges = { ...ranges };
    emitStoreEvent('ui:columnRanges', { previous, next: uiState.columnRanges });
}

export function setAdaptiveLineFilters(filters: AdaptiveLineFilter[]): void {
    const previous = uiState.adaptiveLineFilters;
    uiState.adaptiveLineFilters = filters.map((filter) => ({ ...filter }));
    emitStoreEvent('ui:adaptiveLineFilters', { previous, next: uiState.adaptiveLineFilters });
}

export function appendAdaptiveLineFilter(filter: AdaptiveLineFilter): void {
    setAdaptiveLineFilters([...uiState.adaptiveLineFilters, filter]);
}

export function removeAdaptiveLineFilter(index: number): void {
    setAdaptiveLineFilters(uiState.adaptiveLineFilters.filter((_, i) => i !== index));
}

export function clearAdaptiveLineFilters(): void {
    setAdaptiveLineFilters([]);
}

export function setPendingAdaptivePoint(point: PendingAdaptivePoint | null): void {
    const previous = uiState.pendingAdaptivePoint;
    uiState.pendingAdaptivePoint = point ? { ...point } : null;
    emitStoreEvent('ui:pendingAdaptivePoint', { previous, next: uiState.pendingAdaptivePoint });
}

export function setSelectedColorColumn(col: string | null): void {
    const previous = uiState.selectedColorColumn;
    uiState.selectedColorColumn = col;
    emitStoreEvent('ui:selectedColorColumn', { previous, next: col });
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
