/**
 * driftPage.ts — Temporal Distribution & Drift Analysis page.
 *
 * ECharts-based drift visuals with timeline box summaries and
 * interactive detail views (box, violin-density proxy, ECDF, histogram).
 */

import { DEBUG } from '../debug.js';
import { fetchDriftStats } from '../services/api/index.js';
import { bindDriftControls, getSelectedColumns } from './controls.js';
import { createAnalysisPageRuntime } from '../pages/shared/analysisPageRuntime.js';
import { createRequestTask } from '../pages/shared/requestTask.js';
import type { EChartLike } from './types.js';
import {
    driftColor,
    formatValue,
} from './viewModels.js';
import type { DriftResponse, WindowDistributionStats, DriftWindowStats } from './viewModels.js';
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
    const refStartInput = document.getElementById('drift-ref-start') as HTMLInputElement | null;
    const refEndInput = document.getElementById('drift-ref-end') as HTMLInputElement | null;
    const computeBtn = document.getElementById('drift-compute-btn') as HTMLButtonElement | null;
    const zoomResetBtn = document.getElementById('drift-zoom-reset-btn') as HTMLButtonElement | null;
    const statusEl = document.getElementById('drift-status') as HTMLElement | null;
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

    // ── Chart and data state ────────────────────────────────────────────────────
    let resizeObserver: ResizeObserver | null = null;
    let _pendingFullReset = false;

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

    // detailOption and timelineOption live in timelineView.ts / detailView.ts / viewModels.ts

    function statusSummary(failedColumns: string[] = []): void {
        if (!statusEl) return;
        const cols = Array.from(getResponsesByColumn().values());
        if (cols.length === 0) {
            statusEl.textContent = 'No drift response returned.';
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
        statusEl.textContent = `${cols.length} column(s) | ~${avgWindows.toFixed(0)} windows/column | ${flaggedTotal} flagged | ref avg ${avgRef.toFixed(0)} samples | ${computeMs.toFixed(0)}ms${failedInfo}${warnInfo}`;
    }

    // Module-level request task for drift compute — cancel-before-new semantics
    const driftComputeTask = createRequestTask({
        setLoading: (loading: boolean) => {
            if (loadingOverlay) loadingOverlay.hidden = loading;
        },
        onError: (message: string) => {
            if (statusEl) statusEl.textContent = `Error: ${message}`;
            syncEmptyState(true, message || 'Computation failed. Check column and date ranges.');
        },
    });

    async function runCompute(): Promise<void> {
        const columns = getSelectedColumns();
        if (columns.length === 0) {
            if (statusEl) statusEl.textContent = 'Select at least one numeric column.';
            return;
        }

        const refStart = refStartInput?.value;
        const refEnd = refEndInput?.value;
        if (!refStart || !refEnd) {
            if (statusEl) statusEl.textContent = 'Set reference start and end dates.';
            return;
        }

        computeBtnEl.disabled = true;
        computeBtnEl.textContent = 'Computing...';
        syncEmptyState(false);

        // Ensure ECharts is loaded and charts are initialised before showing data.
        await ensureChartsAsync();

        await driftComputeTask.run(async (signal) => {
            const basePayload: Record<string, unknown> = {
                window: getDropdownValue('drift-window-select') || 'daily',
                referenceStart: new Date(refStart).toISOString(),
                referenceEnd: new Date(refEnd).toISOString(),
            };

            const settled = await Promise.allSettled(columns.map(async (column) => {
                const payload = await fetchDriftStats<DriftResponse>({ ...basePayload, column }, signal);
                return { column, payload };
            }));

            const results = new Map<string, DriftResponse>();
            const failures: string[] = [];

            settled.forEach((result) => {
                if (result.status === 'fulfilled') {
                    results.set(result.value.column, result.value.payload);
                    if (DEBUG && result.value.payload?.metadata) {
                        console.debug('drift metadata', result.value.column, result.value.payload.metadata);
                    }
                } else {
                    failures.push(String(result.reason?.message || result.reason || 'unknown error'));
                }
            });

            if (results.size === 0) {
                throw new Error(failures.join(' | ') || 'No drift responses received.');
            }

            setResponses(results);
            updateDetailColumnSelect();

            // Signal that the next render should do a full ECharts option reset
            // (new series data) rather than an incremental merge (issue #8).
            _pendingFullReset = true;

            statusSummary(failures);
            renderTimelineLocal();
            renderDetailLocal();
            renderWindowListLocal();
            updateDetailStatsLocal();

            const hasWindows = Array.from(getResponsesByColumn().values()).some((resp) => resp.windows.length > 0);
            syncEmptyState(!hasWindows, hasWindows ? undefined : 'No data found in the monitoring range after the reference window.');

            (['drift-export-png', 'drift-export-detail-png', 'drift-export-csv', 'drift-export-json'] as const)
                .forEach((id) => {
                    const btn = document.getElementById(id) as HTMLButtonElement | null;
                    if (btn) btn.disabled = false;
                });
        });

        // requestTask.run() handles setLoading(false) in its finally block.
        // Only reset the button state here since requestTask doesn't manage it.
        computeBtnEl.disabled = false;
        computeBtnEl.textContent = 'Compute';
    }

    function exportDriftCsv(): void {
        if (getResponsesByColumn().size === 0) return;
        const rows: string[] = [
            'column,window,start_ms,end_ms,count,mean,std,median,ks_stat,ks_pvalue,es_stat,es_pvalue,wasserstein,psi,drift_level',
        ];
        getResponsesByColumn().forEach((resp, column) => {
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
                    w.drift_level,
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
        if (getResponsesByColumn().size === 0) return;
        const payload = {
            active_column: getActiveDetailColumn(),
            columns: Object.fromEntries(getResponsesByColumn().entries()),
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
            refStartInput,
            refEndInput,
            computeBtn,
            zoomResetBtn,
            statusEl,
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

    scheduleDriftChartRefresh();

    // ── Shared analysis page runtime ───────────────────────────────────────────
    // Register the inner syncEmptyState with the runtime's module-level wrapper.
    setSyncDriftEmptyState(syncEmptyState);

    driftRuntime = createAnalysisPageRuntime({
        page: 'drift',
        emptyStateRootId: 'drift-empty',
        statusElId: 'drift-status',
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
