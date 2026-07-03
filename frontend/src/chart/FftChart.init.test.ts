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

    it('uses roomier FFT axes and compact y tick formatting for log-scale renders', async () => {
        const instance = makeChartInstance();
        createChartMock.mockResolvedValue(instance);
        const chart = new FftChart('fft-chart');
        await chart.init();

        chart.updateData([{
            column: 'OT',
            frequencies: [0.00028, 0.00056, 0.00084],
            magnitudes: [0.004659095, 0.0008607398, 0.00021873892],
            psd: [0.004659095, 0.0008607398, 0.00021873892],
        }], 'magnitude', true);

        const option = instance.setOption.mock.calls.at(-1)?.[0];
        expect(option.grid.left).toBeGreaterThanOrEqual(110);
        expect(option.grid.top).toBeGreaterThanOrEqual(32);
        expect(option.yAxis.nameGap).toBeGreaterThanOrEqual(72);
        expect(option.yAxis.axisLabel.formatter(-2.1873892)).toBe('-2.19');
    });
});
