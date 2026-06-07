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
});
