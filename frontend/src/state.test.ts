/**
 * Tests for frontend/src/state.ts
 *
 * Validates the centralised application state, color management,
 * format helpers, column range filtering, and adaptive line filters.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    SERIES_COLORS,
    PROFILE_COLUMNS,
    appState,
    normalizeSeriesColor,
    getSeriesColor,
    setSeriesColor,
    formatAnalysisTime,
    formatCount,
    isTemporalDtype,
    normalizeDtypeLabel,
    formatProfileValue,
    formatToDatetimeLocal,
    toFiniteNumberOrNull,
    computeBounds,
    sanitizeSelectedColumns,
    ensureRangeStateFromData,
    buildAdaptiveLineY,
    buildAdaptiveLineFiltersForQuery,
    applyColumnRanges,
} from './state';

describe('SERIES_COLORS', () => {
    it('has at least 6 palette entries', () => {
        expect(SERIES_COLORS.length).toBeGreaterThanOrEqual(6);
    });

    it('all entries are valid hex colors', () => {
        for (const color of SERIES_COLORS) {
            expect(color).toMatch(/^#[0-9a-f]{6}$/);
        }
    });
});

describe('PROFILE_COLUMNS', () => {
    it('has expected column definitions', () => {
        const keys = PROFILE_COLUMNS.map((c) => c.key);
        expect(keys).toContain('name');
        expect(keys).toContain('dtype');
        expect(keys).toContain('min');
        expect(keys).toContain('max');
    });

    it('all columns have minWidth and defaultWidth', () => {
        for (const col of PROFILE_COLUMNS) {
            expect(col.minWidth).toBeGreaterThan(0);
            expect(col.defaultWidth).toBeGreaterThanOrEqual(col.minWidth);
        }
    });
});

describe('normalizeSeriesColor', () => {
    it('accepts valid 6-digit hex colors', () => {
        expect(normalizeSeriesColor('#ff0000')).toBe('#ff0000');
        expect(normalizeSeriesColor('#00D4FF')).toBe('#00d4ff');
    });

    it('rejects invalid formats', () => {
        expect(normalizeSeriesColor('#fff')).toBeNull();
        expect(normalizeSeriesColor('red')).toBeNull();
        expect(normalizeSeriesColor('')).toBeNull();
        expect(normalizeSeriesColor(null)).toBeNull();
        expect(normalizeSeriesColor(undefined)).toBeNull();
    });

    it('trims whitespace', () => {
        expect(normalizeSeriesColor('  #aabbcc  ')).toBe('#aabbcc');
    });
});

describe('getSeriesColor / setSeriesColor', () => {
    beforeEach(() => {
        appState.seriesColors = {};
    });

    it('returns palette color by default', () => {
        const color = getSeriesColor('col1', 0);
        expect(color).toBe(SERIES_COLORS[0]);
    });

    it('wraps palette index', () => {
        const idx = SERIES_COLORS.length + 2;
        const color = getSeriesColor('col1', idx);
        expect(color).toBe(SERIES_COLORS[2]);
    });

    it('returns custom color when set', () => {
        setSeriesColor('col1', '#112233');
        expect(getSeriesColor('col1', 0)).toBe('#112233');
    });

    it('setSeriesColor returns null for invalid values', () => {
        expect(setSeriesColor('col1', 'invalid')).toBeNull();
        expect(setSeriesColor('', '#112233')).toBeNull();
    });
});

describe('formatAnalysisTime', () => {
    it('returns "—" for non-finite', () => {
        expect(formatAnalysisTime(NaN)).toBe('—');
        expect(formatAnalysisTime(Infinity)).toBe('—');
    });

    it('formats a valid epoch ms to locale string', () => {
        const ts = new Date('2024-06-15T10:00:00Z').getTime();
        const result = formatAnalysisTime(ts);
        expect(result).not.toBe('—');
        expect(result.length).toBeGreaterThan(0);
    });
});

describe('formatCount', () => {
    it('formats valid numbers', () => {
        const result = formatCount(1234);
        expect(result).not.toBe('0');
    });

    it('returns "0" for invalid values', () => {
        expect(formatCount(NaN)).toBe('0');
        expect(formatCount(-1)).toBe('0');
        expect(formatCount(null)).toBe('0');
    });
});

describe('isTemporalDtype', () => {
    it('recognizes datetime types', () => {
        expect(isTemporalDtype('Datetime[ns]')).toBe(true);
        expect(isTemporalDtype('datetime[ms]')).toBe(true);
        expect(isTemporalDtype('Date')).toBe(true);
        expect(isTemporalDtype('date[ms]')).toBe(true);
    });

    it('rejects non-temporal types', () => {
        expect(isTemporalDtype('Float64')).toBe(false);
        expect(isTemporalDtype('Int32')).toBe(false);
        expect(isTemporalDtype('String')).toBe(false);
    });
});

describe('normalizeDtypeLabel', () => {
    it('normalizes temporal types to datetime[ns]', () => {
        expect(normalizeDtypeLabel('Datetime[us]')).toBe('datetime[ns]');
    });

    it('passes through non-temporal types', () => {
        expect(normalizeDtypeLabel('Float64')).toBe('Float64');
    });
});

describe('formatProfileValue', () => {
    it('returns "—" for null/undefined', () => {
        expect(formatProfileValue(null, 'Float64')).toBe('—');
        expect(formatProfileValue(undefined, 'Float64')).toBe('—');
    });

    it('formats temporal values as dates', () => {
        const ts = new Date('2024-01-15').getTime();
        const result = formatProfileValue(ts, 'Datetime[ns]');
        expect(result).not.toBe('—');
    });

    it('formats numeric values with two decimals', () => {
        const result = formatProfileValue(42.123, 'Float64');
        expect(result).not.toBe('—');
    });
});

describe('formatToDatetimeLocal', () => {
    it('formats a valid ms to datetime-local string', () => {
        const ts = new Date('2024-06-15T10:30:00').getTime();
        const result = formatToDatetimeLocal(ts);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('returns empty string for non-finite', () => {
        expect(formatToDatetimeLocal(NaN)).toBe('');
        expect(formatToDatetimeLocal(Infinity)).toBe('');
    });
});

describe('toFiniteNumberOrNull', () => {
    it('returns number for finite values', () => {
        expect(toFiniteNumberOrNull(42)).toBe(42);
        expect(toFiniteNumberOrNull('3.14')).toBe(3.14);
    });

    it('returns null for non-finite', () => {
        expect(toFiniteNumberOrNull(NaN)).toBeNull();
        expect(toFiniteNumberOrNull(Infinity)).toBeNull();
        expect(toFiniteNumberOrNull('abc')).toBeNull();
    });
});

describe('computeBounds', () => {
    it('computes min/max from a typed array', () => {
        const values = Float64Array.from([3, 1, 4, 1, 5, 9, 2, 6]);
        const bounds = computeBounds(values);
        expect(bounds).toEqual({ min: 1, max: 9 });
    });

    it('returns null for all-NaN arrays', () => {
        const values = Float64Array.from([NaN, NaN, NaN]);
        expect(computeBounds(values)).toBeNull();
    });

    it('returns null for empty arrays', () => {
        expect(computeBounds(Float64Array.from([]))).toBeNull();
    });

    it('ignores NaN values', () => {
        const values = Float64Array.from([NaN, 5, NaN, 2, NaN]);
        expect(computeBounds(values)).toEqual({ min: 2, max: 5 });
    });
});

describe('sanitizeSelectedColumns', () => {
    beforeEach(() => {
        appState.metadata = {
            total_rows: 100,
            columns: [
                { name: 'ts', dtype: 'Datetime[ns]' },
                { name: 'value', dtype: 'Float64' },
                { name: 'temp', dtype: 'Float64' },
            ],
            numeric_columns: ['value', 'temp'],
            time_range: { start_ms: 0, end_ms: 1000 },
        } as any;
    });

    it('removes time-related columns', () => {
        appState.selectedCols = ['ts', 'value', 'time', 'temp'];
        sanitizeSelectedColumns();
        expect(appState.selectedCols).not.toContain('ts');
        expect(appState.selectedCols).not.toContain('time');
        expect(appState.selectedCols).toContain('value');
        expect(appState.selectedCols).toContain('temp');
    });

    it('removes empty strings', () => {
        appState.selectedCols = ['', 'value', '  '];
        sanitizeSelectedColumns();
        expect(appState.selectedCols).toEqual(['value']);
    });
});

describe('buildAdaptiveLineY', () => {
    const filter = { column: 'temp', x1: 0, y1: 0, x2: 100, y2: 100, keepAbove: true };

    it('computes linear interpolation along the filter line', () => {
        expect(buildAdaptiveLineY(filter, 50)).toBe(50);
        expect(buildAdaptiveLineY(filter, 0)).toBe(0);
        expect(buildAdaptiveLineY(filter, 100)).toBe(100);
    });

    it('returns null for timestamps outside range', () => {
        expect(buildAdaptiveLineY(filter, -10)).toBeNull();
        expect(buildAdaptiveLineY(filter, 110)).toBeNull();
    });

    it('returns null for degenerate filters (x1 === x2)', () => {
        const degenerate = { ...filter, x2: 0 };
        expect(buildAdaptiveLineY(degenerate, 0)).toBeNull();
    });
});

describe('buildAdaptiveLineFiltersForQuery', () => {
    beforeEach(() => {
        appState.adaptiveLineFilters = [];
    });

    it('returns empty array when no filters exist', () => {
        expect(buildAdaptiveLineFiltersForQuery()).toEqual([]);
    });

    it('includes valid filters', () => {
        appState.adaptiveLineFilters = [
            { column: 'temp', x1: 0, y1: 10, x2: 100, y2: 50, keepAbove: true },
        ];
        const result = buildAdaptiveLineFiltersForQuery();
        expect(result).toHaveLength(1);
        expect(result[0].column).toBe('temp');
    });

    it('excludes filters with missing column', () => {
        appState.adaptiveLineFilters = [
            { column: '', x1: 0, y1: 10, x2: 100, y2: 50, keepAbove: true },
        ];
        expect(buildAdaptiveLineFiltersForQuery()).toHaveLength(0);
    });

    it('excludes degenerate filters', () => {
        appState.adaptiveLineFilters = [
            { column: 'temp', x1: 50, y1: 10, x2: 50, y2: 50, keepAbove: true },
        ];
        expect(buildAdaptiveLineFiltersForQuery()).toHaveLength(0);
    });
});

describe('ensureRangeStateFromData', () => {
    beforeEach(() => {
        appState.columnRanges = {};
        appState.selectedCols = ['value'];
    });

    it('initializes column range from data bounds', () => {
        const dataObj = { ts: [1, 2, 3], values: { value: [10, 20, 30] }, color: null };
        ensureRangeStateFromData(dataObj as any);
        expect(appState.columnRanges['value']).toEqual({ from: 10, to: 30 });
    });

    it('does not overwrite existing ranges', () => {
        appState.columnRanges['value'] = { from: 5, to: 50 };
        const dataObj = { ts: [1, 2, 3], values: { value: [10, 20, 30] }, color: null };
        ensureRangeStateFromData(dataObj as any);
        expect(appState.columnRanges['value']).toEqual({ from: 5, to: 50 });
    });
});

describe('applyColumnRanges', () => {
    beforeEach(() => {
        appState.selectedCols = ['value'];
        appState.columnRanges = {};
        appState.adaptiveLineFilters = [];
    });

    it('passes through all points when no range/filter constraints', () => {
        const dataObj = {
            ts: [1, 2, 3, 4, 5],
            values: { value: [10, 20, 30, 40, 50] },
            color: null,
        };
        const result = applyColumnRanges(dataObj as any);
        expect(result.series['value'].x).toHaveLength(5);
        expect(result.series['value'].y).toHaveLength(5);
    });

    it('filters by column range', () => {
        appState.columnRanges['value'] = { from: 20, to: 40 };
        const dataObj = {
            ts: [1, 2, 3, 4, 5],
            values: { value: [10, 20, 30, 40, 50] },
            color: null,
        };
        const result = applyColumnRanges(dataObj as any);
        expect(result.series['value'].y).toHaveLength(3);
        expect(Array.from(result.series['value'].y)).toEqual([20, 30, 40]);
    });

    it('skips NaN values', () => {
        const dataObj = {
            ts: [1, 2, 3],
            values: { value: [10, NaN, 30] },
            color: null,
        };
        const result = applyColumnRanges(dataObj as any);
        expect(result.series['value'].y).toHaveLength(2);
    });

    it('applies adaptive line filters', () => {
        appState.adaptiveLineFilters = [
            { column: 'value', x1: 0, y1: 25, x2: 10, y2: 25, keepAbove: true },
        ];
        const dataObj = {
            ts: [1, 2, 3, 4, 5],
            values: { value: [10, 20, 30, 40, 50] },
            color: null,
        };
        const result = applyColumnRanges(dataObj as any);
        // Only values >= 25 should pass (30, 40, 50)
        expect(result.series['value'].y).toHaveLength(3);
    });
});
