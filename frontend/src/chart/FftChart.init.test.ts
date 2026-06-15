import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createChartMock, initBoxZoomMock, initWheelZoomMock } = vi.hoisted(() => ({
    createChartMock: vi.fn(),
    initBoxZoomMock: vi.fn(),
    initWheelZoomMock: vi.fn(),
}));

vi.mock('../../libs/chartgpu/dist/index.js', () => ({
    createChart: createChartMock,
}));

vi.mock('../utils/platform.js', () => ({
    defaultGpuPowerPreference: () => null,
}));

vi.mock('./chartInteractions.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./chartInteractions.js')>();
    return {
        ...actual,
        createCanvasOverlay: vi.fn(() => ({
            canvas: document.createElement('canvas'),
            observer: { disconnect: vi.fn(), observe: vi.fn() },
        })),
        initBoxZoom: initBoxZoomMock,
        initWheelZoom: initWheelZoomMock,
    };
});

import { FftChart } from './FftChart.js';

function makeChartInstance() {
    return {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
    };
}

describe('FftChart.init', () => {
    beforeEach(() => {
        createChartMock.mockReset();
        initBoxZoomMock.mockReset();
        initWheelZoomMock.mockReset();
        createChartMock.mockResolvedValue(makeChartInstance());
        document.body.innerHTML = '<div id="fft-chart"></div>';
    });

    it('wires box zoom without wheel zoom', async () => {
        const chart = new FftChart('fft-chart');
        await chart.init();

        expect(initBoxZoomMock).toHaveBeenCalledTimes(1);
        expect(initWheelZoomMock).not.toHaveBeenCalled();
    });
});
