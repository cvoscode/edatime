import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../services/api/index.js';
import { setViewport } from '../../store/chartState.js';
import { setMetadata } from '../../store/datasetState.js';
import { scatterState } from '../../store/scatterState.js';
import { setColumnRanges, uiState } from '../../store/uiState.js';
import { setScatterViewSnapshot } from '../../store/scatterState.js';
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
        scatterState.matrixCache = new Map();
        scatterState.matrixBatchCache = new Map();
        scatterState.matrixColumnOrder = [];
        scatterState.lastSuggestions = [];
        scatterState.colorLabels = null;
        scatterState.overviewRequestId = 0;
        scatterState.metadata = { numeric_columns: ['HUFL', 'HULL'] } as any;
        setMetadata({ time_column: '' } as any);
        setViewport(null, null);
        setColumnRanges({});
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: () => new MockCanvasContext2D(),
        });

        document.body.innerHTML = `
            <div id="scatter-matrix"></div>
            <span id="scatter-matrix-status"></span>
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

        const fetchScatterMatrixMock = vi.spyOn(api, 'fetchScatterMatrix').mockResolvedValue({
            cells: new Map([
                ['HUFL|HULL', { totalPoints: 2, points: [[1, 2], [3, 4]], colorValues: null, colorLabels: null }],
            ]),
        });

        await renderScatterOverview(() => { });

        const requestOptions = fetchScatterMatrixMock.mock.calls[0]?.[4];
        expect(requestOptions).toEqual({ signal: expect.any(AbortSignal) });
        const activeSignal = requestOptions?.signal;
        expect(activeSignal).not.toBe(idleSignal);
        expect(activeSignal).toBeDefined();
        expect(activeSignal!.aborted).toBe(false);

        __resetMatrixRenderControllerForTests();

        expect(activeSignal!.aborted).toBe(true);
        expect(getMatrixRenderSignal()).toBe(idleSignal);
    });

    it('builds per-cell query contexts so column filters match each matrix pair', async () => {
        setColumnRanges({
            HUFL: { from: 1, to: 9 },
            HULL: { from: 2, to: 8 },
            OT: { from: 3, to: 7 },
        } as any);
        scatterState.metadata = { numeric_columns: ['HUFL', 'HULL', 'OT'] } as any;
        scatterState.activeView = 'matrix';
        // Push the staged column ranges into the matrix view's snapshot
        // so each per-cell fetch picks them up; the production scatter
        // page mirrors globals into the snapshot on view-entry.
        setScatterViewSnapshot('matrix', {
            columnRanges: uiState.columnRanges as Record<string, { from: number; to: number }>,
            lineFilters: [],
        });

        const fetchScatterMatrixMock = vi.spyOn(api, 'fetchScatterMatrix').mockResolvedValue({
            cells: new Map([
                ['HUFL|HULL', { totalPoints: 2, points: [[1, 2], [3, 4]], colorValues: null, colorLabels: null }],
                ['OT|HUFL', { totalPoints: 1, points: [[5, 6]], colorValues: null, colorLabels: null }],
            ]),
        });

        await renderScatterOverview(() => { });

        expect(fetchScatterMatrixMock).toHaveBeenCalledTimes(1);
        expect(fetchScatterMatrixMock.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
            { x: 'HUFL', y: 'HULL' },
            { x: 'OT', y: 'HUFL' },
        ]));
        expect(fetchScatterMatrixMock.mock.calls[0]?.[2]).toMatchObject({
            filters: [
                { column: 'HUFL', from: 1, to: 9 },
                { column: 'HULL', from: 2, to: 8 },
                { column: 'OT', from: 3, to: 7 },
            ],
        });
    });

    it('renders the matrix from one batch response instead of per-cell requests', async () => {
        const fetchSpy = vi.spyOn(api, 'fetchScatterMatrix').mockResolvedValue({
            cells: new Map([
                ['HUFL|HUFL', { totalPoints: 1, points: [[1, 1]], colorValues: null, colorLabels: null }],
                ['HULL|HUFL', { totalPoints: 1, points: [[2, 1]], colorValues: null, colorLabels: null }],
                ['HUFL|HULL', { totalPoints: 1, points: [[1, 2]], colorValues: null, colorLabels: null }],
                ['HULL|HULL', { totalPoints: 1, points: [[2, 2]], colorValues: null, colorLabels: null }],
            ]),
        });

        scatterState.metadata = { numeric_columns: ['HUFL', 'HULL'] } as any;
        scatterState.lastSuggestions = [];

        await renderScatterOverview(() => { });

        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const statusEl = document.getElementById('scatter-matrix-status');
        expect(statusEl).not.toBeNull();
        expect(statusEl?.textContent).toMatch(/Matrix loaded 4\/4 cells/);
    });

    it('includes every numeric metadata column in the overview matrix up to the soft cap', async () => {
        const columns = ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'];
        const cells = new Map<string, any>();
        for (const row of columns) {
            for (const column of columns) {
                cells.set(`${column}|${row}`, {
                    totalPoints: 1,
                    points: [[1, 1]],
                    colorValues: null,
                    colorLabels: null,
                });
            }
        }

        const fetchSpy = vi.spyOn(api, 'fetchScatterMatrix').mockResolvedValue({ cells });
        scatterState.metadata = { numeric_columns: columns } as any;
        scatterState.lastSuggestions = [];

        await renderScatterOverview(() => { });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toHaveLength(49);
        expect(document.getElementById('scatter-matrix-status')?.textContent).toMatch(/Matrix loaded 49\/49 cells/);
    });

    it('reuses a cached matrix batch for identical pair sets and filters', async () => {
        const fetchSpy = vi.spyOn(api, 'fetchScatterMatrix').mockResolvedValue({
            cells: new Map([
                ['HUFL|HUFL', { totalPoints: 1, points: [[1, 1]], colorValues: null, colorLabels: null }],
                ['HULL|HUFL', { totalPoints: 1, points: [[2, 1]], colorValues: null, colorLabels: null }],
                ['HUFL|HULL', { totalPoints: 1, points: [[1, 2]], colorValues: null, colorLabels: null }],
                ['HULL|HULL', { totalPoints: 1, points: [[2, 2]], colorValues: null, colorLabels: null }],
            ]),
        });

        scatterState.metadata = { numeric_columns: ['HUFL', 'HULL'] } as any;

        await renderScatterOverview(() => { });
        await renderScatterOverview(() => { });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('renders off-diagonal density cells when matrix mode is density', () => {
        (document.getElementById('scatter-matrix-mode') as HTMLInputElement).value = 'density';
        const columns = ['HUFL', 'HULL'];
        const datasets = new Map([
            ['HUFL|HUFL', { totalPoints: 3, points: [[1, 1], [2, 2], [3, 3]] as [number, number][], colorValues: null, colorLabels: null }],
            ['HULL|HUFL', { totalPoints: 3, points: [[1, 4], [2, 5], [3, 6]] as [number, number][], colorValues: null, colorLabels: null }],
            ['HUFL|HULL', { totalPoints: 3, points: [[4, 1], [5, 2], [6, 3]] as [number, number][], colorValues: null, colorLabels: null }],
            ['HULL|HULL', { totalPoints: 3, points: [[4, 4], [5, 5], [6, 6]] as [number, number][], colorValues: null, colorLabels: null }],
        ]);

        renderMatrixGrid(columns, datasets, () => { });

        const canvas = document.querySelector('.scatter-matrix-cell canvas') as HTMLCanvasElement;
        expect(canvas).not.toBeNull();
    });
});
