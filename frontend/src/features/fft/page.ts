import { fetchFft, fetchSpectralFilter } from '../../services/api/index.js';
import { FftChart, type FftTrace } from '../../chart/FftChart.js';
import { EchartsLineChart } from '../../chart/EchartsLineChart.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportTraceCSV } from '../../utils/chartExport.js';
import { toast } from '../../utils/toast.js';
import { getAnalyticsChipColor, getNumericColumns } from '../../platform/analyticsColumns.js';
import { analyticsState, setSpectralFilterPreview } from '../../store/analyticsState.js';
import { chartState } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import { uiState } from '../../store/uiState.js';
import { renderSeriesChipList } from '../../ui/index.js';
import { getDropdownValue, setDropdownDisabled } from '../../ui/primitives/Dropdown.js';
import { setSeriesColor } from '../../utils/seriesColors.js';
import {
    DEFAULT_SPECTRAL_SCALE,
    type SpectralScaleOptions,
} from '../../utils/spectralScaling.js';
import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { initFftHelp } from './help.js';
import { buildFftFilterCutoffState, buildFftScaleOptions } from './fftControls.js';
import { buildFftSpectralInfo } from './fftSpectralInfo.js';
import { buildFftFilterRequest } from './fftFilterRequest.js';
import { buildFftTrace, resolveFftViewport } from './fftTraceModel.js';
import { fetchFftPointBudget } from './fftBudget.js';
import type { AnalysisSampling } from '../../contracts/api/v1/analytics.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import './fft.css';

interface FftPageDeps {
    renderTimeseries: () => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

const FFT_SELECTION_STORAGE_KEY = 'edatime_fft_selected_columns';

let fftTraces: FftTrace[] = [];
let fftSelectedColumns: string[] = [];
let fftSamplingByColumn: Record<string, AnalysisSampling> = {};
let fftComputing = false;
let fftComputeError = '';
let fftMode = 'magnitude';
let fftLogScale = true;
let fftScaleOptions: SpectralScaleOptions = { ...DEFAULT_SPECTRAL_SCALE };
let fftChart: FftChart | EchartsLineChart | null = null;
let fftChartReady: Promise<void> | null = null;
const fftTraceColors: Record<string, string> = {};
let fftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let fftPageCleanup: (() => void) | null = null;
let fftControlAbort: AbortController | null = null;
let fftInitialSelectionSeeded = false;
let workspace: Pick<WorkspaceStore, 'getSnapshot'> | null = null;

function setFieldHidden(fieldOrControl: HTMLElement | null, hidden: boolean): void {
    if (!fieldOrControl) return;
    const field = fieldOrControl.closest('label, .toolbar-field') as HTMLElement | null;
    (field ?? fieldOrControl).hidden = hidden;
}

function resetFftPageState(): void {
    fftPageCleanup?.();
    fftPageCleanup = null;
    fftControlAbort?.abort();
    fftControlAbort = null;
    fftTraces = [];
    fftSelectedColumns = [];
    fftSamplingByColumn = {};
    fftComputing = false;
    fftComputeError = '';
    fftMode = 'magnitude';
    fftLogScale = true;
    fftScaleOptions = { ...DEFAULT_SPECTRAL_SCALE };
    fftChart = null;
    fftChartReady = null;
    fftRuntime = null;
    fftInitialSelectionSeeded = false;
    workspace = null;
    for (const key of Object.keys(fftTraceColors)) delete fftTraceColors[key];
}

export function __resetFftPageForTests(): void {
    resetFftPageState();
}

/** Release the current FFT feature instance and its page-owned resources. */
export function disposeFftPage(): void {
    resetFftPageState();
}

function fftColumns(): string[] {
    return getNumericColumns(workspace?.getSnapshot().dataset.metadata ?? datasetState.metadata);
}

function fftColorFor(column: string): string {
    return getAnalyticsChipColor(column, fftTraceColors);
}

function loadStoredFftSelection(): string[] | null {
    try {
        const raw = window.localStorage.getItem(FFT_SELECTION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.map((value) => String(value)).filter(Boolean);
    } catch {
        return null;
    }
}

function persistFftSelection(): void {
    try {
        window.localStorage.setItem(
            FFT_SELECTION_STORAGE_KEY,
            JSON.stringify(fftSelectedColumns),
        );
    } catch {
        // Ignore storage failures; the current in-memory selection still works.
    }
}

function updateZoomButton(isZoomed?: boolean): void {
    const zoomed = isZoomed ?? fftChart?.getIsZoomed() ?? false;
    const button = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;
    if (button) button.hidden = !zoomed;
    const segment = document.getElementById('fft-zoom-segment') as HTMLElement | null;
    if (segment) segment.hidden = !zoomed;
}

function syncFftEmptyState(): void {
    const visible = fftTraces.length === 0 && !fftComputing;
    const reason = visible
        ? (fftComputeError ? 'compute-failed' : fftSelectedColumns.length > 0 ? 'ready-to-compute' : 'no-columns-selected')
        : '';
    const model = {
        visible,
        reason,
        title: fftComputeError
            ? 'Spectrum could not be computed'
            : fftSelectedColumns.length > 0 ? 'Ready to compute' : 'Select one or more traces',
        message: fftComputeError
            || (fftSelectedColumns.length > 0
                ? `Compute the spectrum for ${fftSelectedColumns.length} selected trace${fftSelectedColumns.length === 1 ? '' : 's'}.`
                : 'Choose traces above, then compute their frequency spectrum.'),
    };

    fftRuntime?.updateEmptyState(model);
    syncFftActions();
    syncFftSamplingBadge();
}

function syncFftActions(): void {
    const disabled = fftSelectedColumns.length === 0 || fftComputing;
    for (const id of ['fft-compute-btn', 'fft-empty-compute-btn']) {
        const button = document.getElementById(id) as HTMLButtonElement | null;
        if (!button) continue;
        button.disabled = disabled;
        button.textContent = fftComputing ? 'Computing…' : 'Compute spectrum';
    }
}

function syncFftSamplingBadge(): void {
    const badge = document.getElementById('fft-sampling-badge');
    if (!badge) return;
    const sampling = fftSelectedColumns
        .map((column) => fftSamplingByColumn[column])
        .find((entry) => entry && entry.input_points > entry.output_points);
    if (!sampling) {
        badge.hidden = true;
        badge.textContent = '';
        return;
    }
    badge.hidden = false;
    badge.textContent = `Downsampled to ${sampling.output_points.toLocaleString()} of ${sampling.input_points.toLocaleString()} points`;
}

function rerenderOrClear(): void {
    syncFftEmptyState();
    syncFftSpectralInfo();
    // Safety net: keep the disabled state of the clip fields consistent
    // with the current toggle value. Use setDropdownDisabled for the
    // method since it may have been upgraded to a custom dropdown.
    const clipToggle = document.getElementById('fft-clip-toggle') as HTMLInputElement | null;
    const clipParam = document.getElementById('fft-clip-param') as HTMLInputElement | null;
    if (clipToggle) {
        const enabled = clipToggle.checked;
        const hint = enabled
            ? ''
            : "Enable the 'Outliers' toggle above to change the clip method";
        setDropdownDisabled('fft-clip-method', !enabled);
        const clipMethod = document.getElementById('fft-clip-method');
        if (clipMethod) clipMethod.title = hint;
        if (clipParam) {
            clipParam.disabled = !enabled;
            clipParam.title = hint;
        }
        setFieldHidden(clipMethod as HTMLElement | null, !enabled);
        setFieldHidden(clipParam, !enabled);
    }
    if (!fftChart) return;
    if (fftTraces.length === 0) {
        fftChart.clear();
        return;
    }
    fftChart.updateData(fftTraces, fftMode, fftLogScale, fftScaleOptions);
}

/**
 * Reflect the backend's spectral metadata (sample rate, nyquist, top
 * peaks) into the small live-region panel below the chart. This gives
 * data scientists an immediate way to identify daily / weekly / monthly
 * cycles in 15-min datasets where the X-axis is otherwise too narrow —
 * see `usage_issue.md` §4.1.
 */
function syncFftSpectralInfo(): void {
    const wrap = document.getElementById('fft-spectral-info');
    const rateEl = document.getElementById('fft-spectral-info-rate');
    const nyquistEl = document.getElementById('fft-spectral-info-nyquist');
    const peaksEl = document.getElementById('fft-spectral-info-peaks');
    if (!wrap || !rateEl || !nyquistEl || !peaksEl) return;
    const info = buildFftSpectralInfo(fftTraces);
    if (!info.visible) {
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    rateEl.textContent = info.sampleRate.text;
    nyquistEl.textContent = info.nyquist.text;
    rateEl.title = info.sampleRate.title;
    nyquistEl.title = info.nyquist.title;
    if (info.peaks.length === 0) {
        peaksEl.textContent = '—';
        peaksEl.removeAttribute('title');
        return;
    }
    const fragment = document.createDocumentFragment();
    peaksEl.replaceChildren();
    peaksEl.classList.add('fft-spectral-info__peak-table');
    info.peaks.forEach((peak) => {
        const row = document.createElement('span');
        row.className = 'fft-spectral-info__peak-row';

        const cells = [peak.rank, peak.frequency, peak.period, peak.power];
        cells.forEach((cellText, cellIndex) => {
            const cell = document.createElement('span');
            cell.className = `fft-spectral-info__peak-cell fft-spectral-info__peak-cell--${cellIndex}`;
            cell.textContent = cellText;
            row.appendChild(cell);
        });
        fragment.appendChild(row);
    });
    peaksEl.appendChild(fragment);
    peaksEl.title = info.peaks
        .map((peak) => peak.title)
        .join('\n');
}

async function ensureFftChartReady(): Promise<void> {
    if (!fftChartReady) {
        fftChartReady = (async () => {
            const primaryChart = new FftChart('fft-chart');
            fftChart = primaryChart;
            try {
                await primaryChart.init();
                primaryChart.onZoomChange = (isZoomed: boolean) => updateZoomButton(isZoomed);
            } catch (error) {
                console.warn('FFT WebGPU renderer unavailable, switching to ECharts fallback:', error);
                const fallbackChart = new EchartsLineChart('fft-chart');
                await fallbackChart.init();
                fallbackChart.onZoomChange = (isZoomed: boolean) => updateZoomButton(isZoomed);
                fftChart = fallbackChart;
            }
        })();
    }
    await fftChartReady;
}

function getFftViewport(): { startMs: number; endMs: number } | null {
    const timeRange = workspace?.getSnapshot().dataset.metadata?.time_range
        ?? datasetState.metadata?.time_range;
    return resolveFftViewport(
        workspace?.getSnapshot().viewport,
        Number(timeRange?.min),
        Number(timeRange?.max),
    );
}

async function fetchFftTrace(
    column: string,
    maxPoints: number,
    signal?: AbortSignal,
): Promise<{ trace: FftTrace; sampling?: AnalysisSampling }> {
    const viewport = getFftViewport();
    if (!viewport) throw new Error('No time range selected');
    const response = await fetchFft(
        new Date(viewport.startMs).toISOString(),
        new Date(viewport.endMs).toISOString(),
        column,
        maxPoints,
        { signal },
    );
    if (!response?.results?.length) throw new Error('No results');
    const trace = buildFftTrace(response.results[0], fftColorFor(column));
    if (!trace) throw new Error('Malformed result');
    return { trace, sampling: response.sampling };
}

function seedInitialFftSelection(): void {
    if (fftInitialSelectionSeeded || fftSelectedColumns.length > 0) return;
    const columns = fftColumns();
    if (columns.length === 0) {
        fftInitialSelectionSeeded = true;
        return;
    }
    const stored = loadStoredFftSelection();
    const targetColumns = (stored ?? columns.slice(0, 2))
        .filter((column, index, list) => columns.includes(column) && list.indexOf(column) === index);
    fftInitialSelectionSeeded = true;
    fftSelectedColumns = targetColumns;
    persistFftSelection();
}

async function computeSelectedFft(signal?: AbortSignal): Promise<void> {
    if (fftComputing || fftSelectedColumns.length === 0) return;
    const requestedColumns = [...fftSelectedColumns];
    fftComputing = true;
    fftComputeError = '';
    const loadingEl = document.getElementById('fft-chart-loading');
    if (loadingEl) loadingEl.hidden = false;
    renderChips();
    document.querySelectorAll<HTMLElement>('#fft-traces-bar .fft-trace-chip.active').forEach((chip) => {
        chip.classList.add('loading');
        chip.setAttribute('aria-disabled', 'true');
    });
    syncFftEmptyState();

    try {
        const maxPoints = await fetchFftPointBudget(signal);
        const settled = await Promise.allSettled(
            requestedColumns.map((column) => fetchFftTrace(column, maxPoints, signal)),
        );
        const nextTraces: FftTrace[] = [];
        const nextSampling: Record<string, AnalysisSampling> = {};
        const failures: string[] = [];
        settled.forEach((result, index) => {
            const column = requestedColumns[index];
            if (result.status === 'fulfilled') {
                nextTraces.push(result.value.trace);
                if (result.value.sampling) nextSampling[column] = result.value.sampling;
            } else {
                failures.push(column);
            }
        });

        if (nextTraces.length === 0) {
            const firstFailure = settled.find((result) => result.status === 'rejected');
            const detail = firstFailure?.status === 'rejected'
                ? (firstFailure.reason instanceof Error ? firstFailure.reason.message : String(firstFailure.reason))
                : 'No results';
            fftComputeError = detail;
            toast(`FFT failed: ${detail}`, 'error');
            return;
        }

        fftTraces = nextTraces;
        fftSamplingByColumn = nextSampling;
        await ensureFftChartReady();
        if (failures.length > 0) {
            toast(`FFT skipped ${failures.length} trace${failures.length === 1 ? '' : 's'}: ${failures.join(', ')}`, 'warning');
        }
    } catch (error) {
        if (signal?.aborted) return;
        const detail = error instanceof Error ? error.message : String(error);
        fftComputeError = detail;
        toast(`FFT failed: ${detail}`, 'error');
    } finally {
        fftComputing = false;
        if (loadingEl) loadingEl.hidden = true;
        document.querySelectorAll<HTMLElement>('#fft-traces-bar .fft-trace-chip.loading').forEach((chip) => {
            chip.classList.remove('loading');
            chip.removeAttribute('aria-disabled');
        });
        renderChips();
        rerenderOrClear();
    }
}

function renderChips(): void {
    const bar = document.getElementById('fft-traces-bar');
    if (!bar) return;
    const columns = fftColumns();

    renderSeriesChipList({
        container: bar,
        items: columns.map((column) => {
            const isActive = fftSelectedColumns.includes(column);
            const color = fftColorFor(column);
            return {
                column,
                label: column,
                checked: isActive,
                disabled: fftComputing,
                color,
                onToggle: (checked) => {
                    if (checked) {
                        if (!fftSelectedColumns.includes(column)) fftSelectedColumns.push(column);
                    } else {
                        fftSelectedColumns = fftSelectedColumns.filter((selected) => selected !== column);
                        fftTraces = fftTraces.filter((trace) => trace.column !== column);
                        delete fftSamplingByColumn[column];
                    }
                    fftComputeError = '';
                    persistFftSelection();
                    renderChips();
                    rerenderOrClear();
                },
                onColorInput: (nextColor) => {
                    fftTraceColors[column] = nextColor;
                    // Mirror the override into the shared series-colors
                    // store so the timeseries / scatter / spectrogram pages
                    // stay in sync with the color picked on the FFT page.
                    setSeriesColor(column, nextColor);
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

export async function initFftPage(deps: FftPageDeps): Promise<() => void> {
    resetFftPageState();
    workspace = deps.workspace ?? null;

    const modeSelect = document.getElementById('fft-mode-select') as HTMLElement | null;
    const logCheck = document.getElementById('fft-log-scale') as HTMLInputElement | null;
    const normalizeSelect = document.getElementById('fft-normalize') as HTMLSelectElement | null;
    const clipToggle = document.getElementById('fft-clip-toggle') as HTMLInputElement | null;
    const clipMethod = document.getElementById('fft-clip-method') as HTMLSelectElement | null;
    const clipParam = document.getElementById('fft-clip-param') as HTMLInputElement | null;
    const clipParamLabel = document.getElementById('fft-clip-param-label') as HTMLElement | null;
    const zoomResetBtn = document.getElementById('fft-zoom-reset-btn') as HTMLButtonElement | null;

    fftRuntime = createAnalysisPageRuntime({
        page: 'fft',
        emptyStateRootId: 'fft-empty-state',
        emptyStateTitleId: 'fft-empty-title',
        emptyStateMessageId: 'fft-empty-message',
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
            fftControlAbort?.abort();
            const controlAbort = new AbortController();
            fftControlAbort = controlAbort;
            const listenerOptions = { signal: controlAbort.signal };
            // one-time setup
            void ensureFftChartReady();
            // Page-level "?" help button. Idempotent so safe to call
            // on every page init.
            controlAbort.signal.addEventListener('abort', initFftHelp(), { once: true });

            const runCompute = () => void computeSelectedFft(controlAbort.signal);
            document.getElementById('fft-compute-btn')?.addEventListener('click', runCompute, listenerOptions);
            document.getElementById('fft-empty-compute-btn')?.addEventListener('click', runCompute, listenerOptions);

            modeSelect?.addEventListener('change', () => {
                fftMode = getDropdownValue('fft-mode-select') || 'magnitude';
                rerenderOrClear();
            }, listenerOptions);
            logCheck?.addEventListener('change', () => {
                fftLogScale = logCheck.checked;
                rerenderOrClear();
            }, listenerOptions);

            const readScaleOptions = (): SpectralScaleOptions => buildFftScaleOptions({
                mode: getDropdownValue('fft-normalize'),
                clipEnabled: clipToggle?.checked ?? false,
                clipMethod: getDropdownValue('fft-clip-method'),
                clipParam: clipParam?.value,
            });
            normalizeSelect?.addEventListener('change', () => {
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            }, listenerOptions);
            // Re-query by id every time we sync, because upgradeSelects()
            // at app startup replaces native <select> elements with custom
            // dropdown <div>s, detaching the closure-captured references.
            const syncClipEnabled = () => {
                const enabled = clipToggle?.checked ?? false;
                const liveClipMethod = document.getElementById('fft-clip-method');
                const liveClipParam = document.getElementById('fft-clip-param') as HTMLInputElement | null;
                const hint = enabled
                    ? ''
                    : "Enable the 'Outliers' toggle above to change the clip method";
                setDropdownDisabled('fft-clip-method', !enabled);
                if (liveClipMethod) liveClipMethod.title = hint;
                if (liveClipParam) {
                    liveClipParam.disabled = !enabled;
                    liveClipParam.title = hint;
                }
                setFieldHidden(liveClipMethod as HTMLElement | null, !enabled);
                setFieldHidden(liveClipParam, !enabled);
            };
            const syncClipParamLabel = () => {
                if (!clipParamLabel) return;
                const method = getDropdownValue('fft-clip-method') || 'percentile';
                clipParamLabel.textContent = method === 'iqr' ? 'Clip k' : 'Clip %';
            };
            // Listen to BOTH input and change so that label-driven toggles,
            // programmatic flips, and any browser quirk (e.g. an old cached
            // bundle) all update the disabled state immediately.
            const onClipToggleChange = () => {
                syncClipEnabled();
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            };
            clipToggle?.addEventListener('change', onClipToggleChange, listenerOptions);
            clipToggle?.addEventListener('input', onClipToggleChange, listenerOptions);
            // The custom dropdown forwards a bubbling `change` from its
            // root (see dispatchDropdownChange in Dropdown.ts), so listen
            // on the live element rather than the detached <select>.
            const liveClipMethodRoot = document.getElementById('fft-clip-method');
            liveClipMethodRoot?.addEventListener('change', () => {
                syncClipParamLabel();
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            }, listenerOptions);
            const liveClipParamEl = document.getElementById('fft-clip-param');
            liveClipParamEl?.addEventListener('change', () => {
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            }, listenerOptions);
            syncClipEnabled();
            syncClipParamLabel();

            zoomResetBtn?.addEventListener('click', () => fftChart?.resetView(), listenerOptions);

            document.getElementById('fft-filter-apply-btn')?.addEventListener('click', async () => {
                const filterType = getDropdownValue('fft-filter-type');
                if (!filterType || filterType === 'none') {
                    if (analyticsState.spectralFilterPreview) {
                        setSpectralFilterPreview(null);
                        chartState.chart?.requestOverlayRender?.();
                        deps.renderTimeseries();
                    }
                    return;
                }

                const column = fftTraces[0]?.column
                    || fftSelectedColumns[0]
                    || workspace?.getSnapshot().selection.columns[0];
                if (!column) {
                    toast('Select a column chip above first.', 'warning');
                    return;
                }

                const statusEl = document.getElementById('fft-filter-status') as HTMLElement | null;
                const lowHz = parseFloat((document.getElementById('fft-filter-low-hz') as HTMLInputElement)?.value) || undefined;
                const highHz = parseFloat((document.getElementById('fft-filter-high-hz') as HTMLInputElement)?.value) || undefined;

                if (statusEl) statusEl.textContent = 'Computing…';
                try {
                    const viewport = getFftViewport();
                    const params = buildFftFilterRequest({
                        startMs: viewport?.startMs ?? null,
                        endMs: viewport?.endMs ?? null,
                        column,
                        filterType,
                        lowHz,
                        highHz,
                    });
                    if (!params) {
                        throw new Error('No range selected');
                    }
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
            }, listenerOptions);

            const filterTypeSelect = document.getElementById('fft-filter-type') as HTMLElement | null;
            // Centralised sync helper so the initial render and every
            // change both end up with the right Low Hz / High Hz enabled
            // state plus a hint title attribute for screen readers. It also
            // collapses the wrapper group when neither cutoff is meaningful
            // (single-edge filters don't expose both fields at once).
            const syncFilterCutoffInputs = (): void => {
                const filterType = String(getDropdownValue('fft-filter-type') || 'none').toLowerCase();
                const lowEl = document.getElementById('fft-filter-low-hz') as HTMLInputElement | null;
                const highEl = document.getElementById('fft-filter-high-hz') as HTMLInputElement | null;
                const bandEl = document.getElementById('fft-filter-band');
                const policy = buildFftFilterCutoffState(filterType);
                if (lowEl) {
                    lowEl.disabled = policy.low.disabled;
                    lowEl.title = policy.low.hint;
                    setFieldHidden(lowEl, policy.low.disabled);
                }
                if (highEl) {
                    highEl.disabled = policy.high.disabled;
                    highEl.title = policy.high.hint;
                    setFieldHidden(highEl, policy.high.disabled);
                }
                // The wrapper is only useful when at least one cutoff is
                // editable — keep it visible for lowpass (high only),
                // highpass (low only), and band* (both).
                if (bandEl) {
                    bandEl.classList.toggle('is-hidden', !policy.bandVisible);
                }
            };
            filterTypeSelect?.addEventListener('change', syncFilterCutoffInputs, listenerOptions);
            syncFilterCutoffInputs();

            seedInitialFftSelection();
            renderChips();
            rerenderOrClear();

            // Deferred export binding so csv dataCheck captures the current fftTraces
            // reference rather than a stale closure from mount time.
            fftRuntime?.bindExports();
            return () => {
                controlAbort.abort();
                if (fftControlAbort === controlAbort) fftControlAbort = null;
            };
        },
        onEveryPageChange() {
            // Re-render chips on every page change (fft needs to reflect selected columns from any page)
            if (fftColumns().length > 0) {
                seedInitialFftSelection();
                renderChips();
                rerenderOrClear();
            }
        },
    });

    fftPageCleanup = fftRuntime.mount();
    return disposeFftPage;
}
