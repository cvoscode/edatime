import { DEBUG, dbg, dbgGroup } from '../debug.js';
import {
    appState,
    ensureRangeStateFromData,
    applyColumnRanges,
    sanitizeSelectedColumns,
    setMetaText,
} from '../state.js';
import { createEmptyStateController, isRangeOutsideDataset } from '../ui/emptyState.js';
import { announceChartLoading, announceDataUpdate } from '../utils/a11y.js';
import { computeFrontendRollingBands } from '../bootstrap/analyticsOverlay.js';

const EMPTY_TIMESERIES_DATA = { ts: [], values: {}, series: {}, colorByColumn: {} } as any;

interface TimeseriesControllerDeps {
    fetchData: (startIso: string, endIso: string, width: number, cols: string, colorCol: string | null, signal: AbortSignal) => Promise<any>;
    buildRangeControls: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => any;
    fetchAndRenderAnalytics: () => Promise<void>;
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
    let dataFetchController: AbortController | null = null;

    const uploadButton = document.getElementById('timeseries-empty-upload-btn');
    if (uploadButton) {
        uploadButton.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'upload' } }));
        });
    }

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
            appState.rollingBands = null;
            appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
            return;
        }
        if (!appState.lastFetchedData) {
            emptyState.update({ visible: false, reason: '', title: '', message: '', showResetAction: false });
            return;
        }
        const filtered = applyColumnRanges(appState.lastFetchedData);
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

            appState.rollingBands = null;
            appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                appState.chart.setXRange(start, end);
            }
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

        appState.chart.updateDataMulti(filtered, displayCols);

        if (appState.pendingRestoreY && appState.pendingYMode === 'restore') {
            const savedY = appState.pendingRestoreY;
            appState.chart.setYRange(savedY.min, savedY.max);
        }

        if (appState.rollingEnabled) {
            appState.rollingBands = computeFrontendRollingBands(filtered as any, appState.selectedCols, (appState as any).rollingWindow || 50);
            appState.chart?.requestOverlayRender?.();
        }
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

        if (dataFetchController) dataFetchController.abort();
        dataFetchController = new AbortController();
        const signal = dataFetchController.signal;

        const loadingEl = document.getElementById('main-chart-loading');
        if (loadingEl) loadingEl.hidden = false;

        try {
            const startIso = new Date(currentStart).toISOString();
            const endIso = new Date(currentEnd).toISOString();
            const width = document.getElementById('main-chart')?.clientWidth || 1200;
            const cols = appState.selectedCols.join(',');
            const colorCol = appState.selectedColorColumn || null;

            announceChartLoading(appState.selectedCols || []);
            dbgGroup('fetchAndRender', () => {
                dbg('request', { startIso, endIso, width, cols, colorCol });
                dbg('selectedCols', appState.selectedCols);
                dbg('selectedColorColumn', appState.selectedColorColumn);
            });

            const data = await deps.fetchData(startIso, endIso, width, cols, colorCol, signal);
            appState.lastFetchedData = data;

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
                    console.warn('[edatime] fetchAndRender: empty result for range', { startIso, endIso, width, cols });
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

            appState.pendingYMode = null;
            appState.pendingRestoreY = null;
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            console.error('Failed to fetch data:', err);
            setMetaText('Error: ' + err.message);
        } finally {
            const loadingEl = document.getElementById('main-chart-loading');
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    function onZoomRangeChange(newStart: number, newEnd: number, sourceKind = 'user'): void {
        if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);

        dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
            dbg('prev', { start: appState.currentStart, end: appState.currentEnd });
            dbg('next', { start: newStart, end: newEnd });
        });

        if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;

        const snap = deps.getCurrentView();
        appState.zoomHistory = [...appState.zoomHistory, snap].slice(-5);

        appState.currentStart = newStart;
        appState.currentEnd = newEnd;
        appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
        appState.pendingYMode = 'fit';
        appState.pendingRestoreY = null;

        deps.updateAnalysisZoom(newStart, newEnd, sourceKind);
        emitChartRangeChange(sourceKind);
        if (!appState.refetchOnZoom) return;
        appState.fetchDebounceId = setTimeout(fetchAndRender, 150);
    }

    return {
        emitChartRangeChange,
        fetchAndRender,
        onZoomRangeChange,
        renderCurrentData,
    };
}