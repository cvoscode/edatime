import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkspaceSnapshot } from '../../workspace/workspaceStore.js';

const mocks = vi.hoisted(() => ({
    buildMatrixFetchPairs: vi.fn((columns: string[]) => columns.flatMap((row) => columns.map((column) => [column, row]))),
    fetchMatrixBatchData: vi.fn(),
    drawDistributionCanvas: vi.fn(),
    drawMiniDensityCanvas: vi.fn(),
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
    drawMiniDensityCanvas: mocks.drawMiniDensityCanvas,
    drawMiniScatterCanvas: mocks.drawMiniScatterCanvas,

}));

import { buildHeatmapRenderData, initHeatmapScatterLayer } from './scatterMatrix.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { scatterState } from '../../store/scatterState.js';

function cell(row: string, column: string, value: string): string {
    return `<div class="heatmap-cell" data-row-name="${row}" data-col-name="${column}"
        data-cell-background="#123456" data-cell-color="#ffffff" data-correlation-label="${value}"
        data-correlation-tooltip="${row} with ${column}: Pearson correlation ${value}.">
        <canvas class="heatmap-cell-canvas"></canvas>
    </div>`;
}

function buildDom(): void {
    document.body.innerHTML = `
        <select id="heatmap-color-column"><option value="">None</option></select>
        <select id="heatmap-diagonal-mode"><option value="kde">Density curve</option><option value="histogram">Histogram</option></select>
        <select id="heatmap-pair-mode"><option value="density">Density</option><option value="scatter">Scatter</option></select>
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
        <div id="heatmap-loading" hidden><span id="heatmap-loading-label"></span></div>
        <div id="heatmap-preview-error" role="status" hidden><span id="heatmap-preview-error-message"></span><button id="heatmap-preview-retry"></button></div>`;
}

function workspace() {
    return {
        getSnapshot: vi.fn(() => makeWorkspaceSnapshot()),
        subscribe: vi.fn(() => vi.fn()),
    };
}

describe('Correlation page unified preview layer', () => {
    it('reuses a real density grid for mirrored cells without allocating one for diagonals', () => {
        const pairs: [string, string][] = [['x', 'x'], ['y', 'x'], ['y', 'y']];
        const datasets = new Map([
            ['x|x', { totalPoints: 2, points: [[1, 1], [2, 2]] as [number, number][], colorValues: null, colorLabels: null }],
            ['y|x', { totalPoints: 2, points: [[1, 3], [2, 4]] as [number, number][], colorValues: null, colorLabels: null }],
            ['y|y', { totalPoints: 2, points: [[3, 3], [4, 4]] as [number, number][], colorValues: null, colorLabels: null }],
        ]);
        const cells = buildHeatmapRenderData(['x', 'y'], pairs, datasets);
        const diagonal = cells.get(JSON.stringify(['x', 'x']))!;
        const direct = cells.get(JSON.stringify(['y', 'x']))!;
        const mirrored = cells.get(JSON.stringify(['x', 'y']))!;

        expect(diagonal.densityGrid).toBeNull();
        expect(diagonal.diagonalSeries?.[0]?.values).toEqual([1, 2]);
        expect(direct.diagonalSeries).toBeNull();
        expect(direct.densityGrid?.finiteCount).toBe(2);
        expect(mirrored.densityGrid?.finiteCount).toBe(2);
        expect(mirrored.points).toEqual([[3, 1], [4, 2]]);
        expect(mirrored.densityGrid?.counts).not.toEqual(direct.densityGrid?.counts);
    });
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        cleaningPlanStore.clear();
        scatterState.colorColumn = '';
        buildDom();
        mocks.fetchMatrixBatchData.mockResolvedValue(new Map([
            ['x|x', { totalPoints: 2, points: [[1, 1], [2, 2]], colorValues: null, colorLabels: null }],
            ['y|y', { totalPoints: 2, points: [[3, 3], [4, 4]], colorValues: null, colorLabels: null }],
            ['y|x', { totalPoints: 100, points: [[1, 3], [2, 4]], colorValues: null, colorLabels: null }],
            ['x|y', { totalPoints: 100, points: [[3, 1], [4, 2]], colorValues: null, colorLabels: null }],
        ]));
    });

    it('requests each unordered pair once and draws KDE diagonals with mirrored density cells by default', async () => {
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace: workspace() });

        expect(mocks.buildMatrixFetchPairs).toHaveBeenCalledWith(['x', 'y'], { x: '', y: '' });
        expect(mocks.fetchMatrixBatchData).toHaveBeenCalledOnce();
        expect(mocks.fetchMatrixBatchData.mock.calls[0]?.[0]).toEqual([['x', 'x'], ['y', 'x'], ['y', 'y']]);
        expect(mocks.fetchMatrixBatchData.mock.calls[0]?.[2]).toBe('');
        expect(mocks.drawDistributionCanvas).toHaveBeenCalledTimes(4);
        expect(mocks.drawDistributionCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement), 'kde', expect.any(Array), expect.objectContaining({ badge: expect.any(Object) }),
        );
        expect(mocks.drawMiniDensityCanvas).toHaveBeenCalledTimes(4);
        expect(mocks.drawMiniDensityCanvas.mock.calls[2]?.[1]).toEqual([[1, 3], [2, 4]]);
        expect(mocks.drawMiniDensityCanvas.mock.calls[3]?.[1]).toEqual([[3, 1], [4, 2]]);
        expect(mocks.drawMiniDensityCanvas.mock.calls[2]?.[2]).toMatchObject({
            colorScale: 'coolwarm',
            showDensityLabel: false,
            badge: { text: '+0.80' },
        });
        expect(mocks.drawMiniScatterCanvas).not.toHaveBeenCalled();
        expect(document.querySelector('.heatmap-scatter-matrix')).toBeNull();
        expect(document.getElementById('scatter-matrix')).toBeNull();
        const pairLabel = document.querySelector<HTMLElement>('.heatmap-cell[data-row-name="x"][data-col-name="y"]')?.getAttribute('aria-label');
        expect(pairLabel).toContain('Horizontal axis: y; vertical axis: x');
        expect(pairLabel).toContain('2 sampled of 100 eligible observations');
        expect(pairLabel).toContain('2 finite pairs plotted');
        const diagonalLabel = document.querySelector<HTMLElement>('.heatmap-cell[data-row-name="x"][data-col-name="x"]')?.getAttribute('aria-label');
        expect(diagonalLabel).toContain('2 finite values plotted');
        expect((document.getElementById('heatmap-color-column') as HTMLSelectElement).disabled).toBe(true);

        dispose();
        expect(mocks.disposeSession).toHaveBeenCalledOnce();
    });

    it('uses the configured global Correlation matrix scale for density cells', async () => {
        window.localStorage.setItem('edatime-settings', JSON.stringify({
            plotColorScales: { correlationMatrix: 'magma' },
        }));
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace: workspace() });

        expect(mocks.drawMiniDensityCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement), expect.any(Array), expect.objectContaining({ colorScale: 'magma' }),
        );
        dispose();
    });

    it('changes the presentation from the loaded sample without another fetch', async () => {
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace: workspace() });
        window.localStorage.setItem('edatime_heatmap_pair_mode', 'scatter');
        document.dispatchEvent(new CustomEvent('edatime:heatmap-grid-rendered'));

        await vi.waitFor(() => expect(mocks.drawMiniScatterCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement), [[3, 1], [4, 2]], expect.any(Object),
        ));
        expect(mocks.fetchMatrixBatchData).toHaveBeenCalledOnce();
        expect((document.getElementById('heatmap-color-column') as HTMLSelectElement).disabled).toBe(false);
        dispose();
    });

    it('requests and renders selected color-by data only in Scatter mode', async () => {
        window.localStorage.setItem('edatime_heatmap_pair_mode', 'scatter');
        const categoryColors = new Map([['cold', '#00f'], ['hot', '#f00']]);
        mocks.buildCategoricalColorGroups.mockImplementation((labels) => labels
            ? { categories: ['cold', 'hot'], colorByLabel: categoryColors }
            : null);
        mocks.fetchMatrixBatchData.mockResolvedValue(new Map([
            ['x|y', { totalPoints: 2, points: [[3, 1], [4, 2]], colorValues: null, colorLabels: ['cold', 'hot'] }],
            ['y|x', { totalPoints: 2, points: [[1, 3], [2, 4]], colorValues: null, colorLabels: ['hot', 'cold'] }],
            ['x|x', { totalPoints: 2, points: [[1, 1], [2, 2]], colorValues: null, colorLabels: null }],
            ['y|y', { totalPoints: 2, points: [[3, 3], [4, 4]], colorValues: null, colorLabels: null }],
        ]));
        const dispose = await initHeatmapScatterLayer({
            numeric_columns: ['x', 'y', 'temperature'],
            columns: [{ name: 'x' }, { name: 'y' }, { name: 'temperature' }],
        } as any, { workspace: workspace() });

        const colorSelect = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        expect(Array.from(colorSelect.options).map((option) => option.value)).toEqual(['', 'x', 'y', 'temperature']);
        colorSelect.value = 'temperature';
        colorSelect.dispatchEvent(new Event('change', { bubbles: true }));

        await vi.waitFor(() => expect(mocks.fetchMatrixBatchData).toHaveBeenCalledTimes(2));
        expect(mocks.fetchMatrixBatchData.mock.calls[1]?.[2]).toBe('temperature');
        await vi.waitFor(() => expect(mocks.drawMiniScatterCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement),
            [[3, 1], [4, 2]],
            expect.objectContaining({ colorLabels: ['hot', 'cold'], categoryColors }),
        ));
        dispose();
    });

    it('offers calculated color columns and removes dropped columns', async () => {
        cleaningPlanStore.resetForDataset({ sourceVersionId: 'source-color', datasetRevision: 1, datasetFingerprint: 'color', schemaFingerprint: 'schema', timeColumn: 'ts' });
        cleaningPlanStore.addStage({ kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Calculate score', expression: 'x + y', outputColumn: 'score' });
        cleaningPlanStore.addStage({ kind: 'columnSelect', executionClass: 'polarsExpression', scope: 'schema', enabled: true, sourcePage: 'manual', label: 'Drop x', columns: ['x'], mode: 'drop' });
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'], columns: [{ name: 'x', dtype: 'Float64' }, { name: 'y', dtype: 'Float64' }] } as any, { workspace: workspace() });
        const colorSelect = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        expect(Array.from(colorSelect.options).map((option) => option.value)).toEqual(['', 'y', 'score']);
        dispose();
    });

    it('requests temporal color columns as a continuous chronological gradient', async () => {
        window.localStorage.setItem('edatime_heatmap_pair_mode', 'scatter');
        const dispose = await initHeatmapScatterLayer({
            numeric_columns: ['x', 'y'],
            columns: [{ name: 'x', dtype: 'Float64' }, { name: 'y', dtype: 'Float64' }, { name: 'date', dtype: 'Datetime(ms)' }],
        } as any, { workspace: workspace() });

        const colorSelect = document.getElementById('heatmap-color-column') as HTMLSelectElement;
        colorSelect.value = 'date';
        colorSelect.dispatchEvent(new Event('change', { bubbles: true }));

        await vi.waitFor(() => expect(mocks.fetchMatrixBatchData).toHaveBeenCalledTimes(2));
        expect(mocks.fetchMatrixBatchData.mock.calls[1]?.[1]).toMatchObject({ timeColorMode: 'raw' });
        await vi.waitFor(() => expect(mocks.drawMiniScatterCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement), [[3, 1], [4, 2]], expect.any(Object),
        ));
        dispose();
    });

    it('shows a recoverable preview error while preserving matrix values', async () => {
        mocks.fetchMatrixBatchData.mockRejectedValueOnce(new Error('network unavailable'));
        const dispose = await initHeatmapScatterLayer({ numeric_columns: ['x', 'y'] } as any, { workspace: workspace() });

        const error = document.getElementById('heatmap-preview-error')!;
        expect(error.hidden).toBe(false);
        expect(document.getElementById('heatmap-preview-error-message')?.textContent)
            .toBe('Pair previews could not load. Correlation values remain available.');
        expect(document.querySelectorAll('.heatmap-cell')).toHaveLength(4);
        expect(document.querySelector('.heatmap-cell')?.getAttribute('data-correlation-label')).toBe('+1.00');

        document.getElementById('heatmap-preview-retry')!.click();
        await vi.waitFor(() => expect(mocks.fetchMatrixBatchData).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(error.hidden).toBe(true));
        dispose();
    });
});
