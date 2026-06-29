/**
 * driftPage.ts — Temporal Distribution & Drift Analysis page.
 *
 * ECharts-based drift visuals with timeline box summaries and
 * interactive detail views (box, violin-density proxy, ECDF, histogram).
 */

import { DEBUG } from '../debug.js';
import { fetchDriftInvestigation, fetchDriftStats } from '../services/api/index.js';
import { bindDriftControls, getSelectedColumns } from './controls.js';
import { toast } from '../utils/toast.js';
import { createAnalysisPageRuntime } from '../pages/shared/analysisPageRuntime.js';
import { createRequestTask } from '../pages/shared/requestTask.js';
import type { EChartLike } from './types.js';
import {
    buildColumnSummary,
    buildGlobalSummary,
    driftColor,
    filterResponseForEvaluation,
    formatValue,
} from './viewModels.js';
import type {
    DriftChangePointRank,
    DriftEvaluationMode,
    DriftFeatureRank,
    DriftInvestigationResponse,
    DriftQualityIssueRank,
    DriftRelationshipRank,
    DriftResponse,
} from './viewModels.js';
import { exportEChartsPNG } from '../utils/chartExport.js';
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
} from '../ui/primitives/Dropdown.js';

// Re-export for test isolation
export { _setEchartsModule };

/** Module-level runtime handle for the drift page lifecycle. */
let driftRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let driftPageCleanup: (() => void) | null = null;

export async function initDriftPage(metadata: any): Promise<void> {
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
    let usingLegacyFallback = false;

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
    }) as EventListener);

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

    function readThresholdValue(input: HTMLInputElement | null, fallback: number): number {
        const value = Number(input?.value ?? '');
        return Number.isFinite(value) ? value : fallback;
    }

    function getEvaluationMode(): DriftEvaluationMode {
        const mode = getDropdownValue('drift-evaluation-mode');
        if (mode === 'latest' || mode === 'latest-n') return mode;
        return 'all';
    }

    function getLatestWindowCount(): number {
        const value = Number(latestNInput?.value ?? '1');
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
    }

    function getFilteredResponses(results: Map<string, DriftResponse>): Map<string, DriftResponse> {
        const mode = getEvaluationMode();
        const latestCount = getLatestWindowCount();
        return new Map(
            Array.from(results.entries()).map(([column, response]) => [
                column,
                filterResponseForEvaluation(response, mode, latestCount),
            ]),
        );
    }

    function renderFeatureRankCards(ranks: DriftFeatureRank[]): string {
        return ranks.slice(0, 5).map((rank) => `
            <article class="drift-column-card">
                <div class="drift-column-card__header">
                    <strong>${rank.column}</strong>
                    <span class="drift-column-card__level drift-${rank.latestLevel}">${rank.latestLevel.toUpperCase()}</span>
                </div>
                <div class="drift-column-card__body">
                    <div>Score: ${rank.driftScore}</div>
                    <div>Flagged windows: ${rank.flaggedWindows}</div>
                    <div>First change: ${rank.firstChangePoint || 'None'}</div>
                </div>
            </article>
        `).join('');
    }

    function renderSimpleList<T>(items: T[], renderItem: (item: T) => string, emptyText: string): string {
        if (items.length === 0) return `<div class="drift-column-card"><div class="drift-column-card__body">${emptyText}</div></div>`;
        return items.slice(0, 5).map(renderItem).join('');
    }

    function renderInvestigationPanels(): void {
        if (!currentInvestigation) {
            if (overviewPanelEl) overviewPanelEl.innerHTML = '';
            if (segmentsPanelEl) segmentsPanelEl.innerHTML = '';
            if (qualityPanelEl) qualityPanelEl.innerHTML = '';
            if (relationshipsPanelEl) relationshipsPanelEl.innerHTML = '';
            return;
        }
        if (overviewPanelEl) {
            overviewPanelEl.innerHTML = `
                <div class="drift-summary-strip">
                    ${usingLegacyFallback ? `
                    <div class="drift-summary-card">
                        <span class="drift-summary-label">Legacy fallback</span>
                        <strong class="drift-summary-value">Using /api/drift/stats compatibility mode</strong>
                    </div>
                    ` : ''}
                    <div class="drift-summary-card">
                        <span class="drift-summary-label">Investigation score</span>
                        <strong class="drift-summary-value">${currentInvestigation.overview.driftScore}</strong>
                    </div>
                    <div class="drift-summary-card">
                        <span class="drift-summary-label">Worst level</span>
                        <strong class="drift-summary-value drift-${currentInvestigation.overview.worstLevel}">${currentInvestigation.overview.worstLevel.toUpperCase()}</strong>
                    </div>
                    <div class="drift-summary-card">
                        <span class="drift-summary-label">First change point</span>
                        <strong class="drift-summary-value">${currentInvestigation.overview.firstChangePoint || 'None'}</strong>
                    </div>
                </div>
                <div class="drift-column-summary">
                    ${renderFeatureRankCards(currentInvestigation.rankings.features)}
                    ${renderSimpleList<DriftChangePointRank>(currentInvestigation.rankings.changePoints, (item) => `
                        <article class="drift-column-card">
                            <div class="drift-column-card__header"><strong>${item.column}</strong><span>${item.label}</span></div>
                            <div class="drift-column-card__body"><div>Change point: ${item.isoTime}</div><div>Reasons: ${item.triggerReasons.join(', ') || 'none'}</div></div>
                        </article>
                    `, 'No change points detected.')}
                </div>
            `;
        }
        if (segmentsPanelEl) {
            const groups = currentInvestigation.segments?.groups ?? [];
            segmentsPanelEl.innerHTML = renderSimpleList(groups, (group) => `
                <article class="drift-column-card">
                    <div class="drift-column-card__header"><strong>${group.value}</strong><span>${group.sampleCount} rows</span></div>
                    <div class="drift-column-card__body"><div>Score: ${group.overview.driftScore}</div><div>Flagged columns: ${group.overview.columnsFlagged}</div></div>
                </article>
            `, 'No segment breakdown returned.');
        }
        if (qualityPanelEl) {
            const issues = currentInvestigation.rankings.qualityIssues;
            qualityPanelEl.innerHTML = renderSimpleList<DriftQualityIssueRank>(issues, (issue) => `
                <article class="drift-column-card">
                    <div class="drift-column-card__header"><strong>${issue.column}</strong><span>${issue.driftScore}</span></div>
                    <div class="drift-column-card__body"><div>${issue.label}</div><div>Issue key: ${issue.issue}</div></div>
                </article>
            `, 'No quality issues detected.');
        }
        if (relationshipsPanelEl) {
            const pairs = currentInvestigation.relationships?.pairs ?? currentInvestigation.rankings.relationships;
            relationshipsPanelEl.innerHTML = renderSimpleList<DriftRelationshipRank>(pairs, (pair) => `
                <article class="drift-column-card">
                    <div class="drift-column-card__header"><strong>${pair.leftColumn} ↔ ${pair.rightColumn}</strong><span>${pair.delta.toFixed(3)}</span></div>
                    <div class="drift-column-card__body"><div>Reference: ${pair.reference.toFixed(3)}</div><div>Comparison: ${pair.comparison.toFixed(3)}</div></div>
                </article>
            `, 'No relationship drift detected.');
        }
    }

    function renderSummaryPanels(): void {
        if (getResponsesByColumn().size === 0) {
            if (summaryStripEl) summaryStripEl.innerHTML = '';
            if (columnSummaryEl) columnSummaryEl.innerHTML = '';
            return;
        }

        const globalSummary = buildGlobalSummary(getResponsesByColumn());
        if (summaryStripEl) {
            summaryStripEl.innerHTML = `
                <div class="drift-summary-card">
                    <span class="drift-summary-label">Any drift detected?</span>
                    <strong class="drift-summary-value">${globalSummary.anyDrift ? 'Yes' : 'No'}</strong>
                </div>
                <div class="drift-summary-card">
                    <span class="drift-summary-label">Columns flagged</span>
                    <strong class="drift-summary-value">${globalSummary.columnsFlagged}/${globalSummary.totalColumns}</strong>
                </div>
                <div class="drift-summary-card">
                    <span class="drift-summary-label">Latest window severity</span>
                    <strong class="drift-summary-value drift-${globalSummary.latestSeverity}">${globalSummary.latestSeverity.toUpperCase()}</strong>
                </div>
                <div class="drift-summary-card">
                    <span class="drift-summary-label">Worst window severity</span>
                    <strong class="drift-summary-value drift-${globalSummary.worstSeverity}">${globalSummary.worstSeverity.toUpperCase()}</strong>
                </div>
            `;
        }

        if (columnSummaryEl) {
            columnSummaryEl.innerHTML = Array.from(getResponsesByColumn().values()).map((response) => {
                const summary = buildColumnSummary(response);
                return `
                    <article class="drift-column-card">
                        <div class="drift-column-card__header">
                            <strong>${summary.column}</strong>
                            <span class="drift-column-card__level drift-${summary.currentLevel}">${summary.currentLevel.toUpperCase()}</span>
                        </div>
                        <div class="drift-column-card__body">
                            <div>Window: ${summary.latestLabel}</div>
                            <div>Strongest reasons: ${summary.strongestReasons.join(', ') || 'none'}</div>
                            <div>Latest PSI/Wass: ${summary.latestMetrics.psi.toFixed(3)} / ${formatValue(summary.latestMetrics.wasserstein)}</div>
                            <div>Latest KS p / E-S p: ${summary.latestMetrics.ksPvalue.toFixed(3)} / ${summary.latestMetrics.esPvalue.toFixed(3)}</div>
                            <div>Flagged windows: ${summary.flaggedWindows}/${summary.totalWindows}</div>
                        </div>
                    </article>
                `;
            }).join('');
        }
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
        renderSummaryPanels();
        renderTimelineLocal();
        renderDetailLocal();
        renderWindowListLocal();
        updateDetailStatsLocal();
    }

    // detailOption and timelineOption live in timelineView.ts / detailView.ts / viewModels.ts

    function statusSummary(failedColumns: string[] = []): void {
        const cols = Array.from(getResponsesByColumn().values());
        if (cols.length === 0) {
            toast('No drift response returned.', 'warning', {});
            return;
        }
        let windowsTotal = 0;
        let flaggedTotal = 0;
        let refSamples = 0;
        let computeMs = 0;
        let psiWarning = false;
        let binWarning = false;

        cols.forEach((resp) => {
            windowsTotal += resp.windows.length;
            flaggedTotal += resp.windows.filter((w) => w.drift_level !== 'green').length;
            refSamples += resp.reference.count;
            computeMs += resp.metadata?.computation_time_ms ?? 0;
            if (resp.metadata?.psi_sample_ratio_warning) psiWarning = true;
            if (resp.metadata?.bin_count_warning) binWarning = true;
        });

        const avgWindows = windowsTotal / cols.length;
        const avgRef = refSamples / cols.length;
        const failedInfo = failedColumns.length > 0 ? ` | failed: ${failedColumns.join(', ')}` : '';
        const warnings: string[] = [];
        if (psiWarning) warnings.push('PSI may be inflated (reference \u226710\u00d7 window size)');
        if (binWarning) warnings.push('histogram bins fell back to equal-width');
        const warnInfo = warnings.length > 0 ? ` \u26a0 ${warnings.join('; ')}` : '';
        const legacyInfo = usingLegacyFallback ? ' | legacy fallback' : '';
        toast(
            `Drift: ${cols.length} column(s) | ~${avgWindows.toFixed(0)} windows/column | ${flaggedTotal} flagged | ref avg ${avgRef.toFixed(0)} samples | ${computeMs.toFixed(0)}ms${legacyInfo}${failedInfo}${warnInfo}`,
            'info',
            {},
        );
    }

    function isLegacyCompatibleError(error: unknown): boolean {
        const status = (error as Error & { status?: number })?.status;
        return status === 404 || status === 405;
    }

    function toLegacyInvestigation(results: Map<string, DriftResponse>): DriftInvestigationResponse {
        const summaries = Array.from(results.values()).map((response) => {
            const summary = buildColumnSummary(response);
            const firstFlaggedWindow = response.windows.find((window) => window.drift_level !== 'green') ?? null;
            return { response, summary, firstFlaggedWindow };
        });
        const globalSummary = buildGlobalSummary(results);
        const firstChangePoint = summaries
            .filter((entry) => entry.firstFlaggedWindow)
            .sort((left, right) => (left.firstFlaggedWindow?.start_ms ?? Number.MAX_SAFE_INTEGER) - (right.firstFlaggedWindow?.start_ms ?? Number.MAX_SAFE_INTEGER))[0]
            ?.firstFlaggedWindow ?? null;
        const driftScore = Math.max(...summaries.map((entry) => entry.summary.flaggedWindows * 10), 0);

        return {
            overview: {
                driftScore,
                worstLevel: globalSummary.worstSeverity,
                columnsFlagged: globalSummary.columnsFlagged,
                totalColumns: globalSummary.totalColumns,
                windowsFlagged: summaries.reduce((sum, entry) => sum + entry.summary.flaggedWindows, 0),
                firstChangePoint: firstChangePoint ? new Date(firstChangePoint.start_ms).toISOString() : null,
            },
            columns: Object.fromEntries(results.entries()),
            rankings: {
                features: summaries
                    .map(({ summary, firstFlaggedWindow }) => ({
                        column: summary.column,
                        driftScore: summary.flaggedWindows * 10,
                        latestLevel: summary.currentLevel,
                        flaggedWindows: summary.flaggedWindows,
                        firstChangePoint: firstFlaggedWindow ? new Date(firstFlaggedWindow.start_ms).toISOString() : null,
                    }))
                    .sort((left, right) => right.driftScore - left.driftScore),
                segments: [],
                changePoints: summaries
                    .flatMap(({ response }) => response.windows
                        .filter((window) => window.drift_level !== 'green')
                        .map((window) => ({
                            column: response.column,
                            label: window.label,
                            isoTime: new Date(window.start_ms).toISOString(),
                            driftScore: window.drift_level === 'red' ? 100 : 50,
                            triggerReasons: window.trigger_reasons ?? [],
                        })))
                    .sort((left, right) => left.isoTime.localeCompare(right.isoTime)),
                qualityIssues: [],
                relationships: [],
            },
            quality: { byColumn: {} },
            relationships: { mode: 'legacy', pairs: [] },
        };
    }

    async function fetchLegacyInvestigation(
        basePayload: Record<string, unknown>,
        columns: string[],
        signal: AbortSignal,
    ): Promise<DriftInvestigationResponse> {
        const window = String(basePayload.window || 'daily');
        const referenceStart = String(basePayload.referenceStart || '');
        const referenceEnd = String(basePayload.referenceEnd || '');
        const sharedPayload = {
            window,
            referenceStart,
            referenceEnd,
            ksPvalueThreshold: basePayload.ksPvalueThreshold,
            esPvalueThreshold: basePayload.esPvalueThreshold,
            psiMinorThreshold: basePayload.psiMinorThreshold,
            psiMajorThreshold: basePayload.psiMajorThreshold,
            wassersteinStdMultiplier: basePayload.wassersteinStdMultiplier,
        };
        const responses = await Promise.all(columns.map(async (column) => {
            const response = await fetchDriftStats<DriftResponse>({ column, ...sharedPayload }, signal);
            return [column, response] as const;
        }));
        return toLegacyInvestigation(new Map<string, DriftResponse>(responses));
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
                const basePayload: Record<string, unknown> = {
                    columns,
                    window: getDropdownValue('drift-window-select') || 'daily',
                    referenceStart: new Date(refStart).toISOString(),
                    referenceEnd: new Date(refEnd).toISOString(),
                    comparisonStart: new Date(refEnd).toISOString(),
                    ksPvalueThreshold: readThresholdValue(ksThresholdInput, 0.05),
                    esPvalueThreshold: readThresholdValue(esThresholdInput, 0.05),
                    psiMinorThreshold: readThresholdValue(psiMinorThresholdInput, 0.1),
                    psiMajorThreshold: readThresholdValue(psiMajorThresholdInput, 0.2),
                    wassersteinStdMultiplier: readThresholdValue(wassersteinStdMultiplierInput, 0.1),
                    includeQuality: true,
                    includeChangePoints: true,
                    includeCorrelations: true,
                };
                const segmentBy = getDropdownValue('drift-segment-by');
                if (segmentBy) basePayload.segmentBy = segmentBy;

                let investigation: DriftInvestigationResponse;
                try {
                    investigation = await fetchDriftInvestigation<DriftInvestigationResponse>(basePayload, signal);
                    usingLegacyFallback = false;
                } catch (error) {
                    if (!isLegacyCompatibleError(error)) throw error;
                    usingLegacyFallback = true;
                    investigation = await fetchLegacyInvestigation(basePayload, columns, signal);
                }
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
        const rows: string[] = [
            'column,window,start_ms,end_ms,count,mean,std,median,ks_stat,ks_pvalue,es_stat,es_pvalue,wasserstein,psi,jensen_shannon,completeness_delta,trigger_reasons,drift_level,current_level,worst_level,flagged_windows',
        ];
        getResponsesByColumn().forEach((resp, column) => {
            const summary = buildColumnSummary(resp);
            resp.windows.forEach((w) => {
                rows.push([
                    column,
                    w.label,
                    w.start_ms,
                    w.end_ms,
                    w.count,
                    isFinite(w.mean) ? w.mean.toFixed(6) : '',
                    isFinite(w.std) ? w.std.toFixed(6) : '',
                    isFinite(w.quantiles[2]) ? w.quantiles[2].toFixed(6) : '',
                    w.ks_stat.toFixed(6),
                    w.ks_pvalue.toFixed(6),
                    isFinite(w.es_stat) ? w.es_stat.toFixed(6) : '',
                    isFinite(w.es_pvalue) ? w.es_pvalue.toFixed(6) : '',
                    w.wasserstein.toFixed(6),
                    w.psi.toFixed(6),
                    isFinite(w.jensen_shannon) ? w.jensen_shannon.toFixed(6) : '',
                    isFinite(w.completeness_delta) ? w.completeness_delta.toFixed(6) : '',
                    `"${(w.trigger_reasons || []).join('|')}"`,
                    w.drift_level,
                    summary.currentLevel,
                    summary.worstLevel,
                    summary.flaggedWindows,
                ].join(','));
            });
        });
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drift_multi_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportDriftJson(): void {
        if (!currentInvestigation) return;
        const payload = {
            ...currentInvestigation,
            activeColumn: getActiveDetailColumn(),
            evaluationMode: getEvaluationMode(),
            latestWindowCount: getLatestWindowCount(),
            filteredColumns: Object.fromEntries(getResponsesByColumn().entries()),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
    bindDriftControls(
        {
            getSelectedColumns,
            runCompute,
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

    evaluationModeSelect?.addEventListener('change', reapplyEvaluationMode);
    latestNInput?.addEventListener('change', reapplyEvaluationMode);
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveTab(button.dataset.driftTab || 'overview'));
    });
    updateSegmentBySelect();
    setActiveTab(activeTab);

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
    driftPageCleanup = driftRuntime.mount();
}
