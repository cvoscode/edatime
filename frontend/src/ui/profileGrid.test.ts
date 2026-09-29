import { describe, expect, it } from 'vitest';
import { createProfileFilterControls, createProfileGridController, profileRowsFromMetadata, sortProfileRows, syncProfileGridScrollCue } from './profileGrid.js';
import type { ProfileFilterCategory } from './profileFilters.js';
import type { DatasetMetadata } from '../contracts/api/v1/dataset.js';
import type { ProfileRow } from '../types/store.js';

describe('shared profile grid filters', () => {
    it('sorts null and pending extrema after known values in either direction', () => {
        const profile = (name: string, min: number | null | undefined): ProfileRow => ({
            name, dtype: 'Float64', nonNullCount: 0, nullCount: 0, min: min as number | null,
            max: null, histCounts: [], profilePending: min === undefined,
        });
        const rows = [profile('unknown-null', null), profile('positive', 7), profile('zero', 0), profile('negative', -5), profile('unknown-pending', undefined)];

        expect(sortProfileRows(rows.slice(), 'min', 'asc').map((row) => row.name))
            .toEqual(['negative', 'zero', 'positive', 'unknown-null', 'unknown-pending']);
        expect(sortProfileRows(rows.slice(), 'min', 'desc').map((row) => row.name))
            .toEqual(['positive', 'zero', 'negative', 'unknown-null', 'unknown-pending']);
        expect(sortProfileRows([profile('all-null-a', null), profile('all-null-b', null)], 'max', 'desc').map((row) => row.name))
            .toEqual(['all-null-a', 'all-null-b']);
    });

    it('shows invalid and constant badges plus exact numeric and time findings in accessible details', () => {
        document.body.innerHTML = '<div id="profile-grid"></div>';
        const metadata = {
            profile_status: 'exact', total_rows: 10, numeric_columns: ['reading', 'constant'],
            time_column: 'ts', time_range: null,
            time_quality: {
                non_null_count: 10, null_count: 0, unique_timestamp_count: 8, duplicate_timestamp_count: 2,
                is_monotonic_non_decreasing: false, out_of_order_count: 1,
                min_gap_ms: 1000, median_gap_ms: 2000, max_gap_ms: 4000,
            },
            columns: [
                { name: 'ts', dtype: 'Datetime[ms]' },
                { name: 'reading', dtype: 'Float64' },
                { name: 'constant', dtype: 'Float64' },
            ],
            column_profiles: [
                { name: 'ts', dtype: 'Datetime[ms]', non_null_count: 10, null_count: 0 },
                {
                    name: 'reading', dtype: 'Float64', non_null_count: 8, null_count: 2,
                    non_finite_count: 2, finite_count: 6, zero_count: 1, distinct_count: 5, is_constant: false,
                    q25: -1.5, q75: 2.5, interquartile_range: 4, longest_zero_run: 2,
                },
                {
                    name: 'constant', dtype: 'Float64', non_null_count: 10, null_count: 0,
                    non_finite_count: 0, finite_count: 10, zero_count: 10, distinct_count: 1, is_constant: true,
                    q25: 0, q75: 0, interquartile_range: 0, longest_zero_run: 10,
                },
            ],
        } as DatasetMetadata;
        const profiles = profileRowsFromMetadata(metadata);
        const root = document.getElementById('profile-grid')!;
        const grid = createProfileGridController({ root, getProfiles: () => profiles, selectable: false });
        grid.render();

        const readingRow = root.querySelector<HTMLElement>('[data-column-name="reading"]')!;
        const invalidBadge = readingRow.querySelector<HTMLElement>('.profile-quality-badge--warning')!;
        expect(invalidBadge.textContent).toBe('2 non-finite');
        expect(invalidBadge.getAttribute('aria-label')).toBe('2 non-finite values');
        const readingButton = readingRow.querySelector<HTMLButtonElement>('.profile-quality-details-button')!;
        expect(readingButton.getAttribute('aria-label')).toBe('Show quality details for reading');
        readingButton.click();
        const details = document.querySelector<HTMLElement>('#profile-grid-quality-details')!;
        expect(details.hidden).toBe(false);
        expect(details.querySelector('summary')?.textContent).toContain('Exact statistics');
        expect(details.textContent).toContain('Non-finite values2');
        expect(details.textContent).toContain('Zero values1');
        expect(details.textContent).toContain('Distinct values5');
        expect(details.textContent).toContain('25th percentile-1.50');
        expect(details.textContent).toContain('Longest zero run2');

        const constantRow = root.querySelector<HTMLElement>('[data-column-name="constant"]')!;
        expect(constantRow.querySelector('.profile-quality-badge')?.textContent).toBe('Constant');
        constantRow.querySelector<HTMLButtonElement>('.profile-quality-details-button')!.click();
        expect(details.textContent).toContain('Constant columnYes');

        const timeRow = root.querySelector<HTMLElement>('[data-column-name="ts"]')!;
        timeRow.querySelector<HTMLButtonElement>('.profile-quality-details-button')!.click();
        expect(details.textContent).toContain('Duplicate timestamps2');
        expect(details.textContent).toContain('Monotonic timestamp orderNo');
        expect(details.textContent).toContain('Out-of-order timestamps1');
        expect(details.textContent).toContain('Median timestamp gap (ms)2,000');
        grid.dispose();
    });

    it('shows scroll direction cues and full UTC dates for temporal extrema', () => {
        document.body.innerHTML = '<div id="temporal-grid"></div>';
        const metadata = {
            profile_status: 'exact', total_rows: 2, numeric_columns: [], time_column: 'ts', time_range: null,
            columns: [{ name: 'ts', dtype: 'Datetime[ms]' }],
            column_profiles: [{ name: 'ts', dtype: 'Datetime[ms]', count: 2, min: 1467331200000, max: 1467462896000, mean: null, median: null, std: null, unique: null, top: null, freq: null, histogram: null, non_null_count: 2, null_count: 0 }],
        } as DatasetMetadata;
        const root = document.getElementById('temporal-grid')!;
        const grid = createProfileGridController({ root, getProfiles: () => profileRowsFromMetadata(metadata), selectable: false });
        grid.render();
        const dateRow = root.querySelector<HTMLElement>('[data-column-name="ts"]')!;
        expect([...dateRow.querySelectorAll<HTMLElement>('.profile-cell[title^="UTC "]')].map((cell) => cell.title))
            .toEqual(['UTC 2016-07-01T00:00:00.000Z', 'UTC 2016-07-02T12:34:56.000Z']);

        const viewport = root.querySelector<HTMLElement>('.profile-grid-viewport')!;
        let clientWidth = 200;
        let scrollLeft = 0;
        Object.defineProperties(viewport, {
            clientWidth: { configurable: true, get: () => clientWidth },
            scrollWidth: { configurable: true, get: () => 500 },
            scrollLeft: { configurable: true, get: () => scrollLeft },
        });
        syncProfileGridScrollCue(root, viewport);
        const cue = document.getElementById('temporal-grid-scroll-cue')!;
        expect(cue.hidden).toBe(false);
        expect(cue.textContent).toContain('Scroll right');
        scrollLeft = 150;
        syncProfileGridScrollCue(root, viewport);
        expect(cue.textContent).toContain('both sides');
        scrollLeft = 300;
        syncProfileGridScrollCue(root, viewport);
        expect(cue.textContent).toContain('Scroll left');
        clientWidth = 500;
        syncProfileGridScrollCue(root, viewport);
        expect(cue.hidden).toBe(true);
        grid.dispose();
    });

    it('labels sampled estimates and explicitly marks immediate-profile findings unavailable', () => {
        document.body.innerHTML = '<div id="sampled-grid"></div><div id="immediate-grid"></div>';
        const sampled = profileRowsFromMetadata({
            profile_status: 'sampled', profile_sample_rows: 25, total_rows: 100, columns: [{ name: 'amount', dtype: 'Float64' }],
            numeric_columns: ['amount'], time_column: null, time_range: null,
            column_profiles: [{ name: 'amount', dtype: 'Float64', non_null_count: 24, null_count: 1 }],
        } as DatasetMetadata);
        const sampledRoot = document.getElementById('sampled-grid')!;
        const sampledGrid = createProfileGridController({ root: sampledRoot, getProfiles: () => sampled, selectable: false });
        sampledGrid.render();
        sampledRoot.querySelector<HTMLButtonElement>('.profile-quality-details-button')!.click();
        const sampledDetails = document.getElementById('sampled-grid-quality-details')!;
        expect(sampledDetails.querySelector('summary')?.textContent).toContain('Sampled estimate');
        expect(sampledDetails.textContent).toContain('estimates from 25 sampled rows');
        expect(sampledDetails.textContent).toContain('Non-finite valuesUnavailable');

        const immediate = profileRowsFromMetadata({
            profile_status: 'immediate', total_rows: 100, columns: [{ name: 'pending_value', dtype: 'Float64' }],
            numeric_columns: ['pending_value'], time_column: null, time_range: null, column_profiles: [],
        } as DatasetMetadata);
        const immediateRoot = document.getElementById('immediate-grid')!;
        const immediateGrid = createProfileGridController({ root: immediateRoot, getProfiles: () => immediate, selectable: false });
        immediateGrid.render();
        immediateRoot.querySelector<HTMLButtonElement>('.profile-quality-details-button')!.click();
        const immediateDetails = document.getElementById('immediate-grid-quality-details')!;
        expect(immediateDetails.querySelector('summary')?.textContent).toContain('Immediate schema only');
        expect(immediateDetails.textContent).toContain('not been profiled in the current report');
        expect(immediateDetails.textContent).toContain('Finite valuesUnavailable');
        sampledGrid.dispose();
        immediateGrid.dispose();
    });

    it('filters an explicit mixed schema and excludes booleans and unsupported types from Numeric', () => {
        document.body.innerHTML = '<div id="profile-filter-controls"></div><div id="profile-grid"></div>';
        const metadata = {
            columns: [
                { name: 'decimal_value', dtype: 'Decimal(18, 4)' },
                { name: 'enabled', dtype: 'Boolean' },
                { name: 'float_value', dtype: 'Float64' },
                { name: 'integer_value', dtype: 'Int64' },
                { name: 'other_value', dtype: 'Object' },
                { name: 'observed_at', dtype: 'Datetime[ns]' },
                { name: 'plain_date', dtype: 'Date' },
                { name: 'description', dtype: 'String' },
            ],
            column_profiles: [], total_rows: 0, numeric_columns: [], time_column: null, time_range: null,
        } as DatasetMetadata;
        const profiles = profileRowsFromMetadata(metadata);
        let category: ProfileFilterCategory = 'all';
        const root = document.getElementById('profile-grid')!;
        const grid = createProfileGridController({
            root,
            getProfiles: () => profiles,
            selectable: false,
            getFilterCategory: () => category,
        });
        const controls = createProfileFilterControls({
            inputId: 'profile-filter',
            filterCategory: category,
            onFilterTextChange: () => {},
            onFilterCategoryChange: (next) => {
                category = next;
                grid.invalidate();
                grid.render(true);
            },
        });
        document.getElementById('profile-filter-controls')!.append(controls);
        grid.render();
        const visibleNames = () => Array.from(root.querySelectorAll<HTMLElement>('.profile-grid-row'))
            .map((row) => row.querySelector<HTMLElement>('.profile-cell')?.textContent || '')
            .filter((name) => !name.includes('No columns match'));

        controls.querySelector<HTMLButtonElement>('[data-category="numeric"]')!.click();
        expect(visibleNames()).toEqual(['decimal_value', 'float_value', 'integer_value']);
        expect(category).toBe('numeric');

        controls.querySelector<HTMLButtonElement>('[data-category="datetime"]')!.click();
        expect(visibleNames()).toEqual(['observed_at', 'plain_date']);
        expect(category).toBe('datetime');
        grid.dispose();
    });
});


it('preserves open quality findings across redraws and clears them when the column disappears', () => {
    document.body.innerHTML = '<div id="profile-grid"></div>';
    let rows = profileRowsFromMetadata({
        profile_status: 'exact', total_rows: 2, columns: [{ name: 'value', dtype: 'Float64' }],
        numeric_columns: ['value'], time_column: null, time_range: null,
        column_profiles: [{ name: 'value', dtype: 'Float64', non_null_count: 2, null_count: 0, non_finite_count: 1 }],
    } as DatasetMetadata);
    const root = document.getElementById('profile-grid')!;
    const grid = createProfileGridController({ root, getProfiles: () => rows, selectable: false });
    grid.render();
    root.querySelector<HTMLButtonElement>('.profile-quality-details-button')!.click();
    const details = document.getElementById('profile-grid-quality-details') as HTMLDetailsElement;
    grid.render();
    expect(details.hidden).toBe(false);
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(details.querySelector('summary'));
    details.open = false;
    grid.render();
    expect(details.open).toBe(false);
    rows = [];
    grid.render();
    expect(details.hidden).toBe(true);
    grid.dispose();
});
