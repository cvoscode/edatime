import { appState } from '../store/index.js';
import { fetchFft, fetchSpectralFilter } from '../services/api/index.js';
import { FftChart, type FftTrace } from '../chart/FftChart.js';
import { EchartsLineChart } from '../chart/EchartsLineChart.js';
import { exportContainerCanvasPNG, exportContainerCanvasSVG, exportContainerCanvasHTML, exportTraceCSV } from '../utils/chartExport.js';
import { toast } from '../utils/toast.js';
import { getAnalyticsChipColor, getNumericColumns } from './analyticsPageUtils.js';
import { setSpectralFilterPreview } from '../store/index.js';
import { renderSeriesChipList } from '../ui/index.js';
import { getDropdownValue, setDropdownDisabled } from '../ui/primitives/Dropdown.js';
import { setSeriesColor } from '../utils/seriesColors.js';
import {
    DEFAULT_SPECTRAL_SCALE,
    type ClipMode,
    type ScaleMode,
    type SpectralScaleOptions,
} from '../utils/spectralScaling.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';

interface FftPageDeps {
    renderTimeseries: () => void;
}

let fftTraces: FftTrace[] = [];
let fftMode = 'magnitude';
let fftLogScale = true;
let fftScaleOptions: SpectralScaleOptions = { ...DEFAULT_SPECTRAL_SCALE };
let fftChart: FftChart | EchartsLineChart | null = null;
let fftChartReady: Promise<void> | null = null;
const fftTraceColors: Record<string, string> = {};
let fftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let fftPageCleanup: (() => void) | null = null;

function resetFftPageState(): void {
    fftPageCleanup?.();
    fftPageCleanup = null;
    fftTraces = [];
    fftMode = 'magnitude';
    fftLogScale = true;
    fftScaleOptions = { ...DEFAULT_SPECTRAL_SCALE };
    fftChart = null;
    fftChartReady = null;
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
    const firstWithMeta = fftTraces.find(
        (trace) => Number.isFinite(trace.sample_rate_hz) && Number.isFinite(trace.nyquist_hz),
    );
    if (!firstWithMeta) {
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    const fs = Number(firstWithMeta.sample_rate_hz);
    const nyquist = Number(firstWithMeta.nyquist_hz);
    rateEl.textContent = Number.isFinite(fs) ? `${fs.toExponential(3)} Hz` : '—';
    nyquistEl.textContent = Number.isFinite(nyquist) ? `${nyquist.toExponential(3)} Hz` : '—';
    const peaks = Array.isArray(firstWithMeta.dominant_peaks) ? firstWithMeta.dominant_peaks : [];
    if (peaks.length === 0) {
        peaksEl.textContent = '—';
        peaksEl.removeAttribute('title');
        return;
    }
    peaksEl.textContent = peaks
        .slice(0, 3)
        .map((peak) => {
            const f = Number(peak?.frequency_hz);
            const periodSeconds = f > 0 ? 1 / f : Number.NaN;
            const periodLabel = periodSeconds >= 86400
                ? `${(periodSeconds / 86400).toFixed(1)} d`
                : periodSeconds >= 3600
                    ? `${(periodSeconds / 3600).toFixed(1)} h`
                    : `${periodSeconds.toFixed(1)} s`;
            return `${f.toExponential(2)} Hz (~${periodLabel})`;
        })
        .join(' · ');
    peaksEl.title = peaks
        .slice(0, 5)
        .map((peak, index) => `${index + 1}. ${peak.frequency_hz.toExponential(3)} Hz (r=${peak.rank ?? index + 1})`)
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
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    const startMs = appState.currentStart;
    const endMs = appState.currentEnd;
    if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();
    // ETTm2's 69,680-row 15-min dataset was being stride-downsampled to
    // 8192 points, which collapsed the FFT X-axis to ~17-69 nHz and made
    // daily/weekly cycles invisible. Raise the cap to 131072 so the
    // resolution is enough to see daily/weekly cycles; the backend will
    // still stride down on bigger datasets without truncating ETTm2.
    const response = await fetchFft(startIso, endIso, column, 131072);
    if (!response?.results?.length) throw new Error('No results');
    const result = response.results[0];
    fftTraces = fftTraces.filter((trace) => trace.column !== column);
    fftTraces.push({
        column: result.column,
        frequencies: result.frequencies,
        magnitudes: result.magnitudes,
        psd: result.psd,
        color: fftColorFor(column, fftColumns().indexOf(column)),
        sample_rate_hz: result.sample_rate_hz,
        nyquist_hz: result.nyquist_hz,
        dominant_peaks: result.dominant_peaks,
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
                        syncFftEmptyState();
                        const loadingEl = document.getElementById('fft-chart-loading');
                        if (loadingEl) loadingEl.hidden = false;
                        try {
                            await fetchAndAddTrace(column);
                            await ensureFftChartReady();
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
            // one-time setup
            void ensureFftChartReady();

            modeSelect?.addEventListener('change', () => {
                fftMode = getDropdownValue('fft-mode-select') || 'magnitude';
                rerenderOrClear();
            });
            logCheck?.addEventListener('change', () => {
                fftLogScale = logCheck.checked;
                rerenderOrClear();
            });

            const readScaleOptions = (): SpectralScaleOptions => {
                const mode = (getDropdownValue('fft-normalize') || 'none') as ScaleMode;
                const enabled = clipToggle?.checked ?? false;
                const method = ((getDropdownValue('fft-clip-method') || 'percentile') as ClipMode);
                const raw = Number.parseFloat(clipParam?.value ?? '0.5');
                const param = Number.isFinite(raw) ? raw : 0.5;
                return { mode, clip: enabled ? method : 'none', clipParam: param };
            };
            normalizeSelect?.addEventListener('change', () => {
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            });
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
            clipToggle?.addEventListener('change', onClipToggleChange);
            clipToggle?.addEventListener('input', onClipToggleChange);
            // The custom dropdown forwards a bubbling `change` from its
            // root (see dispatchDropdownChange in Dropdown.ts), so listen
            // on the live element rather than the detached <select>.
            const liveClipMethodRoot = document.getElementById('fft-clip-method');
            liveClipMethodRoot?.addEventListener('change', () => {
                syncClipParamLabel();
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            });
            const liveClipParamEl = document.getElementById('fft-clip-param');
            liveClipParamEl?.addEventListener('change', () => {
                fftScaleOptions = readScaleOptions();
                rerenderOrClear();
            });
            syncClipEnabled();
            syncClipParamLabel();

            zoomResetBtn?.addEventListener('click', () => fftChart?.resetView());

            document.getElementById('fft-filter-apply-btn')?.addEventListener('click', async () => {
                const filterType = getDropdownValue('fft-filter-type');
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

            const filterTypeSelect = document.getElementById('fft-filter-type') as HTMLElement | null;
            // Centralised sync helper so the initial render and every
            // change both end up with the right Low Hz / High Hz enabled
            // state plus a hint title attribute for screen readers.
            const syncFilterCutoffInputs = (): void => {
                const filterType = String(getDropdownValue('fft-filter-type') || 'none').toLowerCase();
                const lowEl = document.getElementById('fft-filter-low-hz') as HTMLInputElement | null;
                const highEl = document.getElementById('fft-filter-high-hz') as HTMLInputElement | null;
                const lowHint = filterType === 'none'
                    ? 'Set Filter type to Highpass or Bandpass to use the Low Hz cutoff.'
                    : filterType === 'lowpass'
                        ? 'Low Hz cutoff is unused for Lowpass.'
                        : 'Lower edge of the bandpass / highpass.';
                const highHint = filterType === 'none'
                    ? 'Set Filter type to Lowpass or Bandpass to use the High Hz cutoff.'
                    : filterType === 'highpass'
                        ? 'High Hz cutoff is unused for Highpass.'
                        : 'Upper edge of the bandpass / lowpass.';
                if (lowEl) {
                    lowEl.disabled = filterType === 'none' || filterType === 'lowpass';
                    lowEl.title = lowHint;
                }
                if (highEl) {
                    highEl.disabled = filterType === 'none' || filterType === 'highpass';
                    highEl.title = highHint;
                }
            };
            filterTypeSelect?.addEventListener('change', syncFilterCutoffInputs);
            syncFilterCutoffInputs();

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
