import { appState } from '../state.js';
import { fetchFft, fetchSpectralFilter } from '../services/api/index.js';
import { FftChart, type FftTrace } from '../chart/FftChart.js';
import { createEmptyStateController } from '../ui/emptyState.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportTraceCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';
import { getAnalyticsChipColor, getNumericColumns } from './analyticsPageUtils.js';
import { setSpectralFilterPreview } from '../store/index.js';
import { SeriesChip } from '../components/molecules/SeriesChip.js';

interface FftPageDeps {
    renderTimeseries: () => void;
}

let initialized = false;
let fftTraces: FftTrace[] = [];
let fftMode = 'magnitude';
let fftLogScale = true;
let fftChart: FftChart | null = null;
const fftTraceColors: Record<string, string> = {};
let fftEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

function getFftEmptyStateController() {
    if (!fftEmptyStateController) {
        fftEmptyStateController = createEmptyStateController({ rootId: 'fft-empty-state' });
    }
    return fftEmptyStateController;
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

function rerenderOrClear(): void {
    getFftEmptyStateController().update({
        visible: fftTraces.length === 0,
        reason: fftTraces.length > 0 ? '' : 'no-columns-selected',
        title: '',
        message: '',
    });
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
    const statusEl = document.getElementById('fft-status') as HTMLElement | null;
    if (!bar || !appState.metadata) return;
    const columns = fftColumns();

    const existing = new Map<string, HTMLElement>();
    for (const element of bar.querySelectorAll<HTMLElement>('.fft-trace-chip')) {
        const column = element.dataset.col as string;
        if (columns.includes(column)) existing.set(column, element);
        else element.remove();
    }

    const zoomButton = bar.querySelector('#fft-zoom-reset-btn');
    for (const [index, column] of columns.entries()) {
        const isActive = fftTraces.some((trace) => trace.column === column);
        const color = fftColorFor(column, index);
        let chip = existing.get(column);
        if (!chip) {
            chip = SeriesChip({
                column,
                checked: isActive,
                color,
                label: column,
                onToggle: async (checked) => {
                    if (chip?.classList.contains('loading')) return;
                    if (checked) {
                        if (fftTraces.some((trace) => trace.column === column)) return;
                        const activeChip = chip;
                        if (!activeChip) return;
                        activeChip.classList.add('loading');
                        activeChip.classList.add('fft-trace-chip');
                        activeChip.setAttribute('aria-disabled', 'true');
                        const loadingEl = document.getElementById('fft-chart-loading');
                        if (loadingEl) loadingEl.hidden = false;
                        if (statusEl) statusEl.textContent = `Computing FFT for ${column}…`;
                        try {
                            await fetchAndAddTrace(column);
                            renderChips();
                            rerenderOrClear();
                            const bins = fftTraces.find((trace) => trace.column === column)?.frequencies.length ?? 0;
                            if (statusEl) statusEl.textContent = `${fftTraces.map((trace) => trace.column).join(', ')} · ${bins} bins`;
                        } catch (error: any) {
                            if (statusEl) statusEl.textContent = `FFT failed for ${column}: ${error?.message || 'error'}`;
                        } finally {
                            activeChip.classList.remove('loading');
                            activeChip.removeAttribute('aria-disabled');
                            if (loadingEl) loadingEl.hidden = true;
                        }
                    } else {
                        fftTraces = fftTraces.filter((trace) => trace.column !== column);
                        renderChips();
                        rerenderOrClear();
                        if (statusEl) {
                            statusEl.textContent = fftTraces.length
                                ? fftTraces.map((trace) => trace.column).join(', ')
                                : 'Select a column chip to compute its FFT.';
                        }
                    }
                },
                onColorInput: (nextColor) => {
                    fftTraceColors[column] = nextColor;
                    chip?.style.setProperty('--chip-accent', nextColor);
                    const trace = fftTraces.find((item) => item.column === column);
                    if (trace) {
                        trace.color = nextColor;
                        rerenderOrClear();
                    }
                },
            });
            (chip as HTMLElement).classList.add('fft-trace-chip');
            (chip as HTMLElement).setAttribute('role', 'button');
            (chip as HTMLElement).tabIndex = 0;
            (chip as HTMLElement).dataset.col = column;
            chip.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const checkbox = chip.querySelector('input[type="checkbox"]') as HTMLInputElement;
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });
            bar.insertBefore(chip, zoomButton || null);
        }

        chip.className = `series-chip fft-trace-chip${isActive ? ' active' : ''}`;
        chip.style.setProperty('--chip-accent', color);
        const checkbox = chip.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (checkbox) checkbox.checked = isActive;
    }

    bar.hidden = columns.length === 0;
}

export async function initFftPage(deps: FftPageDeps): Promise<void> {
    if (initialized) return;
    initialized = true;

    const modeSelect = document.getElementById('fft-mode-select') as HTMLSelectElement | null;
    const logCheck = document.getElementById('fft-log-scale') as HTMLInputElement | null;
    const zoomResetBtn = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;

    fftChart = new FftChart('fft-chart');
    await fftChart.init();
    fftChart.onZoomChange = (isZoomed: boolean) => updateZoomButton(isZoomed);

    const populateChips = () => { if (appState.metadata) renderChips(); };
    populateChips();
    window.addEventListener('edatime:page-change', populateChips);

    modeSelect?.addEventListener('change', () => {
        fftMode = modeSelect.value;
        rerenderOrClear();
    });
    logCheck?.addEventListener('change', () => {
        fftLogScale = logCheck.checked;
        rerenderOrClear();
    });
    zoomResetBtn?.addEventListener('click', () => fftChart?.resetView());

    document.getElementById('fft-export-png-btn')?.addEventListener('click', () => {
        exportContainerCanvasPNG('fft-chart', 'edatime_fft.png');
    });
    document.getElementById('fft-export-svg-btn')?.addEventListener('click', () => {
        exportContainerCanvasSVG('fft-chart', 'edatime_fft.svg');
    });
    document.getElementById('fft-export-html-btn')?.addEventListener('click', () => {
        exportContainerCanvasHTML('fft-chart', 'edatime_fft.html');
    });
    document.getElementById('fft-export-csv-btn')?.addEventListener('click', () => {
        if (fftTraces.length === 0) {
            toast('No FFT data to export.', 'warning');
            return;
        }
        const csvTraces = fftTraces.map((trace) => ({
            column: trace.column,
            xs: trace.frequencies,
            ys: fftMode === 'psd' ? trace.psd : trace.magnitudes,
        }));
        exportTraceCSV(csvTraces, 'frequency_hz', `edatime_fft_${fftMode}.csv`);
    });

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
}
