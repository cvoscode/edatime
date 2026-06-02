/**
 * drift/selection.ts — Canonical owner of drift selection and sort state.
 *
 * Responsibilities:
 *   - responsesByColumn map (the data)
 *   - activeDetailColumn, selectedWindowIdx
 *   - window sort mode and sorted-window index calculation
 *
 * This module is page-local (drift-specific policy), NOT promoted to ui/*.
 */

import type { DriftResponse } from './viewModels.js';

// ── State ───────────────────────────────────────────────────────────────────

export interface SelectionState {
    responsesByColumn: Map<string, DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
    windowSort: string;
}

const _state: SelectionState = {
    responsesByColumn: new Map(),
    activeDetailColumn: null,
    selectedWindowIdx: null,
    windowSort: 'time-asc',
};

// ── Accessors ────────────────────────────────────────────────────────────────

export function getResponsesByColumn(): Map<string, DriftResponse> {
    return _state.responsesByColumn;
}

export function getActiveDetailColumn(): string | null {
    return _state.activeDetailColumn;
}

export function getSelectedWindowIdx(): number | null {
    return _state.selectedWindowIdx;
}

export function getWindowSort(): string {
    return _state.windowSort;
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function setActiveDetailColumn(col: string | null): void {
    _state.activeDetailColumn = col;
}

export function setSelectedWindowIdx(idx: number | null): void {
    _state.selectedWindowIdx = idx;
}

export function setWindowSort(mode: string): void {
    _state.windowSort = mode;
}

/** Select a column and reset the window index to null (timeline level). */
export function selectColumn(col: string): void {
    _state.activeDetailColumn = col;
    _state.selectedWindowIdx = null;
}

/** Select a window within the currently active column. */
export function selectWindow(idx: number): void {
    _state.selectedWindowIdx = idx;
}

/** Returns the active DriftResponse or null. */
export function getActiveResponse(): DriftResponse | null {
    if (!_state.activeDetailColumn) return null;
    return _state.responsesByColumn.get(_state.activeDetailColumn) ?? null;
}

/** Populates responsesByColumn and auto-selects the first column + first window. */
export function setResponses(responses: Map<string, DriftResponse>): void {
    _state.responsesByColumn = responses;
    // Auto-select first column and first window
    const cols = Array.from(responses.keys());
    if (cols.length > 0) {
        const firstCol = cols[0]!;
        _state.activeDetailColumn = firstCol;
        const firstResp = responses.get(firstCol)!;
        _state.selectedWindowIdx = firstResp.windows.length > 0 ? 0 : null;
    } else {
        _state.activeDetailColumn = null;
        _state.selectedWindowIdx = null;
    }
}

/** Clears all selection state. */
export function clearSelection(): void {
    _state.responsesByColumn.clear();
    _state.activeDetailColumn = null;
    _state.selectedWindowIdx = null;
}

/** Restores full state (for test isolation). */
export function _setSelectionState(state: SelectionState): void {
    _state.responsesByColumn = state.responsesByColumn;
    _state.activeDetailColumn = state.activeDetailColumn;
    _state.selectedWindowIdx = state.selectedWindowIdx;
    _state.windowSort = state.windowSort;
}

/** Returns a snapshot of current state (for test isolation). */
export function _getSelectionState(): SelectionState {
    return { ..._state, responsesByColumn: new Map(_state.responsesByColumn) };
}