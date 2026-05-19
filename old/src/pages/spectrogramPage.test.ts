import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSpectrogramMock = vi.fn();
const chartInstance = {
    setOption: vi.fn(),
    dispatchAction: vi.fn(),
    resize: vi.fn(),
    convertFromPixel: vi.fn(() => [0, 0]),
};

vi.mock('../dataClient.js', () => ({
    fetchSpectrogram: (...args: unknown[]) => fetchSpectrogramMock(...args),
}));

vi.mock('../utils/chartExport.js', () => ({
    exportEChartsPNG: vi.fn(),
    exportEChartsSVG: vi.fn(),
    exportEChartsHTML: vi.fn(),
}));

vi.mock('echarts', () => ({
    init: vi.fn(() => chartInstance),
}));

class ResizeObserverMock {
    observe() { }
    disconnect() { }
}

function buildDom(): void {
    document.body.innerHTML = `
        <section id="page-spectrogram" data-page-name="spectrogram">
            <select id="spectrogram-col-select"></select>
            <select id="spectrogram-win-size"><option value="256" selected>256</option></select>
            <input id="spectrogram-log-scale" type="checkbox" checked>
            <button id="spectrogram-zoom-reset-btn" type="button"></button>
            <button id="spectrogram-compute-btn" type="button">Compute</button>
            <span id="spectrogram-status"></span>
            <div id="spectrogram-chart" style="width:400px;height:240px;"></div>
            <div id="spectrogram-empty-state" data-empty-reason=""></div>
            <div id="spectrogram-loading" hidden></div>
            <button id="spectrogram-export-png-btn" type="button"></button>
            <button id="spectrogram-export-svg-btn" type="button"></button>
            <button id="spectrogram-export-html-btn" type="button"></button>
        </section>
    `;
}

describe('initSpectrogramPage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = {};
        buildDom();
        (globalThis as any).ResizeObserver = ResizeObserverMock;
        const chartEl = document.getElementById('spectrogram-chart') as HTMLDivElement;
        Object.defineProperty(chartEl, 'clientWidth', { configurable: true, value: 400 });
        Object.defineProperty(chartEl, 'clientHeight', { configurable: true, value: 240 });
    });

    it('populates columns and computes a spectrogram on demand', async () => {
        fetchSpectrogramMock.mockResolvedValueOnce({
            sample_count: 128,
            result: {
                column: 'value',
                times_ms: [0, 1000],
                frequencies: [1, 2],
                magnitudes: [[1, 2], [3, 4]],
            },
        });

        const { appState } = await import('../state');
        appState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        appState.currentStart = 0;
        appState.currentEnd = 1000;

        const setLoading = vi.fn();
        const { initSpectrogramPage } = await import('./spectrogramPage');
        await initSpectrogramPage({ setLoading });

        expect((document.getElementById('spectrogram-col-select') as HTMLSelectElement).options).toHaveLength(1);
        (document.getElementById('spectrogram-compute-btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchSpectrogramMock).toHaveBeenCalledTimes(1);
        expect(setLoading).toHaveBeenNthCalledWith(1, 'spectrogram-compute-btn', 'spectrogram-loading', true);
        expect(setLoading).toHaveBeenLastCalledWith('spectrogram-compute-btn', 'spectrogram-loading', false);
        expect(chartInstance.setOption).toHaveBeenCalledTimes(1);
        expect((document.getElementById('spectrogram-empty-state') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('spectrogram-status')?.textContent).toContain('2 windows × 2 bins');
    });

    it('waits for chart dimensions before initializing echarts', async () => {
        fetchSpectrogramMock.mockResolvedValueOnce({
            sample_count: 128,
            result: {
                column: 'value',
                times_ms: [0, 1000],
                frequencies: [1, 2],
                magnitudes: [[1, 2], [3, 4]],
            },
        });

        const { appState } = await import('../state');
        appState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        appState.currentStart = 0;
        appState.currentEnd = 1000;

        const chartEl = document.getElementById('spectrogram-chart') as HTMLDivElement;
        let width = 0;
        let height = 0;
        Object.defineProperty(chartEl, 'clientWidth', { configurable: true, get: () => width });
        Object.defineProperty(chartEl, 'clientHeight', { configurable: true, get: () => height });
        window.setTimeout(() => {
            width = 400;
            height = 240;
        }, 0);

        const setLoading = vi.fn();
        const echarts = await import('echarts');
        const { initSpectrogramPage } = await import('./spectrogramPage');
        await initSpectrogramPage({ setLoading });

        (document.getElementById('spectrogram-compute-btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(echarts.init).toHaveBeenCalledTimes(1);
        expect(chartInstance.setOption).toHaveBeenCalledTimes(1);
    });
});