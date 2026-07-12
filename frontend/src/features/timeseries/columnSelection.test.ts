import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeSelectedColumns, ensureAdaptiveTargetStillValid } from './columnSelection.js';
import {
    datasetState,
    setMetadata,
} from '../../store/datasetState.js';
import { setAdaptiveFilterColumn, uiState } from '../../store/uiState.js';
import { createWorkspaceStore, type WorkspaceStore } from '../../workspace/workspaceStore.js';

describe('columnSelection', () => {
    let workspace: WorkspaceStore;

    beforeEach(() => {
        vi.restoreAllMocks();
        workspace = createWorkspaceStore();
        setMetadata({
            total_rows: 100,
            columns: [
                { name: 'ts', dtype: 'Datetime' },
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'MUFL', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'MUFL'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any);
        datasetState.numericCols = ['HUFL', 'HULL', 'MUFL'];
        workspace.setSelection([]);
    });

    describe('sanitizeSelectedColumns', () => {
        it('removes columns not present in metadata', () => {
            workspace.setSelection(['HUFL', 'NOTACOLUMN', 'HULL']);
            sanitizeSelectedColumns(workspace);
            expect([...uiState.selectedCols]).toEqual(['HUFL', 'HULL']);
        });

        it('removes blocked time-like column names regardless of case', () => {
            workspace.setSelection(['HUFL', 'ts', 'HULL', 'TIMESTAMP', 'time']);
            sanitizeSelectedColumns(workspace);
            expect([...uiState.selectedCols]).toEqual(['HUFL', 'HULL']);
        });

        it('removes datetime-typed columns by dtype pattern', () => {
            workspace.setSelection(['HUFL', 'ts', 'HULL']);
            sanitizeSelectedColumns(workspace);
            expect([...uiState.selectedCols]).toEqual(['HUFL', 'HULL']);
        });

        it('keeps valid numeric columns', () => {
            workspace.setSelection(['HUFL', 'HULL', 'MUFL']);
            sanitizeSelectedColumns(workspace);
            expect([...uiState.selectedCols]).toEqual(['HUFL', 'HULL', 'MUFL']);
        });

        it('handles empty selectedCols gracefully', () => {
            workspace.setSelection([]);
            expect(() => sanitizeSelectedColumns(workspace)).not.toThrow();
            expect([...uiState.selectedCols]).toEqual([]);
        });

        it('handles null/undefined column names gracefully', () => {
            workspace.setSelection(['HUFL', null as any, 'HULL', undefined as any]);
            expect(() => sanitizeSelectedColumns(workspace)).not.toThrow();
        });
    });

    describe('ensureAdaptiveTargetStillValid', () => {
        it('does nothing when adaptiveFilterColumn is already valid', () => {
            workspace.setSelection(['HUFL', 'HULL']);
            setAdaptiveFilterColumn('HUFL');
            ensureAdaptiveTargetStillValid(workspace);
            expect(uiState.adaptiveFilterColumn).toBe('HUFL');
        });

        it('falls back to first selected column when adaptive target was removed', () => {
            workspace.setSelection(['HUFL', 'HULL']);
            setAdaptiveFilterColumn('NOTACOLUMN');
            ensureAdaptiveTargetStillValid(workspace);
            expect(uiState.adaptiveFilterColumn).toBe('HUFL');
        });

        it('sets to null when selectedCols is empty', () => {
            workspace.setSelection([]);
            setAdaptiveFilterColumn('HUFL');
            ensureAdaptiveTargetStillValid(workspace);
            expect(uiState.adaptiveFilterColumn).toBeNull();
        });

        it('does nothing when adaptiveFilterColumn is already null', () => {
            workspace.setSelection(['HUFL']);
            setAdaptiveFilterColumn(null);
            expect(() => ensureAdaptiveTargetStillValid(workspace)).not.toThrow();
        });
    });
});
