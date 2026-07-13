import { DEBUG, dbg, dbgGroup } from '../../debug.js';
import {
    ensureRangeStateFromData,
    applyFilterIntentToData,
    type TimeseriesFilterIntent,
} from '../../services/timeseries/filtering.js';
import { sanitizeSelectedColumns } from './columnSelection.js';
import { createEmptyStateController } from '../../ui/emptyState.js';
import { announceChartLoading, announceDataUpdate } from '../../utils/a11y.js';
import { computeFrontendRollingBands } from '../../bootstrap/analyticsOverlay.js';
import { createRequestTask } from '../../platform/requestTask.js';
import type { ViewSnapshot } from '../../types/chart.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import type { ApiRequestOptions } from '../../services/api/http.js';
import { analyticsState, setRollingBands } from '../../store/analyticsState.js';
import { chartState, setViewport, setZoomHistory } from '../../store/chartState.js';
import { datasetState } from '../../store/datasetState.js';
import {
    runtimeState,
    setFetchDebounceId,
    setFetchedWindow,
    setLastFetchedData,
    setPendingRestoreY,
    setPendingYMode,
} from '../../store/runtimeState.js';
import { buildTimeseriesDataRequest, getTimeseriesLookaroundMs } from './timeseriesRequest.js';
import { canReuseBufferedFetch } from './bufferedFetchPolicy.js';
import { resolveFetchedWindow } from './fetchedWindow.js';
import { buildTimeseriesRenderModel } from './timeseriesRenderModel.js';
import { resolveTimeseriesRequestIntent } from './requestIntent.js';
import {
    appendZoomRestoreState,
    resolveZoomOutDecision,
    type ZoomRestoreState,
} from './zoomHistoryPolicy.js';

const EMPTY_TIMESERIES_DATA = { ts: [], values: {}, series: {}, colorByColumn: {} } as any;

interface TimeseriesControllerDeps {
    fetchData: (
        startIso: string,
        endIso: string,
        width: number,
        cols: string,
        colorCol: string | null,
        lookaroundMs: number,
        options: ApiRequestOptions,
    ) => Promise<any>;
    buildRangeControls: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => ViewSnapshot;
    fetchAndRenderAnalytics: () => Promise<void>;
    recoverFromColumnMismatch?: () => Promise<boolean>;
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setSelection' | 'setFilters' | 'setViewport'>;
}

let timeseriesEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

function getTimeseriesEmptyStateController() {
    if (!timeseriesEmptyStateController) {
        timeseriesEmptyStateController = createEmptyStateController({
            rootId: 'timeseries-empty-state',
            titleId: 'timeseries-empty-title',
            messageId: 'timeseries-empty-message',
            resetButtonId: 'timeseries-reset-range-btn',
            resetEventName: 'edatime:request-chart-range-reset',
            eventSource: 'timeseries-empty-state',
        });
    }
    return timeseriesEmptyStateController;
}

// computeFrontendRollingBands is now imported from ../bootstrap/analyticsOverlay.ts

function isColumnMismatchError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return message.includes('column_not_found') || message.includes('Unknown column');
}

function computeRenderedYDebugSnapshot(intent: TimeseriesFilterIntent) {
    if (!runtimeState.lastFetchedData) return null;
    const filtered = applyFilterIntentToData(runtimeState.lastFetchedData, intent);
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;
    const perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }> = [];

    for (const col of intent.selection.columns) {
        const seriesData = (filtered as any).series?.[col];
        const yValues = seriesData ? seriesData.y : (filtered as any).values?.[col];
        if (!yValues) continue;
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        let count = 0;
        for (let i = 0; i < yValues.length; i++) {
            const y = Number(yValues[i]);
            if (!Number.isFinite(y)) continue;
            count += 1;
            if (y < min) min = y;
            if (y > max) max = y;
        }
        if (count > 0) {
            if (min < globalMin) globalMin = min;
            if (max > globalMax) globalMax = max;
        }
        perSeries.push({ name: col, points: count, yMin: count > 0 ? min : null, yMax: count > 0 ? max : null });
    }

    return {
        selectedCols: [...intent.selection.columns],
        globalYMin: Number.isFinite(globalMin) ? globalMin : null,
        globalYMax: Number.isFinite(globalMax) ? globalMax : null,
        perSeries,
    };
}

export function createTimeseriesPageController(deps: TimeseriesControllerDeps) {
    let lastKnownView: ViewSnapshot | null = null;
    let zoomRestoreHistory: ZoomRestoreState[] = [];
    let consecutiveZoomOuts = 0;
    // Controller-local so buffered zoom reuse cannot leak across page/controller
    // lifetimes after dataset reloads or test harness remounts.
    let lastFetchedParams: string | null = null;

    function getRequestIntent() {
        return resolveTimeseriesRequestIntent(deps.workspace.getSnapshot(), {
            start: chartState.currentStart,
            end: chartState.currentEnd,
        });
    }

    function getFilterIntent(): TimeseriesFilterIntent {
        return deps.workspace.getSnapshot();
    }

    function snapshotCurrentViewport(): ViewSnapshot | null {
        const xMin = Number(chartState.currentStart);
        const xMax = Number(chartState.currentEnd);
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return null;
        const yRange = chartState.chart?.getYRange?.();
        const yMin = Number.isFinite(yRange?.min) ? yRange!.min : null;
        const yMax = Number.isFinite(yRange?.max) ? yRange!.max : null;
        return { xMin, xMax, yMin, yMax };
    }

    function rememberRenderedViewport(): void {
        lastKnownView = snapshotCurrentViewport();
    }

    function rememberAppliedViewport(view: ViewSnapshot): void {
        const currentY = chartState.chart?.getYRange?.();
        const yMin = Number.isFinite(view.yMin)
            ? Number(view.yMin)
            : (Number.isFinite(currentY?.min) ? currentY!.min : null);
        const yMax = Number.isFinite(view.yMax)
            ? Number(view.yMax)
            : (Number.isFinite(currentY?.max) ? currentY!.max : null);
        lastKnownView = {
            xMin: Number(view.xMin),
            xMax: Number(view.xMax),
            yMin,
            yMax,
        };
    }

    function currentFetchKey(): string {
        return getRequestIntent().key;
    }

    function syncZoomHistoryStore(): void {
        setZoomHistory(zoomRestoreHistory.map((entry) => entry.view).slice(-5));
    }

    function applyView(view: ViewSnapshot, sourceKind: string): void {
        const newStart = Number(view.xMin);
        const newEnd = Number(view.xMax);
        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

        const workspaceViewport = {
            xMin: newStart,
            xMax: newEnd,
            yMin: Number.isFinite(view.yMin) ? Number(view.yMin) : null,
            yMax: Number.isFinite(view.yMax) ? Number(view.yMax) : null,
        };
        deps.workspace?.setViewport(workspaceViewport);
        setViewport(newStart, newEnd);
        chartState.chart?.setXRange?.(newStart, newEnd);
        if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
            chartState.chart?.setYRange?.(view.yMin!, view.yMax!);
            setPendingYMode('restore');
            setPendingRestoreY({ min: view.yMin!, max: view.yMax! });
        } else {
            setPendingYMode('fit');
            setPendingRestoreY(null);
        }
        rememberAppliedViewport(workspaceViewport);

        deps.updateAnalysisZoom(newStart, newEnd, sourceKind);
        emitChartRangeChange(sourceKind);
    }

    const task = createRequestTask({
        setLoading: (loading: boolean) => {
            const loadingEl = document.getElementById('main-chart-loading');
            if (loadingEl) loadingEl.hidden = !loading;
        },
        onError: (message: string) => {
            console.error('Failed to fetch data:', message);

        },
    });

    function emitChartRangeChange(sourceKind = 'data'): void {
        if (!Number.isFinite(chartState.currentStart) || !Number.isFinite(chartState.currentEnd)) return;
        window.dispatchEvent(new CustomEvent('edatime:chart-range-change', {
            detail: { start: chartState.currentStart, end: chartState.currentEnd, source: sourceKind },
        }));
    }

    function renderCurrentData(): void {
        const emptyState = getTimeseriesEmptyStateController();
        const workspace = deps.workspace.getSnapshot();
        const selectedColumns = [...workspace.selection.columns];
        const workspaceViewport = workspace.viewport;
        const viewportStart = workspaceViewport?.xMin != null && Number.isFinite(Number(workspaceViewport.xMin))
            ? Number(workspaceViewport!.xMin)
            : Number(chartState.currentStart);
        const viewportEnd = workspaceViewport?.xMax != null && Number.isFinite(Number(workspaceViewport.xMax))
            ? Number(workspaceViewport!.xMax)
            : Number(chartState.currentEnd);
        const columnRanges = workspace.filters.columnRanges;
        const adaptiveLineFilters = workspace.filters.adaptiveLines;

        const model = buildTimeseriesRenderModel({
            data: runtimeState.lastFetchedData,
            selectedColumns,
            viewport: { start: viewportStart, end: viewportEnd },
            columnRanges,
            adaptiveLineFilters,
            datasetRange: datasetState.metadata?.time_range,
            spectralPreview: analyticsState.spectralFilterPreview,
        });
        emptyState.update(model.emptyState);

        if (!chartState.chart) return;
        if (model.kind === 'no-selection') {
            setRollingBands(null);
            chartState.chart.updateDataMulti(
                EMPTY_TIMESERIES_DATA,
                [],
                workspace.selection.colorColumn,
                workspace.filters.adaptiveLines,
            );
            rememberRenderedViewport();
            return;
        }
        if (model.kind === 'awaiting-data') return;
        if (model.kind === 'empty') {
            setRollingBands(null);
            chartState.chart.updateDataMulti(
                EMPTY_TIMESERIES_DATA,
                [],
                workspace.selection.colorColumn,
                workspace.filters.adaptiveLines,
            );
            if (Number.isFinite(model.viewport.start) && Number.isFinite(model.viewport.end) && model.viewport.end > model.viewport.start) {
                chartState.chart.setXRange(model.viewport.start, model.viewport.end);
            }
            rememberRenderedViewport();
            return;
        }

        // Capture the pending y-range restore *before* `updateDataMulti` —
        // its onYRangeCallback consumes the pending store entries via
        // `updateAnalysisYRange`, so by the time we look at them after the
        // render the entries are gone. Saving the snapshot locally lets
        // us re-apply the user y range once the new data has been drawn.
        const restoreY = runtimeState.pendingRestoreY;
        const restoreMode = runtimeState.pendingYMode;
        chartState.chart.updateDataMulti(
            model.data,
            model.displayColumns,
            workspace.selection.colorColumn,
            workspace.filters.adaptiveLines,
        );

        if (restoreY && restoreMode === 'restore') {
            chartState.chart.setYRange(restoreY.min, restoreY.max);
        } else {
            // No pending restore (or pendingYMode === 'fit'): drop any
            // persisted user-set y range so the chart re-renders against
            // the data fit instead of an earlier zoomed-in window.
            chartState.chart.resetYRange?.();
        }

        if (analyticsState.rollingEnabled) {
            setRollingBands(computeFrontendRollingBands(model.data as any, selectedColumns, analyticsState.rollingWindow || 50));
            chartState.chart?.requestOverlayRender?.();
        }
        rememberRenderedViewport();
        window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));
        announceDataUpdate('timeseries');
    }

    async function fetchAndRender(): Promise<void> {
        if (deps.workspace) sanitizeSelectedColumns(deps.workspace);
        const intent = getRequestIntent();
        if (!Number.isFinite(intent.start) || !Number.isFinite(intent.end)) return;
        const currentStart = intent.start;
        const currentEnd = intent.end;
        if (currentStart >= currentEnd) return;
        if (intent.columns.length === 0) {
            deps.buildRangeControls();
            renderCurrentData();
            return;
        }

        // Issue 7.2: Short-circuit no-op requests by checking if parameters
        // match the last successful fetch. This avoids redundant API calls when
        // the user clicks a series chip that's already selected, or triggers
        // other events that would produce identical requests.
        const currentCols = intent.columns.join(',');
        const currentColorCol = intent.colorColumn;
        const lastFetchKey = intent.key;
        const fetchedWindow = runtimeState.fetchedWindow;
        if (canReuseBufferedFetch({
            expectedKey: lastFetchedParams,
            actualKey: lastFetchKey,
            data: runtimeState.lastFetchedData,
            fetchedWindow,
            requestedView: { start: currentStart, end: currentEnd },
        })) {
            dbg('fetchAndRender: reusing buffered data window', {
                startIso: new Date(currentStart).toISOString(),
                endIso: new Date(currentEnd).toISOString(),
                cols: currentCols,
                colorCol: currentColorCol,
                fetchedWindow,
                downsampled: runtimeState.lastFetchedData?._meta?.downsampled ?? null,
            });
            deps.buildRangeControls();
            chartState.chart?.setXRange?.(currentStart, currentEnd);
            renderCurrentData();
            emitChartRangeChange('data');
            return;
        }

        await task.run(async (signal) => {
            let requestIntent = intent;
            const requestData = async () => {
                const request = buildTimeseriesDataRequest(
                    requestIntent,
                    document.getElementById('main-chart')?.clientWidth || 1200,
                );
                if (!request) throw new Error('Invalid timeseries request');

                announceChartLoading(requestIntent.columns);
                dbgGroup('fetchAndRender', () => {
                    dbg('request', request);
                    dbg('selectedCols', requestIntent.columns);
                    dbg('selectedColorColumn', requestIntent.colorColumn);
                });

                return deps.fetchData(request.startIso, request.endIso, request.width, request.columns, request.colorColumn, request.lookaroundMs, { signal });
            };

            let data: any;
            try {
                data = await requestData();
            } catch (error) {
                const recovered = isColumnMismatchError(error)
                    && deps.recoverFromColumnMismatch
                    && await deps.recoverFromColumnMismatch();
                if (!recovered) throw error;
                if (deps.workspace.getSnapshot().selection.columns.length === 0) {
                    deps.buildRangeControls();
                    renderCurrentData();
                    return;
                }
                requestIntent = getRequestIntent();
                data = await requestData();
            }

            setLastFetchedData(data);
            setFetchedWindow(resolveFetchedWindow({
                data,
                requestedStart: currentStart,
                requestedEnd: currentEnd,
                lookaroundMs: getTimeseriesLookaroundMs(currentStart, currentEnd),
            }));
            // Issue 7.2: Update last successful fetch parameters for no-op short-circuit
            lastFetchedParams = requestIntent.key;

            if (DEBUG) {
                const n = data?.ts?.length ?? 0;
                let tsMin = null;
                let tsMax = null;
                if (n > 0) {
                    tsMin = data.ts[0];
                    tsMax = data.ts[n - 1];
                }
                dbg('response points', n, 'tsMin/tsMax', tsMin, tsMax);
                if (!data?.ts || data.ts.length === 0) {
                    console.warn('[edatime] fetchAndRender: empty result for range', {
                        startIso: new Date(currentStart).toISOString(),
                        endIso: new Date(currentEnd).toISOString(),
                        width: document.getElementById('main-chart')?.clientWidth || 1200,
                        cols: requestIntent.columns.join(','),
                    });
                }
            }

            if (deps.workspace) ensureRangeStateFromData(data, deps.workspace);
            deps.buildRangeControls();
            chartState.chart?.setXRange?.(currentStart, currentEnd);
            renderCurrentData();
            emitChartRangeChange('data');

            if (analyticsState.anomalyEnabled) {
                deps.fetchAndRenderAnalytics().catch(() => { });
            }

            if (DEBUG) {
                const snapshot = computeRenderedYDebugSnapshot(getFilterIntent());
                dbg('post-render renderedSnapshot', snapshot);
            }

            const yr = chartState.chart?.getYRange?.();
            if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'data');
            if (DEBUG) dbg('post-render yRange', yr);

            setPendingYMode(null);
            setPendingRestoreY(null);
        });
    }

    function zoomOut(): void {
        if (runtimeState.fetchDebounceId) clearTimeout(runtimeState.fetchDebounceId);
        const decision = resolveZoomOutDecision({
            history: zoomRestoreHistory,
            consecutiveZoomOuts,
            initialView: chartState.initialView,
        });
        consecutiveZoomOuts = decision.consecutiveZoomOuts;
        if (decision.kind === 'reset') {
            resetZoom();
            return;
        }
        zoomRestoreHistory = decision.history;
        syncZoomHistoryStore();
        if (decision.kind === 'none') return;

        applyView(decision.restoreState.view, 'zoom-out');

        const canReuseRawBufferedState = canReuseBufferedFetch({
            expectedKey: decision.restoreState.fetchKey,
            actualKey: currentFetchKey(),
            data: decision.restoreState.data as any,
            fetchedWindow: decision.restoreState.fetchedWindow,
            requestedView: { start: decision.restoreState.view.xMin, end: decision.restoreState.view.xMax },
        });
        if (canReuseRawBufferedState) {
            setLastFetchedData(decision.restoreState.data as any);
            setFetchedWindow(decision.restoreState.fetchedWindow);
            lastFetchedParams = decision.restoreState.fetchKey;
            renderCurrentData();
            return;
        }

        setFetchDebounceId(setTimeout(fetchAndRender, 0));
    }

    function resetZoom(): void {
        if (runtimeState.fetchDebounceId) clearTimeout(runtimeState.fetchDebounceId);
        consecutiveZoomOuts = 0;
        zoomRestoreHistory = [];
        syncZoomHistoryStore();
        if (!chartState.initialView) return;
        applyView(chartState.initialView, 'reset');
        setFetchDebounceId(setTimeout(fetchAndRender, 0));
    }

    function onZoomRangeChange(view: ViewSnapshot, sourceKind = 'user'): void {
        if (runtimeState.fetchDebounceId) clearTimeout(runtimeState.fetchDebounceId);
        consecutiveZoomOuts = 0;

        dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
            dbg('prev', { start: chartState.currentStart, end: chartState.currentEnd });
            dbg('next', view);
        });

        const newStart = Number(view.xMin);
        const newEnd = Number(view.xMax);
        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

        const snap = lastKnownView ?? snapshotCurrentViewport();
        if (snap) {
            zoomRestoreHistory = appendZoomRestoreState(zoomRestoreHistory, {
                view: snap,
                data: runtimeState.lastFetchedData,
                fetchedWindow: runtimeState.fetchedWindow,
                fetchKey: currentFetchKey(),
            });
            syncZoomHistoryStore();
        }

        applyView(view, sourceKind);
        if (!runtimeState.refetchOnZoom) return;
        const delayMs = sourceKind === 'user' ? 0 : 75;
        setFetchDebounceId(setTimeout(fetchAndRender, delayMs));
    }

    function dispose(): void {
        task.cancel();
        if (runtimeState.fetchDebounceId) clearTimeout(runtimeState.fetchDebounceId);
        timeseriesEmptyStateController?.dispose();
        timeseriesEmptyStateController = null;
    }

    return {
        dispose,
        emitChartRangeChange,
        fetchAndRender,
        onZoomRangeChange,
        renderCurrentData,
        resetZoom,
        zoomOut,
    };
}
