import { describe, expect, it } from 'vitest';
import {
    formatAnalysisTime,
    formatCount,
    formatProfileValue,
    formatProfileValueTitle,
    formatToDatetimeLocal,
    isTemporalDtype,
    normalizeDtypeLabel,
    toFiniteNumberOrNull,
} from './format.js';

describe('format helpers', () => {
    it('formats invalid counts and temporal dtype labels consistently', () => {
        expect(formatCount(-1)).toBe('0');
        expect(isTemporalDtype('Datetime[ns]')).toBe(true);
        expect(normalizeDtypeLabel('date[ms]')).toBe('datetime[ns]');
    });

    it('formats analysis/profile date values and finite numbers', () => {
        expect(formatAnalysisTime(NaN)).toBe('—');
        expect(formatProfileValue(new Date('2024-01-01T00:00:00Z').getTime(), 'datetime')).not.toBe('—');
        expect(formatToDatetimeLocal(new Date('2024-01-01T12:30:00').getTime())).toMatch(/T12:30$/);
        expect(toFiniteNumberOrNull('4.5')).toBe(4.5);
    });

    it('renders datetime profile values as UTC ISO 8601 without locale shifts', () => {
        // ETTm2's `date` column starts at exactly 2016-07-01T00:00:00Z.
        // The previous behaviour used `d.toLocaleString()` which shifted
        // the value to the browser's local timezone — see usage_issue.md
        // §6.1. The fix always emits the UTC ISO 8601 string.
        const value = new Date('2016-07-01T00:00:00Z').getTime();
        expect(formatProfileValue(value, 'datetime')).toBe('2016-07-01T00:00:00Z');
        // Compact form drops trailing milliseconds when they're zero so
        // the rendered cell stays narrow.
        expect(formatProfileValue(value, 'date')).toBe('2016-07-01T00:00:00Z');
        // Non-zero milliseconds are preserved.
        const withMs = new Date('2024-01-01T12:30:00.123Z').getTime();
        expect(formatProfileValue(withMs, 'datetime')).toBe('2024-01-01T12:30:00.123Z');
    });

    it('keeps numeric formatting identical to the legacy helper', () => {
        // The legacy helper always used `formatTwoDecimals`, so a whole
        // number like 42 renders as "42.00". Pin that behaviour so the
        // profile grid keeps a consistent column width.
        expect(formatProfileValue(42, 'Float64')).toBe('42.00');
        expect(formatProfileValue(3.14159, 'Float64')).toMatch(/^3\.14/);
    });

    it('formats the title attribute with an explicit UTC label', () => {
        const value = new Date('2016-07-01T00:00:00Z').getTime();
        expect(formatProfileValueTitle(value, 'datetime')).toBe('UTC 2016-07-01T00:00:00.000Z');
    });
});
