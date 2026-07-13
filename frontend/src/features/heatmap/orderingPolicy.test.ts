import { describe, expect, it } from 'vitest';
import { buildHeatmapRenderOrder } from './orderingPolicy.js';

const columns = ['a', 'b', 'c'];
const matrix = [[1, 0.9, 0.1], [0.9, 1, 0.2], [0.1, 0.2, 1]];

describe('heatmap ordering policy', () => {
    it('preserves a complete manual order over clustering', () => {
        const result = buildHeatmapRenderOrder({ columns, matrix, savedOrder: ['c', 'b', 'a'], clusterEnabled: true, clusterThreshold: 0.85 });

        expect(result.order).toEqual(['c', 'b', 'a']);
        expect(result.clusters).toEqual([]);
        expect(result.originalIndices.get(0)).toBe(2);
    });

    it('rejects partial manual orders and falls back to source order without clustering', () => {
        const result = buildHeatmapRenderOrder({ columns, matrix, savedOrder: ['b'], clusterEnabled: false, clusterThreshold: 0.85 });

        expect(result.order).toEqual(columns);
        expect(result.originalIndices.get(2)).toBe(2);
    });
});
