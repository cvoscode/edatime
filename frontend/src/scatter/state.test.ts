import { beforeEach, describe, expect, it } from 'vitest';
import { appState } from '../store/appStateCompat.js';
import { buildScatterQueryContext, getActiveScatterFilterColumns } from './state.js';
import { setScatterViewSnapshot } from '../store/scatterState.js';

/**
 * Mirror the in-app behaviour: tests that stage `appState.columnRanges`
 * should also push them into the active view's filter snapshot so the
 * scatter query context picks them up. The page controller keeps the two
 * in sync via event listeners; here we just call the setter directly
 * because we want a deterministic test fixture.
 */
function primePlotSnapshot(): void {
    setScatterViewSnapshot('plot', {
        columnRanges: (appState.columnRanges as Record<string, { from: number; to: number }>) || {},
        lineFilters: [],
    });
}

describe('scatter query context builders', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        appState.currentStart = null;
        appState.currentEnd = null;
        appState.columnRanges = {};
        appState.metadata = null;
        primePlotSnapshot();
    });

    it('returns undefined start/end for invalid linked ranges in scatter queries', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        appState.currentStart = 100;
        appState.currentEnd = 50;

        const result = buildScatterQueryContext();
        expect(result.start).toBeUndefined();
        expect(result.end).toBeUndefined();
    });

    it('returns valid start/end when the linked brush range is valid', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        appState.currentStart = 100;
        appState.currentEnd = 200;
        appState.metadata = {
            total_rows: 3,
            columns: [],
            numeric_columns: [],
            time_column: 'timestamp',
            time_range: { min: 0, max: 200 },
            column_profiles: [],
        };

        const result = buildScatterQueryContext();
        expect(result.start).toBe(100);
        expect(result.end).toBe(200);
    });

    it('does not include linked time ranges when the dataset has no time column', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        appState.currentStart = 100;
        appState.currentEnd = 200;
        appState.metadata = {
            total_rows: 3,
            columns: [],
            numeric_columns: [],
            time_column: null,
            time_range: null,
            column_profiles: [],
        };

        const result = buildScatterQueryContext();
        expect(result.start).toBeUndefined();
        expect(result.end).toBeUndefined();
    });

    it('scopes column-range filters to active scatter columns', () => {
        appState.columnRanges = {
            x: { from: 1, to: 9 },
            y: { from: 2, to: 8 },
            unrelated: { from: 5, to: 6 },
        } as any;
        primePlotSnapshot();

        const result = buildScatterQueryContext({ x: 'x', y: 'y', colorColumn: '' });
        expect(result.filters).toEqual([
            { column: 'x', from: 1, to: 9 },
            { column: 'y', from: 2, to: 8 },
        ]);
    });

    it('reports only active scoped filter columns for badge summaries', () => {
        appState.columnRanges = {
            x: { from: 1, to: 9 },
            color_bucket: { from: 0, to: 1 },
            ignored: { from: 5, to: 6 },
        } as any;
        primePlotSnapshot();

        const cols = getActiveScatterFilterColumns({ x: 'x', y: 'y', colorColumn: 'color_bucket' });
        expect(cols.sort()).toEqual(['color_bucket', 'x']);
    });
});
