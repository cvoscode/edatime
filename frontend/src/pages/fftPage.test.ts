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
        <select id="fft-filter-type"><option value="none" selected>None</option><option value="lowpass">Lowpass</option></select>
        <input id="fft-filter-low-hz" type="number" value="">
        <input id="fft-filter-high-hz" type="number" value="">
        <button id="fft-filter-apply-btn" type="button"></button>
        <span id="fft-filter-status"></span>
        <select id="fft-normalize"><option value="none" selected>None</option><option value="minmax">Min-max</option></select>
        <input id="fft-clip-toggle" type="checkbox" />
        <select id="fft-clip-method" disabled>
          <option value="percentile" selected>Percentile</option>
          <option value="iqr">IQR (k)</option>
        </select>
        <span id="fft-clip-param-label">Clip %</span>
        <input id="fft-clip-param" type="number" value="0.5" disabled />
    `;
}

describe('initFftPage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        (window as any).__edatime = {};
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

    it('renders FFT chips and starts with the empty state visible', async () => {
        const { appState } = await import('../store/appStateCompat.js');
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
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        expect(fftChartInstance.init).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('.fft-trace-chip')).toHaveLength(2);
        const firstChip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        expect(firstChip.querySelector('.chip-color-picker')).toBeTruthy();
        expect(firstChip.querySelector('.chip-label')).toBeTruthy();
        expect(firstChip.querySelector('.chip-menu-btn')).toBeNull(); // no menu on FFT chips
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

        const { appState } = await import('../store/appStateCompat.js');
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
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect(fftChartInstance.updateData).toHaveBeenCalledTimes(1);
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

        const { appState } = await import('../store/appStateCompat.js');
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
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        const chip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        chip.click();
        await vi.waitFor(() => {
            expect(fftChartInstance.updateData).toHaveBeenCalledTimes(1);
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

        const { appState } = await import('../store/appStateCompat.js');
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
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);
        });

        expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);

        buildDom();
        appState.metadata = {
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
        expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(false);
        expect((document.getElementById('fft-empty-state') as HTMLElement).getAttribute('data-empty-reason')).toBe('no-columns-selected');
    });

    it('falls back to ECharts when the WebGPU FFT chart cannot initialize', async () => {
        fftChartInstance.init.mockRejectedValueOnce(new Error('No WebGPU adapter found'));

        const { appState } = await import('../store/appStateCompat.js');
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
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echartsInitMock).toHaveBeenCalledTimes(1);
    });

    it('enables clip method and param when fft outliers toggle is checked (input event)', async () => {
        const { appState } = await import('../store/appStateCompat.js');
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
});
