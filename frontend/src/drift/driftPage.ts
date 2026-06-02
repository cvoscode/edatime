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
    hashColor,
    timelineTooltipFormatter,
    normalizeDensity,
    COLOR_GREEN,
    COLOR_YELLOW,
    COLOR_RED,
    COLOR_DIM,
    COLOR_REF,
    COLOR_TEXT,
    COLOR_TEXT_DIM,
    COLUMN_PALETTE,
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

    const windowSelect = document.getElementById('drift-window-select') as HTMLSelectElement | null;
    const plotTypeSelect = document.getElementById('drift-plot-type') as HTMLSelectElement | null;
    const refPresetSelect = document.getElementById('drift-ref-preset') as HTMLSelectElement | null;
    const refStartInput = document.getElementById('drift-ref-start') as HTMLInputElement | null;
    const refEndInput = document.getElementById('drift-ref-end') as HTMLInputElement | null;
    const computeBtn = document.getElementById('drift-compute-btn') as HTMLButtonElement | null;
    const zoomResetBtn = document.getElementById('drift-zoom-reset-btn') as HTMLButtonElement | null;
    const statusEl = document.getElementById('drift-status') as HTMLElement | null;
    const timelineEl = document.getElementById('drift-timeline-chart') as HTMLDivElement | null;
    const detailEl = document.getElementById('drift-detail-chart') as HTMLDivElement | null;
    const detailColumnSelect = document.getElementById('drift-detail-col-select') as HTMLSelectElement | null;
    const loadingOverlay = document.getElementById('drift-loading') as HTMLElement | null;
    const emptyState = document.getElementById('drift-empty') as HTMLElement | null;
    const detailHeader = document.getElementById('drift-detail-header') as HTMLElement | null;
    const detailStatsEl = document.getElementById('drift-detail-stats') as HTMLElement | null;
    const windowListEl = document.getElementById('drift-window-list') as HTMLElement | null;
    const driftLayoutEl = document.querySelector('#page-drift .drift-layout') as HTMLElement | null;
    const sortSelect = document.getElementById('drift-sort-select') as HTMLSelectElement | null;

    // ── Chart and data state (stays in driftPage — shared by render/export callbacks) ──
    let timelineChart: EChartLike | null = null;
    let detailChart: EChartLike | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const responsesByColumn = new Map<string, DriftResponse>();
    let activeDetailColumn: string | null = null;
    let selectedWindowIdx: number | null = null;
    let windowSort = sortSelect?.value || 'time-asc';
    let _pendingFullReset = false;

    const isRenderable = (element: HTMLElement | null): boolean => (
        !!element && element.clientWidth > 0 && element.clientHeight > 0
    );

    function isDriftChartReadyForInit(): boolean {
        const page = document.getElementById('page-drift') as HTMLElement | null;
        return !!(page && !page.hidden && isRenderable(timelineElNN) && isRenderable(detailElNN));
    }

    getECharts().catch(() => { /* non-critical; will retry on first ensureCharts() call */ });

    function ensureCharts(): void {
        if (!isDriftChartReadyForInit()) return;
        if (!timelineChart) {
            const _echarts = getEChartsModule();
            if (_echarts && timelineElNN) {
                (_echarts as any).getInstanceByDom?.(timelineElNN)?.dispose?.();
            }
            if (!_echarts) return;
            timelineChart = _echarts.init(timelineElNN, undefined, { renderer: 'canvas' }) as unknown as EChartLike;
            timelineChart.on('click', (params: any) => {
                if (params?.seriesType !== 'boxplot') return;
                const clickedCol = String(params?.seriesName || '');
                const clickedIndex = Number(params?.dataIndex);
                if (!clickedCol || !Number.isFinite(clickedIndex)) return;
                if (clickedIndex <= 0) return;
                activeDetailColumn = clickedCol;
                if (detailColumnSelectEl.value !== clickedCol) detailColumnSelectEl.value = clickedCol;
                selectedWindowIdx = clickedIndex - 1;
                renderTimeline();
                renderDetail();
                renderWindowList();
                updateDetailStats();
            });
        }

        const _echarts2 = getEChartsModule();
        if (!detailChart) {
            if (_echarts2 && detailElNN) {
                (_echarts2 as any).getInstanceByDom?.(detailElNN)?.dispose?.();
            }
            if (!_echarts2) return;
            detailChart = _echarts2.init(detailElNN, undefined, { renderer: 'canvas' }) as unknown as EChartLike;
        }

        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(() => {
                timelineChart?.resize();
                detailChart?.resize();
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
            if (responsesByColumn.size > 0) {
                renderTimeline();
                renderDetail();
            }
        });
    }

    function getActiveResponse(): DriftResponse | null {
        if (!activeDetailColumn) return null;
        return responsesByColumn.get(activeDetailColumn) ?? null;
    }

    function severityScore(level: DriftWindowStats['drift_level']): number {
        if (level === 'red') return 3;
        if (level === 'yellow') return 2;
        return 1;
    }

    function sortedWindowIndices(response: DriftResponse): number[] {
        const idxs = response.windows.map((_, i) => i);
        idxs.sort((a, b) => {
            const wa = response.windows[a];
            const wb = response.windows[b];
            switch (windowSort) {
                case 'time-desc': return wb.start_ms - wa.start_ms;
                case 'psi-desc': return (wb.psi - wa.psi) || (wb.start_ms - wa.start_ms);
                case 'wasserstein-desc': return (wb.wasserstein - wa.wasserstein) || (wb.start_ms - wa.start_ms);
                case 'severity-desc': return (severityScore(wb.drift_level) - severityScore(wa.drift_level)) || ((wb.psi - wa.psi) || (wb.start_ms - wa.start_ms));
                case 'time-asc':
                default: return wa.start_ms - wb.start_ms;
            }
        });
        return idxs;
    }

    function syncEmptyState(show: boolean, message?: string): void {
        if (!emptyState) return;
        if (message) emptyState.innerHTML = `<strong>No drift data</strong><span>${message}</span>`;
        emptyState.hidden = !show;
        driftLayoutEl?.classList.toggle('drift-empty-active', show);
    }

    function updateDetailColumnSelect(): void {
        const cols = Array.from(responsesByColumn.keys());
        const current = activeDetailColumn;
        detailColumnSelectEl.innerHTML = '';
        cols.forEach((col) => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            detailColumnSelectEl.appendChild(opt);
        });
        if (cols.length === 0) {
            detailColumnSelectEl.disabled = true;
            activeDetailColumn = null;
            return;
        }
        detailColumnSelectEl.disabled = false;
        if (current && responsesByColumn.has(current)) {
            detailColumnSelectEl.value = current;
            activeDetailColumn = current;
        } else {
            activeDetailColumn = cols[0]!;
            detailColumnSelectEl.value = cols[0]!;
        }
    }

    function timelineOption(): Record<string, unknown> {
        const columns = Array.from(responsesByColumn.keys());
        const first = columns.length > 0 ? responsesByColumn.get(columns[0]) ?? null : null;
        if (!first) {
            return { backgroundColor: 'transparent', title: { text: 'No drift data', left: 'center', top: 'center', textStyle: { color: COLOR_TEXT_DIM, fontSize: 12 } } };
        }

        const categories = ['Reference', ...first.windows.map((w) => w.label)];

        const series = columns.map((col, colIdx) => {
            const response = responsesByColumn.get(col)!;
            const ref = response.reference;
            const refQuant = ref.quantiles;
            const refSelected = activeDetailColumn === col && selectedWindowIdx === null;

            const data: any[] = [
                {
                    value: [refQuant[0], refQuant[1], refQuant[2], refQuant[3], refQuant[4]],
                    itemStyle: {
                        color: 'rgba(0,168,255,0.18)',
                        borderColor: COLOR_REF,
                        borderWidth: refSelected ? 2.5 : 1.3,
                    },
                    meta: { column: col, ref: true, count: ref.count },
                },
            ];

            response.windows.forEach((w, wIdx) => {
                const colr = w.count < 5 ? COLOR_DIM : driftColor(w.drift_level);
                const isSelected = activeDetailColumn === col && selectedWindowIdx === wIdx;
                data.push({
                    value: [w.quantiles[0], w.quantiles[1], w.quantiles[2], w.quantiles[3], w.quantiles[4]],
                    itemStyle: {
                        color: `${colr}33`,
                        borderColor: colr,
                        borderWidth: isSelected ? 2.4 : 1.2,
                    },
                    meta: {
                        column: col,
                        window_index: wIdx,
                        label: w.label,
                        count: w.count,
                        psi: w.psi,
                        ks_stat: w.ks_stat,
                        wasserstein: w.wasserstein,
                        drift_level: w.drift_level,
                    },
                });
            });

            return {
                name: col,
                type: 'boxplot',
                itemStyle: {
                    borderColor: hashColor(col, colIdx),
                },
                emphasis: {
                    focus: 'series',
                },
                data,
            };
        });

        return {
            backgroundColor: 'transparent',
            animationDuration: 200,
            legend: {
                top: 2,
                right: 6,
                textStyle: { color: COLOR_TEXT_DIM, fontSize: 11 },
                type: 'scroll',
            },
            tooltip: {
                trigger: 'item',
                confine: true,
                borderColor: 'rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(9,14,24,0.95)',
                textStyle: { color: COLOR_TEXT },
                // Pre-defined at module level to avoid recreating the closure on every render
                // (issue #10).
                formatter: timelineTooltipFormatter,
            },
            grid: {
                left: 52,
                right: 20,
                top: 34,
                bottom: 72,
            },
            toolbox: {
                right: 8,
                top: 2,
                itemSize: 12,
                iconStyle: { borderColor: COLOR_TEXT_DIM },
                feature: {
                    dataZoom: { yAxisIndex: 'none', title: { zoom: 'Box zoom', back: 'Undo zoom' } },
                    restore: { title: 'Reset zoom' },
                },
            },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, height: 16, bottom: 32, borderColor: 'rgba(255,255,255,0.08)' },
            ],
            xAxis: {
                type: 'category',
                data: categories,
                axisLabel: { color: COLOR_TEXT_DIM, rotate: 32, fontSize: 10 },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: COLOR_TEXT_DIM },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
            },
            series,
        };
    }

    function detailOption(plotType: string): Record<string, unknown> {
        const response = getActiveResponse();
        if (!response) {
            return { backgroundColor: 'transparent', title: { text: 'No detail data', left: 'center', top: 'center', textStyle: { color: COLOR_TEXT_DIM, fontSize: 12 } } };
        }
        const win = selectedWindowIdx !== null ? response.windows[selectedWindowIdx] : null;
        const ref = response.reference;

        const common = {
            backgroundColor: 'transparent',
            animationDuration: 160,
            tooltip: {
                trigger: 'axis',
                confine: true,
                borderColor: 'rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(9,14,24,0.95)',
                textStyle: { color: COLOR_TEXT },
            },
            toolbox: {
                right: 8,
                top: 2,
                itemSize: 12,
                iconStyle: { borderColor: COLOR_TEXT_DIM },
                feature: {
                    dataZoom: { yAxisIndex: 'none', title: { zoom: 'Box zoom', back: 'Undo zoom' } },
                    restore: { title: 'Reset zoom' },
                },
            },
            legend: {
                top: 2,
                right: 70,
                textStyle: { color: COLOR_TEXT_DIM, fontSize: 10 },
            },
            grid: {
                left: 46,
                right: 14,
                top: 30,
                bottom: 38,
            },
        };

        if (plotType === 'histogram') {
            const bins = ref.hist_bins;
            const mids = bins.length > 1
                ? bins.slice(0, -1).map((v, i) => formatValue((v + bins[i + 1]) / 2))
                : [];
            const windowColor = win && win.count >= 5 ? driftColor(win.drift_level) : COLOR_DIM;
            return {
                ...common,
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                    { type: 'slider', xAxisIndex: 0, height: 14, bottom: 18, borderColor: 'rgba(255,255,255,0.08)' },
                ],
                xAxis: {
                    type: 'category',
                    data: mids,
                    axisLabel: { color: COLOR_TEXT_DIM, fontSize: 10 },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
                },
                yAxis: {
                    type: 'value',
                    axisLabel: { color: COLOR_TEXT_DIM },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
                },
                series: [
                    {
                        name: 'Reference',
                        type: 'bar',
                        barGap: '-35%',
                        data: ref.hist_counts,
                        itemStyle: { color: 'rgba(0,168,255,0.38)', borderColor: COLOR_REF, borderWidth: 1 },
                    },
                    {
                        name: win ? win.label : 'Selected',
                        type: 'bar',
                        data: win?.hist_counts ?? [],
                        itemStyle: { color: `${windowColor}44`, borderColor: windowColor, borderWidth: 1 },
                    },
                ],
            };
        }

        if (plotType === 'ecdf') {
            const windowColor = win && win.count >= 5 ? driftColor(win.drift_level) : COLOR_DIM;
            return {
                ...common,
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0, yAxisIndex: 0, filterMode: 'none' },
                    { type: 'slider', xAxisIndex: 0, height: 14, bottom: 18, borderColor: 'rgba(255,255,255,0.08)' },
                ],
                xAxis: {
                    type: 'value',
                    scale: true,
                    axisLabel: { color: COLOR_TEXT_DIM, formatter: (v: number) => formatValue(v) },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    max: 1,
                    axisLabel: { color: COLOR_TEXT_DIM },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
                },
                series: [
                    {
                        name: 'Reference',
                        type: 'line',
                        step: 'end',
                        symbol: 'none',
                        lineStyle: { color: COLOR_REF, width: 2 },
                        data: ref.ecdf_x.map((x, i) => [x, ref.ecdf_y[i] ?? 0]),
                    },
                    {
                        name: win ? win.label : 'Selected',
                        type: 'line',
                        step: 'end',
                        symbol: 'none',
                        lineStyle: { color: windowColor, width: 2 },
                        data: win ? win.ecdf_x.map((x, i) => [x, win.ecdf_y[i] ?? 0]) : [],
                    },
                ],
            };
        }

        if (plotType === 'violin') {
            const densityRef = normalizeDensity(ref);
            const densityWin = win ? normalizeDensity(win) : [];
            const windowColor = win && win.count >= 5 ? driftColor(win.drift_level) : COLOR_DIM;
            return {
                ...common,
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0, yAxisIndex: 0, filterMode: 'none' },
                    { type: 'slider', xAxisIndex: 0, height: 14, bottom: 18, borderColor: 'rgba(255,255,255,0.08)' },
                ],
                xAxis: {
                    type: 'value',
                    scale: true,
                    axisLabel: { color: COLOR_TEXT_DIM, formatter: (v: number) => formatValue(v) },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    max: 1,
                    axisLabel: { color: COLOR_TEXT_DIM },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
                },
                series: [
                    {
                        name: 'Reference density',
                        type: 'line',
                        smooth: true,
                        symbol: 'none',
                        lineStyle: { color: COLOR_REF, width: 2 },
                        areaStyle: { color: 'rgba(0,168,255,0.16)' },
                        data: densityRef,
                    },
                    {
                        name: win ? `${win.label} density` : 'Selected density',
                        type: 'line',
                        smooth: true,
                        symbol: 'none',
                        lineStyle: { color: windowColor, width: 2 },
                        areaStyle: { color: `${windowColor}30` },
                        data: densityWin,
                    },
                ],
            };
        }

        const winColor = win && win.count >= 5 ? driftColor(win.drift_level) : COLOR_DIM;
        const refQ = ref.quantiles;
        const winQ = win?.quantiles ?? [NaN, NaN, NaN, NaN, NaN];

        return {
            ...common,
            xAxis: {
                type: 'category',
                data: ['Reference', win?.label || 'Selected'],
                axisLabel: { color: COLOR_TEXT_DIM, fontSize: 10 },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: COLOR_TEXT_DIM },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
            },
            series: [
                {
                    name: 'Distribution',
                    type: 'boxplot',
                    data: [
                        {
                            value: [refQ[0], refQ[1], refQ[2], refQ[3], refQ[4]],
                            itemStyle: {
                                color: 'rgba(0,168,255,0.18)',
                                borderColor: COLOR_REF,
                                borderWidth: 1.5,
                            },
                        },
                        {
                            value: [winQ[0], winQ[1], winQ[2], winQ[3], winQ[4]],
                            itemStyle: {
                                color: `${winColor}30`,
                                borderColor: winColor,
                                borderWidth: 1.5,
                            },
                        },
                    ],
                },
            ],
        };
    }

    function renderTimeline(): void {
        if (!timelineChart) return;
        const doReset = _pendingFullReset;
        _pendingFullReset = false;
        timelineChart.setOption(timelineOption(), { notMerge: doReset, lazyUpdate: true });
    }

    function renderDetail(): void {
        if (!detailChart) return;
        const plotType = plotTypeSelect?.value || 'box';
        detailChart.setOption(detailOption(plotType), { notMerge: _pendingFullReset, lazyUpdate: true });
        _pendingFullReset = false;
    }

    function renderWindowList(): void {
        if (!windowListEl) return;
        const response = getActiveResponse();
        if (!response) {
            windowListEl.innerHTML = '';
            return;
        }

        const orderedIdxs = sortedWindowIndices(response);

        // DOM diffing: if the item count and order match, only update selected state
        // instead of rebuilding all DOM nodes (issue #6).
        const existingItems = windowListEl.querySelectorAll<HTMLElement>('.drift-window-item');
        const existingIdxs = Array.from(existingItems).map((el) => Number(el.dataset.windowIdx));
        const sameLayout =
            existingItems.length === orderedIdxs.length &&
            orderedIdxs.every((idx, i) => existingIdxs[i] === idx);

        if (sameLayout) {
            existingItems.forEach((el, i) => {
                const isSelected = orderedIdxs[i] === selectedWindowIdx;
                el.classList.toggle('selected', isSelected);
                el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
            return;
        }

        // Full rebuild (sort changed or list length changed).
        const scrollTop = windowListEl.scrollTop;
        windowListEl.innerHTML = '';
        orderedIdxs.forEach((idx) => {
            const w = response.windows[idx];
            const item = document.createElement('div');
            item.className = 'drift-window-item' + (idx === selectedWindowIdx ? ' selected' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-selected', idx === selectedWindowIdx ? 'true' : 'false');
            item.dataset.windowIdx = String(idx);
            const badgeClass = w.count < 5 ? 'empty' : w.drift_level;
            item.innerHTML = `
                <span class="drift-window-badge drift-window-badge--${badgeClass}"></span>
                <span class="drift-window-label">${w.label}</span>
                <span class="drift-window-psi">PSI ${isFinite(w.psi) ? w.psi.toFixed(3) : '-'}</span>
            `;
            const selectWindow = () => {
                selectedWindowIdx = idx;
                renderTimeline();
                renderDetail();
                updateDetailStats();
                renderWindowList();
            };
            item.addEventListener('click', selectWindow);
            item.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectWindow();
            });
            windowListEl.appendChild(item);
        });
        // Restore scroll position after rebuild to avoid jarring jumps.
        windowListEl.scrollTop = scrollTop;
    }

    function updateDetailStats(): void {
        if (!detailStatsEl) return;
        const response = getActiveResponse();
        const win = response && selectedWindowIdx !== null ? response.windows[selectedWindowIdx] : null;

        if (!response || !win) {
            detailStatsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">Select a window to see stats</span>';
            if (detailHeader) detailHeader.textContent = 'Window Detail';
            return;
        }

        if (detailHeader) {
            detailHeader.textContent = `${response.column} - ${win.label}${win.low_sample_warning ? ' (Low N)' : ''}`;
        }

        const levelClass = `drift-${win.drift_level}`;
        const rows: Array<[string, string, string?]> = [
            ['Count', String(win.count)],
            ['Completeness', `${(win.completeness * 100).toFixed(1)}%`],
            ['Mean', formatValue(win.mean)],
            ['Std', formatValue(win.std)],
            ['Median (Q50)', formatValue(win.quantiles[2])],
            ['KS stat / p', `${win.ks_stat.toFixed(3)} / ${win.ks_pvalue.toFixed(3)}`],
            ['E-S stat / p', `${isFinite(win.es_stat) ? win.es_stat.toFixed(3) : '-'} / ${isFinite(win.es_pvalue) ? win.es_pvalue.toFixed(3) : '-'}`],
            ['Wasserstein', formatValue(win.wasserstein)],
            ['PSI', win.psi.toFixed(4), levelClass],
            ['Drift level', win.drift_level.toUpperCase(), levelClass],
        ];
        if (win.low_sample_warning) {
            rows.unshift(['Low sample size', 'N < 5, stats are less reliable']);
        }

        detailStatsEl.innerHTML = rows.map(([label, value, cls]) => `
            <div class="drift-detail-stat-row">
                <span class="drift-detail-stat-label">${label}</span>
                <span class="drift-detail-stat-value${cls ? ' ' + cls : ''}">${value}</span>
            </div>
        `).join('');
    }

    function statusSummary(failedColumns: string[] = []): void {
        if (!statusEl) return;
        const cols = Array.from(responsesByColumn.values());
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
                window: windowSelect?.value || 'daily',
                reference_start: new Date(refStart).toISOString(),
                reference_end: new Date(refEnd).toISOString(),
            };

            const settled = await Promise.allSettled(columns.map(async (column) => {
                const payload = await fetchDriftStats<DriftResponse>({ ...basePayload, column }, signal);
                return { column, payload };
            }));

            responsesByColumn.clear();
            const failures: string[] = [];

            settled.forEach((result) => {
                if (result.status === 'fulfilled') {
                    responsesByColumn.set(result.value.column, result.value.payload);
                    if (DEBUG && result.value.payload?.metadata) {
                        console.debug('drift metadata', result.value.column, result.value.payload.metadata);
                    }
                } else {
                    failures.push(String(result.reason?.message || result.reason || 'unknown error'));
                }
            });

            if (responsesByColumn.size === 0) {
                throw new Error(failures.join(' | ') || 'No drift responses received.');
            }

            updateDetailColumnSelect();
            const response = getActiveResponse();
            selectedWindowIdx = response && response.windows.length > 0 ? 0 : null;

            // Signal that the next render should do a full ECharts option reset
            // (new series data) rather than an incremental merge (issue #8).
            _pendingFullReset = true;

            statusSummary(failures);
            renderTimeline();
            renderDetail();
            renderWindowList();
            updateDetailStats();

            const hasWindows = Array.from(responsesByColumn.values()).some((resp) => resp.windows.length > 0);
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
        if (responsesByColumn.size === 0) return;
        const rows: string[] = [
            'column,window,start_ms,end_ms,count,mean,std,median,ks_stat,ks_pvalue,es_stat,es_pvalue,wasserstein,psi,drift_level',
        ];
        responsesByColumn.forEach((resp, column) => {
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
        if (responsesByColumn.size === 0) return;
        const payload = {
            active_column: activeDetailColumn,
            columns: Object.fromEntries(responsesByColumn.entries()),
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
    const detailColumnSelectEl = detailColumnSelect as HTMLSelectElement;
    const computeBtnEl = computeBtn as HTMLButtonElement;
    const timelineElNN = timelineEl;
    const detailElNN = detailEl;

    // ── Wire controls ────────────────────────────────────────────────────────
    bindDriftControls(
        {
            getSelectedColumns,
            runCompute,
            exportDriftCsv,
            exportDriftJson,
            renderTimeline,
            renderDetail,
            renderWindowList,
            updateDetailStats,
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
                activeDetailColumn = column;
                selectedWindowIdx = windowIdx;
            },
            timelineChartDispatch: (action) => timelineChart?.dispatchAction?.(action),
            detailChartDispatch: (action) => detailChart?.dispatchAction?.(action),
            exportTimelinePNG: () => {
                if (timelineChart) exportEChartsPNG(timelineChart, `drift_timeline_${activeDetailColumn || 'chart'}.png`);
            },
            exportDetailPNG: () => {
                if (detailChart) exportEChartsPNG(detailChart, `drift_detail_${activeDetailColumn || 'chart'}.png`);
            },
        },
    );

    // ── Chart click handler ──────────────────────────────────────────────────
    // (needs access to chart state — lives here, not in controls.ts)
    const timelineChartInstance = timelineChart as EChartLike | null;
    if (timelineChartInstance) {
        timelineChartInstance.on('click', (params: any) => {
            if (params?.seriesType !== 'boxplot') return;
            const clickedCol = String(params?.seriesName || '');
            const clickedIndex = Number(params?.dataIndex);
            if (!clickedCol || !Number.isFinite(clickedIndex)) return;
            if (clickedIndex <= 0) return;
            activeDetailColumn = clickedCol;
            if (detailColumnSelectEl.value !== clickedCol) detailColumnSelectEl.value = clickedCol;
            selectedWindowIdx = clickedIndex - 1;
            renderTimeline();
            renderDetail();
            renderWindowList();
            updateDetailStats();
        });
    }

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
            csv: { fn: exportDriftCsv, filename: 'edatime_drift.csv', dataCheck: () => responsesByColumn.size > 0 },
            // @ts-expect-error json export is supported by drift but not in the base ExportConfig type
            json: { fn: exportDriftJson, filename: 'edatime_drift.json', dataCheck: () => responsesByColumn.size > 0 },
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
