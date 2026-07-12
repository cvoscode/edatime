import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSpectrogramZoomActions, createSpectrogramChartController } from './spectrogramChartController.js';

afterEach(() => vi.unstubAllGlobals());

describe('spectrogram chart controller', () => {
    it('maps a drag selection to independent time and frequency zoom actions', () => {
        expect(buildSpectrogramZoomActions([1, 3], [7, 5], {
            times_ms: new Array(9).fill(0),
            frequencies: new Array(9).fill(0),
        } as any)).toEqual([
            { type: 'dataZoom', dataZoomIndex: 0, start: 12.5, end: 87.5 },
            { type: 'dataZoom', dataZoomIndex: 1, start: 37.5, end: 62.5 },
        ]);
    });

    it('rejects non-zoomable one-cell axes and empty selections', () => {
        expect(buildSpectrogramZoomActions([0, 0], [1, 1], {
            times_ms: [0],
            frequencies: [0, 1],
        } as any)).toBeNull();
        expect(buildSpectrogramZoomActions([2, 2], [2, 5], {
            times_ms: [0, 1, 2],
            frequencies: [0, 1, 2, 3, 4, 5],
        } as any)).toBeNull();
    });

    it('owns selection overlay, reset behavior, resize observation, and disposal', async () => {
        class ResizeObserverStub {
            observe = vi.fn();
            disconnect = vi.fn();
        }
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        document.body.innerHTML = '<div id="spectrogram-chart"></div>';
        const element = document.getElementById('spectrogram-chart') as HTMLDivElement;
        Object.defineProperty(element, 'clientWidth', { configurable: true, value: 800 });
        Object.defineProperty(element, 'clientHeight', { configurable: true, value: 360 });
        const chart = {
            setOption: vi.fn(),
            resize: vi.fn(),
            dispatchAction: vi.fn(),
            dispose: vi.fn(),
        };
        const controller = createSpectrogramChartController({
            element,
            getResult: () => ({ times_ms: [0, 1], frequencies: [0, 1] }) as any,
            createChart: () => chart,
        });

        await controller.ensure();
        expect(element.querySelector('[style*="pointer-events"]')).not.toBeNull();
        element.dispatchEvent(new MouseEvent('dblclick'));
        expect(chart.dispatchAction).toHaveBeenCalledTimes(2);

        controller.dispose();
        expect(chart.dispose).toHaveBeenCalledTimes(1);
        expect(element.querySelector('[style*="pointer-events"]')).toBeNull();
    });
});
