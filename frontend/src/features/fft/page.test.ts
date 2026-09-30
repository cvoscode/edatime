import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitNavigationChange } from '../../platform/navigationEvents.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { analyticsState, setSpectralFilterPreview } from '../../store/analyticsState.js';

const fftChartInstance = {
    init: vi.fn(async () => undefined),
    clear: vi.fn(),
    updateData: vi.fn(),
    resetView: vi.fn(),
    setFocusFrequency: vi.fn(),
    getIsZoomed: vi.fn(() => false),
    onZoomChange: null as ((isZoomed: boolean) => void) | null,
};

const echartsInitMock = vi.fn();
const fetchFftMock = vi.fn();
const fetchCapabilitiesMock = vi.fn();
const toastMock = vi.fn();

vi.mock('../../chart/FftChart.js', () => ({
    FftChart: class {
        init = fftChartInstance.init;
        clear = fftChartInstance.clear;
        updateData = fftChartInstance.updateData;
        resetView = fftChartInstance.resetView;
        setFocusFrequency = fftChartInstance.setFocusFrequency;
        getIsZoomed = fftChartInstance.getIsZoomed;
        onZoomChange = fftChartInstance.onZoomChange;
    },
}));

vi.mock('../../services/api/index.js', () => ({
    fetchFft: (...args: unknown[]) => fetchFftMock(...args),
    fetchCapabilities: (...args: unknown[]) => fetchCapabilitiesMock(...args),
}));

vi.mock('echarts', () => ({
    init: (...args: unknown[]) => echartsInitMock(...args),
}));

vi.mock('../../utils/chartExport.js', () => ({
    exportContainerCanvasPNG: vi.fn(),
    exportContainerCanvasSVG: vi.fn(),
    exportContainerCanvasHTML: vi.fn(),
    exportTraceCSV: vi.fn(),
}));

const copyTextMock = vi.fn();
vi.mock('../../utils/copyText.js', () => ({
    copyTextToClipboard: (...args: unknown[]) => copyTextMock(...args),
}));

vi.mock('../../utils/toast.js', () => ({
    toast: (...args: unknown[]) => toastMock(...args),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <select id="fft-mode-select"><option value="magnitude" selected>Magnitude</option><option value="psd">PSD</option></select>
        <input id="fft-log-scale" type="checkbox" checked>
        <button id="fft-zoom-reset-btn" type="button" hidden>Zoom</button>
        <div id="fft-trace-selection" hidden><span id="fft-trace-selection-count"></span><button id="fft-select-all-btn" type="button">Select all</button><button id="fft-clear-all-btn" type="button">Clear all</button></div>
        <div id="fft-traces-bar"></div>
        <div id="fft-chart"></div>
        <button id="fft-compute-btn" type="button">Compute spectrum</button>
        <span id="fft-compute-reason"></span>
        <p id="fft-analysis-status"></p>
        <div id="fft-empty-state" data-empty-reason="">
          <strong id="fft-empty-title"></strong>
          <span id="fft-empty-message"></span>
          <button id="fft-empty-compute-btn" type="button">Compute spectrum</button>
        </div>
        <span id="fft-sampling-badge" hidden></span>
        <div id="fft-chart-loading" hidden><span id="fft-chart-loading-label"></span><button id="fft-cancel-btn" type="button">Cancel computation</button></div>
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
          <div id="fft-spectral-info-peaks"></div>
          <p id="fft-frequency-callout"></p>
          <button id="fft-copy-summary-btn" type="button"></button>
          <span id="fft-summary-focus"></span>
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
    let workspace = createWorkspaceStore();
    beforeEach(() => {
        workspace = createWorkspaceStore();
        vi.resetAllMocks();
        fftChartInstance.init.mockResolvedValue(undefined);
        fftChartInstance.getIsZoomed.mockReturnValue(false);
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
        fetchCapabilitiesMock.mockResolvedValue({ budgets: { analytics_points: 65536 } });
    });

    afterEach(async () => {
        const module = await import('./page');
        module.disposeFftPage();
        setSpectralFilterPreview(null);
    });

    it('preselects the first two traces and computes within the advertised budget', async () => {
        fetchFftMock.mockImplementation(async (_start: string, _end: string, column: string) => ({
            sample_count: 64,
            sampling: {
                method: 'block_mean',
                input_points: 69680,
                output_points: 65536,
                aggregation_factor: 1.06,
                source_cadence_ms: 10_000,
                effective_cadence_ms: 10_600,
            },
            results: [{
                column,
                frequencies: [1, 2, 3],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
            }],
        }));

        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value', 'temp', 'pressure'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 200, xMax: 800, yMin: null, yMax: null });

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        expect(fftChartInstance.init).toHaveBeenCalledTimes(1);
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
        expect(emptyState.hidden).toBe(false);
        expect(emptyState.dataset.emptyReason).toBe('ready-to-compute');
        expect(fetchFftMock).not.toHaveBeenCalled();

        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(fetchFftMock).toHaveBeenCalledTimes(2));
        expect(fetchFftMock).toHaveBeenNthCalledWith(
            1,
            new Date(200).toISOString(),
            new Date(800).toISOString(),
            expect.any(String),
            65536,
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
            'constant',
        );
        await vi.waitFor(() => expect(emptyState.hidden).toBe(true));
        expect(document.getElementById('fft-sampling-badge')?.textContent)
            .toBe('Block-mean downsampled · 65,536 of 69,680 points · source cadence 10 s · effective cadence 10.6 s · Shortest resolvable period ≈ 21.2 s');
    });

    it('selects all and clears all FFT traces while updating the disabled reason', async () => {
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10, columns: [], numeric_columns: ['value', 'temp', 'pressure'], time_column: 'ts',
            time_range: { min: 0, max: 1000 }, column_profiles: [],
        } as any, 0);
        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        const checked = () => Array.from(document.querySelectorAll<HTMLInputElement>('.fft-trace-chip input[type="checkbox"]')).filter((input) => input.checked);
        expect(checked()).toHaveLength(2);
        (document.getElementById('fft-select-all-btn') as HTMLButtonElement).click();
        expect(checked()).toHaveLength(3);
        expect(document.getElementById('fft-trace-selection-count')?.textContent).toBe('3 of 3 selected');
        (document.getElementById('fft-clear-all-btn') as HTMLButtonElement).click();
        expect(checked()).toHaveLength(0);
        const compute = document.getElementById('fft-compute-btn') as HTMLButtonElement;
        expect(compute.disabled).toBe(true);
        expect(compute.title).toContain('Select one or more numeric columns');
    });

    it('cancels an in-flight FFT request and announces the preserved completed result', async () => {
        fetchFftMock.mockImplementation((_start: string, _end: string, _column: string, _points: number, options: any) =>
            new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })));
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10, columns: [], numeric_columns: ['value', 'temp'], time_column: 'ts',
            time_range: { min: 0, max: 1000 }, column_profiles: [],
        } as any, 0);
        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(fetchFftMock).toHaveBeenCalledTimes(2));
        (document.getElementById('fft-cancel-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(document.getElementById('fft-analysis-status')?.textContent).toContain('canceled'));
        expect(fetchFftMock.mock.calls.every((call) => call[4].signal.aborted)).toBe(true);
        expect((document.getElementById('fft-chart-loading') as HTMLElement).hidden).toBe(true);
    });

    it('replaces control listeners when the page is initialized twice', async () => {
        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        (document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement).click();

        expect(fftChartInstance.resetView).toHaveBeenCalledTimes(1);
    });

    it('selects a chip and fetches only when Compute is clicked', async () => {
        fetchFftMock.mockResolvedValueOnce({
            sample_count: 64,
            results: [{
                column: 'value',
                frequencies: [1, 2, 3],
                magnitudes: [10, 8, 6],
                psd: [100, 64, 36],
            }],
        });

        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        expect(fetchFftMock).not.toHaveBeenCalled();
        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
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

        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        const chip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        chip.click();
        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
        const startingUpdateCount = fftChartInstance.updateData.mock.calls.length;
        await vi.waitFor(() => {
            expect(fftChartInstance.updateData.mock.calls.length).toBe(startingUpdateCount + 1);
        });

        // Re-query after async handler replaces chips via renderChips()
        const activeChip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        const checkbox = activeChip.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(checkbox.checked).toBe(true);

        checkbox.checked = false;
        emitNavigationChange({ page: 'fft' });

        // Chips are rebuilt by renderChips — re-query to get the reconciled element
        const reconciledChip = document.querySelector<HTMLElement>('.fft-trace-chip')!;
        const reconciledCheckbox = reconciledChip.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(reconciledChip.classList.contains('active')).toBe(true);
        expect(reconciledCheckbox.checked).toBe(true);
    });

    it('the returned disposer unbinds the page controls', async () => {
        const { initFftPage } = await import('./page');
        const dispose = await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        dispose();
        (document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement).click();

        expect(fftChartInstance.resetView).not.toHaveBeenCalled();
    });

    it('recomputes on the next visible visit after being disposed with results', async () => {
        fetchFftMock.mockImplementation(async (_start: string, _end: string, column: string) => ({
            sample_count: 64,
            results: [{ column, frequencies: [1, 2, 3], magnitudes: [10, 8, 6], psd: [100, 64, 36] }],
        }));
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10, columns: [], numeric_columns: ['value'], time_column: 'ts',
            time_range: { min: 0, max: 1000 }, column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        document.body.insertAdjacentHTML('afterbegin', '<section id="page-fft"></section>');

        const { initFftPage } = await import('./page');
        const dispose = await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });
        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(fetchFftMock).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(document.getElementById('fft-analysis-status')?.textContent).toBe('Spectrum updated.'));

        dispose();
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        await vi.waitFor(() => expect(fetchFftMock).toHaveBeenCalledTimes(2));
        expect(fetchFftMock.mock.calls[1][2]).toBe('value');
    });

    describe('remounting on the same DOM', () => {
        const spectrum = (column: string, frequency: number, magnitude: number) => ({
            sample_count: 64,
            results: [{
                column, frequencies: [frequency], magnitudes: [magnitude], psd: [magnitude * magnitude],
                sample_rate_hz: 100, nyquist_hz: 50,
                dominant_peaks: [{ frequency_hz: frequency, magnitude, power: magnitude * magnitude, rank: 1 }],
            }],
        });

        async function mount(columns: string[]) {
            workspace.commitDataset(workspace.beginDatasetSession(), {
                total_rows: 10, columns: [], numeric_columns: columns, time_column: 'ts',
                time_range: { min: 0, max: 1000 }, column_profiles: [],
            } as any, 0);
            workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
            const { initFftPage } = await import('./page');
            const dispose = await initFftPage({ workspace, renderTimeseries: vi.fn() });
            emitNavigationChange({ page: 'fft' });
            return { initFftPage, dispose };
        }

        async function computeAndWait(): Promise<void> {
            // The status text survives a remount; clear it so the wait below sees this run.
            document.getElementById('fft-analysis-status')!.textContent = '';
            (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
            await vi.waitFor(() => expect(document.getElementById('fft-analysis-status')?.textContent).toBe('Spectrum updated.'));
        }

        it('exports only the current instance result', async () => {
            fetchFftMock.mockImplementation(async (_s: string, _e: string, column: string) => spectrum(column, 1, 10));
            const { initFftPage, dispose } = await mount(['value']);
            await computeAndWait();
            dispose();

            fetchFftMock.mockImplementation(async (_s: string, _e: string, column: string) => spectrum(column, 2, 5));
            await initFftPage({ workspace, renderTimeseries: vi.fn() });
            emitNavigationChange({ page: 'fft' });
            await computeAndWait();
            const { exportTraceCSV } = await import('../../utils/chartExport.js');
            vi.mocked(exportTraceCSV).mockClear();

            (document.getElementById('fft-export-csv-btn') as HTMLButtonElement).click();

            expect(exportTraceCSV).toHaveBeenCalledTimes(1);
            expect(vi.mocked(exportTraceCSV).mock.calls[0]![0]).toEqual([{ column: 'value', xs: [2], ys: [5] }]);
        });

        it('keeps chip toggles controlling the active instance', async () => {
            fetchFftMock.mockImplementation(async (_s: string, _e: string, column: string) => spectrum(column, 1, 10));
            window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify(['value', 'temp']));
            const { initFftPage, dispose } = await mount(['value', 'temp']);
            dispose();

            await initFftPage({ workspace, renderTimeseries: vi.fn() });
            emitNavigationChange({ page: 'fft' });
            const tempChip = document.querySelector<HTMLElement>('.fft-trace-chip[data-col="temp"]')!;
            (tempChip.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
            fetchFftMock.mockClear();
            await computeAndWait();

            expect(fetchFftMock.mock.calls.map((call) => call[2])).toEqual(['value']);
        });

        it('copies the current instance summary, not a previous one', async () => {
            copyTextMock.mockResolvedValue(true);
            fetchFftMock.mockImplementation(async (_s: string, _e: string, column: string) => spectrum(column, 1, 10));
            const { initFftPage, dispose } = await mount(['value']);
            await computeAndWait();
            dispose();

            fetchFftMock.mockImplementation(async (_s: string, _e: string, column: string) => spectrum(column, 2, 5));
            await initFftPage({ workspace, renderTimeseries: vi.fn() });
            emitNavigationChange({ page: 'fft' });
            await computeAndWait();

            (document.getElementById('fft-copy-summary-btn') as HTMLButtonElement).click();
            await vi.waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));

            const text = String(copyTextMock.mock.calls[0]![0]);
            expect(text).toContain('Spectrum for value');
            expect(text).toMatch(/\b2(\.0+)? Hz\b/);
            expect(text).not.toMatch(/\b1(\.0+)? Hz\b/);
        });

        it('does not build a fallback chart when the WebGPU chart fails after disposal', async () => {
            let rejectInit: (error: Error) => void = () => {};
            fftChartInstance.init.mockImplementation(() => new Promise<undefined>((_resolve, reject) => { rejectInit = reject; }));
            const { dispose } = await mount(['value']);

            dispose();
            rejectInit(new Error('WebGPU unavailable'));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(echartsInitMock).not.toHaveBeenCalled();
        });
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

        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);
        });

        expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(true);

        buildDom();
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 8,
            columns: [],
            numeric_columns: ['value', 'temp'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);

        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        expect(document.querySelectorAll('.fft-trace-chip')).toHaveLength(2);
        await vi.waitFor(() => {
            expect((document.getElementById('fft-empty-state') as HTMLElement).hidden).toBe(false);
        });
    });

    it('falls back to ECharts when the WebGPU FFT chart cannot initialize', async () => {
        fftChartInstance.init.mockRejectedValueOnce(new Error('No WebGPU adapter found'));

        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(echartsInitMock).toHaveBeenCalledTimes(1);
    });

    it('enables clip method and param when fft outliers toggle is checked (input event)', async () => {
        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });
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
        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

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
        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

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

    it('clears the active Signals preview when filter type returns to Off', async () => {
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        const renderTimeseries = vi.fn();
        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries });
        emitNavigationChange({ page: 'fft' });
        setSpectralFilterPreview({
            column: 'value', ts: [0, 1], values: [1, 2], filterType: 'lowpass', highHz: 0.1,
        });
        const filterType = document.getElementById('fft-filter-type') as HTMLSelectElement;
        filterType.value = 'none';
        filterType.dispatchEvent(new Event('change', { bubbles: true }));

        expect(analyticsState.spectralFilterPreview).toBeNull();
        expect(document.getElementById('fft-filter-status')?.textContent).toBe('');
        expect(renderTimeseries).toHaveBeenCalled();
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

        const { primaryChart } = await import('../../charts/primaryChart.js');
        workspace.commitDataset(workspace.beginDatasetSession(), {
            total_rows: 10,
            columns: [],
            numeric_columns: ['value'],
            time_column: 'ts',
            time_range: { min: 0, max: 1000 },
            column_profiles: [],
        } as any, 0);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        window.localStorage.setItem('edatime_fft_selected_columns', JSON.stringify([]));

        const { initFftPage } = await import('./page');
        await initFftPage({ workspace, renderTimeseries: vi.fn() });
        emitNavigationChange({ page: 'fft' });

        (document.querySelector('.fft-trace-chip') as HTMLButtonElement).click();
        (document.getElementById('fft-compute-btn') as HTMLButtonElement).click();
        await vi.waitFor(() => {
            expect(fetchFftMock).toHaveBeenCalledTimes(1);
        });

        await vi.waitFor(() => {
            expect(document.getElementById('fft-spectral-info')?.hidden).toBe(false);
        });
        expect(document.getElementById('fft-spectral-info-rate')?.textContent).toBe('1 / 15.0 min');
        expect(document.getElementById('fft-spectral-info-nyquist')?.textContent).toBe('1 / 30.0 min');
        expect(document.querySelector('#fft-spectral-info-peaks table caption')?.textContent).toContain('current spectrum');
        expect(document.getElementById('fft-spectral-info-peaks')?.textContent).toContain('Trend');
        expect(document.getElementById('fft-spectral-info-peaks')?.textContent).toMatch(/min|hr|day/);
        const peakRow = document.querySelector<HTMLTableRowElement>('#fft-spectral-info-peaks tbody tr');
        expect(peakRow?.tabIndex).toBe(0);
        peakRow?.focus();
        expect(fftChartInstance.setFocusFrequency).toHaveBeenCalledWith(0.00028);
        expect(document.getElementById('fft-frequency-callout')?.textContent).toContain('value');
    });
});
