import { beforeEach, describe, expect, it } from 'vitest';
import {
    scatterState,
} from '../../store/scatterState.js';
import {
    setAdaptiveLineFilters,
    setColumnRanges,
    uiState,
} from '../../store/uiState.js';
import { setMetadata } from '../../store/datasetState.js';
import { setViewport } from '../../store/chartState.js';
import { buildOverviewContextKey, buildScatterQueryContext, getActiveScatterFilterColumns } from './state.js';
import { setScatterActiveView, setScatterViewSnapshot } from '../../store/scatterState.js';

/**
 * Mirror the in-app behaviour: tests that stage `uiState.columnRanges`
 * should also push them into the active view's filter snapshot so the
 * scatter query context picks them up. The page controller keeps the two
 * in sync via event listeners; here we just call the setter directly
 * because we want a deterministic test fixture.
 */
function primePlotSnapshot(): void {
    setScatterViewSnapshot('plot', {
        columnRanges: uiState.columnRanges as Record<string, { from: number; to: number }>,
        lineFilters: [],
    });
}

describe('scatter query context builders', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setViewport(null, null);
        setColumnRanges({});
        setAdaptiveLineFilters([]);
        setMetadata(null);
        setScatterActiveView('plot');
        primePlotSnapshot();
    });

    it('returns undefined start/end for invalid linked ranges in scatter queries', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        setViewport(100, 50);

        const result = buildScatterQueryContext();
        expect(result.start).toBeUndefined();
        expect(result.end).toBeUndefined();
    });

    it('returns valid start/end when the linked brush range is valid', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        setViewport(100, 200);
        setMetadata({
            total_rows: 3,
            columns: [],
            numeric_columns: [],
            time_column: 'timestamp',
            time_range: { min: 0, max: 200 },
            column_profiles: [],
        } as any);

        const result = buildScatterQueryContext();
        expect(result.start).toBe(100);
        expect(result.end).toBe(200);
    });

    it('uses explicit workspace filters and viewport ahead of legacy state', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        setViewport(1, 2);
        setColumnRanges({ legacy: { from: 1, to: 2 } } as any);
        setMetadata({ time_column: 'timestamp', column_profiles: [], columns: [], numeric_columns: [], time_range: { min: 0, max: 100 } } as any);

        const result = buildScatterQueryContext(
            { x: 'workspace', y: 'other', scopeToColumns: false },
            {
                viewport: { xMin: 10, xMax: 20, yMin: null, yMax: null },
                filters: {
                    columnRanges: { workspace: { from: 3, to: 4 } },
                    adaptiveLines: [{ id: 'line', column: 'workspace', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }],
                },
            } as any,
        );

        expect(result.start).toBe(10);
        expect(result.end).toBe(20);
        expect(result.filters).toEqual([{ column: 'workspace', from: 3, to: 4 }]);
        expect(result.lineFilters).toEqual([expect.objectContaining({ column: 'workspace' })]);
    });

    it('does not include linked time ranges when the dataset has no time column', () => {
        document.body.innerHTML = '<input id="scatter-link-brush" type="checkbox" checked />';
        setViewport(100, 200);
        setMetadata({
            total_rows: 3,
            columns: [],
            numeric_columns: [],
            time_column: null,
            time_range: null,
            column_profiles: [],
        } as any);

        const result = buildScatterQueryContext();
        expect(result.start).toBeUndefined();
        expect(result.end).toBeUndefined();
    });

    it('scopes column-range filters to active scatter columns', () => {
        setColumnRanges({
            x: { from: 1, to: 9 },
            y: { from: 2, to: 8 },
            unrelated: { from: 5, to: 6 },
        } as any);
        primePlotSnapshot();

        const result = buildScatterQueryContext({ x: 'x', y: 'y', colorColumn: '' });
        expect(result.filters).toEqual([
            { column: 'x', from: 1, to: 9 },
            { column: 'y', from: 2, to: 8 },
        ]);
    });

    it('reads adaptive line filters from the active scatter view snapshot when no workspace intent is passed', () => {
        setAdaptiveLineFilters([{ id: 'legacy', column: 'legacy', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }] as any);
        setScatterViewSnapshot('plot', {
            columnRanges: {},
            lineFilters: [{ column: 'snapshot', x1: 0, y1: 0, x2: 2, y2: 2, keepAbove: true }],
        });

        const result = buildScatterQueryContext();

        expect(result.lineFilters).toEqual([expect.objectContaining({ column: 'snapshot' })]);
    });

    it('reports only active scoped filter columns for badge summaries', () => {
        setColumnRanges({
            x: { from: 1, to: 9 },
            color_bucket: { from: 0, to: 1 },
            ignored: { from: 5, to: 6 },
        } as any);
        primePlotSnapshot();

        const cols = getActiveScatterFilterColumns({ x: 'x', y: 'y', colorColumn: 'color_bucket' });
        expect(cols.sort()).toEqual(['color_bucket', 'x']);
    });

    it('reads badge filters from explicit workspace intent', () => {
        setColumnRanges({ legacy: { from: 1, to: 2 } } as any);

        const cols = getActiveScatterFilterColumns(
            { x: 'workspace', y: 'other', colorColumn: '' },
            { filters: { columnRanges: { workspace: { from: 3, to: 4 } }, adaptiveLines: [] } } as any,
        );

        expect(cols).toEqual(['workspace']);
    });

    it('drops full-range filters that still match the dataset profile bounds', () => {
        setMetadata({
            total_rows: 3,
            columns: [],
            numeric_columns: ['x', 'y'],
            time_column: 'timestamp',
            time_range: { min: 0, max: 200 },
            column_profiles: [
                { name: 'x', dtype: 'float64', min: 1, max: 9, count: 3, non_null_count: 3, null_count: 0, mean: 5, median: 5, std: 2, unique: 3, top: null, freq: null, histogram: null },
                { name: 'y', dtype: 'float64', min: 2, max: 8, count: 3, non_null_count: 3, null_count: 0, mean: 5, median: 5, std: 2, unique: 3, top: null, freq: null, histogram: null },
            ],
        } as any);
        setColumnRanges({
            x: { from: 1, to: 9 },
            y: { from: 3, to: 8 },
        } as any);
        primePlotSnapshot();

        const result = buildScatterQueryContext({ x: 'x', y: 'y', colorColumn: '' });
        expect(result.filters).toEqual([
            { column: 'y', from: 3, to: 8 },
        ]);

        const cols = getActiveScatterFilterColumns({ x: 'x', y: 'y', colorColumn: '' });
        expect(cols).toEqual(['y']);
    });
});

describe('buildOverviewContextKey', () => {
    it('changes the key when only the X column changes', () => {
        const base = {
            start: undefined,
            end: undefined,
            filters: [],
            lineFilters: [],
        };
        const k1 = buildOverviewContextKey({ ...base, x: 'HUFL', y: 'HULL', colorColumn: '' });
        const k2 = buildOverviewContextKey({ ...base, x: 'OT', y: 'HULL', colorColumn: '' });
        expect(k1).not.toEqual(k2);
    });

    it('changes the key when only the Y column changes', () => {
        const base = {
            start: undefined,
            end: undefined,
            filters: [],
            lineFilters: [],
        };
        const k1 = buildOverviewContextKey({ ...base, x: 'HUFL', y: 'HULL', colorColumn: '' });
        const k2 = buildOverviewContextKey({ ...base, x: 'HUFL', y: 'MULL', colorColumn: '' });
        expect(k1).not.toEqual(k2);
    });

    it('changes the key when only the color column changes', () => {
        const base = {
            start: undefined,
            end: undefined,
            filters: [],
            lineFilters: [],
        };
        const k1 = buildOverviewContextKey({ ...base, x: 'HUFL', y: 'HULL', colorColumn: '' });
        const k2 = buildOverviewContextKey({ ...base, x: 'HUFL', y: 'HULL', colorColumn: 'OT' });
        expect(k1).not.toEqual(k2);
    });

    it('stays stable when only the X/Y/colorColumn stay the same', () => {
        const a = buildOverviewContextKey({
            x: 'HUFL', y: 'HULL', colorColumn: '',
            start: undefined, end: undefined, filters: [], lineFilters: [],
        });
        const b = buildOverviewContextKey({
            x: 'HUFL', y: 'HULL', colorColumn: '',
            start: undefined, end: undefined, filters: [], lineFilters: [],
        });
        expect(a).toEqual(b);
    });

    it('normalizes missing X/Y/colorColumn to empty strings so callers can rely on a stable shape', () => {
        const k = buildOverviewContextKey({
            start: undefined,
            end: undefined,
            filters: [],
            lineFilters: [],
        });
        // The key must include the empty-string defaults so two callers
        // with undefined axis values still get the same key.
        expect(k).toContain('""');
    });
});
