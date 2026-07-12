import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fftChartInstance = {
    init: vi.fn(async () => undefined),
    clear: vi.fn(),
    updateData: vi.fn(),
    resetView: vi.fn(),
    getIsZoomed: vi.fn(() => false),
    onZoomChange: null as ((isZoomed: boolean) => void) | null,
};

const echartsInitMock = vi.fn();
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

vi.mock('../services/api/index.js', () => ({
    fetchFft: (...args: unknown[]) => fetchFftMock(...args),
}));

vi.mock('echarts', () => ({
    init: (...args: unknown[]) => echartsInitMock(...args),
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
        <div id="fft-traces-bar"></div>
        <div id="fft-chart"></div>
        <div id="fft-empty-state" data-empty-reason=""></div>
        <div id="fft-chart-loading" hidden></div>
        <button id="fft-export-png-btn" type="button"></button>
        <button id="fft-export-svg-btn" type="button"></button>
        <button id="fft-export-html-btn" type="button"></button>
        <button id="fft-export-csv-btn" type="button"></button>
        <select id="fft-filter-type"><option value="none" selected>None</option><option value="lowpass">Lowpass</option><option value="bandpass">Bandpass</option></select>
        <label id="fft-filter-low-field"><input id="fft-filter-low-hz" type="number" value=""></label>
        <label id="fft-filter-high-field"><input id="fft-filter-high-hz" type="number" value=""></label>
        <button id="fft-filter-apply-btn" type="button"></button>
        <span id="fft-filter-status"></span>
        <div id="fft-spectral-info" hidden>
          <span id="fft-spectral-info-rate"></span>
          <span id="fft-spectral-info-nyquist"></span>
          <span id="fft-spectral-info-peaks"></span>
        </div>
        <select id="fft-normalize"><option value="none" selected>None</option><option value="minmax">Min-max</option></select>
        <input id="fft-clip-toggle" type="checkbox" />
        <label id="fft-clip-method-field"><select id="fft-clip-method" disabled>
            <option value="percentile" selected>Percentile</option>
            <option value="iqr">IQR (k)</option>
        </select></label>
        <label id="fft-clip-param-field"><span id="fft-clip-param-label">Clip %</span><input id="fft-clip-param" type="number" value="0.5" disabled /></label>
    `;
}

describe('initFftPage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = {};
        window.localStorage.clear();
        buildDom();
        echartsInitMock.mockReturnValue({
            setOption: vi.fn(),
            resize: vi.fn(),
            dispose: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        });
    });

    afterEach(async () => {
        const module = await import('./fftPage');
        module.__resetFftPageForTests();
    });

    it('preselects the first two FFT traces on the first page visit', async () => {
        fetchFftMock.mockImplementation(async (_start: string, _end: string, column: string) => ({
            sample_count: 64,
            results: [{
                column,
                frequencies: [1, 2, 3],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
            }],
        }));

        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value', 'temp', 'pressure'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        expect(fftChartInstance.init).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => {
            expect(fetchFftMock).toHaveBeenCalledTimes(2);
        });

        expect(document.querySelectorAll('.fft-trace-chip')).toHaveLength(3);
        const firstChip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        expect(firstChip.querySelector('.chip-color-picker')).toBeTruthy();
        expect(firstChip.querySelector('.chip-label')).toBeTruthy();
        expect(firstChip.querySelector('.chip-menu-btn')).toBeNull(); // no menu on FFT chips
        await vi.waitFor(() => {
            const checked = Array.from(document.querySelectorAll<HTMLInputElement>('.fft-trace-chip input[type="checkbox"]'))
                .filter((input) => input.checked);
            expect(checked).toHaveLength(2);
        });
        const emptyState = document.getElementById('fft-empty-state') as HTMLElement;
        expect(emptyState.hidden).toBe(true);
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

        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        const startingUpdateCount = fftChartInstance.updateData.mock.calls.length;
        await vi.waitFor(() => {
            expect(fftChartInstance.updateData.mock.calls.length).toBe(startingUpdateCount + 1);
        });

        expect(fetchFftMock).toHaveBeenCalledTimes(1);
        const chip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        expect(chip.classList.contains('active')).toBe(true);
        expect(chip.querySelector('.fft-chip-remove')).toBeNull();
        expect(chip.querySelector('.chip-menu-btn')).toBeNull(); // menu removed, toggle removes trace
        expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);
    });

    it('reconciles chip checkbox state from the active FFT traces on rerender', async () => {
        fetchFftMock.mockResolvedValueOnce({
            sample_count: 64,
            results: [{
                column: 'value',
                frequencies: [1, 2, 3],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
            }],
        });

        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        const chip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        chip.click();
        const startingUpdateCount = fftChartInstance.updateData.mock.calls.length;
        await vi.waitFor(() => {
            expect(fftChartInstance.updateData.mock.calls.length).toBe(startingUpdateCount + 1);
        });

        // Re-query after async handler replaces chips via renderChips()
        const activeChip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        const checkbox = activeChip.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(checkbox.checked).toBe(true);

        checkbox.checked = false;
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        // Chips are rebuilt by renderChips — re-query to get the reconciled element
        const reconciledChip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        const reconciledCheckbox = reconciledChip.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(reconciledChip.classList.contains('active')).toBe(true);
        expect(reconciledCheckbox.checked).toBe(true);
    });

    it('starts from an empty trace state when the page is initialized again on a fresh DOM', async () => {
        fetchFftMock.mockResolvedValueOnce({
            sample_count: 64,
            results: [{
                column: 'value',
                frequencies: [1, 2, 3],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
            }],
        });

        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);
        });

        expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);

        buildDom();
        datasetState.metadata = {
            total_rows: 8,
            columns: [],
            numeric_columns: ['value', 'temp'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;

        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        expect(document.querySelectorAll('.fft-trace-chip')).toHaveLength(2);
        await vi.waitFor(() => {
            expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(false);
        });
    });

    it('falls back to ECharts when the WebGPU FFT chart cannot initialize', async () => {
        fftChartInstance.init.mockRejectedValueOnce(new Error('No WebGPU adapter found'));

        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echartsInitMock).toHaveBeenCalledTimes(1);
    });

    it('enables clip method and param when fft outliers toggle is checked (input event)', async () => {
        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const toggle = document.getElementById('fft-clip-toggle') as HTMLInputElement;
        const method = document.getElementById('fft-clip-method') as HTMLSelectElement;
        const param = document.getElementById('fft-clip-param') as HTMLInputElement;

        // Initially disabled.
        expect(method.disabled).toBe(true);
        expect(param.disabled).toBe(true);
        expect(method.title).toMatch(/Outliers/);

        // Flip via the input event (label-driven, programmatic).
        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(false);
        expect(param.disabled).toBe(false);
        expect(method.title).toBe('');

        // Flip back to disabled.
        toggle.checked = false;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(method.disabled).toBe(true);
        expect(param.disabled).toBe(true);
    });

    it('hides advanced clip controls until outlier clipping is enabled', async () => {
        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        const methodField = document.getElementById('fft-clip-method-field') as HTMLElement;
        const paramField = document.getElementById('fft-clip-param-field') as HTMLElement;
        const toggle = document.getElementById('fft-clip-toggle') as HTMLInputElement;

        expect(methodField.hidden).toBe(true);
        expect(paramField.hidden).toBe(true);

        toggle.checked = true;
        toggle.dispatchEvent(new Event('input', { bubbles: true }));

        expect(methodField.hidden).toBe(false);
        expect(paramField.hidden).toBe(false);
    });

    it('hides inactive spectral cutoff inputs until the selected filter uses them', async () => {
        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        const filterType = document.getElementById('fft-filter-type') as HTMLSelectElement;
        const lowField = document.getElementById('fft-filter-low-field') as HTMLElement;
        const highField = document.getElementById('fft-filter-high-field') as HTMLElement;

        expect(lowField.hidden).toBe(true);
        expect(highField.hidden).toBe(true);

        filterType.value = 'lowpass';
        filterType.dispatchEvent(new Event('change', { bubbles: true }));
        expect(lowField.hidden).toBe(true);
        expect(highField.hidden).toBe(false);

        filterType.value = 'bandpass';
        filterType.dispatchEvent(new Event('change', { bubbles: true }));
        expect(lowField.hidden).toBe(false);
        expect(highField.hidden).toBe(false);
    });

    it('formats spectral info in readable frequency units instead of raw exponential Hz', async () => {
        fetchFftMock.mockResolvedValueOnce({
            sample_count: 64,
            results: [{
                column: 'value',
                frequencies: [0.00028, 0.00056, 0.00084],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
                sample_rate_hz: 0.001111111,
                nyquist_hz: 0.0005555555,
                dominant_peaks: [{ frequency_hz: 0.00028, magnitude: 10, power: 100, rank: 1 }],
            }],
        });

        const { chartState, datasetState } = await import('../store/index.js');
        datasetState.metadata = {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any;
        chartState.currentStart = 0;
        chartState.currentEnd = 1000;
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./fftPage');
        await initFftPage({ renderTimeseries: vi.fn() });
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect(fetchFftMock).toHaveBeenCalledTimes(1);
        });

        await vi.waitFor(() => {
            expect(document.getElementById('fft-spectral-info')?.hidden).toBe(false);
        });
        expect(document.getElementById('fft-spectral-info-rate')?.textContent).toBe('1 / 15.0 min');
        expect(document.getElementById('fft-spectral-info-nyquist')?.textContent).toBe('1 / 30.0 min');
        expect(document.getElementById('fft-spectral-info-peaks')?.textContent).toContain('#1');
        expect(document.getElementById('fft-spectral-info-peaks')?.textContent).toMatch(/min|hr|day/);
    });
});
