import { describe, expect, it } from 'vitest';

import { buildTimeSeriesAxisPresentation } from './timeSeriesAxisPresentation.js';

describe('buildTimeSeriesAxisPresentation', () => {
    it('uses the display-range policy for both axis bounds and grid tick labels', () => {
        const presentation = buildTimeSeriesAxisPresentation({
            userMin: null, userMax: null, dataMin: 10, dataMax: 20,
            robustMin: null, robustMax: null, stackFromZero: false, yAxisLabel: 'Temperature',
        });

        expect(presentation.yAxis).toMatchObject({ type: 'value', min: 9.5, max: 20.5 });
        expect(presentation.yAxis.tickFormatter(12.345)).toBe('12.35');
        expect(presentation.grid.left).toBeGreaterThan(0);
    });

    it('uses the shared display-range policy for explicit user ranges', () => {
        const { yAxis } = buildTimeSeriesAxisPresentation({
            userMin: -2, userMax: 3, dataMin: 0, dataMax: 1,
            robustMin: null, robustMax: null, stackFromZero: false, yAxisLabel: '',
        });
        expect(yAxis).toMatchObject({ min: -2.25, max: 3.25 });
    });
});
