import { describe, expect, it } from 'vitest';
import { mapCssPointToChartData } from './chartCoordinateMapper.js';

describe('chart coordinate mapper', () => {
    const base = {
        rect: { left: 10, top: 20, width: 300, height: 200 },
        grid: { left: 50, right: 50, top: 20, bottom: 20 },
        xRange: { min: 0, max: 100 },
        yRange: { min: 30, max: 70 },
    };

    it('maps plot edges into active x/y data ranges', () => {
        expect(mapCssPointToChartData({ ...base, clientX: 160, clientY: 40 })).toEqual({ x: 50, y: 70 });
        expect(mapCssPointToChartData({ ...base, clientX: 260, clientY: 200 })).toEqual({ x: 100, y: 30 });
    });

    it('rejects invalid ranges and points outside the plot', () => {
        expect(mapCssPointToChartData({ ...base, clientX: 20, clientY: 40 })).toBeNull();
        expect(mapCssPointToChartData({ ...base, clientX: 160, clientY: 40, xRange: null })).toBeNull();
    });
});
