import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const echartsInitMock = vi.fn();

vi.mock('echarts', () => ({
    init: (...args: unknown[]) => echartsInitMock(...args),
}));

import { EchartsScatterChart } from './EchartsScatterChart.js';

class ResizeObserverMock {
    static instances: ResizeObserverMock[] = [];

    observe = vi.fn();
    disconnect = vi.fn();

    constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverMock.instances.push(this);
    }

    trigger(width: number, height: number): void {
        this.callback([
            {
                contentRect: { width, height },
            } as ResizeObserverEntry,
        ], this as unknown as ResizeObserver);
    }
}

describe('EchartsScatterChart', () => {
    let originalResizeObserver: typeof ResizeObserver | undefined;
    let resizeMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        originalResizeObserver = globalThis.ResizeObserver;
        ResizeObserverMock.instances = [];
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        resizeMock = vi.fn();
        echartsInitMock.mockReturnValue({
            setOption: vi.fn(),
            resize: resizeMock,
            dispose: vi.fn(),
        });
        document.body.innerHTML = '<div id="scatter-chart"></div>';
    });

    afterEach(() => {
        if (originalResizeObserver) {
            (globalThis as any).ResizeObserver = originalResizeObserver;
        } else {
            delete (globalThis as any).ResizeObserver;
        }
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('ignores repeated resize observer callbacks when the fallback container size is unchanged', async () => {
        const chart = new EchartsScatterChart('scatter-chart');
        await chart.init();
        const observer = ResizeObserverMock.instances[0];

        observer.trigger(640, 360);
        observer.trigger(640, 360);
        observer.trigger(640, 360);

        expect(resizeMock).toHaveBeenCalledTimes(1);
    });

    it('resizes again when the fallback container size changes', async () => {
        const chart = new EchartsScatterChart('scatter-chart');
        await chart.init();
        const observer = ResizeObserverMock.instances[0];

        observer.trigger(640, 360);
        observer.trigger(800, 360);
        observer.trigger(800, 480);

        expect(resizeMock).toHaveBeenCalledTimes(3);
    });
});
