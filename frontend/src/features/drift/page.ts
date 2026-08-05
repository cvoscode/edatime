/**
 * driftPage.ts — Temporal Distribution & Drift Analysis page.
 *
 * ECharts-based drift visuals with timeline box summaries and
 * interactive detail views (box, violin-density proxy, ECDF, histogram).
 */

import { DEBUG } from '../../debug.js';
import { fetchDriftInvestigation } from '../../services/api/index.js';
import { bindDriftControls, getSelectedColumns, resetDriftControlsState } from './controls.js';
import { toast } from '../../utils/toast.js';
import { createAnalysisPageRuntime } from '../../platform/analysisRuntime.js';
import { createRequestTask } from '../../platform/requestTask.js';
import { initDriftHelp } from './help.js';
import type { EChartLike } from './types.js';
import {
    driftColor,
    statusSummary as buildStatusSummary,
} from './viewModels.js';
import type {
    DriftEvaluationMode,
    DriftInvestigationResponse,
    DriftResponse,
} from './viewModels.js';
import { exportEChartsPNG } from '../../utils/chartExport.js';
import {
    getECharts,
    getEChartsModule,
    _setEchartsModule,
    syncDriftEmptyState,
    setSyncDriftEmptyState,
} from './runtime.js';
import {
    getResponsesByColumn,
    getActiveDetailColumn,
    getSelectedWindowIdx,
    getActiveResponse,
    setWindowSort,
    setResponses,
    clearSelection,
    _setSelectionState,
    selectColumn,
    selectWindow,
} from './selection.js';
import {
    initTimelineChart,
    renderTimelineFull,
    getTimelineChart,
    resizeTimelineChart,
    disposeTimelineChart,
} from './timelineView.js';
import {
    initDetailChart,
    renderDetail,
    renderDetailFull,
    getDetailChart,
    resizeDetailChart,
    renderWindowList as renderWindowListFromDetail,
    updateDetailStats as updateDetailStatsFromDetail,
    disposeDetailChart,
} from './detailView.js';
import {
    getDropdownValue,
    setDropdownDisabled,
    setDropdownOptions,
    setDropdownValue,
} from '../../ui/primitives/Dropdown.js';
import {
    filterDriftResponsesForEvaluation,
    normalizeDriftEvaluationMode,
    normalizeLatestWindowCount,
} from './evaluationPolicy.js';
import { buildDriftInvestigationPanelHtml } from './investigationPanels.js';
import { buildDriftInvestigationRequest } from './requestPayload.js';
import { buildDriftSummaryPanelHtml } from './summaryPanels.js';
import { buildDriftCsv, buildDriftJsonExport } from './exportPayloads.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import { onThemeChange } from '../../utils/theme.js';

// Re-export for test isolation
export { _setEchartsModule };

/** Module-level runtime handle for the drift page lifecycle. */
let driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let driftPageCleanup: (() => void) | null = null;

/** Release the current Drift feature instance and its page-owned resources. */
export function disposeDriftPage(): void {
    driftPageCleanup?.();
    driftPageCleanup = null;
}

export async function initDriftPage(
    metadata: any,
    deps: { workspace?: Pick<WorkspaceStore, 'getSnapshot'> } = {},
): Promise<() => void> {
    disposeDriftPage();
    const pageAbortController = new AbortController();
    // ── Column picker (custom checkbox dropdown) ──────────────────────────────
    const colPickerBtn = document.getElementById('drift-col-picker-btn') as HTMLButtonElement | null;
    const colPickerPanel = document.getElementById('drift-col-picker-panel') as HTMLElement | null;
    const colPickerList = document.getElementById('drift-col-picker-list') as HTMLElement | null;
    const colPickerLabel = document.getElementById('drift-col-picker-label') as HTMLElement | null;
    const colSelectAllBtn = document.getElementById('drift-cols-all') as HTMLButtonElement | null;
    const colSelectSingleBtn = document.getElementById('drift-cols-single') as HTMLButtonElement | null;
    const colSelectNoneBtn = document.getElementById('drift-cols-none') as HTMLButtonElement | null;
    const windowSelect = document.getElementById('drift-window-select') as HTMLElement | null;
    const plotTypeSelect = document.getElementById('drift-plot-type') as HTMLElement | null;
    const overviewPlotTypeSelect = document.getElementById('drift-overview-plot-type') as HTMLElement | null;
    const overviewTitle = document.getElementById('drift-overview-title') as HTMLElement | null;
    const overviewDescription = document.getElementById('drift-overview-description') as HTMLElement | null;
    const overviewLegend = document.getElementById('drift-overview-legend') as HTMLElement | null;
    const refPresetSelect = document.getElementById('drift-ref-preset') as HTMLElement | null;
    const evaluationModeSelect = document.getElementById('drift-evaluation-mode') as HTMLElement | null;
    const latestNInput = document.getElementById('drift-latest-n') as HTMLInputElement | null;
    const latestNHelper = document.getElementById('drift-latest-n-helper') as HTMLElement | null;
    const segmentBySelect = document.getElementById('drift-segment-by') as HTMLElement | null;
    const ksThresholdInput = document.getElementById('drift-ks-threshold') as HTMLInputElement | null;
    const esThresholdInput = document.getElementById('drift-es-threshold') as HTMLInputElement | null;
    const psiMinorThresholdInput = document.getElementById('drift-psi-minor-threshold') as HTMLInputElement | null;
    const psiMajorThresholdInput = document.getElementById('drift-psi-major-threshold') as HTMLInputElement | null;
    const wassersteinStdMultiplierInput = document.getElementById('drift-wasserstein-std-multiplier') as HTMLInputElement | null;
    const refStartInput = document.getElementById('drift-ref-start') as HTMLInputElement | null;
    const refEndInput = document.getElementById('drift-ref-end') as HTMLInputElement | null;
    const computeBtn = document.getElementById('drift-compute-btn') as HTMLButtonElement | null;
    const zoomResetBtn = document.getElementById('drift-zoom-reset-btn') as HTMLButtonElement | null;
    const timelineEl = document.getElementById('drift-timeline-chart') as HTMLDivElement | null;
    const detailEl = document.getElementById('drift-detail-chart') as HTMLDivElement | null;
    const detailColumnSelect = document.getElementById('drift-detail-col-select') as HTMLElement | null;
    const loadingOverlay = document.getElementById('drift-loading') as HTMLElement | null;
    const emptyState = document.getElementById('drift-empty') as HTMLElement | null;
    const detailHeader = document.getElementById('drift-detail-header') as HTMLElement | null;
    const detailStatsEl = document.getElementById('drift-detail-stats') as HTMLElement | null;
    const windowListEl = document.getElementById('drift-window-list') as HTMLElement | null;
    const driftLayoutEl = document.querySelector('#page-drift .drift-layout') as HTMLElement | null;
    const sortSelect = document.getElementById('drift-sort-select') as HTMLElement | null;
    const summaryStripEl = document.getElementById('drift-summary-strip') as HTMLElement | null;
    const columnSummaryEl = document.getElementById('drift-column-summary') as HTMLElement | null;
    const statusEl = document.getElementById('drift-status') as HTMLElement | null;
    const overviewPanelEl = document.getElementById('drift-overview-panel') as HTMLElement | null;
    const segmentsPanelEl = document.getElementById('drift-segments-panel') as HTMLElement | null;
    const qualityPanelEl = document.getElementById('drift-quality-panel') as HTMLElement | null;
    const relationshipsPanelEl = document.getElementById('drift-relationships-panel') as HTMLElement | null;
    const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-drift-tab]'));

    // ── Chart and data state ────────────────────────────────────────────────────
    let resizeObserver: ResizeObserver | null = null;
    let _pendingFullReset = false;
    let rawResponsesByColumn = new Map<string, DriftResponse>();
    let currentInvestigation: DriftInvestigationResponse | null = null;
    let activeTab = 'timeline';
    let activeTraceFilter: 'all' | 'drifting' | 'stable' = 'all';
    let traceSearchQuery = '';

    getECharts().catch(() => { /* non-critical; will retry on first ensureCharts() call */ });

    const isRenderable = (element: HTMLElement | null): boolean => (
        !!element && element.clientWidth > 0 && element.clientHeight > 0
    );

    function isDriftChartReadyForInit(): boolean {
        const page = document.getElementById('page-drift') as HTMLElement | null;
        return !!(page && !page.hidden && isRenderable(timelineElNN) && isRenderable(detailElNN));
    }

    function onTimelineClick(col: string, windowIdx: number): void {
        if (getDropdownValue('drift-detail-col-select') !== col) setDropdownValue('drift-detail-col-select', col);
        selectWindow(windowIdx);
        syncSelectedTraceRow();
        syncWindowPickButtons(null);
        renderTimelineLocal();
        renderDetail();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    // Handle window selections triggered by keyboard interaction in the window list
    // (detailView.ts dispatches 'drift:window-select' when Enter/Space is pressed).
    function onWindowSelect(windowIdx: number): void {
        selectWindow(windowIdx);
        syncWindowPickButtons(null);
        renderTimelineLocal();
        renderDetail();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    windowListEl?.addEventListener('drift:window-select', ((e: CustomEvent) => {
        onWindowSelect(e.detail.windowIdx);
    }) as EventListener, { signal: pageAbortController.signal });

    function ensureCharts(): void {
        if (!isDriftChartReadyForInit()) return;
        if (!getTimelineChart()) {
            const _echarts = getEChartsModule();
            if (!_echarts || !timelineElNN) return;
            initTimelineChart(_echarts as typeof import('echarts'), timelineElNN, onTimelineClick);
        }

        if (!getDetailChart()) {
            const _echarts2 = getEChartsModule();
            if (!_echarts2 || !detailElNN) return;
            initDetailChart(_echarts2 as typeof import('echarts'), detailElNN);
        }

        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(() => {
                resizeTimelineChart();
                resizeDetailChart();
            });
            resizeObserver.observe(timelineElNN);
            resizeObserver.observe(detailElNN);
        }
    }

    async function ensureChartsAsync(): Promise<void> {
        await getECharts();
        ensureCharts();
    }

    function scheduleDriftChartRefresh(attempts = 6): void {
        if (!isDriftChartReadyForInit()) {
            if (attempts <= 0) return;
            window.setTimeout(() => scheduleDriftChartRefresh(attempts - 1), 0);
            return;
        }
        void ensureChartsAsync().then(() => {
            if (!isDriftChartReadyForInit()) return;
            if (getResponsesByColumn().size > 0) {
                renderTimelineLocal();
                renderDetail();
            }
        });
    }

    const unsubscribeTheme = onThemeChange(() => scheduleDriftChartRefresh());
    pageAbortController.signal.addEventListener('abort', unsubscribeTheme, { once: true });

    function syncEmptyState(show: boolean, message?: string): void {
        if (!emptyState) return;
        if (message) emptyState.innerHTML = `<strong>No drift data</strong><span>${message}</span>`;
        emptyState.hidden = !show;
        driftLayoutEl?.classList.toggle('drift-empty-active', show);
    }

    function setIdleStatus(): void {
        if (!statusEl) return;
        statusEl.textContent = 'Select one or more columns, choose a baseline, and run the analysis.';
    }

    function setComputedStatus(
        responsesByColumn: Map<string, DriftResponse>,
        failedColumns: string[] = [],
    ): void {
        if (!statusEl) return;
        const summary = buildStatusSummary(responsesByColumn, failedColumns);
        if (summary.windowsTotal === 0) {
            setIdleStatus();
            return;
        }
        const hint = summary.flaggedTotal === summary.windowsTotal && summary.windowsTotal > 0
            ? ' Every window is flagged; consider relaxing thresholds or using a longer baseline.'
            : '';
        statusEl.textContent = `Drift analysis complete. ${summary.flaggedTotal} of ${summary.windowsTotal} windows flagged.${hint}`;
    }

    function updateDetailColumnSelect(): void {
        const cols = Array.from(getResponsesByColumn().keys());
        const current = getActiveDetailColumn();
        setDropdownOptions('drift-detail-col-select', cols.map((col) => ({ value: col, label: col })), {
            preferredValue: current || cols[0] || '',
            searchable: true,
        });
        if (cols.length === 0) {
            setDropdownDisabled('drift-detail-col-select', true);
            return;
        }
        setDropdownDisabled('drift-detail-col-select', false);
        setDropdownValue('drift-detail-col-select', current && getResponsesByColumn().has(current) ? current : cols[0]!);
    }

    function updateSegmentBySelect(): void {
        const timeColumn = String(metadata?.time_column || '').trim();
        const options = (Array.isArray(metadata?.columns) ? metadata.columns : [])
            .map((column: { name?: string; dtype?: string }) => String(column?.name || '').trim())
            .filter((name: string) => !!name && name !== timeColumn);
        if (!segmentBySelect) return;
        setDropdownOptions('drift-segment-by', [{ value: '', label: 'None' }, ...options.map((name: string) => ({ value: name, label: name }))], {
            preferredValue: getDropdownValue('drift-segment-by') || '',
        });
    }

    function setActiveTab(nextTab: string): void {
        activeTab = nextTab;
        tabButtons.forEach((button) => {
            const matches = button.dataset.driftTab === nextTab;
            button.classList.toggle('active', matches);
            button.setAttribute('aria-pressed', matches ? 'true' : 'false');
        });
        const isTimeline = nextTab === 'timeline';
        if (summaryStripEl) summaryStripEl.hidden = !isTimeline;
        if (columnSummaryEl) columnSummaryEl.hidden = !isTimeline;
        if (driftLayoutEl) driftLayoutEl.hidden = !isTimeline;
        if (overviewPanelEl) overviewPanelEl.hidden = nextTab !== 'overview';
        if (segmentsPanelEl) segmentsPanelEl.hidden = nextTab !== 'segments';
        if (qualityPanelEl) qualityPanelEl.hidden = nextTab !== 'quality';
        if (relationshipsPanelEl) relationshipsPanelEl.hidden = nextTab !== 'relationships';
    }

    function getEvaluationMode(): DriftEvaluationMode {
        return normalizeDriftEvaluationMode(getDropdownValue('drift-evaluation-mode'));
    }

    function getLatestWindowCount(): number {
        return normalizeLatestWindowCount(latestNInput?.value);
    }

    function getFilteredResponses(results: Map<string, DriftResponse>): Map<string, DriftResponse> {
        return filterDriftResponsesForEvaluation(results, getEvaluationMode(), getLatestWindowCount());
    }

    function renderInvestigationPanels(): void {
        const panels = buildDriftInvestigationPanelHtml(currentInvestigation);
        if (overviewPanelEl) overviewPanelEl.innerHTML = panels.overview;
        if (segmentsPanelEl) segmentsPanelEl.innerHTML = panels.segments;
        if (qualityPanelEl) qualityPanelEl.innerHTML = panels.quality;
        if (relationshipsPanelEl) relationshipsPanelEl.innerHTML = panels.relationships;
    }

    function renderSummaryPanels(): void {
        const panels = buildDriftSummaryPanelHtml(getResponsesByColumn(), currentInvestigation, getActiveDetailColumn());
        if (summaryStripEl) summaryStripEl.innerHTML = panels.summaryStrip;
        if (columnSummaryEl) columnSummaryEl.innerHTML = panels.columnSummary;
        syncTraceFilterCounts();
        applyTraceFilter();
        renderInvestigationPanels();
    }

    function syncTraceFilterCounts(): void {
        const rows = Array.from(columnSummaryEl?.querySelectorAll<HTMLElement>('.drift-trace-row') ?? []);
        const drifting = rows.filter((row) => row.dataset.driftState === 'drifting').length;
        const counts = { all: rows.length, drifting, stable: rows.length - drifting };
        (Object.keys(counts) as Array<keyof typeof counts>).forEach((key) => {
            const element = document.querySelector<HTMLElement>(`[data-drift-count="${key}"]`);
            if (element) element.textContent = String(counts[key]);
        });
    }

    function applyTraceFilter(): void {
        const rows = Array.from(columnSummaryEl?.querySelectorAll<HTMLElement>('.drift-trace-row') ?? []);
        let visible = 0;
        rows.forEach((row) => {
            const matchesState = activeTraceFilter === 'all' || row.dataset.driftState === activeTraceFilter;
            const matchesSearch = !traceSearchQuery || (row.dataset.driftColumn ?? '').toLowerCase().includes(traceSearchQuery);
            row.hidden = !(matchesState && matchesSearch);
            if (!row.hidden) visible += 1;
        });
        const empty = columnSummaryEl?.querySelector<HTMLElement>('.drift-table-empty');
        if (empty) empty.hidden = visible > 0;
    }

    function syncSelectedTraceRow(): void {
        const activeColumn = getActiveDetailColumn();
        columnSummaryEl?.querySelectorAll<HTMLElement>('.drift-trace-row').forEach((row) => {
            const selected = row.dataset.driftColumn === activeColumn;
            row.classList.toggle('selected', selected);
            row.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
    }

    function syncWindowPickButtons(activePick: string | null): void {
        document.querySelectorAll<HTMLElement>('[data-drift-window-pick]').forEach((button) => {
            const selected = !!activePick && button.dataset.driftWindowPick === activePick;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    function pickWindow(mode: 'latest' | 'worst' | 'first'): void {
        const response = getActiveResponse();
        if (!response || response.windows.length === 0) return;
        let index = response.windows.length - 1;
        if (mode === 'first') {
            index = response.windows.findIndex((window) => window.drift_level !== 'green');
            if (index < 0) index = 0;
        } else if (mode === 'worst') {
            index = response.windows.reduce((worstIndex, window, candidateIndex) => {
                const worst = response.windows[worstIndex]!;
                const severityDelta = (window.drift_level === 'red' ? 3 : window.drift_level === 'yellow' ? 2 : 1)
                    - (worst.drift_level === 'red' ? 3 : worst.drift_level === 'yellow' ? 2 : 1);
                return severityDelta > 0 || (severityDelta === 0 && window.psi > worst.psi) ? candidateIndex : worstIndex;
            }, 0);
        }
        selectWindow(index);
        syncWindowPickButtons(mode);
        renderTimelineLocal();
        renderDetail();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    function selectTrace(column: string): void {
        const response = getResponsesByColumn().get(column);
        if (!response) return;
        selectColumn(column);
        if (response.windows.length > 0) selectWindow(response.windows.length - 1);
        setDropdownValue('drift-detail-col-select', column);
        syncSelectedTraceRow();
        syncWindowPickButtons('latest');
        syncOverviewModeUi();
        renderTimelineLocal();
        renderDetail();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    function applyRenderedResponses(
        results: Map<string, DriftResponse>,
        investigation: DriftInvestigationResponse | null,
        failedColumns: string[] = [],
    ): void {
        currentInvestigation = investigation;
        setResponses(getFilteredResponses(results));
        syncWindowPickButtons('latest');
        updateDetailColumnSelect();
        statusSummary(failedColumns);
        setComputedStatus(getResponsesByColumn(), failedColumns);
        renderSummaryPanels();
        syncOverviewModeUi();
        renderTimelineLocal();
        renderDetailLocal();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    // detailOption and timelineOption live in timelineView.ts / detailView.ts / viewModels.ts

    function statusSummary(failedColumns: string[] = []): void {
        const responsesByColumn = getResponsesByColumn();
        if (responsesByColumn.size === 0) {
            toast('No drift response returned.', 'warning', {});
            return;
        }
        const summary = buildStatusSummary(responsesByColumn, failedColumns);
        toast(
            `Drift: ${summary.text}`,
            'info',
            {},
        );
    }

    // Module-level request task for drift compute — cancel-before-new semantics
    const driftComputeTask = createRequestTask({
        setLoading: (loading: boolean) => {
            // loading=true means the overlay should be visible; loading=false
            // hides it once work completes.
            if (loadingOverlay) loadingOverlay.hidden = !loading;
        },
        onError: (message: string) => {
            toast(`Drift failed: ${message}`, 'error', { duration: 0 });
            syncEmptyState(true, message || 'Computation failed. Check column and date ranges.');
        },
    });

    async function runCompute(): Promise<void> {
        const columns = getSelectedColumns();
        if (columns.length === 0) {
            toast('Select at least one numeric column.', 'warning', {});
            return;
        }

        const refStart = refStartInput?.value;
        const refEnd = refEndInput?.value;
        if (!refStart || !refEnd) {
            toast('Set reference start and end dates.', 'warning', {});
            return;
        }

        computeBtnEl.disabled = true;
        computeBtnEl.textContent = 'Running…';
        syncEmptyState(false);

        // Load the chart runtime in parallel with the API request. Drift results
        // should not wait behind a large visualization chunk before the backend
        // can start computing, especially on a cold mobile visit.
        const chartsReady = ensureChartsAsync().catch(() => undefined);

        try {
            await driftComputeTask.run(async (signal) => {
                const basePayload = buildDriftInvestigationRequest({
                    columns,
                    window: getDropdownValue('drift-window-select'),
                    referenceStart: refStart,
                    referenceEnd: refEnd,
                    segmentBy: getDropdownValue('drift-segment-by'),
                    ksPvalueThreshold: ksThresholdInput?.value,
                    esPvalueThreshold: esThresholdInput?.value,
                    psiMinorThreshold: psiMinorThresholdInput?.value,
                    psiMajorThreshold: psiMajorThresholdInput?.value,
                    wassersteinStdMultiplier: wassersteinStdMultiplierInput?.value,
                });

                const investigation = await fetchDriftInvestigation<DriftInvestigationResponse>(basePayload, { signal });
                await chartsReady;
                const results = new Map<string, DriftResponse>(Object.entries(investigation.columns || {}));
                if (results.size === 0) throw new Error('No drift responses received.');
                if (DEBUG && investigation.overview) console.debug('drift investigation overview', investigation.overview);

                rawResponsesByColumn = results;

                // Signal that the next render should do a full ECharts option reset
                // (new series data) rather than an incremental merge (issue #8).
                _pendingFullReset = true;

                applyRenderedResponses(results, investigation);
                setActiveTab('timeline');
                scheduleDriftChartRefresh();

                const hasWindows = Array.from(getResponsesByColumn().values()).some((resp) => resp.windows.length > 0);
                syncEmptyState(!hasWindows, hasWindows ? undefined : 'No data found in the monitoring range after the reference window.');

                (['drift-export-png', 'drift-export-detail-png', 'drift-export-csv', 'drift-export-json'] as const)
                    .forEach((id) => {
                        const btn = document.getElementById(id) as HTMLButtonElement | null;
                        if (btn) btn.disabled = false;
                    });
            });
        } finally {
            // Reset button state regardless of whether the run completed,
            // errored, or was superseded by another run() call.
            computeBtnEl.disabled = false;
            computeBtnEl.textContent = 'Run analysis';
        }
    }

    function exportDriftCsv(): void {
        if (getResponsesByColumn().size === 0) return;
        const blob = new Blob([buildDriftCsv(getResponsesByColumn())], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drift_multi_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportDriftJson(): void {
        if (!currentInvestigation) return;
        const blob = new Blob([buildDriftJsonExport(
            currentInvestigation,
            getActiveDetailColumn(),
            getEvaluationMode(),
            getLatestWindowCount(),
            getResponsesByColumn(),
        )], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drift_multi_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    if (!timelineEl || !detailEl || !computeBtn || !detailColumnSelect) {
        pageAbortController.abort();
        return disposeDriftPage;
    }

    // Aliases for closures that need narrowed non-null references
    const computeBtnEl = computeBtn as HTMLButtonElement;
    const timelineElNN = timelineEl;
    const detailElNN = detailEl;

    function renderTimelineLocal(): void {
        const rawMode = getDropdownValue('drift-overview-plot-type');
        const mode = rawMode === 'grouped' || rawMode === 'boxplot' || rawMode === 'violin' ? rawMode : 'heatmap';
        renderTimelineFull(mode);
    }

    function renderDetailLocal(): void {
        const plotType = getDropdownValue('drift-plot-type') || 'raincloud';
        renderDetailFull(plotType);
    }

    function syncOverviewModeUi(): void {
        const mode = getDropdownValue('drift-overview-plot-type') || 'heatmap';
        const selectedTrace = getActiveDetailColumn() || 'selected trace';
        if (mode === 'heatmap') {
            if (overviewTitle) overviewTitle.textContent = 'Drift severity over time';
            if (overviewDescription) overviewDescription.textContent = 'Reference baseline and evaluation windows across every selected trace.';
            if (overviewLegend) overviewLegend.hidden = false;
            timelineEl?.setAttribute('aria-label', 'Drift severity map over time');
            return;
        }
        if (mode === 'grouped') {
            if (overviewTitle) overviewTitle.textContent = 'Grouped distributions over time';
            if (overviewDescription) overviewDescription.textContent = 'Median and interquartile range for every trace, normalized to its reference distribution.';
            if (overviewLegend) overviewLegend.hidden = true;
            timelineEl?.setAttribute('aria-label', 'Grouped trace distributions over time');
            return;
        }
        if (overviewTitle) overviewTitle.textContent = `${mode === 'boxplot' ? 'Boxplots' : 'Violins'} over time · ${selectedTrace}`;
        if (overviewDescription) overviewDescription.textContent = 'Distribution shape for the selected trace; scroll or drag the navigator to inspect dense windows.';
        if (overviewLegend) overviewLegend.hidden = true;
        timelineEl?.setAttribute('aria-label', `${mode === 'boxplot' ? 'Boxplots' : 'Violins'} over time for ${selectedTrace}`);
    }

    function renderWindowListLocal(): void {
        renderWindowListFromDetail(windowListEl);
    }

    function updateDetailStatsLocal(): void {
        updateDetailStatsFromDetail(detailStatsEl, detailHeader);
    }

    function reapplyEvaluationMode(): void {
        if (rawResponsesByColumn.size === 0) return;
        applyRenderedResponses(rawResponsesByColumn, currentInvestigation);
    }

    // ── Wire controls ────────────────────────────────────────────────────────
    const disposeControls = bindDriftControls(
        {
            getSelectedColumns,
            runCompute,
            onSelectionChange: setIdleStatus,
            exportDriftCsv,
            exportDriftJson,
            renderTimeline: renderTimelineLocal,
            renderDetail: renderDetailLocal,
            renderWindowList: renderWindowListLocal,
            updateDetailStats: updateDetailStatsLocal,
            syncEmptyState,
            scheduleDriftChartRefresh,
        },
        {
            workspace: deps.workspace,
            pageMetadata: metadata,
            colPickerBtn,
            colPickerPanel,
            colPickerList,
            colPickerLabel,
            colSelectAllBtn,
            colSelectSingleBtn,
            colSelectNoneBtn,
            windowSelect,
            plotTypeSelect,
            refPresetSelect,
            evaluationModeSelect,
            latestNInput,
            latestNHelper,
            refStartInput,
            refEndInput,
            computeBtn,
            zoomResetBtn,
            detailColumnSelect,
            loadingOverlay,
            emptyState,
            driftLayoutEl,
            sortSelect,
            onDetailColumnChange: (column, windowIdx) => {
                if (column) selectTrace(column);
            },
            timelineChartDispatch: (action) => getTimelineChart()?.dispatchAction?.(action),
            detailChartDispatch: (action) => getDetailChart()?.dispatchAction?.(action),
            exportTimelinePNG: () => {
                const chart = getTimelineChart();
                if (chart) exportEChartsPNG(chart, `drift_timeline_${getActiveDetailColumn() || 'chart'}.png`);
            },
            exportDetailPNG: () => {
                const chart = getDetailChart();
                if (chart) exportEChartsPNG(chart, `drift_detail_${getActiveDetailColumn() || 'chart'}.png`);
            },
        },
    );

    evaluationModeSelect?.addEventListener('change', reapplyEvaluationMode, { signal: pageAbortController.signal });
    latestNInput?.addEventListener('change', reapplyEvaluationMode, { signal: pageAbortController.signal });
    overviewPlotTypeSelect?.addEventListener('change', () => {
        syncOverviewModeUi();
        renderTimelineLocal();
    }, { signal: pageAbortController.signal });
    columnSummaryEl?.addEventListener('click', (event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('.drift-trace-row');
        if (row?.dataset.driftColumn) selectTrace(row.dataset.driftColumn);
    }, { signal: pageAbortController.signal });
    columnSummaryEl?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = (event.target as HTMLElement).closest<HTMLElement>('.drift-trace-row');
        if (!row?.dataset.driftColumn) return;
        event.preventDefault();
        selectTrace(row.dataset.driftColumn);
    }, { signal: pageAbortController.signal });
    document.querySelectorAll<HTMLElement>('[data-drift-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            const next = button.dataset.driftFilter;
            if (next !== 'all' && next !== 'drifting' && next !== 'stable') return;
            activeTraceFilter = next;
            document.querySelectorAll<HTMLElement>('[data-drift-filter]').forEach((candidate) => {
                const selected = candidate === button;
                candidate.classList.toggle('active', selected);
                candidate.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
            applyTraceFilter();
        }, { signal: pageAbortController.signal });
    });
    document.getElementById('drift-trace-search')?.addEventListener('input', (event) => {
        traceSearchQuery = (event.target as HTMLInputElement).value.trim().toLowerCase();
        applyTraceFilter();
    }, { signal: pageAbortController.signal });
    document.querySelectorAll<HTMLElement>('[data-drift-window-pick]').forEach((button) => {
        button.addEventListener('click', () => {
            const mode = button.dataset.driftWindowPick;
            if (mode === 'latest' || mode === 'worst' || mode === 'first') pickWindow(mode);
        }, { signal: pageAbortController.signal });
    });
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveTab(button.dataset.driftTab || 'overview'), { signal: pageAbortController.signal });
    });
    updateSegmentBySelect();
    setActiveTab(activeTab);
    setIdleStatus();
    syncOverviewModeUi();

    scheduleDriftChartRefresh();

    // ── Shared analysis page runtime ───────────────────────────────────────────
    // Register the inner syncEmptyState with the runtime's module-level wrapper.
    setSyncDriftEmptyState(syncEmptyState);

    driftRuntime = createAnalysisPageRuntime({
        page: 'drift',
        emptyStateRootId: 'drift-empty',
        bindExportsOnInit: false,
        exportConfig: {
            key: 'drift',
            csv: { fn: exportDriftCsv, filename: 'edatime_drift.csv', dataCheck: () => getResponsesByColumn().size > 0 },
            // @ts-expect-error json export is supported by drift but not in the base ExportConfig type
            json: { fn: exportDriftJson, filename: 'edatime_drift.json', dataCheck: () => getResponsesByColumn().size > 0 },
        },
        init() {
            // Deferred export binding so csv/json dataCheck captures live
            // responsesByColumn state rather than a stale closure.
            driftRuntime?.bindExports();
        },
        onEveryPageChange() {
            // Refresh chart on every page change (drift needs to reflect any range changes).
            scheduleDriftChartRefresh();
        },
    });
    const disposeRuntime = driftRuntime.mount();
    driftPageCleanup = () => {
        pageAbortController.abort();
        disposeControls();
        resetDriftControlsState();
        disposeTimelineChart();
        disposeDetailChart();
        resizeObserver?.disconnect();
        disposeRuntime();
        driftRuntime = null;
        setSyncDriftEmptyState(() => {});
    };
    // Release page-level help with the page's controls and requests.
    pageAbortController.signal.addEventListener('abort', initDriftHelp(), { once: true });
    return disposeDriftPage;
}
