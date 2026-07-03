import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createChartMock, initBoxZoomMock, initWheelZoomMock } = vi.hoisted(() => ({
    createChartMock: vi.fn(),
    initBoxZoomMock: vi.fn(),
    initWheelZoomMock: vi.fn(),
}));

const overlayFillTextMock = vi.fn();
const overlayContextMock = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    fillText: overlayFillTextMock,
    strokeText: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 12 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
};

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
        overlayFillTextMock.mockReset();
        createChartMock.mockResolvedValue(makeChartInstance());
        document.body.innerHTML = '<div id="fft-chart"></div>';
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => overlayContextMock as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('wires box zoom without wheel zoom', async () => {
        const chart = new FftChart('fft-chart');
        await chart.init();

        expect(initBoxZoomMock).toHaveBeenCalledTimes(1);
        expect(initWheelZoomMock).not.toHaveBeenCalled();
    });

    it('uses roomier FFT axes and readable log-scale ticks without duplicating the axis title', async () => {
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
        expect(option.yAxis.axisLabel.formatter(-2.1873892)).toBe('0.0065');
        expect(option.yAxis.axisLabel.formatter(-0.8607398)).toBe('0.14');
        expect(overlayFillTextMock).not.toHaveBeenCalledWith('log10(Magnitude)', expect.any(Number), expect.any(Number));
    });

    it('stacks top-peak labels onto distinct rows when nearby peaks cluster together', async () => {
        const instance = makeChartInstance();
        createChartMock.mockResolvedValue(instance);
        const chart = new FftChart('fft-chart');
        await chart.init();

        chart.updateData([{
            column: 'OT',
            frequencies: [0.00028, 0.00056, 0.00084, 0.00112],
            magnitudes: [0.004659095, 0.004659095, 0.004659095, 0.00021873892],
            psd: [0.004659095, 0.004659095, 0.004659095, 0.00021873892],
            dominant_peaks: [
                { frequency_hz: 0.00028, magnitude: 1, power: 1, rank: 1 },
                { frequency_hz: 0.00056, magnitude: 1, power: 1, rank: 2 },
                { frequency_hz: 0.00084, magnitude: 1, power: 1, rank: 3 },
            ],
        }], 'magnitude', true);

        const labelYs = overlayFillTextMock.mock.calls
            .filter(([text]) => typeof text === 'string' && text.includes('Hz'))
            .slice(0, 3)
            .map(([, , y]) => Number(y));

        expect(labelYs).toHaveLength(3);
        expect(new Set(labelYs).size).toBe(3);
    });
});
