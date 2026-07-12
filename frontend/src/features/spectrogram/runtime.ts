/**
 * Spectrogram chart runtime — chart lifecycle, ECharts initialization,
 * resize handling, and empty-state management.
 *
 * Follows the `createAnalysisPageRuntime` pattern so that:
 *   const runtime = createSpectrogramChartRuntime(deps);
 *   runtime.mount();
 * exposes the same interface as other analysis page runtimes.
 */
import { fetchSpectrogram, type SpectrogramResult } from '../../services/api/index.js';
import { chartState } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import { exportEChartsPNG, exportEChartsSVG, exportEChartsHTML } from '../../utils/chartExport.js';
import {
    getDropdownOptions,
    getDropdownValue,
    setDropdownDisabled,
    setDropdownOptions,
} from '../../ui/primitives/Dropdown.js';
import {
    scaleModeLabel,
    type ClipMode,
    type ScaleMode,
} from '../../utils/spectralScaling.js';
import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { toast } from '../../utils/toast.js';
import { getSetting } from '../../utils/settings.js';
import { paletteForColorScale } from '../../utils/colorScales.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { findDominantFrequencyBand } from './spectrogramAnalysis.js';
import {
    type SpectrogramMode,
} from './spectrogramPointFilter.js';
import {
    buildSpectrogramGridModel,
    getSpectrogramDisplayBounds,
    getVisibleSpectrogramPoints,
    type SpectrogramGridModel,
} from './spectrogramGridModel.js';
import { resolveSpectrogramHopSize, resolveSpectrogramWindowSize } from './spectrogramControls.js';
import { buildSpectrogramChartOptions } from './spectrogramChartOptions.js';
import { createSpectrogramColorbar } from './spectrogramColorbar.js';
import { buildSpectrogramRequest } from './spectrogramRequest.js';
import { buildSpectrogramSummaryLabel, renderSpectrogramSummary } from './spectrogramSummary.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

// ── Module-level chart state ─────────────────────────────────────────────────
let spectrogramChart: any = null;
let spectrogramResizeObserver: ResizeObserver | null = null;
let spectrogramInteractionAbort: AbortController | null = null;
let spectrogramSelectionBox: HTMLElement | null = null;
let spectrogramResult: SpectrogramResult | null = null;
let spectrogramRenderError: string | null = null;
let spectrogramAppliedScaleMode: ScaleMode = 'none';
let spectrogramAppliedClipMode: ClipMode = 'none';
let spectrogramAppliedClipParam = 0.5;

export function __resetSpectrogramChartRuntimeForTests(): void {
    spectrogramInteractionAbort?.abort();
    spectrogramInteractionAbort = null;
    spectrogramSelectionBox?.remove();
    spectrogramSelectionBox = null;
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

// ── Runtime factory ───────────────────────────────────────────────────────────
export function createSpectrogramChartRuntime(deps: SpectrogramPageDeps) {
    let spectrogramRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
    let autoComputeStarted = false;
    let autoComputeExplained = false;
    let controlAbort: AbortController | null = null;
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

    const getResolvedSpectrogramWindowSize = (): number => resolveSpectrogramWindowSize(
        getDropdownValue('spectrogram-win-size') || '96',
        getSpectrogramWinCustomInput()?.value,
    );

    const getResolvedSpectrogramHopSize = (winSize: number): number => resolveSpectrogramHopSize(
        getDropdownValue('spectrogram-hop-size') || '0.5',
        getSpectrogramHopCustomInput()?.value,
        winSize,
    );

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
            controlAbort?.abort();
            const listenerAbort = new AbortController();
            controlAbort = listenerAbort;
            const listenerOptions = { signal: listenerAbort.signal };
            const colSelect = document.getElementById('spectrogram-col-select') as HTMLElement | null;
            const logCheck = document.getElementById('spectrogram-log-scale') as HTMLInputElement | null;
            const clipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const clipParamLabel = document.getElementById('spectrogram-clip-param-label') as HTMLElement | null;
            const resetZoomBtn = document.getElementById('spectrogram-zoom-reset-btn') as HTMLButtonElement | null;
            const autoFitToggle = document.getElementById('spectrogram-auto-fit-toggle') as HTMLInputElement | null;
            const summaryEl = document.getElementById('spectrogram-summary') as HTMLElement | null;
            const chartEl = document.getElementById('spectrogram-chart') as HTMLDivElement | null;

            if (!chartEl || !colSelect) {
                return () => {
                    listenerAbort.abort();
                    if (controlAbort === listenerAbort) controlAbort = null;
                };
            }

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
                spectrogramInteractionAbort?.abort();
                spectrogramInteractionAbort = new AbortController();
                const interactionOptions = { signal: spectrogramInteractionAbort.signal };
                spectrogramSelectionBox?.remove();
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
                spectrogramSelectionBox = selectionBox;

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
                }, interactionOptions);

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
                }, interactionOptions);

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

                chartEl.addEventListener('pointerup', finishDrag, interactionOptions);
                chartEl.addEventListener('pointercancel', (event: PointerEvent) => {
                    if (dragStart?.pid === event.pointerId) {
                        dragStart = null;
                        selectionBox.style.display = 'none';
                    }
                }, interactionOptions);
                chartEl.addEventListener('dblclick', () => {
                    if (!spectrogramChart) return;
                    spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
                    spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
                }, interactionOptions);

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
            let cachedGrid: SpectrogramGridModel | null = null;

            let currentScaleBounds: { min: number; max: number } | null = null;
            const colorbar = createSpectrogramColorbar({
                root: document.getElementById('spectrogram-colorbar'),
                signal: listenerAbort.signal,
                onRangeChange: () => {
                    if (spectrogramResult) void renderSpectrogramChart();
                },
            });

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

            const syncSpectrogramSummary = () => renderSpectrogramSummary(summaryEl, spectrogramResult);

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
                    cachedGrid = buildSpectrogramGridModel(spectrogramResult);
                }

                currentScaleBounds = getSpectrogramDisplayBounds(cachedGrid, mode);
                const scaleLabel = activeScaleLabel();
                const points = getVisibleSpectrogramPoints(cachedGrid, mode, colorbar.getRange(), currentScaleBounds);

                const { option, formatFrequency } = buildSpectrogramChartOptions({
                    result: spectrogramResult,
                    points,
                    bounds: currentScaleBounds,
                    logScale,
                    scaleLabel,
                    palette: paletteForColorScale(getSetting('colorScale')),
                });
                chart.setOption(option);

                const dominantBand = findDominantFrequencyBand(spectrogramResult);
                if (summaryEl) {
                    summaryEl.setAttribute('aria-label', buildSpectrogramSummaryLabel({
                        result: spectrogramResult,
                        windowSize: getResolvedSpectrogramWindowSize(),
                        hopSize: getResolvedSpectrogramHopSize(getResolvedSpectrogramWindowSize()),
                        scaleLabel: scaleModeLabel(
                            spectrogramAppliedScaleMode,
                            spectrogramAppliedClipMode,
                            spectrogramAppliedClipParam,
                        ),
                        peakLabel: dominantBand ? formatFrequency(dominantBand.dominantHz) : undefined,
                    }));
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

                colorbar.update({
                    bounds: currentScaleBounds,
                    label: logScale ? 'log10' : scaleLabel,
                    palette: paletteForColorScale(getSetting('colorScale')),
                });
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
                const winSize = getResolvedSpectrogramWindowSize();
                const hopSize = getResolvedSpectrogramHopSize(winSize);
                const normalize = (getDropdownValue('spectrogram-normalize') || 'zscore') as ScaleMode;
                const clipEnabled = !!clipToggle?.checked;
                const clipMethod = (getDropdownValue('spectrogram-clip-method') || 'percentile') as ClipMode;
                const clipParam = Number.parseFloat(
                    (document.getElementById('spectrogram-clip-param') as HTMLInputElement | null)?.value || '0.5',
                );
                const request = buildSpectrogramRequest({
                    column,
                    startMs,
                    endMs,
                    windowSize: winSize,
                    hopSize,
                    normalize,
                    clipEnabled,
                    clipMethod,
                    clipParam,
                });
                if (!request) return;
                try {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', true);
                    spectrogramRenderError = null;
                    colorbar.resetFilter();

                    const response = await fetchSpectrogram(
                        request.start,
                        request.end,
                        request.column,
                        request.windowSize,
                        request.hopSize,
                        request.maxPoints,
                        undefined,
                        {
                            normalize: request.normalize,
                            clip: request.clip,
                            clipParam: request.clipParam,
                        },
                    );

                    spectrogramAppliedScaleMode = request.normalize;
                    spectrogramAppliedClipMode = request.clip;
                    spectrogramAppliedClipParam = request.clipParam;
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
            }, listenerOptions);

            logCheck?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            }, listenerOptions);
            document.getElementById('spectrogram-win-size')?.addEventListener('change', syncSpectrogramCustomInputs, listenerOptions);
            document.getElementById('spectrogram-win-size')?.addEventListener('input', syncSpectrogramCustomInputs, listenerOptions);
            document.getElementById('spectrogram-hop-size')?.addEventListener('change', syncSpectrogramCustomInputs, listenerOptions);
            document.getElementById('spectrogram-hop-size')?.addEventListener('input', syncSpectrogramCustomInputs, listenerOptions);
            const onClipToggleChange = () => {
                syncClipEnabled();
            };
            clipToggle?.addEventListener('change', onClipToggleChange, listenerOptions);
            clipToggle?.addEventListener('input', onClipToggleChange, listenerOptions);
            document.getElementById('spectrogram-clip-method')?.addEventListener('change', () => {
                syncClipParamLabel();
            }, listenerOptions);
            autoFitToggle?.addEventListener('change', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            }, listenerOptions);
            resetZoomBtn?.addEventListener('click', () => {
                if (!spectrogramChart) return;
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
                spectrogramChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
            }, listenerOptions);

            maybeAutoComputeSpectrogram();
            return () => {
                listenerAbort.abort();
                if (controlAbort === listenerAbort) controlAbort = null;
                colorbar.dispose();
            };
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
