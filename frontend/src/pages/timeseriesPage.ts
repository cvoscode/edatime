import { DEBUG, dbg, dbgGroup } from '../debug.js';
import { appState } from '../store/appStateCompat.js';
import { ensureRangeStateFromData, applyColumnRanges, clipDataToViewport, sanitizeSelectedColumns } from '../services/timeseries/filtering.js';
import { createEmptyStateController, isRangeOutsideDataset } from '../ui/emptyState.js';
import { announceChartLoading, announceDataUpdate } from '../utils/a11y.js';
import { computeFrontendRollingBands } from '../bootstrap/analyticsOverlay.js';
import { createRequestTask } from './shared/requestTask.js';
import type { ViewSnapshot } from '../types.js';
import {
    setFetchDebounceId,
    setFetchedWindow,
    setLastFetchedData,
    setPendingRestoreY,
    setPendingYMode,
    setRollingBands,
    setViewport,
    setZoomHistory,
} from '../store/index.js';

const EMPTY_TIMESERIES_DATA = { ts: [], values: {}, series: {}, colorByColumn: {} } as any;
const CONSECUTIVE_ZOOM_OUT_RESET_COUNT = 5;
type ZoomRestoreState = {
    view: ViewSnapshot;
    data: any | null;
    fetchedWindow: { start: number; end: number } | null;
    fetchKey: string | null;
};

interface TimeseriesControllerDeps {
    fetchData: (
        startIso: string,
        endIso: string,
        width: number,
        cols: string,
        colorCol: string | null,
        lookaroundMs: number,
        signal: AbortSignal,
    ) => Promise<any>;
    buildRangeControls: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => ViewSnapshot;
    fetchAndRenderAnalytics: () => Promise<void>;
    recoverFromColumnMismatch?: () => Promise<boolean>;
}

let timeseriesEmptyStateController: ReturnType<typeof createEmptyStateController> | null = null;

const MIN_LOOKAROUND_MS = 60_000;

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

function computeRenderedYDebugSnapshot() {
    if (!appState.lastFetchedData) return null;
    const filtered = applyColumnRanges(appState.lastFetchedData);
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;
    const perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }> = [];

    for (const col of appState.selectedCols || []) {
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
        selectedCols: [...(appState.selectedCols || [])],
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

    function snapshotCurrentViewport(): ViewSnapshot | null {
        const xMin = Number(appState.currentStart);
        const xMax = Number(appState.currentEnd);
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return null;
        const yRange = appState.chart?.getYRange?.();
        const yMin = Number.isFinite(yRange?.min) ? yRange!.min : null;
        const yMax = Number.isFinite(yRange?.max) ? yRange!.max : null;
        return { xMin, xMax, yMin, yMax };
    }

    function rememberRenderedViewport(): void {
        lastKnownView = snapshotCurrentViewport();
    }

    function rememberAppliedViewport(view: ViewSnapshot): void {
        const currentY = appState.chart?.getYRange?.();
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
        const currentCols = Array.isArray(appState.selectedCols) ? appState.selectedCols.join(',') : '';
        const currentColorCol = appState.selectedColorColumn || null;
        return `${currentCols}|${currentColorCol}`;
    }

    function syncZoomHistoryStore(): void {
        setZoomHistory(zoomRestoreHistory.map((entry) => entry.view).slice(-5));
    }

    function applyView(view: ViewSnapshot, sourceKind: string): void {
        const newStart = Number(view.xMin);
        const newEnd = Number(view.xMax);
        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

        setViewport(newStart, newEnd);
        appState.chart?.setXRange?.(newStart, newEnd);
        if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax! > view.yMin!) {
            appState.chart?.setYRange?.(view.yMin!, view.yMax!);
            setPendingYMode('restore');
            setPendingRestoreY({ min: view.yMin!, max: view.yMax! });
        } else {
            setPendingYMode('fit');
            setPendingRestoreY(null);
        }
        rememberAppliedViewport({
            xMin: newStart,
            xMax: newEnd,
            yMin: Number.isFinite(view.yMin) ? Number(view.yMin) : null,
            yMax: Number.isFinite(view.yMax) ? Number(view.yMax) : null,
        });

        deps.updateAnalysisZoom(newStart, newEnd, sourceKind);
        emitChartRangeChange(sourceKind);
    }

    const uploadButton = document.getElementById('timeseries-empty-upload-btn');
    if (uploadButton) {
        uploadButton.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'upload' } }));
        });
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
        if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
        window.dispatchEvent(new CustomEvent('edatime:chart-range-change', {
            detail: { start: appState.currentStart, end: appState.currentEnd, source: sourceKind },
        }));
    }

    function renderCurrentData(): void {
        const emptyState = getTimeseriesEmptyStateController();

        const hasSelection = Array.isArray(appState.selectedCols) && appState.selectedCols.length > 0;
        if (!hasSelection) {
            emptyState.update({
                visible: true,
                reason: 'no-columns-selected',
                title: 'Select one or more series',
                message: 'Click a column chip above to add it to the chart. Start with 2-3 related columns for a clearer first view.',
                showResetAction: false,
            });
        }

        if (!appState.chart) return;
        if (!hasSelection) {
            setRollingBands(null);
            appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
            rememberRenderedViewport();
            return;
        }
        if (!appState.lastFetchedData) {
            emptyState.update({ visible: false, reason: '', title: '', message: '', showResetAction: false });
            return;
        }
        const viewportStart = Number(appState.currentStart);
        const viewportEnd = Number(appState.currentEnd);
        const viewportData = clipDataToViewport(appState.lastFetchedData, viewportStart, viewportEnd);
        const filtered = applyColumnRanges(viewportData);
        const hasPoints = !!filtered?.ts && filtered.ts.length > 0;
        if (!hasPoints) {
            const start = Number(appState.currentStart);
            const end = Number(appState.currentEnd);
            const rangeOutside = isRangeOutsideDataset(appState.metadata?.time_range, start, end);

            emptyState.update({
                visible: true,
                reason: rangeOutside ? 'linked-range-outside-dataset' : 'no-data-after-filters',
                title: rangeOutside ? 'Current range is outside this dataset' : 'No points match current filters',
                message: rangeOutside
                    ? 'Reset to dataset range to recover visible data.'
                    : 'Try widening the time range or clearing filters.',
                showResetAction: true,
            });

            setRollingBands(null);
            appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                appState.chart.setXRange(start, end);
            }
            rememberRenderedViewport();
            return;
        }

        emptyState.update({ visible: false, reason: '', title: '', message: '', showResetAction: false });

        const preview = appState.spectralFilterPreview;
        let displayCols = [...appState.selectedCols];
        if (preview && preview.ts && preview.values && preview.ts.length > 0) {
            const previewKey = `${preview.column} [filtered]`;
            (filtered as any).series = (filtered as any).series || {};
            (filtered as any).series[previewKey] = { x: preview.ts, y: preview.values };
            if (!displayCols.includes(previewKey)) displayCols = [...displayCols, previewKey];
        }

        // Capture the pending y-range restore *before* `updateDataMulti` —
        // its onYRangeCallback consumes the pending store entries via
        // `updateAnalysisYRange`, so by the time we look at them after the
        // render the entries are gone. Saving the snapshot locally lets
        // us re-apply the user y range once the new data has been drawn.
        const restoreY = appState.pendingRestoreY;
        const restoreMode = appState.pendingYMode;
        appState.chart.updateDataMulti(filtered, displayCols);

        if (restoreY && restoreMode === 'restore') {
            appState.chart.setYRange(restoreY.min, restoreY.max);
        } else {
            // No pending restore (or pendingYMode === 'fit'): drop any
            // persisted user-set y range so the chart re-renders against
            // the data fit instead of an earlier zoomed-in window.
            appState.chart.resetYRange?.();
        }

        if (appState.rollingEnabled) {
            setRollingBands(computeFrontendRollingBands(filtered as any, appState.selectedCols, (appState as any).rollingWindow || 50));
            appState.chart?.requestOverlayRender?.();
        }
        rememberRenderedViewport();
        window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));
        announceDataUpdate('timeseries');
    }

    async function fetchAndRender(): Promise<void> {
        sanitizeSelectedColumns();
        if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
        const currentStart = Number(appState.currentStart);
        const currentEnd = Number(appState.currentEnd);
        if (currentStart >= currentEnd) return;
        if (!Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
            deps.buildRangeControls();
            renderCurrentData();
            return;
        }

        // Issue 7.2: Short-circuit no-op requests by checking if parameters
        // match the last successful fetch. This avoids redundant API calls when
        // the user clicks a series chip that's already selected, or triggers
        // other events that would produce identical requests.
        const currentCols = appState.selectedCols.join(',');
        const currentColorCol = appState.selectedColorColumn || null;
        const lastFetchKey = `${currentCols}|${currentColorCol}`;
        const fetchedWindow = appState.fetchedWindow;
        const bufferedDataIsRaw = appState.lastFetchedData?._meta?.downsampled === false;
        const viewportInsideFetchedWindow = !!(
            fetchedWindow
            && Number.isFinite(fetchedWindow.start)
            && Number.isFinite(fetchedWindow.end)
            && fetchedWindow.start <= currentStart
            && fetchedWindow.end >= currentEnd
        );

        if (lastFetchedParams === lastFetchKey && appState.lastFetchedData && viewportInsideFetchedWindow && bufferedDataIsRaw) {
            dbg('fetchAndRender: reusing buffered data window', {
                startIso: new Date(currentStart).toISOString(),
                endIso: new Date(currentEnd).toISOString(),
                cols: currentCols,
                colorCol: currentColorCol,
                fetchedWindow,
                downsampled: appState.lastFetchedData?._meta?.downsampled ?? null,
            });
            deps.buildRangeControls();
            appState.chart?.setXRange?.(currentStart, currentEnd);
            renderCurrentData();
            emitChartRangeChange('data');
            return;
        }

        await task.run(async (signal) => {
            const startIso = new Date(currentStart).toISOString();
            const endIso = new Date(currentEnd).toISOString();
            const width = document.getElementById('main-chart')?.clientWidth || 1200;
            const lookaroundMs = Math.max(MIN_LOOKAROUND_MS, Math.round((currentEnd - currentStart) * 1.25));

            const requestData = async () => {
                const cols = appState.selectedCols.join(',');
                const colorCol = appState.selectedColorColumn || null;

                announceChartLoading(appState.selectedCols || []);
                dbgGroup('fetchAndRender', () => {
                    dbg('request', { startIso, endIso, width, cols, colorCol, lookaroundMs });
                    dbg('selectedCols', appState.selectedCols);
                    dbg('selectedColorColumn', appState.selectedColorColumn);
                });

                return deps.fetchData(startIso, endIso, width, cols, colorCol, lookaroundMs, signal);
            };

            let data: any;
            try {
                data = await requestData();
            } catch (error) {
                const recovered = isColumnMismatchError(error)
                    && deps.recoverFromColumnMismatch
                    && await deps.recoverFromColumnMismatch();
                if (!recovered) throw error;
                if (!Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
                    deps.buildRangeControls();
                    renderCurrentData();
                    return;
                }
                data = await requestData();
            }

            setLastFetchedData(data);
            if (Array.isArray(data?.ts) || data?.ts instanceof Float64Array) {
                const tsCount = data.ts.length;
                const fetchedStart = tsCount > 0 ? Number(data.ts[0]) : currentStart - lookaroundMs;
                const fetchedEnd = tsCount > 0 ? Number(data.ts[tsCount - 1]) : currentEnd + lookaroundMs;
                setFetchedWindow({ start: fetchedStart, end: fetchedEnd });
            } else {
                setFetchedWindow({ start: currentStart - lookaroundMs, end: currentEnd + lookaroundMs });
            }
            // Issue 7.2: Update last successful fetch parameters for no-op short-circuit
            lastFetchedParams = lastFetchKey;

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
                        startIso,
                        endIso,
                        width,
                        cols: appState.selectedCols.join(','),
                    });
                }
            }

            ensureRangeStateFromData(data);
            deps.buildRangeControls();
            appState.chart?.setXRange?.(currentStart, currentEnd);
            renderCurrentData();
            emitChartRangeChange('data');

            if (appState.anomalyEnabled) {
                deps.fetchAndRenderAnalytics().catch(() => { });
            }

            if (DEBUG) {
                const snapshot = computeRenderedYDebugSnapshot();
                (window as any).__edatime.debugYSnapshot = snapshot;
                dbg('post-render renderedSnapshot', snapshot);
            }

            const yr = appState.chart?.getYRange?.();
            if (yr) deps.updateAnalysisYRange(yr.min, yr.max, 'data');
            if (DEBUG) dbg('post-render yRange', yr);

            setPendingYMode(null);
            setPendingRestoreY(null);
        });
    }

    function zoomOut(): void {
        if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
        consecutiveZoomOuts += 1;
        if (consecutiveZoomOuts >= CONSECUTIVE_ZOOM_OUT_RESET_COUNT && appState.initialView) {
            resetZoom();
            return;
        }

        const restoreState = zoomRestoreHistory[zoomRestoreHistory.length - 1] ?? null;
        if (!restoreState) return;

        zoomRestoreHistory = zoomRestoreHistory.slice(0, -1);
        syncZoomHistoryStore();

        applyView(restoreState.view, 'zoom-out');

        const canReuseRawBufferedState = restoreState.fetchKey === currentFetchKey()
            && !!restoreState.data
            && restoreState.data?._meta?.downsampled === false;
        if (canReuseRawBufferedState) {
            setLastFetchedData(restoreState.data);
            setFetchedWindow(restoreState.fetchedWindow);
            lastFetchedParams = restoreState.fetchKey;
            renderCurrentData();
            return;
        }

        setFetchDebounceId(setTimeout(fetchAndRender, 0));
    }

    function resetZoom(): void {
        if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
        consecutiveZoomOuts = 0;
        zoomRestoreHistory = [];
        syncZoomHistoryStore();
        if (!appState.initialView) return;
        applyView(appState.initialView, 'reset');
        setFetchDebounceId(setTimeout(fetchAndRender, 0));
    }

    function onZoomRangeChange(view: ViewSnapshot, sourceKind = 'user'): void {
        if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
        consecutiveZoomOuts = 0;

        dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
            dbg('prev', { start: appState.currentStart, end: appState.currentEnd });
            dbg('next', view);
        });

        const newStart = Number(view.xMin);
        const newEnd = Number(view.xMax);
        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

        const snap = lastKnownView ?? snapshotCurrentViewport();
        if (snap) {
            zoomRestoreHistory = [
                ...zoomRestoreHistory,
                {
                    view: { ...snap },
                    data: appState.lastFetchedData,
                    fetchedWindow: appState.fetchedWindow ? { ...appState.fetchedWindow } : null,
                    fetchKey: currentFetchKey(),
                },
            ].slice(-5);
            syncZoomHistoryStore();
        }

        applyView(view, sourceKind);
        if (!appState.refetchOnZoom) return;
        const delayMs = sourceKind === 'user' ? 0 : 75;
        setFetchDebounceId(setTimeout(fetchAndRender, delayMs));
    }

    return {
        emitChartRangeChange,
        fetchAndRender,
        onZoomRangeChange,
        renderCurrentData,
        resetZoom,
        zoomOut,
    };
}
