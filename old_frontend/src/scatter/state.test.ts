import { beforeEach, describe, expect, it } from 'vitest';
import { appState } from '../state.js';
import { buildScatterQueryContext, getActiveScatterFilterColumns } from './state.js';

describe('scatter query context builders', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        appState.currentStart = null;
        appState.currentEnd = null;
        appState.columnRanges = {};
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

        const result = buildScatterQueryContext();
        expect(result.start).toBe(100);
        expect(result.end).toBe(200);
    });

    it('scopes column-range filters to active scatter columns', () => {
        appState.columnRanges = {
            x: { from: 1, to: 9 },
            y: { from: 2, to: 8 },
            unrelated: { from: 5, to: 6 },
        } as any;

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

        const cols = getActiveScatterFilterColumns({ x: 'x', y: 'y', colorColumn: 'color_bucket' });
        expect(cols.sort()).toEqual(['color_bucket', 'x']);
    });
});
