/** Pure binning and smoothing for density thumbnails in both relationship matrices. */

export interface MiniDensityGrid {
    bins: number;
    counts: Float32Array;
    maxCount: number;
    finiteCount: number;
}

export interface MiniDensityBounds {
    min: number;
    max: number;
}

export const MINI_DENSITY_BINS = 32;

export function domainRatio(value: number, min: number, max: number): number {
    if (min === max) return 0.5;
    const span = max - min;
    if (Number.isFinite(span)) return (value - min) / span;
    const scale = Math.max(Math.abs(value), Math.abs(min), Math.abs(max), Number.MIN_VALUE);
    return (value / scale - min / scale) / (max / scale - min / scale);
}

/** Rows are stored top-down for canvas; a 3×3 box pass softens sparse bins. */
export function prepareMiniDensityGrid(
    points: [number, number][],
    xBounds?: MiniDensityBounds,
    yBounds?: MiniDensityBounds,
): MiniDensityGrid {
    let minX = xBounds?.min ?? Infinity;
    let maxX = xBounds?.max ?? -Infinity;
    let minY = yBounds?.min ?? Infinity;
    let maxY = yBounds?.max ?? -Infinity;
    let finiteCount = 0;
    for (const point of points) {
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        finiteCount += 1;
        if (!xBounds) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
        if (!yBounds) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }

    const bins = MINI_DENSITY_BINS;
    const grid = new Float32Array(bins * bins);
    if (finiteCount === 0 || !Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return { bins, counts: grid, maxCount: 0, finiteCount: 0 };
    }
    let plottedCount = 0;
    for (const point of points) {
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        plottedCount += 1;
        const bx = Math.min(bins - 1, Math.max(0, Math.floor(domainRatio(x, minX, maxX) * bins)));
        const by = Math.min(bins - 1, Math.max(0, Math.floor(domainRatio(y, minY, maxY) * bins)));
        grid[(bins - 1 - by) * bins + bx] += 1;
    }

    const counts = new Float32Array(bins * bins);
    let maxCount = 0;
    for (let row = 0; row < bins; row++) {
        for (let col = 0; col < bins; col++) {
            let sum = 0;
            let hits = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const y = row + dy;
                    const x = col + dx;
                    if (x < 0 || x >= bins || y < 0 || y >= bins) continue;
                    sum += grid[y * bins + x];
                    hits += 1;
                }
            }
            const value = hits > 0 ? sum / hits : 0;
            counts[row * bins + col] = value;
            maxCount = Math.max(maxCount, value);
        }
    }
    return { bins, counts, maxCount, finiteCount: plottedCount };
}

export function transposeMiniDensityGrid(grid: MiniDensityGrid): MiniDensityGrid {
    const counts = new Float32Array(grid.counts.length);
    for (let row = 0; row < grid.bins; row++) {
        for (let col = 0; col < grid.bins; col++) {
            counts[(grid.bins - 1 - col) * grid.bins + row] = grid.counts[row * grid.bins + col]!;
        }
    }
    return { ...grid, counts };
}

