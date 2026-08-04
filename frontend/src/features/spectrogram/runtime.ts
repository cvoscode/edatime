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
import { downloadBlob } from '../../utils/dom.js';
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
import { getPlotColorScale, getSetting } from '../../utils/settings.js';
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
import { onThemeChange } from '../../utils/theme.js';
import { describeSpectrogramFailure } from './spectrogramFailure.js';

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

/**
 * CSV export for the spectrogram. Mirrors the per-page export pattern used
 * by PNG/SVG/HTML but reads the cached `spectrogramResult` (set after a
 * successful Compute) instead of the rendered chart instance.
 *
 * Triples shape: one row per (time, frequency) bin with `power` magnitude.
 * Added to bridge the gap left by the help dialog claiming CSV export +
 * the `E` shortcut, neither of which existed — see usage_issue.md §1.3.
 */

/** Build the (time, frequency, power) CSV body for a spectrogram result. */
export function buildSpectrogramCsv(result: SpectrogramResult): string {
    const headers = ['time_ms', 'frequency_hz', 'power'];
    const lines: string[] = [headers.join(',')];
    const times = result.times_ms;
    const freqs = result.frequencies;
    const mags: number[][] = result.magnitudes;
    for (let t = 0; t < times.length; t += 1) {
        const row = mags[t];
        if (!row) continue;
        const timeVal = times[t];
        for (let f = 0; f < freqs.length; f += 1) {
            const power = row[f];
            lines.push([timeVal, freqs[f], power ?? ''].join(','));
        }
    }
    return lines.join('\n');
}

export function exportSpectrogramCsv(filename = 'edatime_spectrogram.csv'): void {
    const result = spectrogramResult;
    if (!result || !result.times_ms.length || !result.frequencies.length) {
        toast('Compute the spectrogram before exporting CSV.', 'warning');
        return;
    }
    const csv = buildSpectrogramCsv(result);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename);
    toast(`CSV exported (${result.times_ms.length * result.frequencies.length} rows).`, 'success');
}

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
    const currentViewport = () => {
        const viewport = workspaceViewport();
        if (Number.isFinite(viewport?.xMin) && Number.isFinite(viewport?.xMax)) return viewport;
        const timeRange = workspaceMetadata()?.time_range;
        const start = Number(timeRange?.min);
        const end = Number(timeRange?.max);
        return Number.isFinite(start) && Number.isFinite(end) && start < end
            ? { xMin: start, xMax: end, yMin: null, yMax: null }
            : null;
    };

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
            : (message || 'Pick a numeric column and update the spectrogram.');
        spectrogramRuntime?.updateEmptyState({
            visible: !spectrogramResult,
            reason: spectrogramResult ? '' : (spectrogramRenderError ? 'render-error' : 'no-columns-selected'),
            title: spectrogramRenderError ? 'Spectrogram unavailable' : 'No spectrogram yet',
            message: fallback,
            fallbackText: fallback,
        });
    }

    spectrogramRuntime = createAnalysisPageRuntime({
        page: 'spectrogram',
        emptyStateRootId: 'spectrogram-empty-state',
        emptyStateTitleId: 'spectrogram-empty-title',
        emptyStateMessageId: 'spectrogram-empty-message',
        exportConfig: {
            key: 'spectrogram',
            png: { fn: exportEChartsPNG, filename: 'edatime_spectrogram.png' },
            svg: { fn: exportEChartsSVG, filename: 'edatime_spectrogram.svg' },
            html: { fn: exportEChartsHTML, filename: 'edatime_spectrogram.html' },
            csv: { fn: exportSpectrogramCsv, filename: 'edatime_spectrogram.csv' },
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

            // Keyboard shortcut: E triggers CSV export when no input/textarea
            // is focused. Wired next to the rest of the page-level listeners
            // so it gets cleaned up on dispose — see usage_issue.md §1.3.
            document.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key !== 'e' && event.key !== 'E') return;
                if (event.metaKey || event.ctrlKey || event.altKey) return;
                const target = event.target as HTMLElement | null;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                    return;
                }
                event.preventDefault();
                document.getElementById('spectrogram-export-csv-btn')?.click();
            }, listenerOptions);

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
                    palette: paletteForColorScale(getPlotColorScale('timeFrequency')),
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
                    palette: paletteForColorScale(getPlotColorScale('timeFrequency')),
                });
                syncSpectrogramSummary();
                syncSpectrogramEmptyState();
            };

            const disposeTheme = onThemeChange(() => {
                if (spectrogramResult) void renderSpectrogramChart();
            });
            document.addEventListener('edatime:settings-changed', () => {
                if (spectrogramResult) void renderSpectrogramChart();
            }, listenerOptions);

            const computeSpectrogram = async () => {
                const column = getDropdownValue('spectrogram-col-select');
                if (!column) {
                    syncSpectrogramEmptyState('Pick a numeric column and update the spectrogram.');
                    return;
                }
                const viewport = currentViewport();
                const startMs = viewport?.xMin;
                const endMs = viewport?.xMax;
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
                    maxPoints: getSetting('spectrogramMaxPoints'),
                });
                if (!request) return;
                try {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', true, 'Update spectrogram');
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
                } catch (error: unknown) {
                    console.error('[edatime:spectrogram] generation failed', error);
                    spectrogramResult = null;
                    spectrogramRenderError = describeSpectrogramFailure(error);
                    syncSpectrogramSummary();
                    syncSpectrogramEmptyState();
                    toast(spectrogramRenderError, 'error', { duration: 6000 });
                } finally {
                    deps.setLoading('spectrogram-compute-btn', 'spectrogram-loading', false, 'Update spectrogram');
                }
            };

            const maybeAutoComputeSpectrogram = () => {
                if (autoComputeStarted || spectrogramResult) return;
                if (!getDropdownValue('spectrogram-col-select')) return;
                const viewport = currentViewport();
                if (!Number.isFinite(viewport?.xMin) || !Number.isFinite(viewport?.xMax)) return;
                autoComputeStarted = true;
                if (!autoComputeExplained) {
                    autoComputeExplained = true;
                    const autoColumn = getDropdownValue('spectrogram-col-select');
                    toast(`Loaded ${autoColumn} automatically. Pick another column and update the spectrogram to switch.`, 'info', {
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
                disposeTheme();
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
