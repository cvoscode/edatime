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

        await graph.initChart();
        const editor = document.createElement('input');
        editor.className = 'causal-node-edit';
        document.body.appendChild(editor);

        graph.disposeCausalGraph();

        expect(chartInstance.dispose).toHaveBeenCalledOnce();
        expect(graph._eChart).toBeNull();
        expect(graph._chartEl).toBeNull();
        expect(document.querySelector('.causal-node-edit')).toBeNull();
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
