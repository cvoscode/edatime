import { describe, expect, it } from 'vitest';
import { getChartExportDomains, getChartExportViewport } from './chartExportLayout.js';

describe('chart export layout', () => {
    it('calculates stable pixel dimensions with a valid device ratio', () => {
        expect(getChartExportViewport({ width: 400.4, height: 200.4 } as DOMRect, null, 2)).toEqual({
            cssWidth: 400, cssHeight: 200, width: 800, height: 400, dpr: 2,
        });
    });

    it('uses fallback domains and pads the rendered y-range only', () => {
        expect(getChartExportDomains({ min: null, max: null }, { min: 10, max: 20 }, { min: 5, max: 15 })).toEqual({
            xMin: 10, xMax: 20, yMin: 4.6, yMax: 15.4,
        });
    });
});
