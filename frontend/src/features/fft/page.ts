import { fetchFft, fetchSpectralFilter } from '../../services/api/index.js';
import { formatAnalysisSamplingContext, estimateAnalysisSampling, spectralResolutionText, formatAnalysisTimeRange } from '../spectralSampling.js';
import { FftChart, type FftTrace } from '../../chart/FftChart.js';
import { EchartsLineChart } from '../../chart/EchartsLineChart.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportTraceCSV } from '../../utils/chartExport.js';
import { toast } from '../../utils/toast.js';
import { getAnalyticsChipColor, getNumericColumns } from '../../platform/analyticsColumns.js';
import { analyticsState, setSpectralFilterPreview } from '../../store/analyticsState.js';
import { primaryChart } from '../../charts/primaryChart.js';
import { renderSeriesChipList } from '../../ui/index.js';
import { getDropdownValue, setDropdownDisabled } from '../../ui/primitives/Dropdown.js';
import { setFlexibleNumberInputBounds } from '../../ui/primitives/FlexibleNumberInput.js';
import { setSeriesColor } from '../../utils/seriesColors.js';
import {
    DEFAULT_SPECTRAL_SCALE,
    type SpectralScaleOptions,
} from '../../utils/spectralScaling.js';
import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { initFftHelp } from './help.js';
import { buildFftFilterCutoffState, buildFftScaleOptions, parseFftDetrend, validateFftFilterCutoffs } from './fftControls.js';
import { buildFftSpectralInfo } from './fftSpectralInfo.js';
import { buildFftFilterRequest } from './fftFilterRequest.js';
import { buildFftTrace, resolveFftViewport } from './fftTraceModel.js';
import { fetchFftPointBudget } from './fftBudget.js';
import type { AnalysisSampling, FftDetrend } from '../../contracts/api/v1/analytics.js';
import type { ExecutionIdentity } from '../../contracts/api/v1/identity.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import './fft.css';
import { markDataUpdated } from '../../ui/freshnessIndicator.js';
import { copyTextToClipboard } from '../../utils/copyText.js';
import { beginCompletedAnalysisExportContext, updateCompletedAnalysisDisplayControls } from '../../utils/exportProvenanceContext.js';

interface FftPageDeps {
    renderTimeseries: () => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

const FFT_SELECTION_STORAGE_KEY = 'edatime_fft_selected_columns';

// A page disposed while it had results or a running compute (for example by a
// dataset switch) recomputes on its next visit. It is the only state carried
// between instances; everything else lives in mountFftPage.
let recomputeOnNextVisit = false;
// Disposer of the mounted instance, so a re-init never leaves two instances
// bound to the same DOM.
let disposeActiveInstance: (() => void) | null = null;

function setFieldHidden(fieldOrControl: HTMLElement | null, hidden: boolean): void {
    if (!fieldOrControl) return;
    const field = fieldOrControl.closest('label, .toolbar-field') as HTMLElement | null;
    (field ?? fieldOrControl).hidden = hidden;
}

/** Release the current FFT feature instance and its page-owned resources. */
export function disposeFftPage(): void {
    disposeActiveInstance?.();
}

export async function initFftPage(deps: FftPageDeps): Promise<() => void> {
    disposeFftPage();
    const dispose = mountFftPage(deps);
    disposeActiveInstance = dispose;
    return dispose;
}

function mountFftPage(deps: FftPageDeps): () => void {
    const workspace = deps.workspace ?? null;
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
    let fftComputeController: AbortController | null = null;
    let fftComputeTimer: number | undefined;
    let fftInitialSelectionSeeded = false;
    let disposed = false;

    function fftColumns(): string[] {
        return getNumericColumns(workspace?.getSnapshot().dataset.metadata ?? null);
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
        syncFftScopeEstimate();
    }

    function syncFftScopeEstimate(): void {
        const element = document.getElementById('fft-scope-estimate');
        const sampling = estimateAnalysisSampling(workspace?.getSnapshot().dataset.metadata, getFftViewport(), Number((document.getElementById('fft-point-budget') as HTMLInputElement | null)?.value || 65536));
        if (element) element.textContent = sampling ? `Source-based estimate: ${sampling.output_points.toLocaleString()} points; ${spectralResolutionText(sampling)}. Range follows Signals. Narrow that range or raise the budget for shorter cycles. Working-plan counts are validated on Compute. CSV exports raw output; Normalize and Clip only change the display.` : 'Choose a valid range on Signals.';
    }

    function syncFftActions(): void {
        const disabled = fftSelectedColumns.length === 0 || fftComputing;
        const reason = fftComputing
            ? 'Spectrum computation is running. Use Cancel computation to stop it.'
            : fftSelectedColumns.length === 0 ? 'Select one or more numeric columns to compute a spectrum.' : '';
        const reasonEl = document.getElementById('fft-compute-reason');
        if (reasonEl) reasonEl.textContent = reason;
        const button = document.getElementById('fft-compute-btn') as HTMLButtonElement | null;
        if (button) {
            button.disabled = disabled;
            button.textContent = fftComputing ? 'Computing…' : 'Compute spectrum';
            button.title = reason;
        }
        const columns = fftColumns();
        const selectionBar = document.getElementById('fft-trace-selection');
        const count = document.getElementById('fft-trace-selection-count');
        if (selectionBar) selectionBar.hidden = columns.length === 0;
        if (count) count.textContent = `${fftSelectedColumns.length} of ${columns.length} selected`;
        const selectAll = document.getElementById('fft-select-all-btn') as HTMLButtonElement | null;
        const clearAll = document.getElementById('fft-clear-all-btn') as HTMLButtonElement | null;
        if (selectAll) selectAll.disabled = fftComputing || columns.length === 0 || fftSelectedColumns.length === columns.length;
        if (clearAll) clearAll.disabled = fftComputing || fftSelectedColumns.length === 0;
    }

    function syncFftSamplingBadge(): void {
        const badge = document.getElementById('fft-sampling-badge');
        if (!badge) return;
        const sampling = fftSelectedColumns
            .map((column) => fftSamplingByColumn[column])
            .find((entry) => Boolean(entry));
        if (!sampling) {
            badge.hidden = true;
            badge.textContent = '';
            badge.removeAttribute('title');
            return;
        }
        badge.hidden = false;
        badge.textContent = [formatAnalysisSamplingContext(sampling), spectralResolutionText(sampling), formatAnalysisTimeRange(sampling)]
            .filter(Boolean)
            .join(' · ');
        badge.title = sampling.method === 'block_mean'
            ? `Anti-aliased block-mean sampling was applied. ${formatAnalysisSamplingContext(sampling)}`
            : `The selected range was analyzed at its source cadence. ${formatAnalysisSamplingContext(sampling)}`;
    }

    function rerenderOrClear(): void {
        updateCompletedAnalysisDisplayControls('fft', { mode: fftMode, logScale: fftLogScale,
            normalize: fftScaleOptions.mode, clipEnabled: fftScaleOptions.clip !== 'none',
            clipMethod: fftScaleOptions.clip, clipParam: fftScaleOptions.clipParam });
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
        const callout = document.getElementById('fft-frequency-callout');
        const focusReadout = document.getElementById('fft-summary-focus');
        const copyButton = document.getElementById('fft-copy-summary-btn') as HTMLButtonElement | null;
        peaksEl.replaceChildren();
        if (info.peaks.length === 0) {
            if (callout) callout.textContent = '';
            if (copyButton) copyButton.disabled = true;
            if (focusReadout) focusReadout.textContent = '';
            return;
        }

        const table = document.createElement('table');
        table.className = 'fft-spectral-info__peak-table';
        const caption = document.createElement('caption');
        caption.className = 'sr-only';
        caption.textContent = 'Top frequency peaks from the current spectrum. Focus a row to mark its frequency on the chart.';
        table.append(caption);
        const header = table.createTHead().insertRow();
        for (const label of ['Rank', 'Frequency', 'Period', 'PSD (signal²/Hz)']) {
            const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; header.append(th);
        }
        const body = table.createTBody();
        info.peaks.forEach((peak) => {
            const row = body.insertRow();
            row.tabIndex = 0;
            row.dataset.frequencyHz = String(peak.frequencyHz);
            row.setAttribute('aria-label', peak.title);
            for (const value of [peak.rank, peak.frequency, peak.period, peak.power]) {
                const cell = row.insertCell(); cell.textContent = value;
            }
        });
        peaksEl.append(table);
        if (copyButton) copyButton.disabled = false;
        peaksEl.title = info.peaks.map((peak) => peak.title).join('\n');
        if (callout) {
            const peak = info.peaks[0]!;
            callout.textContent = `Strongest reported frequency for ${fftTraces.map((trace) => trace.column).join(', ')}: ${peak.frequency} (${peak.rank}, period ${peak.period}, PSD ${peak.power} signal²/Hz).`;
        }

    }

    /**
     * Wire the summary copy button and peak-table keyboard handling for this
     * instance. They read this instance's traces and chart, so they are bound
     * once per mount (removed with its abort signal) rather than lazily behind
     * a DOM marker that would outlive the instance.
     */
    function bindFftSpectralInfoHandlers(options: AddEventListenerOptions): void {
        const peaksEl = document.getElementById('fft-spectral-info-peaks');
        const copyButton = document.getElementById('fft-copy-summary-btn');
        const focusReadout = () => document.getElementById('fft-summary-focus');
        copyButton?.addEventListener('click', async () => {
            const current = buildFftSpectralInfo(fftTraces);
            const sampling = fftSelectedColumns.map((column) => fftSamplingByColumn[column]).find(Boolean);
            const lines = [
                `Spectrum for ${fftTraces.map((trace) => trace.column).join(', ') || 'no completed traces'}`,
                sampling ? `Sampling: ${formatAnalysisSamplingContext(sampling)}` : '',
                `Sample rate: ${current.sampleRate.text}; Nyquist: ${current.nyquist.text}`,
                ...current.peaks.map((peak) => `${peak.rank}: ${peak.frequency}; period ${peak.period}; power ${peak.power}`),
            ].filter(Boolean);
            const copied = await copyTextToClipboard(lines.join('\n'));
            const readout = focusReadout();
            if (readout) readout.textContent = copied ? 'Spectrum summary copied.' : 'Copy was blocked by the browser. Select the peak table and copy its text.';
        }, options);
        if (!peaksEl) return;
        peaksEl.addEventListener('focusin', (event) => {
            const row = (event.target as HTMLElement).closest<HTMLTableRowElement>('tbody tr[data-frequency-hz]');
            if (!row) return;
            fftChart?.setFocusFrequency?.(Number(row.dataset.frequencyHz));
            const readout = focusReadout();
            if (readout) readout.textContent = `Focused frequency ${row.cells[1]?.textContent ?? ''}. A marker is shown on the spectrum chart.`;
        }, options);
        peaksEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            const row = (event.target as HTMLElement).closest<HTMLTableRowElement>('tbody tr[data-frequency-hz]');
            if (!row) return;
            const rows = Array.from(peaksEl.querySelectorAll<HTMLTableRowElement>('tbody tr[data-frequency-hz]'));
            const next = rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)];
            if (next) { event.preventDefault(); next.focus(); }
        }, options);
        peaksEl.addEventListener('focusout', (event) => {
            if (!peaksEl.contains(event.relatedTarget as Node | null)) fftChart?.setFocusFrequency?.(null);
        }, options);
    }

    async function ensureFftChartReady(): Promise<void> {
        if (!fftChartReady) {
            fftChartReady = (async () => {
                const primaryChart = new FftChart('fft-chart');
                fftChart = primaryChart;
                try {
                    await primaryChart.init();
                    if (disposed || fftChart !== primaryChart) return;
                    primaryChart.onZoomChange = (isZoomed: boolean) => updateZoomButton(isZoomed);
                } catch (error) {
                    // A disposed instance must not build a fallback chart in a DOM it no longer owns.
                    if (disposed || fftChart !== primaryChart) return;
                    console.warn('FFT WebGPU renderer unavailable, switching to ECharts fallback:', error);
                    const fallbackChart = new EchartsLineChart('fft-chart');
                    fftChart = fallbackChart;
                    await fallbackChart.init();
                    if (disposed || fftChart !== fallbackChart) { fallbackChart.destroy(); return; }
                    fallbackChart.onZoomChange = (isZoomed: boolean) => updateZoomButton(isZoomed);
                    fftChart = fallbackChart;
                }
            })();
        }
        await fftChartReady;
    }

    function getFftViewport(): { startMs: number; endMs: number } | null {
        const timeRange = workspace?.getSnapshot().dataset.metadata?.time_range
            ?? workspace?.getSnapshot().dataset.metadata?.time_range;
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
        viewport = getFftViewport(),
        detrend: FftDetrend = 'constant',
    ): Promise<{ trace: FftTrace; sampling?: AnalysisSampling; executionIdentity?: ExecutionIdentity; estimator: string; missingCount: number }> {
        if (!viewport) throw new Error('No time range selected');
        const response = await fetchFft(
            new Date(viewport.startMs).toISOString(),
            new Date(viewport.endMs).toISOString(),
            column,
            maxPoints,
            { signal }, detrend,
        );
        if (!response?.results?.length) throw new Error('No results');
        const trace = buildFftTrace(response.results[0], fftColorFor(column));
        if (!trace) throw new Error('Malformed result');
        return { trace, sampling: response.sampling, executionIdentity: response.executionIdentity,
            estimator: response.results[0].estimator ?? 'unspecified', missingCount: response.results[0].missing_count ?? 0 };
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

    async function computeSelectedFft(lifecycleSignal?: AbortSignal): Promise<void> {
        if (fftComputing || fftSelectedColumns.length === 0 || lifecycleSignal?.aborted) return;
        const requestedColumns = [...fftSelectedColumns];
        const requestedViewport = getFftViewport();
        const requestedWorkspace = workspace?.getSnapshot();
        const requestedDetrend = parseFftDetrend(getDropdownValue('fft-detrend'));
        const requestedBudget = Number((document.getElementById('fft-point-budget') as HTMLInputElement | null)?.value || 65536);
        const requestedDisplay = {
            mode: getDropdownValue('fft-mode-select') || 'magnitude',
            logScale: (document.getElementById('fft-log-scale') as HTMLInputElement | null)?.checked ?? true,
            normalize: getDropdownValue('fft-normalize') || 'none',
            clipEnabled: (document.getElementById('fft-clip-toggle') as HTMLInputElement | null)?.checked ?? false,
            clipMethod: getDropdownValue('fft-clip-method') || 'percentile',
            clipParam: Number((document.getElementById('fft-clip-param') as HTMLInputElement | null)?.value || 0.5),
        };
        const controller = new AbortController();
        fftComputeController?.abort();
        fftComputeController = controller;
        const signal = controller.signal;
        const abortWithLifecycle = () => controller.abort();
        lifecycleSignal?.addEventListener('abort', abortWithLifecycle, { once: true });
        const isCurrent = () => fftComputeController === controller && !signal.aborted;
        const startedAt = Date.now();
        const loadingEl = document.getElementById('fft-chart-loading');
        const loadingLabel = document.getElementById('fft-chart-loading-label');
        const statusEl = document.getElementById('fft-analysis-status');
        const updateElapsed = () => {
            if (!isCurrent()) return;
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            if (loadingLabel) loadingLabel.textContent = `Computing spectrum for ${requestedColumns.length} trace${requestedColumns.length === 1 ? '' : 's'} · ${elapsed}s elapsed`;
        };
        fftComputing = true;
        fftComputeError = '';
        if (loadingEl) loadingEl.hidden = false;
        updateElapsed();
        fftComputeTimer = window.setInterval(updateElapsed, 1000);
        const cancelButton = document.getElementById('fft-cancel-btn') as HTMLButtonElement | null;
        if (cancelButton) cancelButton.onclick = () => controller.abort();
        renderChips();
        document.querySelectorAll<HTMLElement>('#fft-traces-bar .fft-trace-chip.active').forEach((chip) => {
            chip.classList.add('loading');
            chip.setAttribute('aria-disabled', 'true');
        });
        syncFftEmptyState();

        try {
            if (!Number.isInteger(requestedBudget) || requestedBudget < 64) throw new Error('Spectrum point budget must be an integer of at least 64.');
            const serverBudget = await fetchFftPointBudget(signal);
            if (requestedBudget > serverBudget) throw new Error(`Spectrum point budget exceeds this server's limit of ${serverBudget.toLocaleString()}. Lower the budget or narrow the Signals range.`);
            const maxPoints = requestedBudget;
            if (!isCurrent()) return;
            const completeAnalysisProvenance = beginCompletedAnalysisExportContext({
                pageName: 'fft',
                controls: {
                    columns: requestedColumns.join(', '),
                    start: requestedViewport ? new Date(requestedViewport.startMs).toISOString() : '',
                    end: requestedViewport ? new Date(requestedViewport.endMs).toISOString() : '',
                    maxPoints, detrend: requestedDetrend,
                    units: 'Magnitude: signal; PSD: signal^2/Hz', window: 'Hann symmetric',
                    csvValues: 'Raw output before display scaling, clipping, or log10',
                    ...requestedDisplay,
                },
                workspaceSnapshot: requestedWorkspace,
            });
            const settled = await Promise.allSettled(
                requestedColumns.map((column) => fetchFftTrace(column, maxPoints, signal, requestedViewport, requestedDetrend)),
            );
            if (!isCurrent()) return;
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
            document.dispatchEvent(new CustomEvent('fft:computed'));
            if (loadingLabel) loadingLabel.textContent = 'Spectrum received; rendering chart…';
            await ensureFftChartReady();
            if (!isCurrent()) return;
            const firstSuccessful = settled.find((result) => result.status === 'fulfilled');
            syncFftSamplingBadge();
            completeAnalysisProvenance(firstSuccessful?.status === 'fulfilled' ? firstSuccessful.value.executionIdentity ?? null : null, {
                estimator: firstSuccessful?.status === 'fulfilled' ? firstSuccessful.value.estimator : 'unknown',
                missingData: settled.filter((entry) => entry.status === 'fulfilled').map((entry) => `${entry.value.trace.column}: ${entry.value.missingCount} masked analysis samples`).join('; '),
                sampling: JSON.stringify(nextSampling),
            });
            markDataUpdated();
            if (failures.length > 0) {
                toast(`FFT skipped ${failures.length} trace${failures.length === 1 ? '' : 's'}: ${failures.join(', ')}`, 'warning');
            }
        } catch (error) {
            if (!isCurrent() || (error instanceof Error && error.name === 'AbortError')) return;
            const detail = error instanceof Error ? error.message : String(error);
            fftComputeError = detail;
            toast(`FFT failed: ${detail}`, 'error');
        } finally {
            lifecycleSignal?.removeEventListener('abort', abortWithLifecycle);
            if (fftComputeController !== controller) return;
            if (fftComputeTimer !== undefined) window.clearInterval(fftComputeTimer);
            fftComputeTimer = undefined;
            fftComputeController = null;
            fftComputing = false;
            if (loadingEl) loadingEl.hidden = true;
            if (statusEl) statusEl.textContent = signal.aborted
                ? 'Spectrum computation canceled. The previous completed result remains visible.'
                : fftComputeError ? `Spectrum failed: ${fftComputeError}` : 'Spectrum updated.';
            if (loadingLabel) loadingLabel.textContent = 'Computing spectrum…';
            if (cancelButton) cancelButton.onclick = null;
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

            bindFftSpectralInfoHandlers(listenerOptions);
            const runCompute = () => void computeSelectedFft(controlAbort.signal);
            for (const id of ['fft-point-budget', 'fft-detrend']) document.getElementById(id)?.addEventListener('change', () => {
                syncFftScopeEstimate();
                const status = document.getElementById('fft-analysis-status');
                if (status && fftTraces.length) status.textContent = 'Analysis settings changed. Compute spectrum to update the result.';
            }, listenerOptions);
            document.getElementById('fft-compute-btn')?.addEventListener('click', runCompute, listenerOptions);
            document.getElementById('fft-cancel-btn')?.addEventListener('click', () => fftComputeController?.abort(), listenerOptions);
            const updateSelection = (next: string[]) => {
                fftSelectedColumns = [...new Set(next)].filter((column) => fftColumns().includes(column));
                fftComputeError = '';
                persistFftSelection();
                renderChips();
                rerenderOrClear();
            };
            document.getElementById('fft-select-all-btn')?.addEventListener('click', () => updateSelection(fftColumns()), listenerOptions);
            document.getElementById('fft-clear-all-btn')?.addEventListener('click', () => updateSelection([]), listenerOptions);

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
                if (!filterType || filterType === 'none') return;

                const column = fftTraces[0]?.column
                    || fftSelectedColumns[0]
                    || workspace?.getSnapshot().selection.columns[0];
                if (!column) {
                    toast('Select a column chip above first.', 'warning');
                    return;
                }

                const statusEl = document.getElementById('fft-filter-status') as HTMLElement | null;
                const validation = validateFftFilterCutoffs(
                    filterType,
                    (document.getElementById('fft-filter-low-hz') as HTMLInputElement | null)?.value ?? '',
                    (document.getElementById('fft-filter-high-hz') as HTMLInputElement | null)?.value ?? '',
                    fftTraces.find((trace) => Number.isFinite(trace.nyquist_hz))?.nyquist_hz ?? null,
                );
                if (!validation.valid) {
                    if (statusEl) statusEl.textContent = validation.message;
                    return;
                }
                const { lowHz, highHz } = validation;

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
                const nyquistHz = fftTraces.find((trace) => Number.isFinite(trace.nyquist_hz))?.nyquist_hz ?? null;
                const validation = validateFftFilterCutoffs(
                    filterType,
                    lowEl?.value ?? '',
                    highEl?.value ?? '',
                    nyquistHz,
                );
                if (lowEl) {
                    lowEl.disabled = policy.low.disabled;
                    lowEl.title = policy.low.hint;
                    setFlexibleNumberInputBounds(lowEl, { min: 0, max: nyquistHz, step: 'any' });
                    lowEl.setAttribute('aria-invalid', String(!policy.low.disabled && !validation.valid));
                    setFieldHidden(lowEl, policy.low.disabled);
                }
                if (highEl) {
                    highEl.disabled = policy.high.disabled;
                    highEl.title = policy.high.hint;
                    setFlexibleNumberInputBounds(highEl, { min: 0, max: nyquistHz, step: 'any' });
                    highEl.setAttribute('aria-invalid', String(!policy.high.disabled && !validation.valid));
                    setFieldHidden(highEl, policy.high.disabled);
                }
                // The wrapper is only useful when at least one cutoff is
                // editable — keep it visible for lowpass (high only),
                // highpass (low only), and band* (both).
                if (bandEl) {
                    bandEl.classList.toggle('is-hidden', !policy.bandVisible);
                }
                const applyButton = document.getElementById('fft-filter-apply-btn') as HTMLButtonElement | null;
                if (applyButton) {
                    applyButton.disabled = !validation.valid;
                    applyButton.title = validation.valid ? 'Preview filtered signal on the Signals page' : validation.message;
                }
                const status = document.getElementById('fft-filter-status');
                if (status) status.textContent = filterType === 'none' ? '' : validation.message;
            };
            filterTypeSelect?.addEventListener('change', () => {
                syncFilterCutoffInputs();
                if (getDropdownValue('fft-filter-type') !== 'none') return;
                setSpectralFilterPreview(null);
                primaryChart.current?.requestOverlayRender?.();
                deps.renderTimeseries();
                rerenderOrClear();
            }, listenerOptions);
            document.getElementById('fft-filter-low-hz')?.addEventListener('input', syncFilterCutoffInputs, listenerOptions);
            document.getElementById('fft-filter-high-hz')?.addEventListener('input', syncFilterCutoffInputs, listenerOptions);
            document.addEventListener('fft:computed', syncFilterCutoffInputs, listenerOptions);
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
                if (recomputeOnNextVisit && document.getElementById('page-fft')?.hidden === false) {
                    recomputeOnNextVisit = false;
                    void computeSelectedFft(fftControlAbort?.signal);
                }
            }
        },
    });

    fftPageCleanup = fftRuntime.mount();

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        if (disposeActiveInstance === dispose) disposeActiveInstance = null;
        recomputeOnNextVisit ||= fftTraces.length > 0 || fftComputing;
        fftPageCleanup?.();
        fftControlAbort?.abort();
        // Clearing the controller makes an in-flight compute's finally block bail out.
        fftComputeController?.abort();
        fftComputeController = null;
        if (fftComputeTimer !== undefined) window.clearInterval(fftComputeTimer);
        fftChart?.destroy?.();
        // Drop the reference so a late init continuation fails its identity check.
        fftChart = null;
        fftChartReady = null;
        const cancelButton = document.getElementById('fft-cancel-btn');
        if (cancelButton) cancelButton.onclick = null;
        document.getElementById('fft-chart')?.replaceChildren();
        // Chips keep their toggle callbacks from the instance that built them; the
        // next instance must rebuild them rather than reuse them.
        document.getElementById('fft-traces-bar')?.replaceChildren();
    }
    return dispose;
}
