import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scatterState } from '../../store/scatterState.js';
import { applyView, buildOption, updateCorrelationStats, updateMarginalPlots } from './rendering.js';
import { buildDensitySeries, buildDensityTooltipCache, densityTooltipFormatterFactory } from './renderingDensity.js';

class MockCanvasContext2D {
    ops: string[] = [];
    fillStyle = '';
    strokeStyle = '';
    lineWidth = 1;
    font = '';
    textAlign: CanvasTextAlign = 'start';
    textBaseline: CanvasTextBaseline = 'alphabetic';
    globalAlpha = 1;

    setTransform() { this.ops.push('setTransform'); }
    clearRect() { this.ops.push('clearRect'); }
    fillRect(x: number, y: number, w: number, h: number) { this.ops.push(`fillRect:${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`); }
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

const contextByCanvas = new WeakMap<HTMLCanvasElement, MockCanvasContext2D>();

function bindRect(element: HTMLElement, width: number, height: number) {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            width,
            height,
            toJSON: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
        }),
    });
}

function signature(canvasId: string): string {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    return (contextByCanvas.get(canvas)?.ops || []).join('|');
}

function fillRects(canvasId: string): Array<{ x: number; y: number; w: number; h: number }> {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    return (contextByCanvas.get(canvas)?.ops || [])
        .filter((op) => op.startsWith('fillRect:'))
        .map((op) => {
            const [x, y, w, h] = op.slice('fillRect:'.length).split(',').map(Number);
            return { x, y, w, h };
        });
}

describe('scatter marginal rendering modes', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: function getContext() {
                let ctx = contextByCanvas.get(this);
                if (!ctx) {
                    ctx = new MockCanvasContext2D();
                    contextByCanvas.set(this, ctx);
                }
                ctx.ops = [];
                return ctx;
            },
        });

        document.body.innerHTML = `
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="scatter" selected>Scatter</option>
                <option value="density">Density</option>
            </select>
            <select id="scatter-diagonal-mode">
                <option value="histogram" selected>Histogram</option>
                <option value="kde">KDE</option>
                <option value="boxplot">Box Plot</option>
            </select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <div id="scatter-color-scale-field"><select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
            <div id="scatter-chart"></div>
            <canvas id="scatter-marginal-x"></canvas>
            <div id="scatter-right-panel"><canvas id="scatter-marginal-y"></canvas><div id="scatter-colorbar-wrap" hidden></div></div>
        `;

        bindRect(document.getElementById('scatter-chart') as HTMLElement, 1308, 648);
        bindRect(document.getElementById('scatter-marginal-x') as HTMLElement, 1308, 64);
        bindRect(document.getElementById('scatter-marginal-y') as HTMLElement, 72, 712);

        scatterState.activeView = 'plot';
        scatterState.points = [
            [10, 2], [12, 4], [14, 8], [18, 16], [22, 12], [28, 9], [34, 5], [40, 3],
        ] as [number, number][];
        scatterState.view = { xMin: 8, xMax: 42, yMin: 0, yMax: 20 };
    });

    it('uses different drawing paths for histogram, kde, and boxplot marginals', () => {
        const diagonalMode = document.getElementById('scatter-diagonal-mode') as HTMLSelectElement;

        diagonalMode.value = 'histogram';
        updateMarginalPlots();
        const histogramSig = signature('scatter-marginal-x');

        diagonalMode.value = 'kde';
        updateMarginalPlots();
        const kdeSig = signature('scatter-marginal-x');

        diagonalMode.value = 'boxplot';
        updateMarginalPlots();
        const boxSig = signature('scatter-marginal-x');

        expect(histogramSig).not.toEqual(kdeSig);
        expect(histogramSig).not.toEqual(boxSig);
        expect(kdeSig).not.toEqual(boxSig);
    });

    it('shows marginals in density mode and keeps them on the right panel', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderMode.value = 'density';
        updateMarginalPlots();

        const marginalX = document.getElementById('scatter-marginal-x') as HTMLCanvasElement;
        const marginalY = document.getElementById('scatter-marginal-y') as HTMLCanvasElement;
        const rightPanel = document.getElementById('scatter-right-panel') as HTMLElement;

        // Marginals should now be visible in density mode.
        expect(marginalX.hidden).toBe(false);
        expect(marginalY.hidden).toBe(false);
        // Right panel hosts both the y-marginal and the colorbar in density mode.
        expect(rightPanel.hidden).toBe(false);
        expect(rightPanel.dataset.marginalActive).toBe('1');
        // #scatter-chart should reserve the 64px top strip via the .with-x-marginal class.
        expect(document.getElementById('scatter-chart')?.classList.contains('with-x-marginal')).toBe(true);
    });

    it('draws histogram, kde, and boxplot marginals in density mode', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        const diagonalMode = document.getElementById('scatter-diagonal-mode') as HTMLSelectElement;
        renderMode.value = 'density';

        diagonalMode.value = 'histogram';
        updateMarginalPlots();
        const histX = signature('scatter-marginal-x');
        const histY = signature('scatter-marginal-y');

        diagonalMode.value = 'kde';
        updateMarginalPlots();
        const kdeX = signature('scatter-marginal-x');
        const kdeY = signature('scatter-marginal-y');

        diagonalMode.value = 'boxplot';
        updateMarginalPlots();
        const boxX = signature('scatter-marginal-x');
        const boxY = signature('scatter-marginal-y');

        // Each mode should produce a non-empty draw signature.
        expect(histX.length).toBeGreaterThan(0);
        expect(kdeX.length).toBeGreaterThan(0);
        expect(boxX.length).toBeGreaterThan(0);
        expect(histY.length).toBeGreaterThan(0);
        expect(kdeY.length).toBeGreaterThan(0);
        expect(boxY.length).toBeGreaterThan(0);

        // And the three modes should still differ on both axes.
        expect(histX).not.toEqual(kdeX);
        expect(histX).not.toEqual(boxX);
        expect(kdeX).not.toEqual(boxX);
        expect(histY).not.toEqual(kdeY);
        expect(histY).not.toEqual(boxY);
        expect(kdeY).not.toEqual(boxY);
    });

    it('uses density bin geometry for histogram marginals in density mode', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        const binSize = document.getElementById('scatter-bin-size') as HTMLInputElement;
        renderMode.value = 'density';
        binSize.value = '10';

        scatterState.points = Array.from({ length: 120 }, (_, i) => [10 + i * 0.25, 2 + (i % 6)] as [number, number]);
        scatterState.view = { xMin: 10, xMax: 40, yMin: 0, yMax: 12 };

        const container = document.getElementById('scatter-chart') as HTMLElement;
        buildOption(scatterState.points, container);
        updateMarginalPlots();

        const xBars = fillRects('scatter-marginal-x');
        expect(xBars.length).toBeGreaterThan(20);
        expect(Math.max(...xBars.map((bar) => bar.w))).toBeLessThanOrEqual(10);
    });

    it('excludes points on the density view right edge from cached bins', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderMode.value = 'density';

        scatterState.points = [
            [5, 5],
            [10, 5],
        ] as [number, number][];
        scatterState.view = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };

        const container = document.getElementById('scatter-chart') as HTMLElement;
        const controls = {
            x: 'HUFL',
            y: 'HULL',
            binSize: 10,
            colormap: 'viridis',
            normalization: 'linear',
            renderMode: 'density',
            diagonalMode: 'histogram',
            colorColumn: '',
            selectedColorColumn: '',
            colorScale: 'viridis',
            matrixMode: 'scatter',
            matrixCellSize: 160,
        };
        const series = buildDensitySeries(scatterState.points, controls);
        const cache = buildDensityTooltipCache(series, controls, container);
        const total = Array.from(cache?.binsBySeriesIndex.get(0)?.values() || []).reduce((sum, count) => sum + count, 0);

        expect(total).toBe(1);
    });

    it('stores density marginal counts on the shared tooltip cache', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderMode.value = 'density';

        scatterState.points = Array.from({ length: 80 }, (_, i) => [10 + i * 0.2, 2 + (i % 8)] as [number, number]);
        scatterState.view = { xMin: 10, xMax: 26, yMin: 0, yMax: 12 };

        const container = document.getElementById('scatter-chart') as HTMLElement;
        const controls = {
            x: 'HUFL',
            y: 'HULL',
            binSize: 10,
            colormap: 'viridis',
            normalization: 'linear',
            renderMode: 'density',
            diagonalMode: 'histogram',
            colorColumn: '',
            selectedColorColumn: '',
            colorScale: 'viridis',
            matrixMode: 'scatter',
            matrixCellSize: 160,
        };

        const series = buildDensitySeries(scatterState.points, controls);
        const cache = buildDensityTooltipCache(series, controls, container) as any;

        expect(cache.marginalCountsX).toBeDefined();
        expect(cache.marginalCountsY).toBeDefined();
        expect(cache.marginalCountsX.length).toBeGreaterThan(0);
        expect(cache.marginalCountsY.length).toBeGreaterThan(0);
    });

    it('builds marginal histograms from points inside both visible axes', () => {
        scatterState.points = [
            [1, 1],
            [9, 9],
            [1, 99],
            [1, 99],
            [1, 99],
            [99, 1],
            [99, 1],
            [99, 1],
        ] as [number, number][];
        scatterState.view = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };

        updateMarginalPlots();

        const xBars = fillRects('scatter-marginal-x');
        const yBars = fillRects('scatter-marginal-y');

        expect(xBars).toHaveLength(2);
        expect(yBars).toHaveLength(2);
        expect(xBars[0].h).toBe(xBars[1].h);
        expect(yBars[0].w).toBe(yBars[1].w);
    });
});

describe('updateCorrelationStats', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <div id="scatter-pearson"></div>
            <div id="scatter-spearman"></div>
        `;
        scatterState.correlationsByColumn = new Map([
            ['HULL', { column: 'HULL', value: 0.671, count: 42 }],
        ]);
        (scatterState as any).currentPairStats = { pearsonRaw: 0.671, spearmanRaw: 0.642, count: 42 };
    });

    it('renders Pearson and Spearman values for the active pair', () => {
        updateCorrelationStats();
        expect(document.getElementById('scatter-pearson')?.textContent).toBe('Pearson r: 0.671');
        expect(document.getElementById('scatter-spearman')?.textContent).toBe('Spearman ρ: 0.642');
    });
});

/* ── Density zoom regression ──────────────────────────── */

describe('density series zoom', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: function getContext() {
                let ctx = contextByCanvas.get(this);
                if (!ctx) {
                    ctx = new MockCanvasContext2D();
                    contextByCanvas.set(this, ctx);
                }
                ctx.ops = [];
                return ctx;
            },
        });

        document.body.innerHTML = `
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="scatter">Scatter</option>
                <option value="density" selected>Density</option>
            </select>
            <select id="scatter-diagonal-mode">
                <option value="histogram" selected>Histogram</option>
            </select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <div id="scatter-color-scale-field"><select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
            <div id="scatter-chart"></div>
            <canvas id="scatter-marginal-x"></canvas>
            <div id="scatter-right-panel"><canvas id="scatter-marginal-y"></canvas><div id="scatter-colorbar-wrap" hidden></div></div>
        `;

        bindRect(document.getElementById('scatter-chart') as HTMLElement, 1308, 648);
    });

    it('passes the full unfiltered point set as rawData/data to ChartGPU when the view is zoomed in', () => {
        // The full data domain spans [0, 100] in both x and y, but the active
        // view has been zoomed in to a sub-region. buildDensitySeries must
        // hand the binner the FULL point set, not just the in-view subset.
        const fullPoints: [number, number][] = [
            [0, 0], [5, 10], [10, 5], [15, 20],
            [25, 25], [35, 30], [45, 35], [55, 40],
            [65, 45], [75, 50], [85, 55], [95, 60],
        ];
        scatterState.points = fullPoints;
        scatterState.allPoints = fullPoints;
        scatterState.full = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };
        scatterState.view = { xMin: 20, xMax: 60, yMin: 20, yMax: 50 };

        const container = document.getElementById('scatter-chart') as HTMLElement;
        const series = buildDensitySeries(scatterState.points, {
            x: 'HUFL',
            y: 'HULL',
            binSize: 10,
            colormap: 'viridis',
            normalization: 'linear',
            renderMode: 'density',
            diagonalMode: 'histogram',
            colorColumn: '',
            selectedColorColumn: '',
            colorScale: 'viridis',
            matrixMode: 'scatter',
            matrixCellSize: 160,
        });

        expect(series).toHaveLength(1);
        expect(series[0].mode).toBe('density');
        // The binner must see the full set, not the in-view subset.
        expect(series[0].rawData).toEqual(fullPoints);
        expect(series[0].data).toEqual(fullPoints);
        // rawBounds tracks the current view so the binner clips to the visible region.
        expect(series[0].rawBounds).toEqual({ xMin: 20, xMax: 60, yMin: 20, yMax: 50 });

        // buildOption composes a full ECharts option around the density series.
        const option = buildOption(scatterState.points, container);
        expect(option.series).toHaveLength(1);
        expect(option.series[0].mode).toBe('density');
        expect(option.series[0].rawData).toEqual(fullPoints);
        expect(option.series[0].data).toEqual(fullPoints);
    });

    it('attaches color metadata to density series so density tooltips can show color values', () => {
        const fullPoints: [number, number][] = [
            [0, 0], [10, 10], [20, 20],
        ];
        scatterState.points = fullPoints;
        scatterState.allPoints = fullPoints;
        scatterState.allColorValues = [2, 4, 6];
        scatterState.colorValues = [2, 4, 6];
        scatterState.colorMin = 2;
        scatterState.colorMax = 6;
        scatterState.view = { xMin: 0, xMax: 20, yMin: 0, yMax: 20 };
        const colorSelect = document.getElementById('scatter-color-column') as HTMLSelectElement;
        colorSelect.innerHTML = '<option value="temperature" selected>temperature</option>';

        const container = document.getElementById('scatter-chart') as HTMLElement;
        const option = buildOption(fullPoints, container);
        const tooltip = densityTooltipFormatterFactory({
            x: 'HUFL',
            y: 'HULL',
            binSize: 10,
            colormap: 'viridis',
            normalization: 'linear',
            renderMode: 'density',
            diagonalMode: 'histogram',
            colorColumn: '',
            selectedColorColumn: 'temperature',
            colorScale: 'viridis',
            matrixMode: 'scatter',
            matrixCellSize: 160,
        }, container);

        expect(option.series[0].__edatimeColorCenter).toBe(4);
        expect(tooltip({ value: [10, 10], seriesIndex: 0 })).toContain('temperature');
        expect(tooltip({ value: [10, 10], seriesIndex: 0 })).toContain('4.00');
    });

    it('keeps the full point set across a second box-zoom in density mode', () => {
        // After a successful box-zoom, the view narrows further. The second
        // call must still hand the binner the full data set, so the heatmap
        // does not appear "cut off" relative to the original.
        const fullPoints: [number, number][] = [
            [0, 0], [5, 10], [10, 5], [15, 20],
            [25, 25], [35, 30], [45, 35], [55, 40],
            [65, 45], [75, 50], [85, 55], [95, 60],
        ];
        scatterState.points = fullPoints;
        scatterState.allPoints = fullPoints;
        scatterState.full = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };

        // First zoom: narrow to half the data range.
        scatterState.view = { xMin: 25, xMax: 75, yMin: 10, yMax: 60 };
        const first = buildDensitySeries(scatterState.points, {
            x: 'HUFL',
            y: 'HULL',
            binSize: 10,
            colormap: 'viridis',
            normalization: 'linear',
            renderMode: 'density',
            diagonalMode: 'histogram',
            colorColumn: '',
            selectedColorColumn: '',
            colorScale: 'viridis',
            matrixMode: 'scatter',
            matrixCellSize: 160,
        });
        expect(first[0].rawData).toEqual(fullPoints);
        expect(first[0].rawBounds).toEqual({ xMin: 25, xMax: 75, yMin: 10, yMax: 60 });

        // Second zoom: zoom in further on a sub-region.
        scatterState.view = { xMin: 40, xMax: 60, yMin: 25, yMax: 45 };
        const second = buildDensitySeries(scatterState.points, {
            x: 'HUFL',
            y: 'HULL',
            binSize: 10,
            colormap: 'viridis',
            normalization: 'linear',
            renderMode: 'density',
            diagonalMode: 'histogram',
            colorColumn: '',
            selectedColorColumn: '',
            colorScale: 'viridis',
            matrixMode: 'scatter',
            matrixCellSize: 160,
        });
        expect(second[0].rawData).toEqual(fullPoints);
        expect(second[0].rawBounds).toEqual({ xMin: 40, xMax: 60, yMin: 25, yMax: 45 });
    });
});

/* ── Density re-bin on zoom ──────────────────────────── */

describe('density chart re-bin on view change', () => {
    let schedulers: number[] = [];
    let scheduledOpts: Array<{ preserveView?: boolean } | undefined> = [];

    beforeEach(() => {
        schedulers = [];
        scheduledOpts = [];
        vi.restoreAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: function getContext() {
                let ctx = contextByCanvas.get(this);
                if (!ctx) {
                    ctx = new MockCanvasContext2D();
                    contextByCanvas.set(this, ctx);
                }
                ctx.ops = [];
                return ctx;
            },
        });

        document.body.innerHTML = `
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="scatter">Scatter</option>
                <option value="density" selected>Density</option>
            </select>
            <select id="scatter-diagonal-mode">
                <option value="histogram" selected>Histogram</option>
            </select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <div id="scatter-color-scale-field"><select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select></div>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
            <div id="scatter-chart"></div>
            <canvas id="scatter-marginal-x"></canvas>
            <div id="scatter-right-panel"><canvas id="scatter-marginal-y"></canvas><div id="scatter-colorbar-wrap" hidden></div></div>
        `;

        bindRect(document.getElementById('scatter-chart') as HTMLElement, 1308, 648);

        // Register a fake render-scheduler that the density-mode zoom path
        // pokes via `globalThis.__scatterScheduleRender`.
        (globalThis as { __scatterScheduleRender?: (opts?: { preserveView?: boolean }) => void }).__scatterScheduleRender = (opts) => {
            schedulers.push(1);
            scheduledOpts.push(opts);
        };
    });

    afterEach(() => {
        delete (globalThis as { __scatterScheduleRender?: (opts?: { preserveView?: boolean }) => void }).__scatterScheduleRender;
    });

    it('disposes the density chart and schedules a re-render on applyView', () => {
        // Simulate an existing density chart and pretend a view zoom happened.
        const setOptionSpy = vi.fn();
        const resizeSpy = vi.fn();
        scatterState.chart = { setOption: setOptionSpy, resize: resizeSpy } as any;
        scatterState.full = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };
        scatterState.view = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };

        applyView({ xMin: 20, xMax: 60, yMin: 20, yMax: 50 }, true);

        // The chart must be disposed so the next renderScatter() recreates
        // it against the new view (the ChartGPU density renderer does not
        // re-bin when only rawBounds change otherwise).
        expect(scatterState.chart).toBeNull();
        // The view itself was updated.
        expect(scatterState.view).toEqual({ xMin: 20, xMax: 60, yMin: 20, yMax: 50 });
        // The previous view was pushed onto the zoom history.
        expect(scatterState.zoomHistory).toHaveLength(1);
        expect(scatterState.zoomHistory[0]).toEqual({ xMin: 0, xMax: 100, yMin: 0, yMax: 70 });
        // The density-mode zoom path must signal `preserveView: true` to
        // the scheduled renderScatter(), otherwise the default
        // `applyScatterStateFromCache(true)` call inside renderScatter
        // would clobber the new view back to the full extent and the
        // user's zoom would visually disappear.
        expect(scheduledOpts).toHaveLength(1);
        expect(scheduledOpts[0]).toEqual({ preserveView: true, immediate: true });
    });

    it('looks up the registered density re-render scheduler on every zoom', () => {
        const firstScheduler = vi.fn();
        const secondScheduler = vi.fn();
        (globalThis as { __scatterScheduleRender?: (opts?: { preserveView?: boolean }) => void }).__scatterScheduleRender = firstScheduler;

        scatterState.chart = { setOption: vi.fn(), resize: vi.fn() } as any;
        scatterState.full = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };
        scatterState.view = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };
        applyView({ xMin: 20, xMax: 60, yMin: 20, yMax: 50 }, true);
        expect(firstScheduler).toHaveBeenCalledWith({ preserveView: true, immediate: true });

        (globalThis as { __scatterScheduleRender?: (opts?: { preserveView?: boolean }) => void }).__scatterScheduleRender = secondScheduler;
        scatterState.chart = { setOption: vi.fn(), resize: vi.fn() } as any;
        applyView({ xMin: 30, xMax: 50, yMin: 25, yMax: 45 }, true);
        expect(secondScheduler).toHaveBeenCalledWith({ preserveView: true, immediate: true });
    });

    it('does not dispose the chart on applyView when not in density mode', () => {
        // Switch to scatter mode.
        const renderModeSelect = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderModeSelect.value = 'scatter';

        const setOptionSpy = vi.fn();
        scatterState.chart = { setOption: setOptionSpy, resize: vi.fn() } as any;
        scatterState.full = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };
        scatterState.view = { xMin: 0, xMax: 100, yMin: 0, yMax: 70 };

        applyView({ xMin: 20, xMax: 60, yMin: 20, yMax: 50 }, true);

        // In scatter mode the regular setOption path is enough — the chart
        // must stay alive (and we should have called setOption to update
        // the axis labels).
        expect(scatterState.chart).not.toBeNull();
        expect(setOptionSpy).toHaveBeenCalled();
    });
});
