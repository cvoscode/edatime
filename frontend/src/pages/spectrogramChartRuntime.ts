/**
 * Spectrogram chart runtime — chart lifecycle, ECharts initialization,
 * resize handling, and empty-state management.
 *
 * Follows the `createAnalysisPageRuntime` pattern so that:
 *   const runtime = createSpectrogramChartRuntime(deps);
 *   runtime.mount();
 * exposes the same interface as other analysis page runtimes.
 */
import { fetchSpectrogram, type SpectrogramResult } from '../services/api/index.js';
import { chartState, datasetState } from '../store/index.js';
import { exportEChartsPNG, exportEChartsSVG, exportEChartsHTML } from '../utils/chartExport.js';
import {
    getDropdownOptions,
    getDropdownValue,
    setDropdownDisabled,
    setDropdownOptions,
} from '../ui/primitives/Dropdown.js';
import {
    scaleModeLabel,
    type ClipMode,
    type ScaleMode,
} from '../utils/spectralScaling.js';
import {
    formatFrequencyInUnit,
    pickFrequencyAxisUnit,
} from '../utils/spectralPresets.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';
import { toast } from '../utils/toast.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

// ── Module-level chart state ─────────────────────────────────────────────────
let spectrogramChart: any = null;
let spectrogramResizeObserver: ResizeObserver | null = null;
let spectrogramResult: SpectrogramResult | null = null;
let spectrogramRenderError: string | null = null;
let spectrogramAppliedScaleMode: ScaleMode = 'none';
let spectrogramAppliedClipMode: ClipMode = 'none';
let spectrogramAppliedClipParam = 0.5;

export function __resetSpectrogramChartRuntimeForTests(): void {
    spectrogramResizeObserver?.disconnect();
    spectrogramResizeObserver = null;
    try {
        spectrogramChart?.dispose?.();
    } catch {
        // Ignore cleanup failures in the test environment.
    }
    spectrogramChart = null;
    spectrogramResult = null;
    spectrogramRenderError = null;
    spectrogramAppliedScaleMode = 'none';
    spectrogramAppliedClipMode = 'none';
    spectrogramAppliedClipParam = 0.5;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSpectrogramTime(timestampMs: number): string {
    return new Date(timestampMs).toLocaleString([], {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function findDominantFrequencyBand(result: SpectrogramResult): { lowerIndex: number; upperIndex: number; dominantHz: number } | null {
    const freqs = result.frequencies;
    if (!Array.isArray(freqs) || freqs.length === 0) return null;
    const totals = freqs.map(() => 0);
    result.magnitudes.forEach((row) => {
        freqs.forEach((_, index) => {
            const value = Number(row?.[index] ?? NaN);
            if (Number.isFinite(value)) totals[index] += Math.abs(value);
        });
    });
    let dominantIndex = 0;
    for (let i = 1; i < totals.length; i += 1) {
        if (totals[i] > totals[dominantIndex]!) dominantIndex = i;
    }
    const dominantTotal = totals[dominantIndex] ?? 0;
    const threshold = dominantTotal * 0.75;
    let lowerIndex = dominantIndex;
    let upperIndex = dominantIndex;
    while (lowerIndex > 0 && (totals[lowerIndex - 1] ?? 0) >= threshold) lowerIndex -= 1;
    while (upperIndex < totals.length - 1 && (totals[upperIndex + 1] ?? 0) >= threshold) upperIndex += 1;
    if (lowerIndex === upperIndex && totals.length > 1) {
        if (dominantIndex === totals.length - 1) lowerIndex = dominantIndex - 1;
        else upperIndex = dominantIndex + 1;
    }
    return {
        lowerIndex,
        upperIndex,
        dominantHz: Number(freqs[dominantIndex] ?? 0),
    };
}

// ── Runtime factory ───────────────────────────────────────────────────────────
export function createSpectrogramChartRuntime(deps: SpectrogramPageDeps) {
    let spectrogramRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
    let autoComputeStarted = false;
    let autoComputeExplained = false;
    const workspaceSnapshot = () => deps.workspace?.getSnapshot();
    const workspaceMetadata = () => workspaceSnapshot()?.dataset.metadata ?? datasetState.metadata;
    const workspaceViewport = () => workspaceSnapshot()?.viewport;

    const getSpectrogramWinCustomInput = () => document.getElementById('spectrogram-win-size-custom') as HTMLInputElement | null;
    const getSpectrogramHopCustomInput = () => document.getElementById('spectrogram-hop-size-custom') as HTMLInputElement | null;

    const syncSpectrogramCustomInputs = () => {
        const winMode = getDropdownValue('spectrogram-win-size') || '96';
        const hopMode = getDropdownValue('spectrogram-hop-size') || '0.5';
        const winCustomInput = getSpectrogramWinCustomInput();
        const hopCustomInput = getSpectrogramHopCustomInput();

        if (winCustomInput) {
            const custom = winMode === 'custom';
            winCustomInput.hidden = !custom;
            winCustomInput.disabled = !custom;
        }
        if (hopCustomInput) {
            const custom = hopMode === 'custom';
            hopCustomInput.hidden = !custom;
            hopCustomInput.disabled = !custom;
        }
    };

    const parseCustomInteger = (
        input: HTMLInputElement | null,
        fallback: number,
        min: number,
        max: number,
    ): number => {
        const raw = Number.parseInt(input?.value || '', 10);
        if (!Number.isFinite(raw)) return fallback;
        return Math.max(min, Math.min(max, raw));
    };

    const resolveSpectrogramWindowSize = (): number => {
        const selected = getDropdownValue('spectrogram-win-size') || '96';
        if (selected === 'custom') {
            return parseCustomInteger(getSpectrogramWinCustomInput(), 96, 16, 4096);
        }
        const parsed = Number.parseInt(selected, 10);
        return Number.isFinite(parsed) ? Math.max(16, Math.min(4096, parsed)) : 96;
    };

    const resolveSpectrogramHopSize = (winSize: number): number => {
        const selected = getDropdownValue('spectrogram-hop-size') || '0.5';
        if (selected === 'custom') {
            return parseCustomInteger(getSpectrogramHopCustomInput(), Math.max(1, Math.round(winSize * 0.5)), 1, winSize);
        }
        const hopRatioRaw = Number.parseFloat(selected);
        const hopRatio = Number.isFinite(hopRatioRaw) && hopRatioRaw > 0 && hopRatioRaw < 1 ? hopRatioRaw : 0.5;
        return Math.max(1, Math.min(winSize, Math.round(winSize * hopRatio)));
    };

    function syncSpectrogramEmptyState(message?: string): void {
        // If a fetch/render failure is recorded, prefer that message over
        // the generic placeholder so a silent failure becomes visible —
        // see `usage_issue.md` §5.1.
        const fallback = spectrogramRenderError
            ? spectrogramRenderError
            : (message || 'Pick a numeric column and click Compute to generate the spectrogram.');
        spectrogramRuntime?.updateEmptyState({
            visible: !spectrogramResult,
            reason: spectrogramResult ? '' : (spectrogramRenderError ? 'render-error' : 'no-columns-selected'),
            title: spectrogramRenderError ? 'Spectrogram render failed' : '',
            message: '',
            fallbackText: fallback,
        });
    }

    spectrogramRuntime = createAnalysisPageRuntime({
        page: 'spectrogram',
        emptyStateRootId: 'spectrogram-empty-state',
        exportConfig: {
            key: 'spectrogram',
            png: { fn: exportEChartsPNG, filename: 'edatime_spectrogram.png' },
            svg: { fn: exportEChartsSVG, filename: 'edatime_spectrogram.svg' },
            html: { fn: exportEChartsHTML, filename: 'edatime_spectrogram.html' },
        },
        init() {
            const colSelect = document.getElementById('spectrogram-col-select') as HTMLElement | null;
            const logCheck = document.getElementById('spectrogram-log-scale') as HTMLInputElement | null;
            const clipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const clipParamLabel = document.getElementById('spectrogram-clip-param-label') as HTMLElement | null;
            const resetZoomBtn = document.getElementById('spectrogram-zoom-reset-btn') as HTMLButtonElement | null;
            const autoFitToggle = document.getElementById('spectrogram-auto-fit-toggle') as HTMLInputElement | null;
            const summaryEl = document.getElementById('spectrogram-summary') as HTMLElement | null;
            const chartEl = document.getElementById('spectrogram-chart') as HTMLDivElement | null;

            if (!chartEl || !colSelect) return;

            // ── Chart readiness helpers ────────────────────────────────────────
            const ensureSpectrogramChartDimensions = () => {
                if (chartEl.clientHeight >= 320) return;
                chartEl.style.minHeight = chartEl.style.minHeight || '360px';
                if (!chartEl.style.height || chartEl.style.height === '100%' || chartEl.clientHeight < 320) {
                    chartEl.style.height = '360px';
                }
            };

            const isSpectrogramChartReadyForInit = () => {
                const page = document.getElementById('page-spectrogram') as HTMLElement | null;
                ensureSpectrogramChartDimensions();
                return !!chartEl
                    && chartEl.clientWidth > 0
                    && chartEl.clientHeight > 0
                    && (!page || !page.hidden);
            };

            const waitForSpectrogramChartReady = async (attempts = 20) => {
                for (let remaining = attempts; remaining >= 0; remaining -= 1) {
                    if (isSpectrogramChartReadyForInit()) return true;
                    await new Promise((resolve) => window.setTimeout(resolve, 0));
                }
                return isSpectrogramChartReadyForInit();
            };

            // ── Chart initialization ───────────────────────────────────────────
            const ensureSpectrogramChart = async () => {
                if (spectrogramChart) {
                    if (isSpectrogramChartReadyForInit()) spectrogramChart.resize?.();
                    return spectrogramChart;
                }
                if (!(await waitForSpectrogramChartReady())) {
                    throw new Error('Spectrogram chart container is not ready yet.');
                }
                const echarts = await import('echarts');
                spectrogramChart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
                spectrogramResizeObserver?.disconnect();
                spectrogramResizeObserver = new ResizeObserver(() => spectrogramChart?.resize());
                spectrogramResizeObserver.observe(chartEl);

                if (chartEl.style.position === '' || chartEl.style.position === 'static') {
                    chartEl.style.position = 'relative';
                }

                // ── Selection box overlay ──────────────────────────────────
                const selectionBox = document.createElement('div');
                selectionBox.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;'
                    + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
                    + 'pointer-events:none;display:none;z-index:5';
                chartEl.appendChild(selectionBox);

                let dragStart: { x: number; y: number; pid: number } | null = null;
                let dragEnd = { x: 0, y: 0 };
                const grid = { left: 92, right: 110, top: 36, bottom: 88 };

                chartEl.addEventListener('pointerdown', (event: PointerEvent) => {
                    if (event.button !== 0) return;
                    const rect = chartEl.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    if (x > rect.width - grid.right || x < grid.left || y < grid.top || y > rect.height - grid.bottom) return;
                    dragStart = { x, y, pid: event.pointerId };
                    dragEnd = { x, y };
                    try { chartEl.setPointerCapture(event.pointerId); } catch { }
                });

                chartEl.addEventListener('pointermove', (event: PointerEvent) => {
                    if (!dragStart || event.pointerId !== dragStart.pid) return;
                    const rect = chartEl.getBoundingClientRect();
                    dragEnd = { x: event.clientX - rect.left, y: event.clientY - rect.top };
                    const left = Math.min(dragStart.x, dragEnd.x);
                    const top = Math.min(dragStart.y, dragEnd.y);
                    selectionBox.style.left = `${left}px`;
                    selectionBox.style.top = `${top}px`;
                    selectionBox.style.width = `${Math.abs(dragEnd.x - dragStart.x)}px`;
                    selectionBox.style.height = `${Math.abs(dragEnd.y - dragStart.y)}px`;
                    selectionBox.style.display = 'block';
                });

                const finishDrag = (event: PointerEvent) => {
                    if (!dragStart || event.pointerId !== dragStart.pid) return;
                    const start = dragStart;
                    dragStart = null;
                    selectionBox.style.display = 'none';
                    try { chartEl.releasePointerCapture(event.pointerId); } catch { }

                    const dx = Math.abs(dragEnd.x - start.x);
                    const dy = Math.abs(dragEnd.y - start.y);
                    if (dx < 8 || dy < 8) return;
                    if (!spectrogramChart || !spectrogramResult) return;

                    const p0 = spectrogramChart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [start.x, start.y]) as [number, number] | null;
                    const p1 = spectrogramChart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [dragEnd.x, dragEnd.y]) as [number, number] | null;
                    if (!p0 || !p1) return;

                    const xLen = spectrogramResult.times_ms.length;
                    const yLen = spectrogramResult.frequencies.length;
                    const xStartPct = Math.max(0, Math.min(100, (Math.min(p0[0], p1[0]) / (xLen - 1)) * 100));
                    const xEndPct = Math.max(0, Math.min(100, (Math.max(p0[0], p1[0]) / (xLen - 1)) * 100));
                    const yStartPct = Math.max(0, Math.min(100, (Math.min(p0[1], p1[1]) / (yLen - 1)) * 100));
                    const yEndPct = Math.max(0, Math.min(100, (Math.max(p0[1], p1[1]) / (yLen - 1)) * 100));
                    if (xEndPct <= xStartPct || yEndPct <= yStartPct) return;

                    spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: xStartPct, end: xEndPct });
                    spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: yStartPct, end: yEndPct });
                };

                chartEl.addEventListener('pointerup', finishDrag);
                chartEl.addEventListener('pointercancel', (event: PointerEvent) => {
                    if (dragStart?.pid === event.pointerId) {
                        dragStart = null;
                        selectionBox.style.display = 'none';
                    }
                });
                chartEl.addEventListener('dblclick', () => {
                    if (!spectrogramChart) return;
                    spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
                    spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
                });

                return spectrogramChart;
            };

            // ── Chart rendering ───────────────────────────────────────────────
            //
            // The spectrogram grid can hold hundreds of thousands of cells
            // (timeAxis.length × freqAxis.length). On every redraw the naive
            // implementation rebuilt the full `points` array and re-ran
            // Math.log10 over each cell, which dominated the frame budget
            // for the log-scale toggle and any subsequent repaint.
            //
            // We now cache both display modes and reuse stable visible
            // buffers during colorbar drags. That removes the biggest
            // avoidable redraw costs:
            // - rebuilding every point tuple on log toggles
            // - allocating a fresh filtered series array on each drag
            type SpectrogramPoint = [number, number, number, number];
            type SpectrogramMode = 'linear' | 'log';

            let cachedGrid: {
                result: SpectrogramResult;
                log: Float64Array;
                raw: Float64Array;
                linearPoints: SpectrogramPoint[];
                logPoints: SpectrogramPoint[];
                visibleLinearPoints: SpectrogramPoint[];
                visibleLogPoints: SpectrogramPoint[];
                logMin: number;
                logMax: number;
                linearMin: number;
                linearMax: number;
                lastVisibleMode: SpectrogramMode | null;
                lastVisibleRangeKey: string | null;
            } | null = null;

            let currentScaleBounds: { min: number; max: number } | null = null;
            let colorFilterRange: { min: number; max: number } | null = null;
            let colorbarInteractionInitialized = false;
            let colorbarDragRaf = 0;

            const buildPointsFromDisplay = (
                result: SpectrogramResult,
                displayValues: Float64Array,
                rawValues: Float64Array,
            ): SpectrogramPoint[] => {
                const timeAxis = result.times_ms;
                const freqAxis = result.frequencies;
                const total = displayValues.length;
                const points: SpectrogramPoint[] = new Array(total);
                let writeIndex = 0;
                for (let t = 0; t < timeAxis.length; t += 1) {
                    const tBase = t * freqAxis.length;
                    for (let f = 0; f < freqAxis.length; f += 1) {
                        const idx = tBase + f;
                        const display = displayValues[idx];
                        if (!Number.isFinite(display)) continue;
                        points[writeIndex++] = [t, f, display, rawValues[idx]];
                    }
                }
                points.length = writeIndex;
                return points;
            };

            const buildCachedGrid = (result: SpectrogramResult) => {
                const timeAxis = result.times_ms;
                const freqAxis = result.frequencies;
                const total = timeAxis.length * freqAxis.length;
                const log = new Float64Array(total);
                const raw = new Float64Array(total);
                const linearDisplay = new Float64Array(total);
                let logMin = Number.POSITIVE_INFINITY;
                let logMax = Number.NEGATIVE_INFINITY;
                let linearMin = Number.POSITIVE_INFINITY;
                let linearMax = Number.NEGATIVE_INFINITY;
                for (let t = 0; t < timeAxis.length; t += 1) {
                    const row = result.magnitudes[t] || [];
                    const tBase = t * freqAxis.length;
                    for (let f = 0; f < freqAxis.length; f += 1) {
                        const idx = tBase + f;
                        const v = Number(row[f] ?? NaN);
                        raw[idx] = v;
                        linearDisplay[idx] = v;
                        if (Number.isFinite(v)) {
                            if (v < linearMin) linearMin = v;
                            if (v > linearMax) linearMax = v;
                        }
                        const display = Number.isFinite(v) && v > 0 ? Math.log10(v) : NaN;
                        log[idx] = display;
                        if (Number.isFinite(display)) {
                            if (display < logMin) logMin = display;
                            if (display > logMax) logMax = display;
                        }
                    }
                }
                if (!Number.isFinite(logMin) || !Number.isFinite(logMax)) {
                    logMin = 0;
                    logMax = 1;
                }
                if (!Number.isFinite(linearMin) || !Number.isFinite(linearMax)) {
                    linearMin = 0;
                    linearMax = 1;
                }
                if (!(logMax > logMin)) logMax = logMin + 1;
                if (!(linearMax > linearMin)) linearMax = linearMin + 1;
                const linearPoints = buildPointsFromDisplay(result, linearDisplay, raw);
                const logPoints = buildPointsFromDisplay(result, log, raw);
                return {
                    log,
                    raw,
                    linearPoints,
                    logPoints,
                    visibleLinearPoints: linearPoints.slice(),
                    visibleLogPoints: logPoints.slice(),
                    logMin,
                    logMax,
                    linearMin,
                    linearMax,
                };
            };

            const syncClipEnabled = () => {
                const enabled = clipToggle?.checked ?? false;
                const hint = enabled
                    ? ''
                    : "Enable the 'Outliers' toggle above to change the clip method";
                const liveClipMethod = document.getElementById('spectrogram-clip-method');
                const liveClipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
                setDropdownDisabled('spectrogram-clip-method', !enabled);
                if (liveClipMethod) liveClipMethod.title = hint;
                if (liveClipParam) {
                    liveClipParam.disabled = !enabled;
                    liveClipParam.title = hint;
                }
                const clipMethodField = liveClipMethod?.closest('label, .toolbar-field') as HTMLElement | null;
                const clipParamField = liveClipParam?.closest('label, .toolbar-field') as HTMLElement | null;
                if (clipMethodField) clipMethodField.hidden = !enabled;
                if (clipParamField) clipParamField.hidden = !enabled;
                // Also toggle the wrapping .spectrogram-clip-band so the inline
                // Method/% inputs disappear entirely when Outliers is off —
                // keeps the toolbar single-row at narrow desktop widths.
                const clipBand = document.getElementById('spectrogram-clip-band');
                if (clipBand) clipBand.classList.toggle('is-hidden', !enabled);
            };

            const syncClipParamLabel = () => {
                if (!clipParamLabel) return;
                const method = getDropdownValue('spectrogram-clip-method') || 'percentile';
                clipParamLabel.textContent = method === 'iqr' ? 'Clip k' : 'Clip %';
            };

            const activeScaleLabel = () => {
                return scaleModeLabel(
                    spectrogramAppliedScaleMode,
                    spectrogramAppliedClipMode,
                    spectrogramAppliedClipParam,
                );
            };

            // Populate the floating results context panel anchored to the
            // top-right of the spectrogram chart. Mirrors the FFT page's
            // `.fft-spectral-info` overlay so the user can interpret the
            // rendered result without opening the timeseries or settings.
            const syncSpectrogramSummary = () => {
                if (!summaryEl) return;
                const result = spectrogramResult;
                const rateEl = document.getElementById('spectrogram-summary-rate');
                const nyquistEl = document.getElementById('spectrogram-summary-nyquist');
                const pointsEl = document.getElementById('spectrogram-summary-points');
                const binsEl = document.getElementById('spectrogram-summary-bins');
                if (!result) {
                    summaryEl.hidden = true;
                    return;
                }
                const times = result.times_ms;
                const freqs = result.frequencies;
                const spanMs = Math.max(
                    0,
                    Number(times[times.length - 1] ?? 0) - Number(times[0] ?? 0),
                );
                const sampleRateHz = spanMs > 0 && times.length > 1
                    ? ((times.length - 1) * 1000) / spanMs
                    : NaN;
                const nyquistHz = Number.isFinite(sampleRateHz) ? sampleRateHz / 2 : NaN;
                const formatHz = (hz: number): string => {
                    if (!Number.isFinite(hz)) return '—';
                    if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
                    if (hz >= 1) return `${hz.toFixed(2)} Hz`;
                    return `${(hz * 1000).toFixed(2)} mHz`;
                };
                if (rateEl) rateEl.textContent = formatHz(sampleRateHz);
                if (nyquistEl) nyquistEl.textContent = formatHz(nyquistHz);
                if (pointsEl) pointsEl.textContent = times.length.toLocaleString();
                if (binsEl) binsEl.textContent = freqs.length.toLocaleString();
                summaryEl.hidden = false;
            };

            const formatSpectrogramColorbarNumber = (value: number): string => {
                if (!Number.isFinite(value)) return '—';
                const abs = Math.abs(value);
                if (abs !== 0 && (abs >= 1e4 || abs < 1e-3)) return value.toExponential(2);
                return value.toFixed(3);
            };

            const isColorFilterActive = (
                range: { min: number; max: number } | null,
                bounds: { min: number; max: number } | null,
            ): range is { min: number; max: number } => {
                if (!range || !bounds) return false;
                return !(range.min <= bounds.min && range.max >= bounds.max);
            };

            const fillVisiblePoints = (
                source: SpectrogramPoint[],
                target: SpectrogramPoint[],
                range: { min: number; max: number },
            ): SpectrogramPoint[] => {
                let writeIndex = 0;
                for (const point of source) {
                    const display = Number(point[2]);
                    if (display < range.min || display > range.max) continue;
                    target[writeIndex++] = point;
                }
                target.length = writeIndex;
                return target;
            };

            const getVisiblePointsForMode = (
                cache: NonNullable<typeof cachedGrid>,
                mode: SpectrogramMode,
                range: { min: number; max: number } | null,
                bounds: { min: number; max: number },
            ): SpectrogramPoint[] => {
                const source = mode === 'log' ? cache.logPoints : cache.linearPoints;
                if (!isColorFilterActive(range, bounds)) return source;

                const key = `${mode}:${range.min}:${range.max}`;
                const target = mode === 'log' ? cache.visibleLogPoints : cache.visibleLinearPoints;
                if (cache.lastVisibleMode === mode && cache.lastVisibleRangeKey === key) {
                    return target;
                }
                cache.lastVisibleMode = mode;
                cache.lastVisibleRangeKey = key;
                return fillVisiblePoints(source, target, range);
            };

            const updateColorbarHandles = () => {
                const wrap = document.getElementById('spectrogram-colorbar');
                if (!wrap || !currentScaleBounds) return;
                const handleHigh = wrap.querySelector<HTMLElement>('[data-role="cb-handle-high"]');
                const handleLow = wrap.querySelector<HTMLElement>('[data-role="cb-handle-low"]');
                const fill = wrap.querySelector<HTMLElement>('[data-role="cb-fill"]');
                const { min: scaleMin, max: scaleMax } = currentScaleBounds;
                const span = scaleMax - scaleMin || 1;
                const active = colorFilterRange && !(colorFilterRange.min <= scaleMin && colorFilterRange.max >= scaleMax);
                if (active && colorFilterRange) {
                    const highPct = Math.max(0, Math.min(100, ((scaleMax - colorFilterRange.max) / span) * 100));
                    const lowPct = Math.max(0, Math.min(100, ((colorFilterRange.min - scaleMin) / span) * 100));
                    if (handleHigh) {
                        handleHigh.style.top = `${highPct}%`;
                        handleHigh.setAttribute('aria-valuenow', String(Math.round(100 - highPct)));
                    }
                    if (handleLow) {
                        handleLow.style.bottom = `${lowPct}%`;
                        handleLow.setAttribute('aria-valuenow', String(Math.round(100 - lowPct)));
                    }
                    if (fill) {
                        fill.hidden = false;
                        fill.style.top = `${highPct}%`;
                        fill.style.height = `${Math.max(0, 100 - highPct - lowPct)}%`;
                    }
                    return;
                }
                if (handleHigh) {
                    handleHigh.style.top = '0%';
                    handleHigh.setAttribute('aria-valuenow', '100');
                }
                if (handleLow) {
                    handleLow.style.bottom = '0%';
                    handleLow.setAttribute('aria-valuenow', '0');
                }
                if (fill) fill.hidden = true;
            };

            const updateSpectrogramColorbar = (min: number, max: number, label: string) => {
                const wrap = document.getElementById('spectrogram-colorbar');
                if (!wrap) return;
                const vbar = wrap.querySelector<HTMLElement>('.scatter-colorbar-vbar');
                const high = wrap.querySelector<HTMLElement>('[data-role="cb-high"]');
                const low = wrap.querySelector<HTMLElement>('[data-role="cb-low"]');
                const name = wrap.querySelector<HTMLElement>('.scatter-colorbar-vname');
                if (vbar) {
                    vbar.style.background = 'linear-gradient(to top, #440154, #414487, #2a788e, #22a884, #7ad151, #fde725)';
                }
                if (high) high.textContent = `High · ${formatSpectrogramColorbarNumber(max)}`;
                if (low) low.textContent = `Low · ${formatSpectrogramColorbarNumber(min)}`;
                if (name) name.textContent = label;
                wrap.hidden = false;
                updateColorbarHandles();
            };

            const initColorbarInteraction = () => {
                if (colorbarInteractionInitialized) return;
                const wrap = document.getElementById('spectrogram-colorbar');
                if (!wrap) return;
                const track = wrap.querySelector<HTMLElement>('[data-role="cb-track"]');
                const handleHigh = wrap.querySelector<HTMLElement>('[data-role="cb-handle-high"]');
                const handleLow = wrap.querySelector<HTMLElement>('[data-role="cb-handle-low"]');
                if (!track || !handleHigh || !handleLow) return;
                colorbarInteractionInitialized = true;

                const onHandlePointerDown = (which: 'high' | 'low') => (event: PointerEvent) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    const target = which === 'high' ? handleHigh : handleLow;
                    target.setAttribute('data-dragging', 'true');
                    try { target.setPointerCapture(event.pointerId); } catch { /* noop */ }
                    const startY = event.clientY;
                    const startBounds = currentScaleBounds ? { ...currentScaleBounds } : null;
                    const startFilter = colorFilterRange && startBounds
                        ? { ...colorFilterRange }
                        : (startBounds ? { min: startBounds.min, max: startBounds.max } : null);
                    const minSeparation = startBounds ? (startBounds.max - startBounds.min) * 0.01 : 0.01;

                    const onMove = (moveEvent: PointerEvent) => {
                        if (!startBounds || !startFilter) return;
                        const trackRect = track.getBoundingClientRect();
                        const trackHeight = trackRect.height || 1;
                        const deltaFrac = (moveEvent.clientY - startY) / trackHeight;
                        const deltaValue = -deltaFrac * (startBounds.max - startBounds.min);
                        let nextMin = startFilter.min;
                        let nextMax = startFilter.max;
                        if (which === 'high') {
                            nextMax = Math.max(startFilter.min + minSeparation, Math.min(startBounds.max, startFilter.max + deltaValue));
                        } else {
                            nextMin = Math.max(startBounds.min, Math.min(startFilter.max - minSeparation, startFilter.min + deltaValue));
                        }
                        colorFilterRange = { min: nextMin, max: nextMax };
                        updateColorbarHandles();
                        if (colorbarDragRaf) cancelAnimationFrame(colorbarDragRaf);
                        colorbarDragRaf = requestAnimationFrame(() => {
                            colorbarDragRaf = 0;
                            if (spectrogramResult) void renderSpectrogramChart();
                        });
                    };

                    const onUp = (upEvent: PointerEvent) => {
                        target.removeAttribute('data-dragging');
                        try { target.releasePointerCapture(upEvent.pointerId); } catch { /* noop */ }
                        target.removeEventListener('pointermove', onMove);
                        target.removeEventListener('pointerup', onUp);
                        target.removeEventListener('pointercancel', onUp);
                        if (colorbarDragRaf) {
                            cancelAnimationFrame(colorbarDragRaf);
                            colorbarDragRaf = 0;
                        }
                        if (spectrogramResult) void renderSpectrogramChart();
                    };

                    target.addEventListener('pointermove', onMove);
                    target.addEventListener('pointerup', onUp);
                    target.addEventListener('pointercancel', onUp);
                };

                handleHigh.addEventListener('pointerdown', onHandlePointerDown('high'));
                handleLow.addEventListener('pointerdown', onHandlePointerDown('low'));

                wrap.addEventListener('dblclick', () => {
                    if (!colorFilterRange) return;
                    colorFilterRange = null;
                    updateColorbarHandles();
                    if (spectrogramResult) void renderSpectrogramChart();
                });
            };

            const renderSpectrogramChart = async () => {
                if (!spectrogramResult) return;
                const chart = await ensureSpectrogramChart();
                const logScale = (logCheck?.checked ?? true) && spectrogramAppliedScaleMode === 'none';
                syncClipEnabled();
                syncClipParamLabel();
                const timeAxis = spectrogramResult.times_ms;
                const freqAxis = spectrogramResult.frequencies;
                const mode: SpectrogramMode = logScale ? 'log' : 'linear';

                if (!cachedGrid || cachedGrid.result !== spectrogramResult) {
                    const built = buildCachedGrid(spectrogramResult);
                    cachedGrid = {
                        result: spectrogramResult,
                        log: built.log,
                        raw: built.raw,
                        linearPoints: built.linearPoints,
                        logPoints: built.logPoints,
                        visibleLinearPoints: built.visibleLinearPoints,
                        visibleLogPoints: built.visibleLogPoints,
                        logMin: built.logMin,
                        logMax: built.logMax,
                        linearMin: built.linearMin,
                        linearMax: built.linearMax,
                        lastVisibleMode: null,
                        lastVisibleRangeKey: null,
                    };
                }

                const minValue = mode === 'log' ? cachedGrid.logMin : cachedGrid.linearMin;
                const maxValue = mode === 'log' ? cachedGrid.logMax : cachedGrid.linearMax;
                currentScaleBounds = { min: minValue, max: maxValue };
                const scaleLabel = activeScaleLabel();
                const points = getVisiblePointsForMode(cachedGrid, mode, colorFilterRange, currentScaleBounds);

                const xTickInterval = Math.max(0, Math.ceil(timeAxis.length / 8) - 1);
                const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);
                const maxFrequency = freqAxis.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
                const frequencyUnit = pickFrequencyAxisUnit(maxFrequency);
                const formatFrequencyForAxis = (value: number) => formatFrequencyInUnit(value, frequencyUnit);
                const totalSpanMs = Math.max(0, Number(timeAxis[timeAxis.length - 1] ?? 0) - Number(timeAxis[0] ?? 0));

                chart.setOption({
                    backgroundColor: 'transparent',
                    animation: false,
                    grid: { left: 104, right: 40, top: 36, bottom: 88 },
                    toolbox: {
                        right: 12,
                        feature: {
                            restore: { title: 'Reset zoom' },
                            saveAsImage: { title: 'Save image' },
                        },
                    },
                    tooltip: {
                        trigger: 'item',
                        backgroundColor: 'rgba(8, 12, 20, 0.94)',
                        borderColor: 'rgba(126, 158, 212, 0.28)',
                        textStyle: { color: '#eef4ff' },
                        formatter: (params: any) => {
                            const value = params?.value || [];
                            const xIndex = Number(value[0]);
                            const yIndex = Number(value[1]);
                            const displayMagnitude = Number(value[2]);
                            const rawMagnitude = Number(value[3]);
                            const timeMs = Number(timeAxis[xIndex]);
                            const freq = Number(freqAxis[yIndex]);
                            return [
                                `<strong>${spectrogramResult?.column || 'Spectrogram'}</strong>`,
                                `Time: ${formatSpectrogramTime(timeMs)}`,
                                `Frequency: ${formatFrequencyForAxis(freq)}`,
                                `Intensity: ${displayMagnitude.toFixed(4)}${logScale ? ' log10' : ` (${scaleLabel})`}`,
                                `Raw magnitude: ${rawMagnitude.toExponential(4)}`,
                            ].join('<br>');
                        },
                    },
                    xAxis: {
                        type: 'category',
                        data: timeAxis,
                        name: 'Time',
                        nameLocation: 'middle',
                        nameGap: 48,
                        axisLabel: {
                            color: '#9fb1d1',
                            rotate: totalSpanMs > 48 * 60 * 60_000 ? 0 : 15,
                            interval: xTickInterval,
                            formatter: (value: string | number) => {
                                const date = new Date(Number(value));
                                if (totalSpanMs > 48 * 60 * 60_000) {
                                    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
                                }
                                return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            },
                        },
                        splitLine: { show: false },
                    },
                    yAxis: {
                        type: 'category',
                        data: freqAxis,
                        name: `Frequency (${frequencyUnit})`,
                        nameLocation: 'middle',
                        nameGap: 84,
                        axisLabel: {
                            color: '#9fb1d1',
                            interval: yTickInterval,
                            formatter: (value: string | number) => formatFrequencyForAxis(Number(value)),
                        },
                        splitLine: { show: false },
                    },
                    visualMap: {
                        show: false,
                        min: minValue,
                        max: maxValue,
                        calculable: false,
                        inRange: {
                            color: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
                        },
                    },
                    dataZoom: [
                        {
                            type: 'inside', xAxisIndex: 0, filterMode: 'none',
                            zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
                        },
                        {
                            type: 'inside', yAxisIndex: 0, filterMode: 'none',
                            zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
                        },
                    ],
                    series: [{
                        name: spectrogramResult.column,
                        type: 'heatmap',
                        // Chunked rendering keeps the heatmap responsive
                        // during a visualMap drag and on large datasets.
                        // The default (`progressive: 0`) does a single
                        // synchronous draw of every cell, which is the
                        // main cause of the perceived "sluggish" feel
                        // when dragging the colorscale handles.
                        progressive: 4000,
                        progressiveThreshold: 8000,
                        emphasis: { itemStyle: { borderColor: '#ffffff', borderWidth: 1 } },
                        data: points,
                    }],
                });

                const dominantBand = findDominantFrequencyBand(spectrogramResult);
                if (summaryEl) {
                    // Populate the structured context panel with derived
                    // metrics (sample rate, Nyquist, time points, frequency
                    // bins). The existing single-line summary text is
                    // preserved in `aria-label` for screen readers.
                    const summaryParts = [
                        `Spectrogram of ${spectrogramResult.column}`,
                        `Window ${resolveSpectrogramWindowSize()}`,
                        `Hop ${resolveSpectrogramHopSize(resolveSpectrogramWindowSize())}`,
                        scaleModeLabel(spectrogramAppliedScaleMode, spectrogramAppliedClipMode, spectrogramAppliedClipParam),
                    ];
                    if (dominantBand) {
                        summaryParts.push(`Peak ${formatFrequencyForAxis(dominantBand.dominantHz)}`);
                    }
                    summaryEl.setAttribute('aria-label', summaryParts.join(' · '));
                    syncSpectrogramSummary();
                }
                if (autoFitToggle?.checked && dominantBand && freqAxis.length > 1) {
                    const denom = Math.max(1, freqAxis.length - 1);
                    chart.dispatchAction({
                        type: 'dataZoom',
                        dataZoomIndex: 1,
                        start: (dominantBand.lowerIndex / denom) * 100,
                        end: (dominantBand.upperIndex / denom) * 100,
                    });
                }

                initColorbarInteraction();
                updateSpectrogramColorbar(minValue, maxValue, logScale ? 'log10' : scaleLabel);
                syncSpectrogramSummary();
                syncSpectrogramEmptyState();
            };

            const computeSpectrogram = async () => {
                const column = getDropdownValue('spectrogram-col-select');
                if (!column) {
                    syncSpectrogramEmptyState('Pick a numeric column and click Compute to generate the spectrogram.');
                    return;
                }
                const viewport = workspaceViewport();
                const startMs = viewport?.xMin ?? chartState.currentStart;
                const endMs = viewport?.xMax ?? chartState.currentEnd;
                if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
                    return;
                }

                const winSize = resolveSpectrogramWindowSize();
                const hopSize = resolveSpectrogramHopSize(winSize);
                const normalize = (getDropdownValue('spectrogram-normalize') || 'zscore') as ScaleMode;
                const clipEnabled = !!clipToggle?.checked;
                const clipMethod = (getDropdownValue('spectrogram-clip-method') || 'percentile') as ClipMode;
                const clipParam = Number.parseFloat(
                    (document.getElementById('spectrogram-clip-param') as HTMLInputElement | null)?.value || '0.5',
                );
                const appliedClipMode: ClipMode = clipEnabled ? clipMethod : 'none';
                const appliedClipParam = Number.isFinite(clipParam) ? clipParam : 0.5;
                try {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', true);
                    spectrogramRenderError = null;
                    colorFilterRange = null;

                    if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
                        throw new Error('No time range available.');
                    }
                    const startIso = new Date(startMs).toISOString();
                    const endIso = new Date(endMs).toISOString();
                    const response = await fetchSpectrogram(
                        startIso,
                        endIso,
                        column,
                        winSize,
                        hopSize,
                        131072,
                        undefined,
                        {
                            normalize,
                            clip: appliedClipMode,
                            clipParam: appliedClipParam,
                        },
                    );

                    spectrogramAppliedScaleMode = normalize;
                    spectrogramAppliedClipMode = appliedClipMode;
                    spectrogramAppliedClipParam = appliedClipParam;
                    spectrogramResult = response.result;
                    await renderSpectrogramChart();
                    spectrogramRenderError = null;
                    syncSpectrogramEmptyState();
                } catch (error: any) {
                    console.error('[edatime:spectrogram] render failed', error);
                    spectrogramResult = null;
                    spectrogramRenderError = `Spectrogram generation failed: ${String(error?.message ?? error)}`;
                    syncSpectrogramSummary();
                    syncSpectrogramEmptyState();
                    toast(spectrogramRenderError, 'error', { duration: 6000 });
                } finally {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', false);
                }
            };

            const maybeAutoComputeSpectrogram = () => {
                if (autoComputeStarted || spectrogramResult) return;
                if (!getDropdownValue('spectrogram-col-select')) return;
                const viewport = workspaceViewport();
                if (!Number.isFinite(viewport?.xMin ?? chartState.currentStart) || !Number.isFinite(viewport?.xMax ?? chartState.currentEnd)) return;
                autoComputeStarted = true;
                if (!autoComputeExplained) {
                    autoComputeExplained = true;
                    const autoColumn = getDropdownValue('spectrogram-col-select');
                    toast(`Loaded ${autoColumn} automatically. Pick another column and press Compute to switch.`, 'info', {
                        duration: 5000,
                    });
                }
                void computeSpectrogram();
            };

            // ── Column select population ───────────────────────────────────────
            const metadata = workspaceMetadata();
            if (metadata) {
                setDropdownOptions('spectrogram-col-select', metadata.numeric_columns.map((column) => ({
                    value: column,
                    label: column,
                })), {
                    preferredValue: getDropdownValue('spectrogram-col-select'),
                });
            }
            syncSpectrogramEmptyState();
            syncClipEnabled();
            syncClipParamLabel();
            syncSpectrogramCustomInputs();
            syncSpectrogramSummary();

            // ── Compute button ─────────────────────────────────────────────────
            document.getElementById('spectrogram-compute-btn')?.addEventListener('click', async () => {
                autoComputeStarted = true;
                await computeSpectrogram();
            });

            logCheck?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            document.getElementById('spectrogram-win-size')?.addEventListener('change', syncSpectrogramCustomInputs);
            document.getElementById('spectrogram-win-size')?.addEventListener('input', syncSpectrogramCustomInputs);
            document.getElementById('spectrogram-hop-size')?.addEventListener('change', syncSpectrogramCustomInputs);
            document.getElementById('spectrogram-hop-size')?.addEventListener('input', syncSpectrogramCustomInputs);
            const onClipToggleChange = () => {
                syncClipEnabled();
            };
            clipToggle?.addEventListener('change', onClipToggleChange);
            clipToggle?.addEventListener('input', onClipToggleChange);
            document.getElementById('spectrogram-clip-method')?.addEventListener('change', () => {
                syncClipParamLabel();
            });
            autoFitToggle?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            resetZoomBtn?.addEventListener('click', () => {
                if (!spectrogramChart) return;
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
            });

            maybeAutoComputeSpectrogram();
        },
        onVisible() {
            const visibleClipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const visibleClipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
            const visibleClipMethod = document.getElementById('spectrogram-clip-method');
            const visibleClipMethodValue = getDropdownValue('spectrogram-clip-method') || 'percentile';
            const visibleClipParamLabel = document.getElementById('spectrogram-clip-param-label');
            if (visibleClipParamLabel) {
                visibleClipParamLabel.textContent = visibleClipMethodValue === 'iqr' ? 'Clip k' : 'Clip %';
            }
            if (visibleClipToggle) {
                const enabled = visibleClipToggle.checked;
                const hint = enabled
                    ? ''
                    : "Enable the 'Outliers' toggle above to change the clip method";
                setDropdownDisabled('spectrogram-clip-method', !enabled);
                if (visibleClipMethod) visibleClipMethod.title = hint;
                if (visibleClipParam) {
                    visibleClipParam.disabled = !enabled;
                    visibleClipParam.title = hint;
                }
                const clipMethodField = visibleClipMethod?.closest('label, .toolbar-field') as HTMLElement | null;
                const clipParamField = visibleClipParam?.closest('label, .toolbar-field') as HTMLElement | null;
                if (clipMethodField) clipMethodField.hidden = !enabled;
                if (clipParamField) clipParamField.hidden = !enabled;
            }
            syncSpectrogramCustomInputs();
            const colSelect = document.getElementById('spectrogram-col-select');
            const metadata = workspaceMetadata();
            if (metadata && colSelect) {
                const currentOptions = new Set(getDropdownOptions('spectrogram-col-select').map((option) => option.value));
                for (const column of metadata.numeric_columns) {
                    currentOptions.add(column);
                }
                setDropdownOptions('spectrogram-col-select', Array.from(currentOptions).map((column) => ({
                    value: column,
                    label: column,
                })), {
                    preferredValue: getDropdownValue('spectrogram-col-select'),
                });
                const chartElLocal = document.getElementById('spectrogram-chart') as HTMLDivElement | null;
                const isReady = chartElLocal && chartElLocal.clientWidth > 0 && chartElLocal.clientHeight > 0;
                if (isReady) {
                    spectrogramChart?.resize?.();
                } else {
                    const waitForReady = async () => {
                        for (let i = 0; i < 20; i++) {
                            await new Promise((resolve) => window.setTimeout(resolve, 0));
                            if (chartElLocal && chartElLocal.clientWidth > 0 && chartElLocal.clientHeight > 0) {
                                spectrogramChart?.resize?.();
                                return;
                            }
                        }
                    };
                    void waitForReady();
                }
            }
            if (!spectrogramResult && !spectrogramRenderError) {
                autoComputeStarted = false;
            }
        },
    });

    return {
        mount: () => spectrogramRuntime.mount(),
    };
}
