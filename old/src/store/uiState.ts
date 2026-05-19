/**
 * uiState — filter controls, column selection, range state, profile grid.
 *
 * Consumed by columns.ts, toolbar.ts, profile.ts, upload.ts, and page controllers.
 */

import type { AdaptiveLineFilter, ColumnRange, PendingAdaptivePoint, ProfileGridSort } from '../types.js';

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

import { SERIES_COLORS } from '../state.js';

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
    uiState.seriesColors = { ...uiState.seriesColors, [name]: normalized };
    return normalized;
}

/* ── Column selection mutations ──────────────────────────── */

export function setSelectedCols(cols: string[]): void {
    uiState.selectedCols = cols;
}

export function setAdaptiveFilterColumn(col: string | null): void {
    uiState.adaptiveFilterColumn = col;
}

export function setColumnRange(col: string, range: ColumnRange): void {
    uiState.columnRanges = { ...uiState.columnRanges, [col]: range };
}

export function clearColumnRange(col: string): void {
    const { [col]: _, ...rest } = uiState.columnRanges;
    uiState.columnRanges = rest;
}

export function setAdaptiveLineFilters(filters: AdaptiveLineFilter[]): void {
    uiState.adaptiveLineFilters = filters;
}

export function appendAdaptiveLineFilter(filter: AdaptiveLineFilter): void {
    uiState.adaptiveLineFilters = [...uiState.adaptiveLineFilters, filter];
}

export function removeAdaptiveLineFilter(index: number): void {
    uiState.adaptiveLineFilters = uiState.adaptiveLineFilters.filter((_, i) => i !== index);
}

export function clearAdaptiveLineFilters(): void {
    uiState.adaptiveLineFilters = [];
}

export function setPendingAdaptivePoint(point: PendingAdaptivePoint | null): void {
    uiState.pendingAdaptivePoint = point;
}

export function setSelectedColorColumn(col: string | null): void {
    uiState.selectedColorColumn = col;
}

export function setFilterText(text: string): void {
    uiState.filterText = text;
}

export function setProfileFilterText(text: string): void {
    uiState.profileFilterText = text;
}

export function setPreviewSelectedColumns(cols: string[]): void {
    uiState.previewSelectedColumns = cols;
}

export function setPreviewTimeColumn(col: string | null): void {
    uiState.previewTimeColumn = col;
}

export function setProfileGridSort(sort: ProfileGridSort): void {
    uiState.profileGridSort = sort;
}

export function setProfileGridColWidths(widths: number[]): void {
    uiState.profileGridColWidths = widths;
}

export function setProfileGridBound(bound: boolean): void {
    uiState.profileGridBound = bound;
}

export function setProfileGridHeaderBound(bound: boolean): void {
    uiState.profileGridHeaderBound = bound;
}