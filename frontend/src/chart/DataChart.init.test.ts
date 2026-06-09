import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createChartMock } = vi.hoisted(() => ({
    createChartMock: vi.fn(),
}));

vi.mock('../../libs/chartgpu/dist/index.js', () => ({
    createChart: createChartMock,
}));

vi.mock('../utils/platform.js', () => ({
    defaultGpuPowerPreference: () => null,
}));

vi.mock('../utils/settings.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/settings.js')>();
    return {
        ...actual,
        getSetting: vi.fn(() => false),
    };
});

import { DataChart } from './DataChart.js';
import { setResolvedTheme } from '../utils/theme.js';

function makeChartInstance() {
    return {
        disposed: false,
        options: { series: [] },
        setOption: vi.fn(),
        getZoomRange: vi.fn(() => null),
        setZoomRange: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    };
}

describe('DataChart.init', () => {
    beforeEach(() => {
        createChartMock.mockReset();
        document.body.innerHTML = '<div id="main-chart"><canvas id="stale-fallback"></canvas></div>';
        setResolvedTheme('dark');
    });

    it('clears stale chart DOM before mounting a new chart instance', async () => {
        createChartMock.mockImplementation(async (container: HTMLElement) => {
            const root = document.createElement('div');
            root.className = 'chartgpu-root';
            container.appendChild(root);
            return makeChartInstance();
        });

        const chart = new DataChart('main-chart', null, null, null);
        await chart.init();

        const container = document.getElementById('main-chart') as HTMLElement;
        expect(container.querySelector('#stale-fallback')).toBeNull();
        expect(container.querySelector('.chartgpu-root')).not.toBeNull();
    });

    it('passes the resolved light theme into ChartGPU at creation time', async () => {
        setResolvedTheme('light');
        createChartMock.mockResolvedValue(makeChartInstance());

        const chart = new DataChart('main-chart', null, null, null);
        await chart.init();

        expect(createChartMock).toHaveBeenCalledTimes(1);
        expect(createChartMock.mock.calls[0][1]).toEqual(expect.objectContaining({
            theme: expect.objectContaining({
                backgroundColor: '#F4F5F7',
                textColor: '#1B2638',
            }),
        }));
    });

    it('reapplies ChartGPU theme when the resolved theme changes after init', async () => {
        const chartInstance = makeChartInstance();
        createChartMock.mockResolvedValue(chartInstance);

        const chart = new DataChart('main-chart', null, null, null);
        await chart.init();
        chartInstance.setOption.mockClear();

        setResolvedTheme('light');

        expect(chartInstance.setOption).toHaveBeenCalledWith(expect.objectContaining({
            theme: expect.objectContaining({
                backgroundColor: '#F4F5F7',
                textColor: '#1B2638',
            }),
        }));
    });
});
