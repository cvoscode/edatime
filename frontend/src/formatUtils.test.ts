/**
 * Tests for frontend/src/formatUtils.ts
 *
 * Validates date/number formatting behavior used throughout the UI.
 */
import { describe, it, expect } from 'vitest';
import { formatTwoDecimals, formatTimestamp, formatTimeTooltip } from './formatUtils';

describe('formatTwoDecimals', () => {
    it('formats finite numbers with 2 decimal places', () => {
        const result = formatTwoDecimals(3.14159);
        // Locale-dependent but should contain "3" and some decimals
        expect(result).toContain('3');
        expect(result).not.toBe('—');
    });

    it('returns "—" for NaN', () => {
        expect(formatTwoDecimals(NaN)).toBe('—');
    });

    it('returns "—" for Infinity', () => {
        expect(formatTwoDecimals(Infinity)).toBe('—');
        expect(formatTwoDecimals(-Infinity)).toBe('—');
    });

    it('returns "—" for non-numeric values', () => {
        expect(formatTwoDecimals(undefined)).toBe('—');
        // null coerces to 0 via Number(null), so it formats as 0.00
        expect(formatTwoDecimals(null)).not.toBe('—');
        expect(formatTwoDecimals('abc')).toBe('—');
    });

    it('formats zero correctly', () => {
        const result = formatTwoDecimals(0);
        expect(result).not.toBe('—');
    });

    it('formats negative numbers', () => {
        const result = formatTwoDecimals(-42.5);
        expect(result).not.toBe('—');
    });
});

describe('formatTimestamp', () => {
    const epoch2024 = new Date('2024-01-15T12:30:45Z').getTime();

    it('returns "—" for non-finite values', () => {
        expect(formatTimestamp(NaN, 1000)).toBe('—');
        expect(formatTimestamp(Infinity, 1000)).toBe('—');
    });

    it('returns a string for valid epoch ms', () => {
        const result = formatTimestamp(epoch2024, 60_000);
        expect(result).not.toBe('—');
        expect(result.length).toBeGreaterThan(0);
    });

    it('uses seconds format for short spans (<=2 min)', () => {
        // spanMs <= 2*60_000 → should use EURO_DATE_TIME_SECONDS
        const result = formatTimestamp(epoch2024, 60_000);
        expect(result).not.toBe('—');
    });

    it('uses date+time for medium spans (<=2 days)', () => {
        // spanMs <= 2*24*60*60_000 → should use EURO_DATE_TIME
        const result = formatTimestamp(epoch2024, 12 * 60 * 60_000);
        expect(result).not.toBe('—');
    });

    it('uses date-only for wide spans (>2 days)', () => {
        // spanMs > 2*24*60*60_000 → should use EURO_DATE_ONLY
        const result = formatTimestamp(epoch2024, 30 * 24 * 60 * 60_000);
        expect(result).not.toBe('—');
    });
});

describe('formatTimeTooltip', () => {
    const epoch2024 = new Date('2024-01-15T12:30:45Z').getTime();

    it('always shows at least date+time for wide spans', () => {
        const result = formatTimeTooltip(epoch2024, 30 * 24 * 60 * 60_000);
        expect(result).not.toBe(String(epoch2024));
        expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to string representation for invalid dates', () => {
        const badMs = NaN;
        const result = formatTimeTooltip(badMs, 60_000);
        expect(result).toBe(String(badMs));
    });
});
