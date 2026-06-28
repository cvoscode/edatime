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
import { getDropdownOptions, getDropdownValue, setDropdownDisabled, setDropdownOptions } from '../ui/primitives/Dropdown.js';
import {
    applySpectralScale,
    scaleModeLabel,
    type ClipMode,
    type ScaleMode,
} from '../utils/spectralScaling.js';
import { createAnalysisPageRuntime } from './shared/analysisPageRuntime.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

// ── Module-level chart state ─────────────────────────────────────────────────
let spectrogramChart: any = null;
let spectrogramResizeObserver: ResizeObserver | null = null;
let spectrogramResult: SpectrogramResult | null = null;

// Cache of pre-scaled spectrogram magnitudes keyed by
// (column, scaleMode, clipMode, clipParam, logScale). On every render
// the same set of magnitudes would otherwise be flattened into a
// Float64Array and run through `applySpectralScale` even when the
// only thing that changed is the colorbar filter bounds. Reusing the
// scaled values keeps the colorbar-drag hot path cheap. The cache is
// invalidated automatically when the user picks a different scaling
// combination because the key captures every input that feeds into
// `applySpectralScale` and the log transform.
interface ScaledSpectrogram {
    vmin: number;
    vmax: number;
    displayValues: Float64Array;
    flat: Float64Array;
}
const scaledSpectrogramCache = new Map<string, ScaledSpectrogram>();

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
        spectrogramRuntime?.updateEmptyState({
            visible: !spectrogramResult,
            reason: spectrogramResult ? '' : 'no-columns-selected',
            title: '',
            message: '',
            fallbackText: message || 'Pick a numeric column and click Compute to generate the spectrogram.',
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
            const normalizeSelect = document.getElementById('spectrogram-normalize') as HTMLSelectElement | null;
            const clipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const clipMethod = document.getElementById('spectrogram-clip-method') as HTMLSelectElement | null;
            const clipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
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
            const renderSpectrogramChart = async () => {
                if (!spectrogramResult) return;
                const chart = await ensureSpectrogramChart();
                const logScale = logCheck?.checked ?? true;
                const scaleMode = ((getDropdownValue('spectrogram-normalize') || 'none') as ScaleMode);
                // Always sync the disabled state from the current toggle before
                // reading the rest of the clip inputs — this is the single
                // source of truth for the gated fields and survives any
                // listener-timing quirks (cached bundle, label-driven toggle,
                // back-forward cache restore).
                syncClipEnabled();
                const clipEnabled = clipToggle?.checked ?? false;
                const clipMethodValue = (getDropdownValue('spectrogram-clip-method') || 'percentile') as ClipMode;
                const clipParamEl = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
                const clipParamValue = Number.parseFloat(clipParamEl?.value ?? '0.5');
                const clipParam = Number.isFinite(clipParamValue) ? clipParamValue : 0.5;
                const clipMode: ClipMode = clipEnabled ? clipMethodValue : 'none';

                const points: [number, number, number, number, number, number][] = [];
                const timeAxis = spectrogramResult.times_ms;
                const freqAxis = spectrogramResult.frequencies;

                // Flatten magnitudes into a single typed array — log first if
                // requested, then pass through applySpectralScale for clip +
                // normalize. Reuse a cached scaled buffer when the
                // (column, scale, clip, log) combination is unchanged so
                // colorbar drags do not retrigger the O(N) flatten +
                // applySpectralScale work.
                const total = timeAxis.length * freqAxis.length;
                const cacheKey = [
                    spectrogramResult.column,
                    scaleMode,
                    clipMode,
                    clipParam,
                    logScale ? 'log' : 'linear',
                    total,
                ].join('|');
                let scaled = scaledSpectrogramCache.get(cacheKey);
                if (!scaled) {
                    const flat = new Float64Array(total);
                    for (let i = 0; i < total; i += 1) {
                        const timeIndex = Math.floor(i / freqAxis.length);
                        const freqIndex = i % freqAxis.length;
                        const raw = Number(spectrogramResult.magnitudes[timeIndex]?.[freqIndex] ?? NaN);
                        flat[i] = logScale ? Math.log10(Math.max(raw, 1e-30)) : raw;
                    }
                    const scaledFresh = applySpectralScale(flat, { mode: scaleMode, clip: clipMode, clipParam });
                    scaled = { ...scaledFresh, flat };
                    scaledSpectrogramCache.set(cacheKey, scaled);
                    // Evict the oldest entry when the cache grows past 8
                    // combinations (different clip params, normalize modes,
                    // columns) so a long-lived session cannot leak memory.
                    if (scaledSpectrogramCache.size > 8) {
                        const oldestKey = Array.from(scaledSpectrogramCache.keys())[0];
                        if (oldestKey !== undefined) scaledSpectrogramCache.delete(oldestKey);
                    }
                }
                const minValue = scaled.vmin;
                const maxValue = scaled.vmax;
                const scaleLabel = scaleModeLabel(scaleMode, clipMode, clipParam);

                // Capture the global scale bounds so the colorbar filter
                // handles can position themselves in absolute value space.
                currentScaleBounds = { min: minValue, max: maxValue };

                for (let i = 0; i < total; i += 1) {
                    const timeIndex = Math.floor(i / freqAxis.length);
                    const freqIndex = i % freqAxis.length;
                    const timeMs = timeAxis[timeIndex];
                    const freq = freqAxis[freqIndex];
                    const rawMagnitude = Number(spectrogramResult.magnitudes[timeIndex]?.[freqIndex] ?? 0);
                    const displayMagnitude = scaled.displayValues[i];
                    if (!Number.isFinite(displayMagnitude)) continue;
                    // Apply the user-defined color filter (range drag on the
                    // colorbar). Filtered-out cells are dropped from the
                    // data array; ECharts heatmap treats missing cells as
                    // transparent when combined with a visualMap that has
                    // an out-of-range color set to transparent. (We
                    // configure visualMap.inRange.outOfRange below.)
                    if (!isInsideColorFilter(displayMagnitude)) continue;
                    points.push([timeIndex, freqIndex, displayMagnitude, timeMs, freq, rawMagnitude]);
                }

                const xTickInterval = Math.max(0, Math.floor(timeAxis.length / 10) - 1);
                const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);

                chart.setOption({
                    backgroundColor: 'transparent',
                    animation: false,
                    // Colorbar moved out of ECharts into a DOM sibling
                    // (#spectrogram-colorbar). Shrink grid.right so the heatmap
                    // uses the space the visualMap used to occupy.
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
                            const intensityLabel = logScale && scaleMode === 'none'
                                ? `${displayMagnitude.toFixed(4)} log10`
                                : `${displayMagnitude.toFixed(4)} (${scaleLabel})`;
                            return [
                                `<strong>${spectrogramResult?.column || 'Spectrogram'}</strong>`,
                                `Time: ${formatSpectrogramTime(timeMs)}`,
                                `Frequency: ${formatSpectrogramFrequency(freq)}`,
                                `Intensity: ${intensityLabel}`,
                                `Raw magnitude: ${rawMagnitude.toExponential(4)}`,
                            ].join('<br>');
                        },
                    },
                    xAxis: {
                        type: 'category',
                        data: timeAxis,
                        name: 'Time',
                        nameLocation: 'middle',
                        nameGap: 56,
                        nameTextStyle: {
                            color: '#cfd9f1',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: [8, 0, 0, 0],
                        },
                        axisLabel: {
                            color: '#9fb1d1',
                            fontSize: 11,
                            rotate: 30,
                            interval: xTickInterval,
                            hideOverlap: true,
                            margin: 10,
                            formatter: (value: string | number) => {
                                const date = new Date(Number(value));
                                return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}\n${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            },
                        },
                        axisTick: {
                            alignWithLabel: true,
                        },
                        splitLine: { show: false },
                    },
                    yAxis: {
                        type: 'category',
                        data: freqAxis,
                        name: 'Frequency (Hz)',
                        nameLocation: 'middle',
                        nameGap: 72,
                        nameTextStyle: {
                            color: '#cfd9f1',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: [0, 0, 8, 0],
                        },
                        axisLabel: {
                            color: '#9fb1d1',
                            fontSize: 11,
                            interval: yTickInterval,
                            hideOverlap: true,
                            margin: 8,
                            formatter: (value: string | number) => formatSpectrogramFrequency(Number(value)),
                        },
                        axisTick: {
                            alignWithLabel: true,
                        },
                        splitLine: { show: false },
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
                    // ECharts requires a visualMap for heatmap series to map
                    // values to colors. We hide it (show: false) and use the
                    // DOM colorbar sibling (#spectrogram-colorbar) as the
                    // user-facing color scale.
                    visualMap: {
                        show: false,
                        min: minValue,
                        max: maxValue,
                        calculable: false,
                        inRange: {
                            color: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
                        },
                    },
                    series: [{
                        name: spectrogramResult.column,
                        type: 'heatmap',
                        progressive: 0,
                        emphasis: { itemStyle: { borderColor: '#ffffff', borderWidth: 1 } },
                        data: points,
                    }],
                });

                updateSpectrogramColorbar({
                    min: minValue,
                    max: maxValue,
                    label: scaleLabel,
                });

                syncSpectrogramEmptyState();
            };

            // ── DOM colorbar (replaces ECharts visualMap) ─────────────────────
            const VIRIDIS_STOPS = [
                '#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725',
            ] as const;

            const updateSpectrogramColorbar = (args: { min: number; max: number; label: string }) => {
                const wrap = document.getElementById('spectrogram-colorbar');
                if (!wrap) return;
                const vbar = wrap.querySelector<HTMLElement>('.scatter-colorbar-vbar');
                const vtickHigh = wrap.querySelector<HTMLElement>('[data-role="cb-high"]');
                const vtickLow = wrap.querySelector<HTMLElement>('[data-role="cb-low"]');
                const vtickMidHigh = wrap.querySelector<HTMLElement>('[data-role="cb-mid-high"]');
                const vtickMidLow = wrap.querySelector<HTMLElement>('[data-role="cb-mid-low"]');
                const midMarkHigh = wrap.querySelector<HTMLElement>('[data-role="cb-mid-mark-high"]');
                const midMarkMid = wrap.querySelector<HTMLElement>('[data-role="cb-mid-mark-mid"]');
                const midMarkLow = wrap.querySelector<HTMLElement>('[data-role="cb-mid-mark-low"]');
                const vname = wrap.querySelector<HTMLElement>('.scatter-colorbar-vname');
                if (vbar) {
                    vbar.style.background = `linear-gradient(to top, ${VIRIDIS_STOPS.join(', ')})`;
                }
                if (vtickHigh) vtickHigh.textContent = `High · ${formatSpectrogramColorbarNumber(args.max)}`;
                if (vtickLow) vtickLow.textContent = `Low · ${formatSpectrogramColorbarNumber(args.min)}`;
                // Populate the intermediate (25% / 75%) tick labels and reveal
                // the corresponding tick marks on the gradient bar. These give
                // the user a finer-grained reading of intensity without
                // forcing them to drag the filter handles.
                const showMid = Number.isFinite(args.min) && Number.isFinite(args.max) && args.max !== args.min;
                const midHighValue = args.min + 0.25 * (args.max - args.min);
                const midLowValue = args.min + 0.75 * (args.max - args.min);
                if (vtickMidHigh) {
                    vtickMidHigh.textContent = `· ${formatSpectrogramColorbarNumber(midHighValue)}`;
                    vtickMidHigh.hidden = !showMid;
                }
                if (vtickMidLow) {
                    vtickMidLow.textContent = `· ${formatSpectrogramColorbarNumber(midLowValue)}`;
                    vtickMidLow.hidden = !showMid;
                }
                if (midMarkHigh) midMarkHigh.hidden = !showMid;
                if (midMarkMid) midMarkMid.hidden = !showMid;
                if (midMarkLow) midMarkLow.hidden = !showMid;
                if (vname) vname.textContent = args.label;
                wrap.hidden = false;
                initColorbarInteraction();
                updateColorbarHandles();
            };

            const formatSpectrogramColorbarNumber = (value: number): string => {
                if (!Number.isFinite(value)) return '—';
                const abs = Math.abs(value);
                if (abs !== 0 && (abs >= 1e4 || abs < 1e-3)) return value.toExponential(2);
                return value.toFixed(3);
            };

            // ── Colorbar value-range filter (replaces visualMap.calculable) ──
            //
            // Two draggable handles on the colorbar let the user restrict the
            // displayed value range. Out-of-range heatmap cells are dropped
            // from the data array. State is closure-local so it survives
            // re-renders but is reset on a fresh Compute.
            let currentScaleBounds: { min: number; max: number } | null = null;
            let colorFilterRange: { min: number; max: number } | null = null;
            let colorbarInteractionInitialized = false;
            let colorbarDragRaf = 0;

            const isInsideColorFilter = (value: number): boolean => {
                if (!colorFilterRange || !currentScaleBounds) return true;
                const { min: fMin, max: fMax } = colorFilterRange;
                const { min: sMin, max: sMax } = currentScaleBounds;
                // If the filter is at full extent, treat as inactive.
                if (fMin <= sMin && fMax >= sMax) return true;
                return value >= fMin && value <= fMax;
            };

            const updateColorbarHandles = () => {
                const wrap = document.getElementById('spectrogram-colorbar');
                if (!wrap || !currentScaleBounds) return;
                const handleHigh = wrap.querySelector<HTMLElement>('[data-role="cb-handle-high"]');
                const handleLow = wrap.querySelector<HTMLElement>('[data-role="cb-handle-low"]');
                const fill = wrap.querySelector<HTMLElement>('[data-role="cb-fill"]');
                const { min: sMin, max: sMax } = currentScaleBounds;
                const span = sMax - sMin || 1;
                const active = colorFilterRange && !(colorFilterRange.min <= sMin && colorFilterRange.max >= sMax);
                if (active && colorFilterRange) {
                    const highPct = Math.max(0, Math.min(100, ((sMax - colorFilterRange.max) / span) * 100));
                    const lowPct = Math.max(0, Math.min(100, ((colorFilterRange.min - sMin) / span) * 100));
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
                } else {
                    if (handleHigh) {
                        handleHigh.style.top = '0%';
                        handleHigh.setAttribute('aria-valuenow', '100');
                    }
                    if (handleLow) {
                        handleLow.style.bottom = '0%';
                        handleLow.setAttribute('aria-valuenow', '0');
                    }
                    if (fill) {
                        fill.hidden = true;
                    }
                }
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
                    const minSeparation = (startBounds ? (startBounds.max - startBounds.min) * 0.01 : 0.01);

                    const onMove = (moveEvent: PointerEvent) => {
                        if (!startBounds || !startFilter) return;
                        const trackRect = track.getBoundingClientRect();
                        const trackHeight = trackRect.height || 1;
                        const deltaFrac = (moveEvent.clientY - startY) / trackHeight; // +1 = down
                        const deltaValue = -deltaFrac * (startBounds.max - startBounds.min);
                        let nextMin = startFilter.min;
                        let nextMax = startFilter.max;
                        if (which === 'high') {
                            nextMax = startFilter.max + deltaValue;
                            nextMax = Math.max(nextMax, startFilter.min + minSeparation);
                            nextMax = Math.min(nextMax, startBounds.max);
                        } else {
                            nextMin = startFilter.min + deltaValue;
                            nextMin = Math.min(nextMin, startFilter.max - minSeparation);
                            nextMin = Math.max(nextMin, startBounds.min);
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

                const onHandleKey = (which: 'high' | 'low') => (event: KeyboardEvent) => {
                    if (!currentScaleBounds) return;
                    const span = currentScaleBounds.max - currentScaleBounds.min;
                    if (span <= 0) return;
                    const step = span * 0.01;
                    const start = colorFilterRange ?? { min: currentScaleBounds.min, max: currentScaleBounds.max };
                    const minSep = span * 0.01;
                    let nextMin = start.min;
                    let nextMax = start.max;
                    let handled = true;
                    if (which === 'high') {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nextMax = start.max + step;
                        else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nextMax = start.max - step;
                        else if (event.key === 'Home') nextMax = currentScaleBounds.max;
                        else if (event.key === 'End') nextMax = start.min + minSep;
                        else handled = false;
                        nextMax = Math.max(nextMax, start.min + minSep);
                        nextMax = Math.min(nextMax, currentScaleBounds.max);
                    } else {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nextMin = start.min - step;
                        else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nextMin = start.min + step;
                        else if (event.key === 'End') nextMin = currentScaleBounds.min;
                        else if (event.key === 'Home') nextMin = start.max - minSep;
                        else handled = false;
                        nextMin = Math.min(nextMin, start.max - minSep);
                        nextMin = Math.max(nextMin, currentScaleBounds.min);
                    }
                    if (!handled) return;
                    event.preventDefault();
                    colorFilterRange = { min: nextMin, max: nextMax };
                    updateColorbarHandles();
                    if (spectrogramResult) void renderSpectrogramChart();
                };

                handleHigh.addEventListener('keydown', onHandleKey('high'));
                handleLow.addEventListener('keydown', onHandleKey('low'));

                // Double-click anywhere on the colorbar resets the filter.
                wrap.addEventListener('dblclick', () => {
                    if (!colorFilterRange) return;
                    colorFilterRange = null;
                    updateColorbarHandles();
                    if (spectrogramResult) void renderSpectrogramChart();
                });
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
            initColorbarInteraction();

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

                const winSize = Number.parseInt(getDropdownValue('spectrogram-win-size') || '256', 10);
                try {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', true);

                    // Reset any previous color filter on a fresh Compute so
                    // the new dataset's scale isn't clipped by stale bounds.
                    colorFilterRange = null;

                    const startMs = appState.currentStart;
                    const endMs = appState.currentEnd;
                    if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
                        throw new Error('No time range available.');
                    }
                    const startIso = new Date(startMs).toISOString();
                    const endIso = new Date(endMs).toISOString();
                    const response = await fetchSpectrogram(startIso, endIso, column, winSize);

                    spectrogramResult = response.result;
                    await renderSpectrogramChart();
                } catch (error: any) {
                    spectrogramResult = null;
                    syncSpectrogramEmptyState('Spectrogram generation failed. Choose a column and try again.');
                } finally {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', false);
                }
            });

            logCheck?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            normalizeSelect?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            // Re-query the method/param elements by id every time we sync,
            // because upgradeSelects() at app startup replaces native
            // <select> elements with custom dropdown <div>s, detaching the
            // closure-captured references. The id is preserved on the new
            // root, so getElementById() always returns the live element.
            const syncClipEnabled = () => {
                const enabled = clipToggle?.checked ?? false;
                const liveClipMethod = document.getElementById('spectrogram-clip-method');
                const liveClipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
                const hint = enabled
                    ? ''
                    : "Enable the 'Outliers' toggle above to change the clip method";
                // Use setDropdownDisabled so the custom dropdown's
                // trigger.disabled is updated, not a detached <select>.
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
            // Listen to BOTH input and change so that label-driven toggles,
            // programmatic flips, and any browser quirk (e.g. an old cached
            // bundle) all update the disabled state immediately.
            const onClipToggleChange = () => {
                syncClipEnabled();
                if (spectrogramResult) void renderSpectrogramChart();
            };
            clipToggle?.addEventListener('change', onClipToggleChange);
            clipToggle?.addEventListener('input', onClipToggleChange);
            // For the clip method, listen to the `dropdown:change` custom
            // event that the upgraded dropdown dispatches. The native
            // `change` event won't fire on a detached <select>, but the
            // dropdown controller forwards a bubbling `change` from its
            // root (see dispatchDropdownChange in Dropdown.ts).
            const liveClipMethodRoot = document.getElementById('spectrogram-clip-method');
            const onClipMethodChange = () => {
                syncClipParamLabel();
                if (spectrogramResult) void renderSpectrogramChart();
            };
            liveClipMethodRoot?.addEventListener('change', onClipMethodChange);
            const liveClipParamEl = document.getElementById('spectrogram-clip-param');
            liveClipParamEl?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            syncClipEnabled();
            syncClipParamLabel();
            resetZoomBtn?.addEventListener('click', () => {
                if (!spectrogramChart) return;
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
            });
        },
        onVisible() {
            // Safety net for back-forward-cache restores and stale bundles:
            // re-derive the disabled state of the clip fields from the
            // current toggle value. Use the dropdown helper for the select
            // since it may have been upgraded to a custom dropdown.
            const onVisibleClipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const onVisibleClipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
            if (onVisibleClipToggle) {
                const enabled = onVisibleClipToggle.checked;
                const hint = enabled
                    ? ''
                    : "Enable the 'Outliers' toggle above to change the clip method";
                setDropdownDisabled('spectrogram-clip-method', !enabled);
                const onVisibleClipMethod = document.getElementById('spectrogram-clip-method');
                if (onVisibleClipMethod) onVisibleClipMethod.title = hint;
                if (onVisibleClipParam) {
                    onVisibleClipParam.disabled = !enabled;
                    onVisibleClipParam.title = hint;
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
