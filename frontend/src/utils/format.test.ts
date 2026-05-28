import { describe, expect, it } from 'vitest';
import {
    formatAnalysisTime,
    formatCount,
    formatProfileValue,
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
});
