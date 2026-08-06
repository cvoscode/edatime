import { describe, expect, it } from 'vitest';

import {
    FFT_FALLBACK_BUDGET,
    FFT_TARGET_POINTS,
    resolveFftPointBudget,
} from './fftBudget.js';

describe('FFT request budget', () => {
    it('uses the server-advertised analytics point limit', () => {
        expect(resolveFftPointBudget({ budgets: { analytics_points: 65_536 } })).toBe(65_536);
    });

    it('does not request more than the FFT quality target', () => {
        expect(resolveFftPointBudget({ budgets: { analytics_points: 500_000 } })).toBe(FFT_TARGET_POINTS);
    });

    it('falls back conservatively when capabilities are absent or invalid', () => {
        expect(resolveFftPointBudget(undefined)).toBe(FFT_FALLBACK_BUDGET);
        expect(resolveFftPointBudget({ budgets: { analytics_points: 0 } })).toBe(FFT_FALLBACK_BUDGET);
    });
});
