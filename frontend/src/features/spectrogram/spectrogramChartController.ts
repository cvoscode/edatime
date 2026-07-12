import type { SpectrogramResult } from '../../services/api/index.js';

export interface SpectrogramChart {
    resize?: () => void;
    setOption: (option: any) => void;
    dispatchAction: (action: any) => void;
    convertFromPixel?: (finder: Record<string, unknown>, value: [number, number]) => [number, number] | null;
    dispose?: () => void;
}

export interface SpectrogramChartController {
    ensure(): Promise<SpectrogramChart>;
    resizeWhenReady(): void;
    resetZoom(): void;
    dispose(): void;
}

export interface SpectrogramZoomAction {
    type: 'dataZoom';
    dataZoomIndex: 0 | 1;
    start: number;
    end: number;
}

interface SpectrogramChartControllerOptions {
    element: HTMLDivElement;
    getResult: () => SpectrogramResult | null;
    createChart?: (element: HTMLDivElement) => SpectrogramChart | Promise<SpectrogramChart>;
}

const selectionGrid = { left: 92, right: 110, top: 36, bottom: 88 };

export function createSpectrogramChartController({
    element,
    getResult,
    createChart = createEChartsInstance,
}: SpectrogramChartControllerOptions): SpectrogramChartController {
    let chart: SpectrogramChart | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let interactionAbort: AbortController | null = null;
    let selectionBox: HTMLElement | null = null;
    let disposed = false;

    const ensureDimensions = () => {
        if (element.clientHeight >= 320) return;
        element.style.minHeight = element.style.minHeight || '360px';
        if (!element.style.height || element.style.height === '100%' || element.clientHeight < 320) {
            element.style.height = '360px';
        }
    };

    const isReady = () => {
        const page = document.getElementById('page-spectrogram') as HTMLElement | null;
        ensureDimensions();
        return element.clientWidth > 0 && element.clientHeight > 0 && (!page || !page.hidden);
    };

    const waitForReady = async (attempts = 20) => {
        for (let remaining = attempts; remaining >= 0; remaining -= 1) {
            if (isReady()) return true;
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        return isReady();
    };

    const resetZoom = () => {
        if (!chart) return;
        chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    };

    const bindSelectionZoom = (instance: SpectrogramChart) => {
        interactionAbort?.abort();
        interactionAbort = new AbortController();
        const listenerOptions = { signal: interactionAbort.signal };
        selectionBox?.remove();
        if (element.style.position === '' || element.style.position === 'static') element.style.position = 'relative';
        selectionBox = document.createElement('div');
        selectionBox.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;'
            + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
            + 'pointer-events:none;display:none;z-index:5';
        element.appendChild(selectionBox);

        let dragStart: { x: number; y: number; pointerId: number } | null = null;
        let dragEnd = { x: 0, y: 0 };
        element.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0) return;
            const rect = element.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (x > rect.width - selectionGrid.right || x < selectionGrid.left
                || y < selectionGrid.top || y > rect.height - selectionGrid.bottom) return;
            dragStart = { x, y, pointerId: event.pointerId };
            dragEnd = { x, y };
            try { element.setPointerCapture(event.pointerId); } catch { /* noop */ }
        }, listenerOptions);
        element.addEventListener('pointermove', (event: PointerEvent) => {
            if (!dragStart || event.pointerId !== dragStart.pointerId || !selectionBox) return;
            const rect = element.getBoundingClientRect();
            dragEnd = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            selectionBox.style.left = `${Math.min(dragStart.x, dragEnd.x)}px`;
            selectionBox.style.top = `${Math.min(dragStart.y, dragEnd.y)}px`;
            selectionBox.style.width = `${Math.abs(dragEnd.x - dragStart.x)}px`;
            selectionBox.style.height = `${Math.abs(dragEnd.y - dragStart.y)}px`;
            selectionBox.style.display = 'block';
        }, listenerOptions);
        const finishDrag = (event: PointerEvent) => {
            if (!dragStart || event.pointerId !== dragStart.pointerId) return;
            const start = dragStart;
            dragStart = null;
            if (selectionBox) selectionBox.style.display = 'none';
            try { element.releasePointerCapture(event.pointerId); } catch { /* noop */ }
            if (Math.abs(dragEnd.x - start.x) < 8 || Math.abs(dragEnd.y - start.y) < 8) return;
            const result = getResult();
            if (!result || !instance.convertFromPixel) return;
            const startPoint = instance.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [start.x, start.y]);
            const endPoint = instance.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [dragEnd.x, dragEnd.y]);
            if (!startPoint || !endPoint) return;
            const actions = buildSpectrogramZoomActions(startPoint, endPoint, result);
            if (!actions) return;
            for (const action of actions) instance.dispatchAction(action);
        };
        element.addEventListener('pointerup', finishDrag, listenerOptions);
        element.addEventListener('pointercancel', (event: PointerEvent) => {
            if (dragStart?.pointerId === event.pointerId) {
                dragStart = null;
                if (selectionBox) selectionBox.style.display = 'none';
            }
        }, listenerOptions);
        element.addEventListener('dblclick', resetZoom, listenerOptions);
    };

    return {
        async ensure() {
            if (chart) {
                if (isReady()) chart.resize?.();
                return chart;
            }
            if (!(await waitForReady())) throw new Error('Spectrogram chart container is not ready yet.');
            if (disposed) throw new Error('Spectrogram chart controller has been disposed.');
            chart = await createChart(element);
            resizeObserver?.disconnect();
            resizeObserver = new ResizeObserver(() => chart?.resize?.());
            resizeObserver.observe(element);
            bindSelectionZoom(chart);
            return chart;
        },
        resizeWhenReady() {
            if (isReady()) {
                chart?.resize?.();
                return;
            }
            void (async () => {
                await waitForReady();
                chart?.resize?.();
            })();
        },
        resetZoom,
        dispose() {
            disposed = true;
            interactionAbort?.abort();
            interactionAbort = null;
            selectionBox?.remove();
            selectionBox = null;
            resizeObserver?.disconnect();
            resizeObserver = null;
            try { chart?.dispose?.(); } catch { /* ignore teardown failures */ }
            chart = null;
        },
    };
}

export function buildSpectrogramZoomActions(
    start: [number, number],
    end: [number, number],
    result: Pick<SpectrogramResult, 'times_ms' | 'frequencies'>,
): SpectrogramZoomAction[] | null {
    const timeDenominator = result.times_ms.length - 1;
    const frequencyDenominator = result.frequencies.length - 1;
    if (timeDenominator <= 0 || frequencyDenominator <= 0) return null;
    const xStart = clampPercent((Math.min(start[0], end[0]) / timeDenominator) * 100);
    const xEnd = clampPercent((Math.max(start[0], end[0]) / timeDenominator) * 100);
    const yStart = clampPercent((Math.min(start[1], end[1]) / frequencyDenominator) * 100);
    const yEnd = clampPercent((Math.max(start[1], end[1]) / frequencyDenominator) * 100);
    if (xEnd <= xStart || yEnd <= yStart) return null;
    return [
        { type: 'dataZoom', dataZoomIndex: 0, start: xStart, end: xEnd },
        { type: 'dataZoom', dataZoomIndex: 1, start: yStart, end: yEnd },
    ];
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

async function createEChartsInstance(element: HTMLDivElement): Promise<SpectrogramChart> {
    const echarts = await import('echarts');
    return echarts.init(element, undefined, { renderer: 'canvas' }) as unknown as SpectrogramChart;
}
