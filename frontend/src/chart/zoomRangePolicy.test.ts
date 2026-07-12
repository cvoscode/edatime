import { describe, expect, it } from 'vitest';
import { computeZoomPercentRange } from './zoomRangePolicy.js';

describe('chart zoom range policy', () => {
    it('maps an in-domain viewport to percentages', () => {
        expect(computeZoomPercentRange(100, 300, 150, 250)).toEqual({ start: 25, end: 75 });
    });

    it('clamps a viewport to the domain and rejects invalid ranges', () => {
        expect(computeZoomPercentRange(100, 300, 0, 400)).toEqual({ start: 0, end: 100 });
        expect(computeZoomPercentRange(100, 300, 350, 400)).toEqual({ start: 0, end: 100 });
        expect(computeZoomPercentRange(100, 100, 100, 101)).toEqual({ start: 0, end: 100 });
    });
});
