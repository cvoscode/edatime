import { appState } from '../store/appStateCompat.js';
import { fetchFft, fetchSpectralFilter } from '../services/api/index.js';
import { FftChart, type FftTrace } from '../chart/FftChart.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportTraceCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';
import { getAnalyticsChipColor, getNumericColumns } from './analyticsPageUtils.js';
import { setSpectralFilterPreview } from '../store/index.js';
import { renderSeriesChipList } from '../ui/index.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';

interface FftPageDeps {
    renderTimeseries: () => void;
}

let fftTraces: FftTrace[] = [];
let fftMode = 'magnitude';
let fftLogScale = true;
let fftChart: FftChart | null = null;
const fftTraceColors: Record<string, string> = {};
let fftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let fftPageCleanup: (() => void) | null = null;

function resetFftPageState(): void {
    fftPageCleanup?.();
    fftPageCleanup = null;
    fftTraces = [];
    fftMode = 'magnitude';
    fftLogScale = true;
    fftChart = null;
    fftRuntime = null;
    for (const key of Object.keys(fftTraceColors)) delete fftTraceColors[key];
}

export function __resetFftPageForTests(): void {
    resetFftPageState();
}

function fftColumns(): string[] {
    return getNumericColumns(appState.metadata);
}

function fftColorFor(column: string, fallbackIndex: number): string {
    return getAnalyticsChipColor(column, fallbackIndex, fftTraceColors);
}

function updateZoomButton(isZoomed?: boolean): void {
    const button = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;
    if (button) button.hidden = !(isZoomed ?? fftChart?.getIsZoomed() ?? false);
}

function syncFftEmptyState(): void {
    const visible = fftTraces.length === 0;
    const reason = visible ? 'no-columns-selected' : '';
    const model = {
        visible,
        reason,
        title: '',
        message: '',
    };

    fftRuntime?.updateEmptyState(model);

    const root = document.getElementById('fft-empty-state') as HTMLElement | null;
    if (!root) return;
    root.hidden = !visible;
    root.setAttribute('data-empty-reason', reason);
}

function rerenderOrClear(): void {
    syncFftEmptyState();
    if (!fftChart) return;
    if (fftTraces.length === 0) {
        fftChart.clear();
        return;
    }
    fftChart.updateData(fftTraces, fftMode, fftLogScale);
}

async function fetchAndAddTrace(column: string): Promise<void> {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    const startMs = appState.currentStart;
    const endMs = appState.currentEnd;
    if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();
    const response = await fetchFft(startIso, endIso, column);
    if (!response?.results?.length) throw new Error('No results');
    const result = response.results[0];
    fftTraces = fftTraces.filter((trace) => trace.column !== column);
    fftTraces.push({
        column: result.column,
        frequencies: result.frequencies,
        magnitudes: result.magnitudes,
        psd: result.psd,
        color: fftColorFor(column, fftColumns().indexOf(column)),
    });
}

function renderChips(): void {
    const bar = document.getElementById('fft-traces-bar');
    if (!bar || !appState.metadata) return;
    const columns = fftColumns();

    renderSeriesChipList({
        container: bar,
        items: columns.map((column, index) => {
            const isActive = fftTraces.some((trace) => trace.column === column);
            const color = fftColorFor(column, index);
            return {
                column,
                label: column,
                checked: isActive,
                color,
                onToggle: async (checked) => {
                    if (checked) {
                        if (fftTraces.some((trace) => trace.column === column)) return;
                        const activeChip = bar.querySelector(`[data-col="${column}"]`) as HTMLElement | null;
                        if (!activeChip) return;
                        activeChip.classList.add('loading');
                        activeChip.classList.add('fft-trace-chip');
                        activeChip.setAttribute('aria-disabled', 'true');
                        const loadingEl = document.getElementById('fft-chart-loading');
                        if (loadingEl) loadingEl.hidden = false;
                        fftRuntime?.updateStatus(`Computing FFT for ${column}…`);
                        try {
                            await fetchAndAddTrace(column);
                            renderChips();
                            rerenderOrClear();
                            const bins = fftTraces.find((trace) => trace.column === column)?.frequencies.length ?? 0;
                            fftRuntime?.updateStatus(`${fftTraces.map((trace) => trace.column).join(', ')} · ${bins} bins`);
                        } catch (error: any) {
                            fftRuntime?.updateStatus(`FFT failed for ${column}: ${error?.message || 'error'}`);
                        } finally {
                            activeChip.classList.remove('loading');
                            activeChip.removeAttribute('aria-disabled');
                            if (loadingEl) loadingEl.hidden = true;
                        }
                    } else {
                        fftTraces = fftTraces.filter((trace) => trace.column !== column);
                        renderChips();
                        rerenderOrClear();
                        fftRuntime?.updateStatus(
                            fftTraces.length
                                ? fftTraces.map((trace) => trace.column).join(', ')
                                : 'Select a column chip to compute its FFT.',
                        );
                    }
                },
                onColorInput: (nextColor) => {
                    fftTraceColors[column] = nextColor;
                },
            };
        }),
        chipClass: 'fft-trace-chip',
        preserveExisting: true,
        postChipAttributes: { role: 'button', tabIndex: '0' },
        onColorUpdate: (column, color) => {
            const trace = fftTraces.find((item) => item.column === column);
            if (trace) {
                trace.color = color;
                rerenderOrClear();
            }
        },
    });

    bar.hidden = columns.length === 0;
}

export async function initFftPage(deps: FftPageDeps): Promise<void> {
    resetFftPageState();

    const modeSelect = document.getElementById('fft-mode-select') as HTMLSelectElement | null;
    const logCheck = document.getElementById('fft-log-scale') as HTMLInputElement | null;
    const zoomResetBtn = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;

    fftRuntime = createAnalysisPageRuntime({
        page: 'fft',
        emptyStateRootId: 'fft-empty-state',
        statusElId: 'fft-status',
        bindExportsOnInit: false,
        exportConfig: {
            key: 'fft',
            png: { fn: exportContainerCanvasPNG, filename: 'edatime_fft.png' },
            svg: { fn: exportContainerCanvasSVG, filename: 'edatime_fft.svg' },
            html: { fn: exportContainerCanvasHTML, filename: 'edatime_fft.html' },
            csv: {
                fn: (filename) => {
                    const csvTraces = fftTraces.map((trace) => ({
                        column: trace.column,
                        xs: trace.frequencies,
                        ys: fftMode === 'psd' ? trace.psd : trace.magnitudes,
                    }));
                    exportTraceCSV(csvTraces, 'frequency_hz', filename);
                },
                filename: `edatime_fft_${fftMode}.csv`,
                dataCheck: () => fftTraces.length > 0,
            },
        },
        init() {
            // one-time setup
            fftChart = new FftChart('fft-chart');
            void fftChart.init().then(() => {
                fftChart!.onZoomChange = (isZoomed: boolean) => updateZoomButton(isZoomed);
            });

            modeSelect?.addEventListener('change', () => {
                fftMode = modeSelect.value;
                rerenderOrClear();
            });
            logCheck?.addEventListener('change', () => {
                fftLogScale = logCheck.checked;
                rerenderOrClear();
            });
            zoomResetBtn?.addEventListener('click', () => fftChart?.resetView());

            document.getElementById('fft-filter-apply-btn')?.addEventListener('click', async () => {
                const filterType = (document.getElementById('fft-filter-type') as HTMLSelectElement)?.value;
                if (!filterType || filterType === 'none') {
                    if (appState.spectralFilterPreview) {
                        setSpectralFilterPreview(null);
                        appState.chart?.requestOverlayRender?.();
                        deps.renderTimeseries();
                    }
                    return;
                }

                const column = fftTraces[0]?.column || appState.selectedCols[0];
                if (!column) {
                    toast('Select a column chip below first.', 'warning');
                    return;
                }

                const statusEl = document.getElementById('fft-filter-status') as HTMLElement | null;
                const lowHz = parseFloat((document.getElementById('fft-filter-low-hz') as HTMLInputElement)?.value) || undefined;
                const highHz = parseFloat((document.getElementById('fft-filter-high-hz') as HTMLInputElement)?.value) || undefined;

                if (statusEl) statusEl.textContent = 'Computing…';
                try {
                    const start = appState.currentStart;
                    const end = appState.currentEnd;
                    if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) {
                        throw new Error('No range selected');
                    }
                    const params = new URLSearchParams({
                        start: new Date(start).toISOString(),
                        end: new Date(end).toISOString(),
                        column,
                        filter_type: filterType,
                        ...(lowHz !== undefined ? { low_hz: String(lowHz) } : {}),
                        ...(highHz !== undefined ? { high_hz: String(highHz) } : {}),
                    });
                    const data = await fetchSpectralFilter(params);
                    setSpectralFilterPreview({
                        column: data.column,
                        ts: data.ts as number[],
                        values: data.values as number[],
                        filterType,
                        lowHz: data.low_hz,
                        highHz: data.high_hz,
                    });
                    if (statusEl) statusEl.textContent = `${filterType} preview active`;
                    toast(`Spectral filter preview: ${filterType} applied to "${column}". Switch to Timeseries to view.`, 'success');
                    deps.renderTimeseries();
                } catch (error) {
                    if (statusEl) statusEl.textContent = 'Error';
                    toast(`Spectral filter failed: ${String(error)}`, 'error');
                }
            });

            const filterTypeSelect = document.getElementById('fft-filter-type') as HTMLSelectElement | null;
            filterTypeSelect?.addEventListener('change', () => {
                const filterType = filterTypeSelect.value;
                const lowEl = document.getElementById('fft-filter-low-hz') as HTMLInputElement | null;
                const highEl = document.getElementById('fft-filter-high-hz') as HTMLInputElement | null;
                if (lowEl) lowEl.disabled = filterType === 'none' || filterType === 'lowpass';
                if (highEl) highEl.disabled = filterType === 'none' || filterType === 'highpass';
            });

            rerenderOrClear();

            // Deferred export binding so csv dataCheck captures the current fftTraces
            // reference rather than a stale closure from mount time.
            fftRuntime?.bindExports();
        },
        onEveryPageChange() {
            // Re-render chips on every page change (fft needs to reflect selected columns from any page)
            if (appState.metadata) renderChips();
        },
    });

    fftPageCleanup = fftRuntime.mount();
}
