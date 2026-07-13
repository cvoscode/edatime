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
import {
    resolveSpectrogramCustomInputState,
    resolveSpectrogramHopSize,
    resolveSpectrogramWindowSize,
} from './spectrogramControls.js';
import { createSpectrogramRenderModel } from './spectrogramRenderModel.js';
import { createSpectrogramColorbar } from './spectrogramColorbar.js';
import { buildSpectrogramRequest } from './spectrogramRequest.js';
import { buildSpectrogramSummaryLabel, renderSpectrogramSummary } from './spectrogramSummary.js';
import { createSpectrogramChartController, type SpectrogramChartController } from './spectrogramChartController.js';
import { syncSpectrogramClipControls, syncSpectrogramClipLabel } from './spectrogramClipControls.js';

interface SpectrogramPageDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
    workspace?: Pick<WorkspaceStore, 'getSnapshot'>;
}

// ── Module-level page result state ───────────────────────────────────────────
let spectrogramChartController: SpectrogramChartController | null = null;
let spectrogramResult: SpectrogramResult | null = null;
let spectrogramRenderError: string | null = null;
let spectrogramAppliedScaleMode: ScaleMode = 'none';
let spectrogramAppliedClipMode: ClipMode = 'none';
let spectrogramAppliedClipParam = 0.5;

export function __resetSpectrogramChartRuntimeForTests(): void {
    spectrogramChartController?.dispose();
    spectrogramChartController = null;
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
            Object.assign(winCustomInput, resolveSpectrogramCustomInputState(winMode));
        }
        if (hopCustomInput) {
            Object.assign(hopCustomInput, resolveSpectrogramCustomInputState(hopMode));
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

            spectrogramChartController?.dispose();
            const chartController = createSpectrogramChartController({
                element: chartEl,
                getResult: () => spectrogramResult,
            });
            spectrogramChartController = chartController;

            let currentScaleBounds: { min: number; max: number } | null = null;
            const renderModel = createSpectrogramRenderModel();
            const colorbar = createSpectrogramColorbar({
                root: document.getElementById('spectrogram-colorbar'),
                signal: listenerAbort.signal,
                onRangeChange: () => {
                    if (spectrogramResult) void renderSpectrogramChart();
                },
            });

            const syncClipEnabled = () => {
                const liveClipMethod = document.getElementById('spectrogram-clip-method') as HTMLElement | null;
                const liveClipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
                syncSpectrogramClipControls({
                    enabled: clipToggle?.checked ?? false,
                    methodRoot: liveClipMethod,
                    parameter: liveClipParam,
                    band: document.getElementById('spectrogram-clip-band'),
                });
            };

            const syncClipParamLabel = () => {
                syncSpectrogramClipLabel(clipParamLabel, getDropdownValue('spectrogram-clip-method') || 'percentile');
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
                const chart = await chartController.ensure();
                syncClipEnabled();
                syncClipParamLabel();
                const timeAxis = spectrogramResult.times_ms;
                const freqAxis = spectrogramResult.frequencies;
                const scaleLabel = activeScaleLabel();
                const rendered = renderModel.build({
                    result: spectrogramResult,
                    logRequested: logCheck?.checked ?? true,
                    allowLogScale: spectrogramAppliedScaleMode === 'none',
                    scaleLabel,
                    palette: paletteForColorScale(getSetting('colorScale')),
                    range: colorbar.getRange(),
                });
                currentScaleBounds = rendered.bounds;
                chart.setOption(rendered.option);

                const { dominantBand, formatFrequency, logScale } = rendered;
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
                chartController.resetZoom();
            }, listenerOptions);

            maybeAutoComputeSpectrogram();
            return () => {
                listenerAbort.abort();
                if (controlAbort === listenerAbort) controlAbort = null;
                colorbar.dispose();
                chartController.dispose();
                if (spectrogramChartController === chartController) spectrogramChartController = null;
            };
        },
        onVisible() {
            const visibleClipToggle = document.getElementById('spectrogram-clip-toggle') as HTMLInputElement | null;
            const visibleClipParam = document.getElementById('spectrogram-clip-param') as HTMLInputElement | null;
            const visibleClipMethod = document.getElementById('spectrogram-clip-method') as HTMLElement | null;
            const visibleClipMethodValue = getDropdownValue('spectrogram-clip-method') || 'percentile';
            syncSpectrogramClipLabel(document.getElementById('spectrogram-clip-param-label'), visibleClipMethodValue);
            syncSpectrogramClipControls({
                enabled: visibleClipToggle?.checked ?? false,
                methodRoot: visibleClipMethod,
                parameter: visibleClipParam,
                band: document.getElementById('spectrogram-clip-band'),
            });
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
                spectrogramChartController?.resizeWhenReady();
            }
            if (!spectrogramResult && !spectrogramRenderError) {
                autoComputeStarted = false;
            }
        },
    });

    return {
        mount: () => spectrogramRuntime.mount(),
        activate: () => spectrogramRuntime.activate(),
    };
}
