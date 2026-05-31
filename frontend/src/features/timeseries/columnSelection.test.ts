import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appState } from '../../store/appStateCompat.js';
import { sanitizeSelectedColumns, ensureAdaptiveTargetStillValid } from './columnSelection.js';
import {
    datasetState,
    setAdaptiveFilterColumn,
    setMetadata,
    setSelectedCols,
} from '../../store/index.js';

describe('columnSelection', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
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
    });

    describe('sanitizeSelectedColumns', () => {
        it('removes columns not present in metadata', () => {
            setSelectedCols(['HUFL', 'NOTACOLUMN', 'HULL']);
            sanitizeSelectedColumns();
            expect([...appState.selectedCols]).toEqual(['HUFL', 'HULL']);
        });

        it('removes blocked time-like column names regardless of case', () => {
            setSelectedCols(['HUFL', 'ts', 'HULL', 'TIMESTAMP', 'time']);
            sanitizeSelectedColumns();
            expect([...appState.selectedCols]).toEqual(['HUFL', 'HULL']);
        });

        it('removes datetime-typed columns by dtype pattern', () => {
            setSelectedCols(['HUFL', 'ts', 'HULL']);
            sanitizeSelectedColumns();
            expect([...appState.selectedCols]).toEqual(['HUFL', 'HULL']);
        });

        it('keeps valid numeric columns', () => {
            setSelectedCols(['HUFL', 'HULL', 'MUFL']);
            sanitizeSelectedColumns();
            expect([...appState.selectedCols]).toEqual(['HUFL', 'HULL', 'MUFL']);
        });

        it('handles empty selectedCols gracefully', () => {
            setSelectedCols([]);
            expect(() => sanitizeSelectedColumns()).not.toThrow();
            expect([...appState.selectedCols]).toEqual([]);
        });

        it('handles null/undefined column names gracefully', () => {
            setSelectedCols(['HUFL', null as any, 'HULL', undefined as any]);
            expect(() => sanitizeSelectedColumns()).not.toThrow();
        });
    });

    describe('ensureAdaptiveTargetStillValid', () => {
        it('does nothing when adaptiveFilterColumn is already valid', () => {
            setSelectedCols(['HUFL', 'HULL']);
            setAdaptiveFilterColumn('HUFL');
            ensureAdaptiveTargetStillValid();
            expect(appState.adaptiveFilterColumn).toBe('HUFL');
        });

        it('falls back to first selected column when adaptive target was removed', () => {
            setSelectedCols(['HUFL', 'HULL']);
            setAdaptiveFilterColumn('NOTACOLUMN');
            ensureAdaptiveTargetStillValid();
            expect(appState.adaptiveFilterColumn).toBe('HUFL');
        });

        it('sets to null when selectedCols is empty', () => {
            setSelectedCols([]);
            setAdaptiveFilterColumn('HUFL');
            ensureAdaptiveTargetStillValid();
            expect(appState.adaptiveFilterColumn).toBeNull();
        });

        it('does nothing when adaptiveFilterColumn is already null', () => {
            setSelectedCols(['HUFL']);
            setAdaptiveFilterColumn(null);
            expect(() => ensureAdaptiveTargetStillValid()).not.toThrow();
        });
    });
});
