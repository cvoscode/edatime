import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../services/api/index.js';
import { appState } from './state.js';
import {
    __resetMatrixRenderControllerForTests,
    buildMatrixFetchPairs,
    getMatrixRenderSignal,
    renderScatterOverview,
} from './matrix.js';
import { renderMatrixGrid } from './matrixGrid.js';

class MockCanvasContext2D {
    setTransform() { }
    clearRect() { }
    fillRect() { }
    strokeRect() { }
    fillText() { }
    beginPath() { }
    moveTo() { }
    lineTo() { }
    arc() { }
    closePath() { }
    stroke() { }
    fill() { }
}

describe('buildMatrixFetchPairs', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        __resetMatrixRenderControllerForTests();
        appState.scatter.matrixCache = new Map();
        appState.scatter.matrixColumnOrder = [];
        appState.scatter.lastSuggestions = [];
        appState.scatter.colorLabels = null;
        appState.scatter.overviewRequestId = 0;
        appState.scatter.metadata = { numeric_columns: ['HUFL', 'HULL'] } as any;
        appState.metadata = { time_column: '' } as any;
        appState.currentStart = null;
        appState.currentEnd = null;
        appState.columnRanges = {};
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: () => new MockCanvasContext2D(),
        });

        document.body.innerHTML = `
            <div id="scatter-matrix"></div>
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode"><option value="scatter" selected>Scatter</option><option value="density">Density</option></select>
            <select id="scatter-diagonal-mode"><option value="histogram" selected>Histogram</option></select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
        `;
    });

    it('prioritizes the active pair before the rest of the matrix', () => {
        const pairs = buildMatrixFetchPairs(
            ['HUFL', 'HULL', 'OT'],
            { x: 'HUFL', y: 'HULL' },
            [{ x: 'HUFL', y: 'OT' }],
        );

        expect(pairs[0]).toEqual(['HUFL', 'HULL']);
        expect(pairs[1]).toEqual(['HULL', 'HUFL']);
    });

    it('promotes suggested columns ahead of unrelated cells', () => {
        const pairs = buildMatrixFetchPairs(
            ['HUFL', 'HULL', 'OT', 'MUFL'],
            { x: 'HUFL', y: 'HULL' },
            [{ x: 'HUFL', y: 'OT' }],
        );

        const otWithCurrentAxis = pairs.findIndex(([column, row]) => (
            (column === 'HUFL' && row === 'OT')
            || (column === 'OT' && row === 'HUFL')
            || (column === 'HULL' && row === 'OT')
            || (column === 'OT' && row === 'HULL')
        ));
        const unrelatedPair = pairs.findIndex(([column, row]) => column === 'MUFL' && row === 'OT');

        expect(otWithCurrentAxis).toBeGreaterThanOrEqual(0);
        expect(unrelatedPair).toBeGreaterThan(otWithCurrentAxis);
    });

    it('ranks both x and y columns from a suggestion', () => {
        const pairs = buildMatrixFetchPairs(
            ['HUFL', 'HULL', 'OT', 'MUFL'],
            { x: 'HUFL', y: 'HULL' },
            [{ x: 'OT', y: 'MUFL' }],
        );

        const otPair = pairs.findIndex(([column, row]) => column === 'OT' || row === 'OT');
        const muflPair = pairs.findIndex(([column, row]) => column === 'MUFL' || row === 'MUFL');

        expect(otPair).toBeGreaterThanOrEqual(0);
        expect(muflPair).toBeGreaterThanOrEqual(0);
    });

    it('reuses existing matrix cell nodes when rerendering the same layout', () => {
        const columns = ['HUFL', 'HULL'];
        const firstDatasets = new Map([
            ['HUFL|HUFL', { totalPoints: 3, points: [[1, 1], [2, 2], [3, 3]] as [number, number][], colorValues: null, colorLabels: null }],
            ['HULL|HUFL', { totalPoints: 2, points: [[4, 1], [5, 2]] as [number, number][], colorValues: null, colorLabels: null }],
            ['HUFL|HULL', { totalPoints: 2, points: [[1, 4], [2, 5]] as [number, number][], colorValues: null, colorLabels: null }],
            ['HULL|HULL', { totalPoints: 3, points: [[4, 4], [5, 5], [6, 6]] as [number, number][], colorValues: null, colorLabels: null }],
        ]);

        renderMatrixGrid(columns, firstDatasets, () => { });

        const container = document.getElementById('scatter-matrix') as HTMLElement;
        const firstGrid = container.querySelector('.scatter-matrix-grid');
        const firstCell = container.querySelector('.scatter-matrix-cell') as HTMLButtonElement;
        expect(firstGrid).not.toBeNull();
        expect(firstCell).not.toBeNull();

        const secondDatasets = new Map(firstDatasets);
        secondDatasets.set('HULL|HUFL', {
            totalPoints: 5,
            points: [[10, 1], [11, 2], [12, 3], [13, 4], [14, 5]] as [number, number][],
            colorValues: null,
            colorLabels: null,
        });

        renderMatrixGrid(columns, secondDatasets, () => { });

        expect(container.querySelector('.scatter-matrix-grid')).toBe(firstGrid);
        expect(container.querySelector('.scatter-matrix-cell')).toBe(firstCell);
    });

    it('reuses a stable idle signal and resets the active matrix render controller', async () => {
        const idleSignal = getMatrixRenderSignal();
        expect(getMatrixRenderSignal()).toBe(idleSignal);

        const fetchScatterPointsMock = vi.spyOn(api, 'fetchScatterPoints').mockResolvedValue({
            x: 'HUFL',
            y: 'HULL',
            color: null,
            total_points: 2,
            returned_points: 2,
            points: [[1, 2], [3, 4]],
            color_values: null,
            color_labels: null,
            color_min: null,
            color_max: null,
        });

        await renderScatterOverview(() => { });

        const activeSignal = fetchScatterPointsMock.mock.calls[0]?.[5];
        expect(activeSignal).toBeInstanceOf(AbortSignal);
        expect(activeSignal).not.toBe(idleSignal);
        expect(activeSignal?.aborted).toBe(false);

        __resetMatrixRenderControllerForTests();

        expect(activeSignal?.aborted).toBe(true);
        expect(getMatrixRenderSignal()).toBe(idleSignal);
    });
});
