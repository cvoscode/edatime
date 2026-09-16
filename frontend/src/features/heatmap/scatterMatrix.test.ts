import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';

const mocks = vi.hoisted(() => ({
    buildMatrixFetchPairs: vi.fn((columns: string[]) => columns.flatMap((row) => columns.map((column) => [column, row]))),
    fetchMatrixBatchData: vi.fn(),
    drawDistributionCanvas: vi.fn(),
    drawMiniScatterCanvas: vi.fn(),
    buildCategoricalColorGroups: vi.fn((_labels?: unknown[] | null): { categories: string[]; colorByLabel: Map<string, string> } | null => null),
    buildGroupedDistributionSeries: vi.fn(() => null),
    disposeSession: vi.fn(),
}));

vi.mock('../scatter/matrix.js', () => ({
    buildMatrixFetchPairs: mocks.buildMatrixFetchPairs,
    createMatrixRenderSession: () => {
        let controller = new AbortController();
        return {
            begin: () => {
                controller.abort();
                controller = new AbortController();
                return controller.signal;
            },
            currentSignal: () => controller.signal,
            dispose: mocks.disposeSession,
        };
    },
    fetchMatrixBatchData: mocks.fetchMatrixBatchData,
}));
vi.mock('../scatter/state.js', () => ({
    buildScatterQueryContext: vi.fn(() => ({ filters: [], lineFilters: [] })),
}));
vi.mock('../scatter/helpers.js', () => ({
    buildCategoricalColorGroups: mocks.buildCategoricalColorGroups,
    buildGroupedDistributionSeries: mocks.buildGroupedDistributionSeries,
    drawDistributionCanvas: mocks.drawDistributionCanvas,
    drawMiniScatterCanvas: mocks.drawMiniScatterCanvas,
}));

import { initHeatmapScatterLayer } from './scatterMatrix.js';
import { cleaningPlanStore } from '../../cleaning/store.js';

function cell(row: string, column: string, value: string): string {
    return `<div class="heatmap-cell" data-row-name="${row}" data-col-name="${column}"
        data-cell-background="#123456" data-cell-color="#ffffff" data-correlation-label="${value}">
        <canvas class="heatmap-cell-canvas"></canvas>
    </div>`;
}

function buildDom(): void {
    document.body.innerHTML = `
        <select id="heatmap-color-column"><option value="">None</option></select>
        <div id="heatmap-container">
            <div class="heatmap-grid">
                <div class="heatmap-header" data-drag-name="x">x</div>
                <div class="heatmap-header" data-drag-name="y">y</div>
                ${cell('x', 'x', '+1.00')}
                ${cell('x', 'y', '+0.80')}
                ${cell('y', 'x', '+0.80')}
                ${cell('y', 'y', '+1.00')}
            </div>
        </div>
        <div id="heatmap-loading" hidden><span id="heatmap-loading-label"></span></div>`;
}

describe('Correlation page unified scatter layer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        cleaningPlanStore.clear();
        buildDom();
        mocks.fetchMatrixBatchData.mockResolvedValue(new Map([
            ['x|x', { totalPoints: 2, points: [[1, 1], [2, 2]], colorValues: null, colorLabels: null }],
            ['y|y', { totalPoints: 2, points: [[3, 3], [4, 4]], colorValues: null, colorLabels: null }],
            ['y|x', { totalPoints: 2, points: [[1, 3], [2, 4]], colorValues: null, colorLabels: null }],
            ['x|y', { totalPoints: 2, points: [[3, 1], [4, 2]], colorValues: null, colorLabels: null }],
        ]));
    });

    it('draws histograms and correlation-backed scatter thumbnails in the one heatmap grid', async () => {
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
            subscribe: vi.fn(() => vi.fn()),
        };
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace });

        expect(mocks.buildMatrixFetchPairs).toHaveBeenCalledWith(['x', 'y'], { x: '', y: '' });
        expect(mocks.fetchMatrixBatchData).toHaveBeenCalledOnce();
        expect(mocks.fetchMatrixBatchData.mock.calls[0]?.[2]).toBe('');
        expect(mocks.drawDistributionCanvas).toHaveBeenCalledTimes(4);
        expect(mocks.drawMiniScatterCanvas).toHaveBeenCalledTimes(4);
        expect(mocks.drawMiniScatterCanvas).toHaveBeenLastCalledWith(
            expect.any(HTMLCanvasElement),
            [[3, 1], [4, 2]],
            expect.objectContaining({
                background: '#123456',
                badge: { text: '+0.80', color: '#ffffff' },
                showEmptyLabel: false,
            }),
        );
        expect(document.querySelector('.heatmap-scatter-matrix')).toBeNull();
        expect(document.getElementById('scatter-matrix')).toBeNull();

        dispose();
        expect(mocks.disposeSession).toHaveBeenCalledOnce();
    });

    it('requests and renders the selected color-by feature', async () => {
        const categoryColors = new Map([['cold', '#00f'], ['hot', '#f00']]);
        mocks.buildCategoricalColorGroups.mockImplementation((labels) => labels
            ? { categories: ['cold', 'hot'], colorByLabel: categoryColors }
            : null);
        mocks.fetchMatrixBatchData.mockResolvedValue(new Map([
            ['x|y', { totalPoints: 2, points: [[3, 1], [4, 2]], colorValues: null, colorLabels: ['cold', 'hot'] }],
            ['y|x', { totalPoints: 2, points: [[1, 3], [2, 4]], colorValues: null, colorLabels: ['hot', 'cold'] }],
        ]));
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
            subscribe: vi.fn(() => vi.fn()),
        };
        const dispose = await initHeatmapScatterLayer({
            numeric_columns: ['x', 'y', 'temperature'],
            columns: [{ name: 'x' }, { name: 'y' }, { name: 'temperature' }],
        } as any, { workspace });

        const colorSelect = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        expect(Array.from(colorSelect.options).map((option) => option.value)).toEqual(['', 'x', 'y', 'temperature']);
        colorSelect.value = 'temperature';
        colorSelect.dispatchEvent(new Event('change', { bubbles: true }));

        await vi.waitFor(() => expect(mocks.fetchMatrixBatchData).toHaveBeenCalledTimes(2));
        expect(mocks.fetchMatrixBatchData.mock.calls[1]?.[2]).toBe('temperature');
        expect(mocks.drawMiniScatterCanvas).toHaveBeenLastCalledWith(
            expect.any(HTMLCanvasElement),
            [[3, 1], [4, 2]],
            expect.objectContaining({
                colorLabels: ['cold', 'hot'],
                categoryColors,
            }),
        );
        dispose();
    });

    it('offers calculated color columns and removes dropped columns', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-color', datasetRevision: 1, datasetFingerprint: 'color', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({ kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Calculate score', expression: 'x + y', outputColumn: 'score' });
        cleaningPlanStore.addStage({ kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Drop x', columns: ['x'], mode: 'drop' });
        const workspace = { getSnapshot: vi.fn(() => makeWorkspaceSnapshot()), subscribe: vi.fn(() => vi.fn()) };
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'], columns: [{ name: 'x', dtype: 'Float64' }, { name: 'y', dtype: 'Float64' }] } as any, { workspace });
        const colorSelect = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        expect(Array.from(colorSelect.options).map((option) => option.value)).toEqual(['', 'y', 'score']);
        dispose();
    });

    it('requests temporal color columns as a continuous chronological gradient', async () => {
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
            subscribe: vi.fn(() => vi.fn()),
        };
        const dispose = await initHeatmapScatterLayer({
            numeric_columns: ['x', 'y'],
            columns: [{ name: 'x', dtype: 'Float64' }, { name: 'y', dtype: 'Float64' }, { name: 'date', dtype: 'Datetime(ms)' }],
        } as any, { workspace });

        const colorSelect = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        colorSelect.value = 'date';
        colorSelect.dispatchEvent(new Event('change', { bubbles: true }));

        await vi.waitFor(() => expect(mocks.fetchMatrixBatchData).toHaveBeenCalledTimes(2));
        expect(mocks.fetchMatrixBatchData.mock.calls[1]?.[1]).toMatchObject({ timeColorMode: 'raw' });
        dispose();
    });

    it('shows the existing plot spinner until scatter thumbnails finish loading', async () => {
        let resolveFetch!: (value: Map<string, any>) => void;
        mocks.fetchMatrixBatchData.mockImplementationOnce(() => new Promise((resolve) => {
            resolveFetch = resolve;
        }));
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
            subscribe: vi.fn(() => vi.fn()),
        };

        const init = initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace });
        await vi.waitFor(() => expect(document.getElementById('heatmap-loading')?.hidden).toBe(false));
        expect(document.getElementById('heatmap-loading-label')?.textContent).toBe('Loading scatter thumbnails…');

        resolveFetch(new Map());
        const dispose = await init;
        expect(document.getElementById('heatmap-loading')?.hidden).toBe(true);
        dispose();
    });

    it('keeps one request alive when layout rerenders replace the canvases', async () => {
        let resolveFetch!: (value: Map<string, any>) => void;
        mocks.fetchMatrixBatchData.mockImplementationOnce(() => new Promise((resolve) => {
            resolveFetch = resolve;
        }));
        const workspace = {
            getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
            subscribe: vi.fn(() => vi.fn()),
        };

        const init = initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace });
        await vi.waitFor(() => expect(mocks.fetchMatrixBatchData).toHaveBeenCalledOnce());
        document.dispatchEvent(new CustomEvent('edatime:heatmap-grid-rendered'));
        await Promise.resolve();

        expect(mocks.fetchMatrixBatchData).toHaveBeenCalledOnce();
        expect(document.getElementById('heatmap-loading')?.hidden).toBe(false);

        resolveFetch(new Map([
            ['y|x', { totalPoints: 2, points: [[1, 3], [2, 4]], colorValues: null, colorLabels: null }],
        ]));
        const dispose = await init;
        expect(mocks.drawMiniScatterCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement),
            [[1, 3], [2, 4]],
            expect.any(Object),
        );
        expect(document.getElementById('heatmap-loading')?.hidden).toBe(true);
        dispose();
    });
});
