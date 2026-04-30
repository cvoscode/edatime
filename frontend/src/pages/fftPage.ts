import { appState } from '../state.js';
import { fetchFft } from '../dataClient.js';
import { FftChart, type FftTrace } from '../chart/FftChart.js';
import { createEmptyStateController } from '../ui/emptyState.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportTraceCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';
import { getAnalyticsChipColor, getNumericColumns } from './analyticsPageUtils.js';

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
        let chip = existing.get(column) as HTMLButtonElement | undefined;
        if (!chip) {
            chip = document.createElement('button');
            chip.className = 'series-chip fft-trace-chip';
            chip.type = 'button';
            chip.dataset.col = column;
            chip.addEventListener('click', async (event) => {
                const currentColumn = chip?.dataset.col || '';
                if ((event.target as HTMLElement)?.closest?.('.chip-color-picker')) return;
                if ((event.target as HTMLElement).classList.contains('fft-chip-remove')) {
                    fftTraces = fftTraces.filter((trace) => trace.column !== currentColumn);
                    renderChips();
                    rerenderOrClear();
                    if (statusEl) {
                        statusEl.textContent = fftTraces.length
                            ? fftTraces.map((trace) => trace.column).join(', ')
                            : 'Select a column chip to compute its FFT.';
                    }
                    return;
                }
                if (!currentColumn || fftTraces.some((trace) => trace.column === currentColumn)) return;
                const activeChip = chip;
                if (!activeChip) return;
                activeChip.classList.add('loading');
                activeChip.disabled = true;
                const loadingEl = document.getElementById('fft-chart-loading');
                if (loadingEl) loadingEl.hidden = false;
                if (statusEl) statusEl.textContent = `Computing FFT for ${currentColumn}…`;
                try {
                    await fetchAndAddTrace(currentColumn);
                    renderChips();
                    rerenderOrClear();
                    const bins = fftTraces.find((trace) => trace.column === currentColumn)?.frequencies.length ?? 0;
                    if (statusEl) statusEl.textContent = `${fftTraces.map((trace) => trace.column).join(', ')} · ${bins} bins`;
                } catch (error: any) {
                    if (statusEl) statusEl.textContent = `FFT failed for ${currentColumn}: ${error?.message || 'error'}`;
                } finally {
                    activeChip.classList.remove('loading');
                    activeChip.disabled = false;
                    if (loadingEl) loadingEl.hidden = true;
                }
            });
            bar.insertBefore(chip, zoomButton || null);
        }

        chip.className = `series-chip fft-trace-chip${isActive ? ' active' : ''}`;
        chip.style.setProperty('--chip-accent', color);
        chip.innerHTML = `<span class="chip-label">${column}</span>`
            + `<input type="color" class="chip-color-picker fft-chip-color-picker" value="${color}" aria-label="Set ${column} FFT color" title="Set ${column} FFT color">`
            + (isActive ? '<span class="fft-chip-remove" aria-hidden="true">×</span>' : '');

        const colorInput = chip.querySelector('.chip-color-picker') as HTMLInputElement | null;
        if (colorInput) {
            for (const eventName of ['pointerdown', 'mousedown', 'click', 'dblclick'] as const) {
                colorInput.addEventListener(eventName, (event) => event.stopPropagation());
            }
            colorInput.addEventListener('input', (event) => {
                const nextColor = (event.target as HTMLInputElement).value;
                fftTraceColors[column] = nextColor;
                chip?.style.setProperty('--chip-accent', nextColor);
                const trace = fftTraces.find((item) => item.column === column);
                if (trace) {
                    trace.color = nextColor;
                    rerenderOrClear();
                }
            });
        }
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
                appState.spectralFilterPreview = null;
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
            const response = await fetch(`/api/analytics/spectral-filter?${params.toString()}`);
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            appState.spectralFilterPreview = {
                column: data.column,
                ts: data.ts as number[],
                values: data.values as number[],
                filterType,
                lowHz: data.low_hz,
                highHz: data.high_hz,
            };
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