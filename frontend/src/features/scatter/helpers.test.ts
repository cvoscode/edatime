/**
 * Tests for frontend/src/scatter/helpers.ts
 *
 * Validates scatter-page utilities: color palettes, gradient sampling,
 * hex/RGB conversion, and computation helpers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    DEFAULT_SCATTER_SUGGESTION_THRESHOLD,
    paletteForScale,
    hexToRgb,
    rgbToHex,
    sampleGradient,
    computeColorExtent,
    MATRIX_POINT_LIMIT,
    MATRIX_MAX_COLUMNS,
    HISTOGRAM_BINS,
    LOW_CARDINALITY_LIMIT,
    normalizeScatterSuggestionThreshold,
    buildHistogramForDomain,
    drawMiniDensityCanvas,
} from './helpers';

class DensityMockContext2D {
    ops: string[] = [];
    fillStyle = '';
    strokeStyle = '';
    lineWidth = 1;
    font = '';
    textAlign: CanvasTextAlign = 'start';
    textBaseline: CanvasTextBaseline = 'alphabetic';

    setTransform() { this.ops.push('setTransform'); }
    clearRect() { this.ops.push('clearRect'); }
    fillRect(x: number, y: number, w: number, h: number) {
        this.ops.push(`fillRect:${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`);
    }
    strokeRect(_x: number, _y: number, w: number, h: number) { this.ops.push(`strokeRect:${Math.round(w)}x${Math.round(h)}`); }
    fillText(text: string) { this.ops.push(`fillText:${text}`); }
    beginPath() { this.ops.push('beginPath'); }
    moveTo() { this.ops.push('moveTo'); }
    lineTo() { this.ops.push('lineTo'); }
    arc() { this.ops.push('arc'); }
    closePath() { this.ops.push('closePath'); }
    stroke() { this.ops.push('stroke'); }
    fill() { this.ops.push('fill'); }
}

describe('scatter constants', () => {
    it('defines sensible limits', () => {
        expect(MATRIX_POINT_LIMIT).toBeGreaterThan(0);
        expect(MATRIX_MAX_COLUMNS).toBeGreaterThan(0);
        expect(HISTOGRAM_BINS).toBeGreaterThan(0);
        expect(LOW_CARDINALITY_LIMIT).toBeGreaterThan(0);
    });
});

describe('paletteForScale', () => {
    it('returns viridis palette by default', () => {
        const colors = paletteForScale('viridis');
        expect(colors.length).toBeGreaterThanOrEqual(6);
        expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('returns plasma palette', () => {
        const colors = paletteForScale('plasma');
        expect(colors[0]).toBe('#0d0887');
    });

    it('returns inferno palette', () => {
        const colors = paletteForScale('inferno');
        expect(colors[0]).toBe('#000004');
    });
});

describe('hexToRgb', () => {
    it('converts 6-digit hex to rgb', () => {
        expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
        expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
        expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('handles 3-digit hex', () => {
        expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('handles hex without hash', () => {
        expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });
});

describe('rgbToHex', () => {
    it('converts rgb to hex', () => {
        expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
        expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
    });

    it('clamps values to 0-255', () => {
        expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe('#ff0080');
    });

    it('rounds fractional values', () => {
        expect(rgbToHex({ r: 127.6, g: 0, b: 0 })).toBe('#800000');
    });
});

describe('sampleGradient', () => {
    const stops = ['#000000', '#ffffff'];

    it('returns first color at t=0', () => {
        expect(sampleGradient(stops, 0)).toBe('#000000');
    });

    it('returns last color at t=1', () => {
        expect(sampleGradient(stops, 1)).toBe('#ffffff');
    });

    it('interpolates at t=0.5', () => {
        const mid = sampleGradient(stops, 0.5);
        // Should be approximately #808080
        const rgb = hexToRgb(mid);
        expect(rgb.r).toBeGreaterThan(120);
        expect(rgb.r).toBeLessThan(136);
    });

    it('clamps values outside [0,1]', () => {
        expect(sampleGradient(stops, -1)).toBe('#000000');
        expect(sampleGradient(stops, 2)).toBe('#ffffff');
    });

    it('handles single-stop palette', () => {
        expect(sampleGradient(['#ff0000'], 0.5)).toBe('#ff0000');
    });

    it('handles empty palette', () => {
        const result = sampleGradient([], 0.5);
        expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe('computeColorExtent', () => {
    it('computes min/max from numeric array', () => {
        expect(computeColorExtent([1, 5, 3, 8, 2])).toEqual({ min: 1, max: 8 });
    });

    it('returns null for null input', () => {
        expect(computeColorExtent(null)).toBeNull();
    });

    it('returns null for all-NaN values', () => {
        expect(computeColorExtent([NaN, NaN])).toBeNull();
    });

    it('skips NaN values', () => {
        expect(computeColorExtent([NaN, 3, NaN, 7, NaN])).toEqual({ min: 3, max: 7 });
    });
});

describe('normalizeScatterSuggestionThreshold', () => {
    it('falls back to the default threshold for non-finite values', () => {
        expect(normalizeScatterSuggestionThreshold(undefined)).toBe(DEFAULT_SCATTER_SUGGESTION_THRESHOLD);
    });

    it('clamps the threshold into the supported range', () => {
        expect(normalizeScatterSuggestionThreshold(0.1)).toBe(0.3);
        expect(normalizeScatterSuggestionThreshold(1.2)).toBe(0.95);
    });

    it('rounds to 0.05 increments for UI consistency', () => {
        expect(normalizeScatterSuggestionThreshold(0.73)).toBe(0.75);
    });
});

describe('buildHistogramForDomain', () => {
    it('ignores values outside the requested domain instead of clamping them into edge bins', () => {
        const histogram = buildHistogramForDomain(
            [-100, -50, 1, 2, 8, 9, 50, 100],
            0,
            10,
            5,
        );

        expect(histogram?.counts).toEqual([1, 1, 0, 0, 2]);
    });
});

describe('drawMiniDensityCanvas', () => {
    const densityContexts = new WeakMap<HTMLCanvasElement, DensityMockContext2D>();

    beforeEach(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: function getContext() {
                let ctx = densityContexts.get(this);
                if (!ctx) {
                    ctx = new DensityMockContext2D();
                    densityContexts.set(this, ctx);
                }
                ctx.ops = [];
                return ctx;
            },
        });
    });

    function bindRect(element: HTMLElement, width: number, height: number) {
        Object.defineProperty(element, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height,
                toJSON: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
            }),
        });
    }

    it('writes a "No points" placeholder for empty input', () => {
        document.body.innerHTML = '<canvas id="density-empty"></canvas>';
        const canvas = document.getElementById('density-empty') as HTMLCanvasElement;
        bindRect(canvas, 180, 92);

        drawMiniDensityCanvas(canvas, []);

        const ctx = densityContexts.get(canvas)!;
        const text = ctx.ops.filter((op) => op.startsWith('fillText:'));
        expect(text).toContain('fillText:No points');
        // No rectangle fills for an empty cell.
        expect(ctx.ops.filter((op) => op.startsWith('fillRect:')).length).toBe(0);
    });

    it('renders a soft density fill instead of sparse scatter dots for low-density cells', () => {
        // Tightly clustered points should produce a small but contiguous
        // density blob. The 3×3 box-blur ensures neighbours of populated
        // bins are shaded, so a 5×5 cluster produces > 25 fillRect ops
        // (every populated bin + its smoothed neighbours).
        document.body.innerHTML = '<canvas id="density-blob"></canvas>';
        const canvas = document.getElementById('density-blob') as HTMLCanvasElement;
        bindRect(canvas, 180, 92);

        const points: [number, number][] = [];
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                points.push([10 + i * 0.1, 20 + j * 0.1]);
            }
        }

        drawMiniDensityCanvas(canvas, points);

        const ctx = densityContexts.get(canvas)!;
        const fills = ctx.ops.filter((op) => op.startsWith('fillRect:'));
        expect(fills.length).toBeGreaterThan(25);
        // Density badge should make the cell unambiguous next to scatter cells.
        expect(ctx.ops).toContain('fillText:Density');
        // No isolated fill calls — neighbours of the cluster must be shaded too.
        const xPositions = fills.map((op) => Number(op.split(':')[1].split(',')[0]));
        const uniqueXs = new Set(xPositions.map((x) => Math.round(x)));
        expect(uniqueXs.size).toBeGreaterThan(3);
    });

    it('survives non-finite values mixed into the point list', () => {
        document.body.innerHTML = '<canvas id="density-mixed"></canvas>';
        const canvas = document.getElementById('density-mixed') as HTMLCanvasElement;
        bindRect(canvas, 180, 92);

        drawMiniDensityCanvas(canvas, [
            [Number.NaN, 1],
            [1, Number.POSITIVE_INFINITY],
            [2, 4],
            [3, 5],
            [4, 6],
        ]);

        const ctx = densityContexts.get(canvas)!;
        const fills = ctx.ops.filter((op) => op.startsWith('fillRect:'));
        // Only the three finite points (2,4), (3,5), (4,6) should populate bins.
        expect(fills.length).toBeGreaterThan(0);
        // "No points" placeholder must not be drawn when there is finite data.
        expect(ctx.ops.filter((op) => op === 'fillText:No points')).toHaveLength(0);
    });

    it('writes a density label on the canvas regardless of fill colour', () => {
        document.body.innerHTML = '<canvas id="density-label"></canvas>';
        const canvas = document.getElementById('density-label') as HTMLCanvasElement;
        bindRect(canvas, 180, 92);

        const points: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * 0.5, i * 0.25]);
        drawMiniDensityCanvas(canvas, points, { colorScale: 'inferno' });

        const ctx = densityContexts.get(canvas)!;
        expect(ctx.ops).toContain('fillText:Density');
    });
});
