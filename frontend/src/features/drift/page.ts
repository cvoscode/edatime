/**
 * driftPage.ts — Temporal Distribution & Drift Analysis page.
 *
 * ECharts-based drift visuals with timeline box summaries and
 * interactive detail views (box, violin-density proxy, ECDF, histogram).
 */

import { DEBUG } from '../../debug.js';
import { fetchDriftInvestigation } from '../../services/api/index.js';
import { bindDriftControls, getSelectedColumns } from './controls.js';
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
    selectWindow,
} from './selection.js';
import {
    initTimelineChart,
    renderTimeline,
    renderTimelineFull,
    getTimelineChart,
    resizeTimelineChart,
} from './timelineView.js';
import {
    initDetailChart,
    renderDetail,
    renderDetailFull,
    getDetailChart,
    resizeDetailChart,
    renderWindowList as renderWindowListFromDetail,
    updateDetailStats as updateDetailStatsFromDetail,
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

// Re-export for test isolation
export { _setEchartsModule };

/** Module-level runtime handle for the drift page lifecycle. */
let driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let driftPageCleanup: (() => void) | null = null;

export async function initDriftPage(metadata: any): Promise<void> {
    driftPageCleanup?.();
    driftPageCleanup = null;
    const pageAbortController = new AbortController();
    // ── Column picker (custom checkbox dropdown) ──────────────────────────────
    const colPickerBtn = document.getElementById('drift-col-picker-btn') as HTMLButtonElement | null;
    const colPickerPanel = document.getElementById('drift-col-picker-panel') as HTMLElement | null;
    const colPickerList = document.getElementById('drift-col-picker-list') as HTMLElement | null;
    const colPickerLabel = document.getElementById('drift-col-picker-label') as HTMLElement | null;
    const colSelectAllBtn = document.getElementById('drift-cols-all') as HTMLButtonElement | null;
    const colSelectSingleBtn = document.getElementById('drift-cols-single') as HTMLButtonElement | null;
    const colSelectNoneBtn = document.getElementById('drift-cols-none') as HTMLButtonElement | null;
    // Hidden backing <select> kept for compatibility; updated in sync with checkboxes.
    const colSelect = document.getElementById('drift-col-select') as HTMLSelectElement | null;

    const windowSelect = document.getElementById('drift-window-select') as HTMLElement | null;
    const plotTypeSelect = document.getElementById('drift-plot-type') as HTMLElement | null;
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
    let activeTab = 'overview';

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
        renderTimeline();
        renderDetail();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    // Handle window selections triggered by keyboard interaction in the window list
    // (detailView.ts dispatches 'drift:window-select' when Enter/Space is pressed).
    function onWindowSelect(windowIdx: number): void {
        selectWindow(windowIdx);
        renderTimeline();
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
                renderTimeline();
                renderDetail();
            }
        });
    }

    function syncEmptyState(show: boolean, message?: string): void {
        if (!emptyState) return;
        if (message) emptyState.innerHTML = `<strong>No drift data</strong><span>${message}</span>`;
        emptyState.hidden = !show;
        driftLayoutEl?.classList.toggle('drift-empty-active', show);
    }

    function setIdleStatus(): void {
        if (!statusEl) return;
        statusEl.textContent = 'Select one or more columns, choose a baseline, and press Compute.';
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
        const panels = buildDriftSummaryPanelHtml(getResponsesByColumn());
        if (summaryStripEl) summaryStripEl.innerHTML = panels.summaryStrip;
        if (columnSummaryEl) columnSummaryEl.innerHTML = panels.columnSummary;
        renderInvestigationPanels();
    }

    function applyRenderedResponses(
        results: Map<string, DriftResponse>,
        investigation: DriftInvestigationResponse | null,
        failedColumns: string[] = [],
    ): void {
        currentInvestigation = investigation;
        setResponses(getFilteredResponses(results));
        updateDetailColumnSelect();
        statusSummary(failedColumns);
        setComputedStatus(getResponsesByColumn(), failedColumns);
        renderSummaryPanels();
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
        computeBtnEl.textContent = 'Computing...';
        syncEmptyState(false);

        // Ensure ECharts is loaded and charts are initialised before showing data.
        await ensureChartsAsync();

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

                const investigation = await fetchDriftInvestigation<DriftInvestigationResponse>(basePayload, signal);
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
            computeBtnEl.textContent = 'Compute';
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

    if (!timelineEl || !detailEl || !computeBtn || !detailColumnSelect) return;

    // Aliases for closures that need narrowed non-null references
    const computeBtnEl = computeBtn as HTMLButtonElement;
    const timelineElNN = timelineEl;
    const detailElNN = detailEl;

    function renderTimelineLocal(): void {
        renderTimelineFull();
    }

    function renderDetailLocal(): void {
        const plotType = getDropdownValue('drift-plot-type') || 'boxplot';
        renderDetailFull(plotType);
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
            pageMetadata: metadata,
            colPickerBtn,
            colPickerPanel,
            colPickerList,
            colPickerLabel,
            colSelectAllBtn,
            colSelectSingleBtn,
            colSelectNoneBtn,
            colSelect,
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
                // Selection is managed by timelineView via selection.ts
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
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveTab(button.dataset.driftTab || 'overview'), { signal: pageAbortController.signal });
    });
    updateSegmentBySelect();
    setActiveTab(activeTab);
    setIdleStatus();

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
        resizeObserver?.disconnect();
        disposeRuntime();
        driftRuntime = null;
        setSyncDriftEmptyState(() => {});
    };
    // Page-level "?" help button. Idempotent so safe to call on every
    // page init.
    initDriftHelp();
}
