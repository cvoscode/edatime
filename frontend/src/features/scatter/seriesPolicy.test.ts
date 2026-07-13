import { describe, expect, it } from 'vitest';
import { buildNormalScatterSeries } from './seriesPolicy.js';

describe('scatter series policy', () => {
    const points: [number, number][] = [[1, 2], [3, 4]];
    const controls = { x: 'x', y: 'y', selectedColorColumn: 'value', colorScale: 'viridis' };

    it('falls back to one stable-color series without a usable continuous domain', () => {
        const series = buildNormalScatterSeries(points, controls, { colorValues: [], allColorValues: [], colorLabels: null, colorMin: null, colorMax: null }, '#abc');
        expect(series).toEqual([expect.objectContaining({ name: 'x vs y', color: '#abc', data: points })]);
    });

    it('groups finite continuous values into colored series', () => {
        const series = buildNormalScatterSeries(points, controls, { colorValues: [0, 1], allColorValues: [0, 1], colorLabels: null, colorMin: 0, colorMax: 1 }, '#abc');
        expect(series).toHaveLength(2);
        expect(series.flatMap((entry) => entry.data)).toEqual(points);
    });
});
