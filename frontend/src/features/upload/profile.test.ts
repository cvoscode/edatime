/**
 * Tests for frontend/src/features/upload/profile.ts
 *
 * Covers: hydrateColumnProfiles — profile hydration from metadata.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    formatUploadSelectionStatus,
    hydrateColumnProfiles,
    invalidateProfileGridViewModel,
    renderColumnProfilesGrid,
    sortProfileRows,
} from './profile';
import { datasetState } from '../../store/datasetState.js';
import { uiState } from '../../store/uiState.js';
import type { DatasetMetadata } from '../../types/api.js';

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
        datasetState.columnProfiles = [];
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

        expect(datasetState.columnProfiles).toHaveLength(1);
        const p = datasetState.columnProfiles[0];
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

        expect(datasetState.columnProfiles).toHaveLength(2);
        expect(datasetState.columnProfiles[0].name).toBe('col_a');
        expect(datasetState.columnProfiles[0].nonNullCount).toBe(0);
        expect(datasetState.columnProfiles[0].histCounts).toEqual([]);
        expect(datasetState.columnProfiles[1].name).toBe('col_b');
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

        expect(datasetState.columnProfiles).toHaveLength(1);
        expect(datasetState.columnProfiles[0].dtype).toBe('Float64');
        expect(datasetState.columnProfiles[0].min).toBe(1);
    });

    it('handles empty metadata', () => {
        hydrateColumnProfiles(makeMeta());
        expect(datasetState.columnProfiles).toEqual([]);
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
        expect(datasetState.columnProfiles[0].histCounts).toEqual([0, 7]);
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
        expect(datasetState.columnProfiles[0].min).toBeNull();
        expect(datasetState.columnProfiles[0].max).toBeNull();
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
        expect(datasetState.columnProfiles).toEqual([]);
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
        expect(datasetState.columnProfiles).toHaveLength(3);
        const names = datasetState.columnProfiles.map((p) => p.name);
        expect(names).toEqual(['a', 'b', 'c']);
        // 'a' should come from column_profiles (has stats)
        expect(datasetState.columnProfiles[0].nonNullCount).toBe(99);
        // 'b' and 'c' should be stubs from columns
        expect(datasetState.columnProfiles[1].nonNullCount).toBe(0);
    });
});

describe('formatUploadSelectionStatus', () => {
    it('describes selected analysis columns without implying an error state', () => {
        expect(formatUploadSelectionStatus(7, 2, 'date')).toBe(
            'Time column date plus 2 of 7 analysis columns selected.',
        );
    });

    it('calls out a fully selected preview clearly', () => {
        expect(formatUploadSelectionStatus(4, 4, 'timestamp')).toBe(
            'Time column timestamp plus all 4 analysis columns are selected.',
        );
    });

    it('handles previews with only a detected time column', () => {
        expect(formatUploadSelectionStatus(0, 0, 'ts')).toBe(
            'Time column detected: ts. No additional analysis columns available.',
        );
    });
});

describe('sortProfileRows', () => {
    it('sorts string keys ascending', () => {
        const result = sortProfileRows([
            { name: 'beta', dtype: 'Float64', nonNullCount: 1, nullCount: 0, min: null, max: null, histCounts: [] },
            { name: 'alpha', dtype: 'Int32', nonNullCount: 1, nullCount: 0, min: null, max: null, histCounts: [] },
        ], 'name', 'asc');

        expect(result.map((profile) => profile.name)).toEqual(['alpha', 'beta']);
    });

    it('sorts numeric keys descending', () => {
        const result = sortProfileRows([
            { name: 'a', dtype: 'Float64', nonNullCount: 3, nullCount: 0, min: null, max: null, histCounts: [] },
            { name: 'b', dtype: 'Float64', nonNullCount: 8, nullCount: 0, min: null, max: null, histCounts: [] },
        ], 'nonNullCount', 'desc');

        expect(result.map((profile) => profile.name)).toEqual(['b', 'a']);
    });

    it('keeps non-finite numeric values at the end', () => {
        const result = sortProfileRows([
            { name: 'a', dtype: 'Float64', nonNullCount: Number.NaN, nullCount: 0, min: null, max: null, histCounts: [] },
            { name: 'b', dtype: 'Float64', nonNullCount: 8, nullCount: 0, min: null, max: null, histCounts: [] },
        ], 'nonNullCount', 'asc');

        expect(result.map((profile) => profile.name)).toEqual(['b', 'a']);
    });
});

describe('renderColumnProfilesGrid', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="profile-grid">
                <div class="profile-grid-header"></div>
                <div id="profile-grid-viewport">
                    <div id="profile-grid-spacer"></div>
                    <div id="profile-grid-rows"></div>
                </div>
            </div>
        `;
        uiState.previewSelectedColumns = [];
        uiState.previewTimeColumn = null;
        uiState.profileFilterText = '';
        uiState.profileFilterCategory = 'all';
        uiState.profileGridSort = { key: null, dir: 'asc' };
        invalidateProfileGridViewModel();
    });

    it('renders UTC ISO datetime titles for min/max cells', () => {
        uiState.previewTimeColumn = 'timestamp';
        uiState.previewSelectedColumns = ['timestamp'];
        datasetState.columnProfiles = [{
            name: 'timestamp',
            dtype: 'datetime64[ms]',
            nonNullCount: 2,
            nullCount: 0,
            min: Date.parse('2016-07-01T00:00:00Z'),
            max: Date.parse('2016-07-02T12:34:56Z'),
            histCounts: [],
        }];

        renderColumnProfilesGrid(true);

        const cells = Array.from(document.querySelectorAll<HTMLDivElement>('.profile-grid-row .profile-cell'));
        const minCell = cells[5];
        const maxCell = cells[6];

        expect(minCell?.textContent).toBe('2016-07-01T00:00:00Z');
        expect(minCell?.title).toBe('UTC 2016-07-01T00:00:00.000Z');
        expect(maxCell?.textContent).toBe('2016-07-02T12:34:56Z');
        expect(maxCell?.title).toBe('UTC 2016-07-02T12:34:56.000Z');
    });

    it('filters the grid to datetime columns when the datetime category is active', () => {
        uiState.profileFilterCategory = 'datetime';
        datasetState.columnProfiles = [
            {
                name: 'timestamp',
                dtype: 'datetime64[ms]',
                nonNullCount: 3,
                nullCount: 0,
                min: Date.parse('2024-01-01T00:00:00Z'),
                max: Date.parse('2024-01-03T00:00:00Z'),
                histCounts: [],
            },
            {
                name: 'value',
                dtype: 'Float64',
                nonNullCount: 3,
                nullCount: 0,
                min: 1,
                max: 3,
                histCounts: [],
            },
        ];

        renderColumnProfilesGrid(true);

        const rowText = Array.from(document.querySelectorAll('.profile-grid-row'))
            .map((row) => row.textContent || '')
            .join(' ');
        expect(rowText).toContain('timestamp');
        expect(rowText).not.toContain('value');
    });

    it('updates preview selection through uiState when a non-time column checkbox is toggled', () => {
        uiState.previewTimeColumn = 'timestamp';
        uiState.previewSelectedColumns = ['timestamp'];
        datasetState.columnProfiles = [
            {
                name: 'timestamp',
                dtype: 'datetime64[ms]',
                nonNullCount: 3,
                nullCount: 0,
                min: 0,
                max: 1,
                histCounts: [],
            },
            {
                name: 'value',
                dtype: 'Float64',
                nonNullCount: 3,
                nullCount: 0,
                min: 1,
                max: 3,
                histCounts: [],
            },
        ];

        renderColumnProfilesGrid(true);

        const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('.profile-cell-check input[type="checkbox"]'));
        expect(datasetState.columnProfiles).toHaveLength(2);
        expect(uiState.previewSelectedColumns).toEqual(['timestamp']);

        checkboxes[1].click();

        expect(uiState.previewTimeColumn).toBe('timestamp');
        expect(uiState.previewSelectedColumns).toEqual(['timestamp', 'value']);
    });
});
