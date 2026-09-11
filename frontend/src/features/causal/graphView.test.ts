import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const echarts = vi.hoisted(() => ({
    init: vi.fn(),
}));

vi.mock('echarts', () => echarts);

class ResizeObserverMock {
    disconnect = vi.fn();
    observe = vi.fn();
}

describe('Causal graph lifecycle', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        const graph = await import('./graphView.js');
        graph.disposeCausalGraph();
        document.body.innerHTML = `
            <section id="page-causal">
                <div id="causal-chart"></div>
            </section>
        `;
        const chart = document.getElementById('causal-chart') as HTMLDivElement;
        Object.defineProperties(chart, {
            clientWidth: { configurable: true, value: 640 },
            clientHeight: { configurable: true, value: 360 },
        });
    });

    afterEach(async () => {
        const graph = await import('./graphView.js');
        graph.disposeCausalGraph();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('disposes the chart, observer, and transient node editor', async () => {
        const chartInstance = {
            on: vi.fn(),
            resize: vi.fn(),
            dispose: vi.fn(),
            setOption: vi.fn(),
        };
        echarts.init.mockReturnValue(chartInstance);
        const graph = await import('./graphView.js');
        const chart = document.getElementById('causal-chart') as HTMLDivElement;
        graph.setChartEl(chart);

        await expect(graph.initChart()).resolves.toBe(true);
        const editor = document.createElement('input');
        editor.className = 'causal-node-edit';
        document.body.appendChild(editor);

        graph.disposeCausalGraph();

        expect(chartInstance.dispose).toHaveBeenCalledOnce();
        expect(graph._eChart).toBeNull();
        expect(graph._chartEl).toBeNull();
        expect(document.querySelector('.causal-node-edit')).toBeNull();
    });

    it('reports whether a populated graph was actually handed to a visible chart', async () => {
        const chartInstance = {
            on: vi.fn(),
            resize: vi.fn(),
            dispose: vi.fn(),
            setOption: vi.fn(),
            getOption: vi.fn(() => ({ series: [] })),
        };
        echarts.init.mockReturnValue(chartInstance);
        const graph = await import('./graphView.js');
        const state = await import('./selectionState.js');
        const chart = document.getElementById('causal-chart') as HTMLDivElement;
        graph.setChartEl(chart);
        state.setCurrentColumns(['HUFL', 'HULL']);
        state.setCurrentLinks([{ source: 'HUFL', target: 'HULL', lag: 1, type: '-->', value: 0.5, pvalue: 0.01 }]);

        await expect(graph.initChart()).resolves.toBe(true);
        expect(graph.renderEChartsGraph()).toBe(true);
        expect(chartInstance.setOption).toHaveBeenCalledOnce();
        expect(chartInstance.setOption.mock.calls[0]?.[0].series[0].data).toHaveLength(2);
        expect(chartInstance.setOption.mock.calls[0]?.[0].series[0].edgeLabel.show).toBe(true);

        state.setCurrentColumns(['HUFL', 'HULL', 'OT']);
        state.setCurrentLinks([
            { source: 'HUFL', target: 'HULL', lag: 1, type: '-->', value: 0.5, pvalue: 0.01 },
            { source: 'HUFL', target: 'OT', lag: 1, type: '-->', value: 0.4, pvalue: 0.02 },
            { source: 'HULL', target: 'OT', lag: 1, type: '-->', value: 0.3, pvalue: 0.03 },
        ]);
        expect(graph.renderEChartsGraph()).toBe(true);
        const denseSeries = chartInstance.setOption.mock.calls.at(-1)?.[0].series[0];
        expect(denseSeries.edgeLabel.show).toBe(false);
        expect(denseSeries.emphasis.edgeLabel.show).toBe(true);

        chart.closest('section')!.hidden = true;
        expect(graph.renderEChartsGraph()).toBe(false);
    });

    it('makes a deferred refresh harmless after disposal', async () => {
        const graph = await import('./graphView.js');
        const page = document.getElementById('page-causal') as HTMLElement;
        const chart = document.getElementById('causal-chart') as HTMLDivElement;
        page.hidden = true;
        graph.setChartEl(chart);
        graph.scheduleCausalChartRefresh();

        graph.disposeCausalGraph();
        page.hidden = false;
        await vi.runAllTimersAsync();

        expect(echarts.init).not.toHaveBeenCalled();
        expect(graph._eChart).toBeNull();
    });
});
