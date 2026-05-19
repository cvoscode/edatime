import { beforeEach, describe, expect, it, vi } from 'vitest';

const fftChartInstance = {
    init: vi.fn(async () => undefined),
    clear: vi.fn(),
    updateData: vi.fn(),
    resetView: vi.fn(),
    getIsZoomed: vi.fn(() => false),
    onZoomChange: null as ((isZoomed: boolean) => void) | null,
};

const fetchFftMock = vi.fn();
const toastMock = vi.fn();

vi.mock('../chart/FftChart.js', () => ({
    FftChart: class {
        init = fftChartInstance.init;
        clear = fftChartInstance.clear;
        updateData = fftChartInstance.updateData;
        resetView = fftChartInstance.resetView;
        getIsZoomed = fftChartInstance.getIsZoomed;
        onZoomChange = fftChartInstance.onZoomChange;
    },
}));

vi.mock('../dataClient.js', () => ({
    fetchFft: (...args: unknown[]) => fetchFftMock(...args),
}));

vi.mock('../utils/chartExport.js', () => ({
    exportContainerCanvasPNG: vi.fn(),
    exportContainerCanvasSVG: vi.fn(),
    exportContainerCanvasHTML: vi.fn(),
    exportTraceCSV: vi.fn(),
}));

vi.mock('../utils/toast.js', () => ({
    toast: (...args: unknown[]) => toastMock(...args),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <select id="fft-mode-select"><option value="magnitude" selected>Magnitude</option><option value="psd">PSD</option></select>
        <input id="fft-log-scale" type="checkbox" checked>
        <button id="fft-zoom-reset-btn" type="button" hidden>Zoom</button>
        <span id="fft-status"></span>
        <div id="fft-traces-bar"></div>
        <div id="fft-chart"></div>
        <div id="fft-empty-state" data-empty-reason=""></div>
        <div id="fft-chart-loading" hidden></div>
        <button id="fft-export-png-btn" type="button"></button>
        <button id="fft-export-svg-btn" type="button"></button>
        <button id="fft-export-html-btn" type="button"></button>
        <button id="fft-export-csv-btn" type="button"></button>
        <select id="fft-filter-type"><option value="none" selected>None</option><option value="lowpass">Lowpass</option></select>
        <input id="fft-filter-low-hz" type="number" value="">
        <input id="fft-filter-high-hz" type="number" value="">
        <button id="fft-filter-apply-btn" type="button"></button>
        <span id="fft-filter-status"></span>
    `;
}

describe('initFftPage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = {};
        buildDom();
    });

    it('renders FFT chips and starts with the empty state visible', async () => {
        const { appState } = await import('../state');
        appState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value', 'temp'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        appState.currentStart = 0;
        appState.currentEnd = 1000;

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });

        expect(fftChartInstance.init).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('.fft-trace-chip')).toHaveLength(2);
        const emptyState = document.getElementById('fft-empty-state') as HTMLElement;
        expect(emptyState.hidden).toBe(false);
        expect(emptyState.getAttribute('data-empty-reason')).toBe('no-columns-selected');
    });

    it('fetches and renders a trace when a chip is clicked', async () => {
        fetchFftMock.mockResolvedValueOnce({
            sample_count: 64,
            results: [{
                column: 'value',
                frequencies: [1, 2, 3],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
            }],
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

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();

        expect(fetchFftMock).toHaveBeenCalledTimes(1);
        expect(fftChartInstance.updateData).toHaveBeenCalledTimes(1);
        expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);
        expect(document.getElementById('fft-status')?.textContent).toContain('3 bins');
    });
});