/**
 * Tests for frontend/src/ui/profile.ts
 *
 * Covers: hydrateColumnProfiles — profile hydration from metadata.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateColumnProfiles } from './profile';
import { appState } from '../state';
import type { DatasetMetadata } from '../types';

function makeMeta(overrides: Partial<DatasetMetadata> = {}): DatasetMetadata {
    return {
        total_rows: 100,
        columns: [],
        numeric_columns: [],
        time_column: null,
        time_range: null,
        column_profiles: [],
        ...overrides,
    };
}

describe('hydrateColumnProfiles', () => {
    beforeEach(() => {
        appState.columnProfiles = [];
    });

    it('populates columnProfiles from column_profiles', () => {
        const meta = makeMeta({
            column_profiles: [
                {
                    name: 'temperature',
                    dtype: 'Float64',
                    count: 100,
                    non_null_count: 95,
                    null_count: 5,
                    min: 10.5,
                    max: 42.1,
                    mean: 25.0,
                    median: 24.0,
                    std: 5.0,
                    unique: null,
                    top: null,
                    freq: null,
                    histogram: { bin_edges: [10, 20, 30, 40], counts: [20, 50, 30] },
                },
            ],
        });
        hydrateColumnProfiles(meta);

        expect(appState.columnProfiles).toHaveLength(1);
        const p = appState.columnProfiles[0];
        expect(p.name).toBe('temperature');
        expect(p.dtype).toBe('Float64');
        expect(p.nonNullCount).toBe(95);
        expect(p.nullCount).toBe(5);
        expect(p.min).toBe(10.5);
        expect(p.max).toBe(42.1);
        expect(p.histCounts).toEqual([20, 50, 30]);
    });

    it('fills missing columns from metadata.columns', () => {
        const meta = makeMeta({
            columns: [
                { name: 'col_a', dtype: 'Int32' },
                { name: 'col_b', dtype: 'Utf8' },
            ],
            column_profiles: [],
        });
        hydrateColumnProfiles(meta);

        expect(appState.columnProfiles).toHaveLength(2);
        expect(appState.columnProfiles[0].name).toBe('col_a');
        expect(appState.columnProfiles[0].nonNullCount).toBe(0);
        expect(appState.columnProfiles[0].histCounts).toEqual([]);
        expect(appState.columnProfiles[1].name).toBe('col_b');
    });

    it('prefers column_profiles over columns when both exist', () => {
        const meta = makeMeta({
            columns: [{ name: 'x', dtype: 'Int32' }],
            column_profiles: [
                {
                    name: 'x',
                    dtype: 'Float64',
                    count: 50,
                    non_null_count: 50,
                    null_count: 0,
                    min: 1,
                    max: 100,
                    mean: null,
                    median: null,
                    std: null,
                    unique: null,
                    top: null,
                    freq: null,
                    histogram: null,
                },
            ],
        });
        hydrateColumnProfiles(meta);

        expect(appState.columnProfiles).toHaveLength(1);
        expect(appState.columnProfiles[0].dtype).toBe('Float64');
        expect(appState.columnProfiles[0].min).toBe(1);
    });

    it('handles empty metadata', () => {
        hydrateColumnProfiles(makeMeta());
        expect(appState.columnProfiles).toEqual([]);
    });

    it('normalises negative histogram counts to zero', () => {
        const meta = makeMeta({
            column_profiles: [
                {
                    name: 'c',
                    dtype: 'Int32',
                    count: 10,
                    non_null_count: 10,
                    null_count: 0,
                    min: 0,
                    max: 10,
                    mean: null,
                    median: null,
                    std: null,
                    unique: null,
                    top: null,
                    freq: null,
                    histogram: { bin_edges: [0, 5, 10], counts: [-3, 7] },
                },
            ],
        });
        hydrateColumnProfiles(meta);
        expect(appState.columnProfiles[0].histCounts).toEqual([0, 7]);
    });

    it('treats non-finite min/max as null', () => {
        const meta = makeMeta({
            column_profiles: [
                {
                    name: 'n',
                    dtype: 'Float64',
                    count: 5,
                    non_null_count: 5,
                    null_count: 0,
                    min: 'NaN' as any,
                    max: Infinity,
                    mean: null,
                    median: null,
                    std: null,
                    unique: null,
                    top: null,
                    freq: null,
                    histogram: null,
                },
            ],
        });
        hydrateColumnProfiles(meta);
        expect(appState.columnProfiles[0].min).toBeNull();
        expect(appState.columnProfiles[0].max).toBeNull();
    });

    it('skips profiles with empty names', () => {
        const meta = makeMeta({
            column_profiles: [
                {
                    name: '',
                    dtype: 'Int32',
                    count: 1,
                    non_null_count: 1,
                    null_count: 0,
                    min: 0,
                    max: 1,
                    mean: null,
                    median: null,
                    std: null,
                    unique: null,
                    top: null,
                    freq: null,
                    histogram: null,
                },
            ],
        });
        hydrateColumnProfiles(meta);
        expect(appState.columnProfiles).toEqual([]);
    });

    it('handles multiple profiles + columns without duplicates', () => {
        const meta = makeMeta({
            columns: [
                { name: 'a', dtype: 'Float64' },
                { name: 'b', dtype: 'Utf8' },
                { name: 'c', dtype: 'Int32' },
            ],
            column_profiles: [
                {
                    name: 'a',
                    dtype: 'Float64',
                    count: 100,
                    non_null_count: 99,
                    null_count: 1,
                    min: -1,
                    max: 1,
                    mean: null,
                    median: null,
                    std: null,
                    unique: null,
                    top: null,
                    freq: null,
                    histogram: null,
                },
            ],
        });
        hydrateColumnProfiles(meta);
        expect(appState.columnProfiles).toHaveLength(3);
        const names = appState.columnProfiles.map((p) => p.name);
        expect(names).toEqual(['a', 'b', 'c']);
        // 'a' should come from column_profiles (has stats)
        expect(appState.columnProfiles[0].nonNullCount).toBe(99);
        // 'b' and 'c' should be stubs from columns
        expect(appState.columnProfiles[1].nonNullCount).toBe(0);
    });
});
