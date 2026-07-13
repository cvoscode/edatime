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
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';

interface FftPageDeps {
    renderTimeseries: () => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

const FFT_SELECTION_STORAGE_KEY = 'edatime_fft_selected_columns';

let fftTraces: FftTrace[] = [];
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

function fftColumns(): string[] {
    return getNumericColumns(workspace?.getSnapshot().dataset.metadata ?? datasetState.metadata);
}

function fftColorFor(column: string, fallbackIndex: number): string {
    return getAnalyticsChipColor(column, fallbackIndex, fftTraceColors);
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
            JSON.stringify(fftTraces.map((trace) => trace.column)),
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
    // Suppress the placeholder the moment any chip is in the loading
    // state so the user sees the active "loading" feedback instead of a
    // contradictory "Select one or more traces" message.
    const loadingChips = document.querySelectorAll<HTMLElement>('#fft-traces-bar .fft-trace-chip.loading');
    const inFlight = loadingChips.length > 0;
    const visible = fftTraces.length === 0 && !inFlight;
    const reason = visible ? 'no-columns-selected' : '';
    const model = {
        visible,
        reason,
        title: '',
        message: '',
    };

    fftRuntime?.updateEmptyState(model);
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

async function fetchAndAddTrace(column: string): Promise<void> {
    const viewport = resolveFftViewport(workspace?.getSnapshot().viewport, chartState.currentStart, chartState.currentEnd);
    if (!viewport) return;
    // ETTm2's 69,680-row 15-min dataset was being stride-downsampled to
    // 8192 points, which collapsed the FFT X-axis to ~17-69 nHz and made
    // daily/weekly cycles invisible. Raise the cap to 131072 so the
    // resolution is enough to see daily/weekly cycles; the backend will
    // still stride down on bigger datasets without truncating ETTm2.
    const response = await fetchFft(new Date(viewport.startMs).toISOString(), new Date(viewport.endMs).toISOString(), column, 131072);
    if (!response?.results?.length) throw new Error('No results');
    const trace = buildFftTrace(response.results[0], fftColorFor(column, fftColumns().indexOf(column)));
    if (!trace) throw new Error('Malformed result');
    fftTraces = fftTraces.filter((trace) => trace.column !== column);
    fftTraces.push(trace);
}

async function seedInitialFftSelection(): Promise<void> {
    if (fftInitialSelectionSeeded || !datasetState.metadata || fftTraces.length > 0) return;
    const columns = fftColumns();
    if (columns.length === 0) {
        fftInitialSelectionSeeded = true;
        return;
    }
    const stored = loadStoredFftSelection();
    const targetColumns = (stored ?? columns.slice(0, 2))
        .filter((column, index, list) => columns.includes(column) && list.indexOf(column) === index);
    fftInitialSelectionSeeded = true;
    if (targetColumns.length === 0) return;

    const loadingEl = document.getElementById('fft-chart-loading');
    if (loadingEl) loadingEl.hidden = false;
    try {
        await Promise.all(targetColumns.map(async (column) => {
            try {
                await fetchAndAddTrace(column);
            } catch (error) {
                console.warn(`FFT failed for ${column}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }));
        await ensureFftChartReady();
        renderChips();
        rerenderOrClear();
    } finally {
        if (loadingEl) loadingEl.hidden = true;
        syncFftEmptyState();
    }
}

function renderChips(): void {
    const bar = document.getElementById('fft-traces-bar');
    if (!bar || !datasetState.metadata) return;
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
                        syncFftEmptyState();
                        const loadingEl = document.getElementById('fft-chart-loading');
                        if (loadingEl) loadingEl.hidden = false;
                        try {
                            await fetchAndAddTrace(column);
                            await ensureFftChartReady();
                            persistFftSelection();
                            renderChips();
                            rerenderOrClear();
                        } catch (error: any) {
                            console.warn(`FFT failed for ${column}: ${error?.message || 'error'}`);
                        } finally {
                            activeChip.classList.remove('loading');
                            activeChip.removeAttribute('aria-disabled');
                            if (loadingEl) loadingEl.hidden = true;
                            syncFftEmptyState();
                        }
                    } else {
                        fftTraces = fftTraces.filter((trace) => trace.column !== column);
                        persistFftSelection();
                        renderChips();
                        rerenderOrClear();
                    }
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

export async function initFftPage(deps: FftPageDeps): Promise<void> {
    workspace = deps.workspace ?? null;
    resetFftPageState();

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
            initFftHelp();

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

                const column = fftTraces[0]?.column || uiState.selectedCols[0];
                if (!column) {
                    toast('Select a column chip below first.', 'warning');
                    return;
                }

                const statusEl = document.getElementById('fft-filter-status') as HTMLElement | null;
                const lowHz = parseFloat((document.getElementById('fft-filter-low-hz') as HTMLInputElement)?.value) || undefined;
                const highHz = parseFloat((document.getElementById('fft-filter-high-hz') as HTMLInputElement)?.value) || undefined;

                if (statusEl) statusEl.textContent = 'Computing…';
                try {
                    const params = buildFftFilterRequest({
                        startMs: chartState.currentStart,
                        endMs: chartState.currentEnd,
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

            rerenderOrClear();
            void seedInitialFftSelection().then(() => {
                // Surface persisted selections so users understand why the
                // chip bar is pre-populated after a page reload.
                const stored = loadStoredFftSelection();
                if (stored && stored.length > 0 && fftTraces.length > 0) {
                    const sessionFlag = 'edatime_fft_restored_toast';
                    try {
                        if (window.sessionStorage.getItem(sessionFlag) === '1') return;
                        window.sessionStorage.setItem(sessionFlag, '1');
                    } catch {
                        // sessionStorage may be unavailable in private mode;
                        // that's fine — the toast is purely informational.
                    }
                    toast(
                        `Restored ${stored.length} FFT trace${stored.length === 1 ? '' : 's'} from last session.`,
                        'info',
                    );
                }
            });

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
            if (datasetState.metadata) {
                renderChips();
                void seedInitialFftSelection();
            }
        },
    });

    fftPageCleanup = fftRuntime.mount();
}
