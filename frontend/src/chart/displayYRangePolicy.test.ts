import { describe, expect, it } from 'vitest';
import { computeDisplayYRange } from './displayYRangePolicy.js';

describe('display Y-range policy', () => {
    it('pads ordinary data and preserves a non-negative floor', () => {
        expect(computeDisplayYRange({ userMin: null, userMax: null, dataMin: 10, dataMax: 30, robustMin: null, robustMax: null, stackFromZero: false })).toEqual({ min: 9, max: 31 });
    });
    it('honors an explicit range and stack-from-zero', () => {
        expect(computeDisplayYRange({ userMin: -10, userMax: 10, dataMin: -10, dataMax: 10, robustMin: null, robustMax: null, stackFromZero: true })).toEqual({ min: 0, max: 11 });
    });
});
