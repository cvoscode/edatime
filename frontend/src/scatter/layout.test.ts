import { beforeEach, describe, expect, it } from 'vitest';
import { buildOption } from './rendering.js';
import { getPlotMetrics } from './state.js';
import { getScatterMarginalXMetrics, getScatterMarginalYMetrics } from './layout.js';
import { scatterState } from '../store/scatterState.js';

const EXPECTED_GRID = { left: 72, right: 72, top: 24, bottom: 50 };

function buildDom(): HTMLDivElement {
    document.body.innerHTML = `
        <select id="scatter-x-col"><option value="feature_x" selected>feature_x</option></select>
        <select id="scatter-y-col"><option value="feature_y" selected>feature_y</option></select>
        <input id="scatter-bin-size" value="10">
        <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
        <select id="scatter-render-mode"><option value="scatter" selected>Scatter</option></select>
        <select id="scatter-diagonal-mode"><option value="histogram" selected>Histogram</option></select>
        <select id="scatter-color-column"><option value="" selected>None</option></select>
        <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
        <select id="scatter-matrix-mode"><option value="scatter" selected>Scatter</option></select>
        <input id="scatter-matrix-cell-size" value="160">
        <div id="scatter-chart"></div>
    `;

    const chart = document.getElementById('scatter-chart') as HTMLDivElement;
    Object.defineProperty(chart, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            width: 960,
            height: 540,
            top: 0,
            left: 0,
            right: 960,
            bottom: 540,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }),
    });
    return chart;
}

describe('scatter plot layout geometry', () => {
    beforeEach(() => {
        scatterState.view = { xMin: 0, xMax: 10, yMin: 0, yMax: 20 };
        scatterState.columnTypes = new Map();
        scatterState.lastOptionSeries = null;
        scatterState.densityTooltipCache = null;
    });

    it('keeps the chart option grid aligned with the marginal plot metrics', () => {
        const chart = buildDom();

        const option = buildOption([[1, 2], [5, 8], [9, 16]], chart);
        const metrics = getPlotMetrics(chart);

        expect(option.grid).toEqual(EXPECTED_GRID);
        expect(metrics?.grid).toEqual(EXPECTED_GRID);
    });

    it('keeps marginal plot extents usable on marginal-sized canvases', () => {
        expect(getScatterMarginalXMetrics(960)).toEqual({
            plotLeft: 72,
            plotRight: 888,
            plotWidth: 816,
        });

        expect(getScatterMarginalYMetrics(540)).toEqual({
            plotTop: 24,
            plotBottom: 490,
            plotHeight: 466,
        });
    });
});
