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
import { appState } from '../store/index.js';
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
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';
import { toast } from '../utils/toast.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

// ── Module-level chart state ─────────────────────────────────────────────────
let spectrogramChart: any = null;
let spectrogramResizeObserver: ResizeObserver | null = null;
let spectrogramResult: SpectrogramResult | null = null;
let spectrogramRenderError: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSpectrogramTime(timestampMs: number): string {
    return new Date(timestampMs).toLocaleString([], {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function formatSpectrogramFrequency(frequency: number): string {
    if (!Number.isFinite(frequency)) return '—';
    if (frequency >= 1000) return `${(frequency / 1000).toFixed(2)} kHz`;
    if (frequency >= 1) return `${frequency.toFixed(2)} Hz`;
    return `${(frequency * 1000).toFixed(2)} mHz`;
}

// ── Runtime factory ───────────────────────────────────────────────────────────
export function createSpectrogramChartRuntime(deps: SpectrogramPageDeps) {
    let spectrogramRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;

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
            const winSelect = document.getElementById('spectrogram-win-size') as HTMLElement | null;
            const logCheck = document.getElementById('spectrogram-log-scale') as HTMLInputElement | null;
            const clipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const clipParamLabel = document.getElementById('spectrogram-clip-param-label') as HTMLElement | null;
            const resetZoomBtn = document.getElementById('spectrogram-zoom-reset-btn') as HTMLButtonElement | null;
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
                const grid = { left: 72, right: 110, top: 24, bottom: 80 };

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
            // We cache two artefacts keyed by the underlying
            // `spectrogramResult` identity:
            //
            //   `cachedGrid`     — a Float64Array of length (time × freq)
            //                      holding the *log-domain* magnitudes. This
            //                      is the expensive Math.log10 work and
            //                      only needs to happen once per Compute.
            //   `cachedPoints`   — the full `[x, y, value, timeMs, freq,
            //                      raw]` tuples ECharts consumes. Building
            //                      this still costs O(N) but skips the
            //                      Math.log10 step, and we only rebuild it
            //                      when the user toggles log scale or the
            //                      active dataset changes.
            //   `cachedRawMag`   — parallel Float64Array of raw magnitudes
            //                      so the log-scale flip can rebuild the
            //                      display values in one tight loop over
            //                      typed arrays (no per-cell object alloc).
            let cachedGrid: {
                result: SpectrogramResult;
                log: Float64Array;
                raw: Float64Array;
                freqLen: number;
                points: [number, number, number, number, number, number][];
                logMin: number;
                logMax: number;
                rawMin: number;
                rawMax: number;
                logScale: boolean;
            } | null = null;

            let currentScaleBounds: { min: number; max: number } | null = null;
            let colorFilterRange: { min: number; max: number } | null = null;
            let colorbarInteractionInitialized = false;
            let colorbarDragRaf = 0;

            const buildCachedGrid = (result: SpectrogramResult) => {
                const timeAxis = result.times_ms;
                const freqAxis = result.frequencies;
                const total = timeAxis.length * freqAxis.length;
                const log = new Float64Array(total);
                const raw = new Float64Array(total);
                let logMin = Number.POSITIVE_INFINITY;
                let logMax = Number.NEGATIVE_INFINITY;
                let rawMin = Number.POSITIVE_INFINITY;
                let rawMax = Number.NEGATIVE_INFINITY;
                for (let t = 0; t < timeAxis.length; t += 1) {
                    const row = result.magnitudes[t] || [];
                    const tBase = t * freqAxis.length;
                    for (let f = 0; f < freqAxis.length; f += 1) {
                        const idx = tBase + f;
                        const v = Number(row[f] ?? NaN);
                        raw[idx] = v;
                        if (Number.isFinite(v)) {
                            if (v < rawMin) rawMin = v;
                            if (v > rawMax) rawMax = v;
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
                if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
                    rawMin = 0;
                    rawMax = 1;
                }
                if (!(logMax > logMin)) logMax = logMin + 1;
                if (!(rawMax > rawMin)) rawMax = rawMin + 1;
                return { log, raw, logMin, logMax, rawMin, rawMax, total, freqLen: freqAxis.length };
            };

            const buildPointsFromGrid = (
                result: SpectrogramResult,
                grid: { log: Float64Array; raw: Float64Array; freqLen: number },
                logScale: boolean,
            ): [number, number, number, number, number, number][] => {
                const timeAxis = result.times_ms;
                const freqAxis = result.frequencies;
                const total = grid.log.length;
                const points: [number, number, number, number, number, number][] = new Array(total);
                let writeIndex = 0;
                for (let t = 0; t < timeAxis.length; t += 1) {
                    const timeMs = timeAxis[t];
                    const tBase = t * grid.freqLen;
                    for (let f = 0; f < freqAxis.length; f += 1) {
                        const idx = tBase + f;
                        const rawMag = grid.raw[idx];
                        const display = logScale
                            ? grid.log[idx]
                            : (Number.isFinite(rawMag) ? rawMag : grid.log[idx]);
                        if (!Number.isFinite(display)) continue;
                        points[writeIndex++] = [t, f, display, timeMs, freqAxis[f], rawMag];
                    }
                }
                points.length = writeIndex;
                return points;
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
            };

            const syncClipParamLabel = () => {
                if (!clipParamLabel) return;
                const method = getDropdownValue('spectrogram-clip-method') || 'percentile';
                clipParamLabel.textContent = method === 'iqr' ? 'Clip k' : 'Clip %';
            };

            const activeScaleLabel = () => {
                const mode = (getDropdownValue('spectrogram-normalize') || 'none') as ScaleMode;
                const method = (getDropdownValue('spectrogram-clip-method') || 'percentile') as ClipMode;
                const clipParamValue = Number.parseFloat(
                    (document.getElementById('spectrogram-clip-param') as HTMLInputElement | null)?.value || '0.5',
                );
                const clipParam = Number.isFinite(clipParamValue) ? clipParamValue : 0.5;
                const clipMode: ClipMode = clipToggle?.checked ? method : 'none';
                return scaleModeLabel(mode, clipMode, clipParam);
            };

            const formatSpectrogramColorbarNumber = (value: number): string => {
                if (!Number.isFinite(value)) return '—';
                const abs = Math.abs(value);
                if (abs !== 0 && (abs >= 1e4 || abs < 1e-3)) return value.toExponential(2);
                return value.toFixed(3);
            };

            const isInsideColorFilter = (value: number): boolean => {
                if (!colorFilterRange || !currentScaleBounds) return true;
                const { min: fMin, max: fMax } = colorFilterRange;
                const { min: sMin, max: sMax } = currentScaleBounds;
                if (fMin <= sMin && fMax >= sMax) return true;
                return value >= fMin && value <= fMax;
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
                const logScale = logCheck?.checked ?? true;
                syncClipEnabled();
                syncClipParamLabel();
                const timeAxis = spectrogramResult.times_ms;
                const freqAxis = spectrogramResult.frequencies;

                // Rebuild the underlying log/raw Float64Arrays only when the
                // Compute produced a new spectrogram. The Math.log10 pass is
                // by far the most expensive step (~9M cells on a 70k-row
                // dataset with a 256 window) so we never want to repeat it
                // just because the user toggled log scale.
                if (!cachedGrid || cachedGrid.result !== spectrogramResult) {
                    const built = buildCachedGrid(spectrogramResult);
                    cachedGrid = {
                        result: spectrogramResult,
                        log: built.log,
                        raw: built.raw,
                        freqLen: built.freqLen,
                        points: buildPointsFromGrid(spectrogramResult, built, logScale),
                        logMin: built.logMin,
                        logMax: built.logMax,
                        rawMin: built.rawMin,
                        rawMax: built.rawMax,
                        logScale,
                    };
                } else if (cachedGrid.logScale !== logScale) {
                    // Log-scale flip: rebuild only the visible points from
                    // the cached typed arrays. No Math.log10, no nested
                    // `spectrogramResult.magnitudes[t]` lookups.
                    cachedGrid.points = buildPointsFromGrid(spectrogramResult, cachedGrid, logScale);
                    cachedGrid.logScale = logScale;
                }

                const minValue = logScale ? cachedGrid.logMin : cachedGrid.rawMin;
                const maxValue = logScale ? cachedGrid.logMax : cachedGrid.rawMax;
                currentScaleBounds = { min: minValue, max: maxValue };
                const scaleLabel = activeScaleLabel();
                const points = cachedGrid.points.filter((point) => isInsideColorFilter(Number(point[2])));

                const xTickInterval = Math.max(0, Math.floor(timeAxis.length / 10) - 1);
                const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);

                chart.setOption({
                    backgroundColor: 'transparent',
                    animation: false,
                    grid: { left: 72, right: 24, top: 24, bottom: 80 },
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
                            const timeMs = Number(value[3]);
                            const freq = Number(value[4]);
                            const displayMagnitude = Number(value[2]);
                            const rawMagnitude = Number(value[5]);
                            return [
                                `<strong>${spectrogramResult?.column || 'Spectrogram'}</strong>`,
                                `Time: ${formatSpectrogramTime(timeMs)}`,
                                `Frequency: ${formatSpectrogramFrequency(freq)}`,
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
                            rotate: 30,
                            interval: xTickInterval,
                            formatter: (value: string | number) => {
                                const date = new Date(Number(value));
                                return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}\n${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            },
                        },
                        splitLine: { show: false },
                    },
                    yAxis: {
                        type: 'category',
                        data: freqAxis,
                        name: 'Frequency (Hz)',
                        nameLocation: 'middle',
                        nameGap: 56,
                        axisLabel: {
                            color: '#9fb1d1',
                            interval: yTickInterval,
                            formatter: (value: string | number) => formatSpectrogramFrequency(Number(value)),
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

                initColorbarInteraction();
                updateSpectrogramColorbar(minValue, maxValue, logScale ? 'log10' : scaleLabel);
                syncSpectrogramEmptyState();
            };

            // ── Column select population ───────────────────────────────────────
            if (appState.metadata) {
                setDropdownOptions('spectrogram-col-select', appState.metadata.numeric_columns.map((column) => ({
                    value: column,
                    label: column,
                })), {
                    preferredValue: getDropdownValue('spectrogram-col-select'),
                });
            }
            syncSpectrogramEmptyState();
            syncClipEnabled();
            syncClipParamLabel();

            // ── Compute button ─────────────────────────────────────────────────
            document.getElementById('spectrogram-compute-btn')?.addEventListener('click', async () => {
                const column = getDropdownValue('spectrogram-col-select');
                if (!column) {
                    syncSpectrogramEmptyState('Pick a numeric column and click Compute to generate the spectrogram.');
                    return;
                }
                if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) {
                    return;
                }

                const winSize = Number.parseInt(getDropdownValue('spectrogram-win-size') || '96', 10);
                const hopRatioRaw = Number.parseFloat(getDropdownValue('spectrogram-hop-size') || '0.5');
                const hopRatio = Number.isFinite(hopRatioRaw) && hopRatioRaw > 0 && hopRatioRaw < 1 ? hopRatioRaw : 0.5;
                const hopSize = Math.max(1, Math.round(winSize * hopRatio));
                const normalize = String(getDropdownValue('spectrogram-normalize') || 'none');
                const clipEnabled = !!clipToggle?.checked;
                const clipMethod = String(getDropdownValue('spectrogram-clip-method') || 'percentile');
                const clipParam = Number.parseFloat(
                    (document.getElementById('spectrogram-clip-param') as HTMLInputElement | null)?.value || '0.5',
                );
                try {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', true);
                    // Clear any previous error state since the user just
                    // requested a new compute.
                    spectrogramRenderError = null;
                    colorFilterRange = null;

                    const startMs = appState.currentStart;
                    const endMs = appState.currentEnd;
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
                        // Cap max_points so a 70k-row dataset keeps full
                        // resolution by default; the backend will stride
                        // down only if needed.
                        131072,
                        undefined,
                        {
                            normalize,
                            clip: clipEnabled ? clipMethod : 'none',
                            clipParam: Number.isFinite(clipParam) ? clipParam : 0.5,
                        },
                    );

                    spectrogramResult = response.result;
                    await renderSpectrogramChart();
                    // Successful render — clear the error placeholder.
                    spectrogramRenderError = null;
                    syncSpectrogramEmptyState();
                } catch (error: any) {
                    console.error('[edatime:spectrogram] render failed', error);
                    spectrogramResult = null;
                    spectrogramRenderError = `Spectrogram generation failed: ${String(error?.message ?? error)}`;
                    syncSpectrogramEmptyState();
                    toast(spectrogramRenderError, 'error', { duration: 6000 });
                } finally {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', false);
                }
            });

            logCheck?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            document.getElementById('spectrogram-normalize')?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            const onClipToggleChange = () => {
                syncClipEnabled();
                if (spectrogramResult) void renderSpectrogramChart();
            };
            clipToggle?.addEventListener('change', onClipToggleChange);
            clipToggle?.addEventListener('input', onClipToggleChange);
            document.getElementById('spectrogram-clip-method')?.addEventListener('change', () => {
                syncClipParamLabel();
                if (spectrogramResult) void renderSpectrogramChart();
            });
            document.getElementById('spectrogram-clip-param')?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            resetZoomBtn?.addEventListener('click', () => {
                if (!spectrogramChart) return;
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
            });
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
            }
            const colSelect = document.getElementById('spectrogram-col-select');
            if (appState.metadata && colSelect) {
                const currentOptions = new Set(getDropdownOptions('spectrogram-col-select').map((option) => option.value));
                for (const column of appState.metadata.numeric_columns) {
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
        },
    });

    return {
        mount: () => spectrogramRuntime.mount(),
    };
}
