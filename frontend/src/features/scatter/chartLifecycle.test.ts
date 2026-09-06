import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scatterState } from '../../store/scatterState.js';
import { disposeScatterChart } from './state.js';
import { renderScatterChart } from './chartLifecycle.js';

const { createChart, isGPUAvailable } = vi.hoisted(() => ({
    createChart: vi.fn(), isGPUAvailable: vi.fn(async () => true),
}));
vi.mock('chartgpu', () => ({ createChart }));
vi.mock('./runtime.js', () => ({ isGPUAvailable, setGpuUnavailable: vi.fn(), initScatterPageRuntime: vi.fn() }));
vi.mock('../../chart/EchartsScatterChart.js', () => ({ EchartsScatterChart: vi.fn() }));
vi.mock('./selectionZoom.js', () => ({ initSelectionZoom: vi.fn() }));

const chart = () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), onPerformanceUpdate: vi.fn() });
const options = () => ({
    container: document.getElementById('scatter-chart')!, renderSignature: 'density-new',
    buildOption: () => ({ series: [{ type: 'scatter', mode: 'density', data: [[1, 2], [2, 3]] }] }),
    onPerformanceUpdate: vi.fn(),
});

describe('scatter chart lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="scatter-chart"></div>';
        scatterState.chart = null;
        scatterState.chartLifecycleGeneration = 0;
        scatterState.lastRenderSignature = '';
    });

    it('keeps the replacement density chart when its own signature change disposes the old chart', async () => {
        const old = chart();
        const replacement = chart();
        scatterState.chart = old as any;
        scatterState.lastRenderSignature = 'scatter-old';
        createChart.mockResolvedValue(replacement);
        await renderScatterChart(options());
        expect(old.dispose).toHaveBeenCalledOnce();
        expect(replacement.dispose).not.toHaveBeenCalled();
        expect(scatterState.chart).toBe(replacement);
        expect(replacement.setOption).toHaveBeenCalled();
    });

    it('keeps the newest chart when asynchronous creations finish out of order', async () => {
        const older = chart();
        const newer = chart();
        let resolveOlder!: (value: ReturnType<typeof chart>) => void;
        createChart.mockReturnValueOnce(new Promise((done) => { resolveOlder = done; }))
            .mockResolvedValueOnce(newer);
        const pending = renderScatterChart(options());
        await Promise.resolve();
        await renderScatterChart({ ...options(), renderSignature: 'density-latest' });
        resolveOlder(older);
        await pending;
        expect(older.dispose).toHaveBeenCalledOnce();
        expect(newer.dispose).not.toHaveBeenCalled();
        expect(scatterState.chart).toBe(newer);
        expect(scatterState.lastRenderSignature).toBe('density-latest');
    });

    it('disposes a pending chart when an external lifecycle change invalidates it', async () => {
        const pendingChart = chart();
        let resolve!: (value: ReturnType<typeof chart>) => void;
        createChart.mockReturnValue(new Promise((done) => { resolve = done; }));
        const pending = renderScatterChart(options());
        await Promise.resolve();
        disposeScatterChart();
        resolve(pendingChart);
        await pending;
        expect(pendingChart.dispose).toHaveBeenCalledOnce();
        expect(scatterState.chart).toBeNull();
    });
});
