import { describe, expect, it } from 'vitest';
import { prepareMiniDensityGrid, transposeMiniDensityGrid } from './miniDensity.js';

describe('mini matrix density grid', () => {
    it('counts only finite plotted pairs and transposes bins for mirrored cells', () => {
        const grid = prepareMiniDensityGrid([
            [Number.NaN, 1],
            [2, Number.POSITIVE_INFINITY],
            [3, 4],
            [5, 7],
        ]);
        expect(grid.finiteCount).toBe(2);
        expect(grid.maxCount).toBeGreaterThan(0);

        const transposed = transposeMiniDensityGrid({
            bins: 2,
            counts: new Float32Array([1, 2, 3, 4]),
            maxCount: 4,
            finiteCount: 4,
        });
        expect(Array.from(transposed.counts)).toEqual([2, 4, 1, 3]);
        expect(transposed.maxCount).toBe(4);
    });

    it('excludes pairs outside the supplied bounds from plotted counts', () => {
        const grid = prepareMiniDensityGrid(
            [[1, 1], [5, 5], [Number.NaN, 4]],
            { min: 0, max: 2 },
            { min: 0, max: 2 },
        );
        expect(grid.finiteCount).toBe(1);
        expect(grid.maxCount).toBeGreaterThan(0);
        expect(prepareMiniDensityGrid([[5, 5]], { min: 0, max: 2 }, { min: 0, max: 2 }).finiteCount).toBe(0);
    });
});
