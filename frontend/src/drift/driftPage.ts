/**
 * driftPage.ts — Temporal Distribution & Drift Analysis page.
 *
 * ECharts-based drift visuals with timeline box summaries and
 * interactive detail views (box, violin-density proxy, ECDF, histogram).
 */

import { DEBUG } from '../debug.js';
import { exportEChartsPNG } from '../utils/chartExport.js';

// ── Module-level ECharts cache (issue #3: avoid re-importing on every page visit) ──
let _echartsModule: typeof import('echarts') | null = null;
async function getECharts(): Promise<typeof import('echarts')> {
    if (!_echartsModule) {
        _echartsModule = await import('echarts');
    }
    return _echartsModule;
}

// ── Module-level tooltip formatter (issue #10: avoid closure creation per render) ──
const timelineTooltipFormatter = (params: any): string => {
    const v = params?.value || [];
    const meta = params?.data?.meta || {};
    const lines = [
        `<strong>${meta.column || params.seriesName}</strong>`,
        `${params.name || ''}`,
        `Q05: ${formatValue(v[0])}`,
        `Q25: ${formatValue(v[1])}`,
        `Q50: ${formatValue(v[2])}`,
        `Q75: ${formatValue(v[3])}`,
        `Q95: ${formatValue(v[4])}`,
    ];
    if (meta.ref) {
        lines.push(`Reference samples: ${meta.count ?? '-'}`);
    } else {
        lines.push(`Count: ${meta.count ?? '-'}`);
        lines.push(`PSI: ${isFinite(meta.psi) ? Number(meta.psi).toFixed(4) : '-'}`);
        lines.push(`KS: ${isFinite(meta.ks_stat) ? Number(meta.ks_stat).toFixed(3) : '-'}`);
        lines.push(`Wasserstein: ${isFinite(meta.wasserstein) ? formatValue(Number(meta.wasserstein)) : '-'}`);
        lines.push(`Drift: ${(meta.drift_level || '-').toUpperCase()}`);
    }
    return lines.join('<br/>');
};

interface WindowDistributionStats {
    start_ms: number;
    end_ms: number;
    label: string;
    count: number;
    null_count: number;
    completeness: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    /** [q5, q25, q50, q75, q95] */
    quantiles: number[];
    hist_bins: number[];
    hist_counts: number[];
    ecdf_x: number[];
    ecdf_y: number[];
}

interface DriftWindowStats extends WindowDistributionStats {
    ks_stat: number;
    ks_pvalue: number;
    es_stat: number;
    es_pvalue: number;
    wasserstein: number;
    psi: number;
    drift_level: 'green' | 'yellow' | 'red';
    low_sample_warning: boolean;
}

interface DriftResponse {
    column: string;
    reference: WindowDistributionStats;
    windows: DriftWindowStats[];
    thresholds: {
        ks_threshold: number;
        wasserstein_threshold: number;
        psi_minor_threshold: number;
        psi_major_threshold: number;
    };
    metadata?: {
        computation_time_ms: number;
        num_windows: number;
        reference_samples: number;
        /** True when quantile-based histogram edges collapsed to fewer bins than requested. */
        bin_count_warning?: boolean;
        effective_bins?: number;
        /** True when reference samples / avg monitoring window samples > 10×. */
        psi_sample_ratio_warning?: boolean;
        avg_window_samples?: number;
    };
}

interface EChartLike {
    setOption: (option: Record<string, unknown>, opts?: Record<string, unknown>) => void;
    clear: () => void;
    resize: () => void;
    on: (event: string, handler: (params: any) => void) => void;
    showLoading?: (type?: string, opts?: Record<string, unknown>) => void;
    hideLoading?: () => void;
    dispatchAction?: (payload: { type: string } & Record<string, unknown>) => void;
    getDataURL?: (opts?: Record<string, unknown>) => string;
}

const COLOR_GREEN = '#00C896';
const COLOR_YELLOW = '#FFC041';
const COLOR_RED = '#FF6B6B';
const COLOR_DIM = 'rgba(120,139,174,0.35)';
const COLOR_REF = 'rgba(0,168,255,0.85)';
const COLOR_TEXT = '#D2DAF0';
const COLOR_TEXT_DIM = '#788BAE';

const COLUMN_PALETTE = ['#00D4FF', '#7CFFB2', '#FF9E7A', '#E190FF', '#FDD663', '#58D8FF', '#58C8A6'];

function driftColor(level: string): string {
    if (level === 'red') return COLOR_RED;
    if (level === 'yellow') return COLOR_YELLOW;
    return COLOR_GREEN;
}

function formatValue(v: number): string {
    if (!isFinite(v)) return '-';
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
    if (abs >= 10) return v.toFixed(1);
    if (abs >= 1) return v.toFixed(2);
    if (abs >= 0.01) return v.toFixed(4);
    if (abs === 0) return '0';
    return v.toExponential(2);
}

function toDatetimeLocal(ms: number): string {
    if (!isFinite(ms)) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hashColor(text: string, fallbackIndex: number): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % COLUMN_PALETTE.length;
    return COLUMN_PALETTE[idx] || COLUMN_PALETTE[fallbackIndex % COLUMN_PALETTE.length] || '#00D4FF';
}

function normalizeDensity(stats: WindowDistributionStats): Array<[number, number]> {
    if (stats.hist_counts.length === 0 || stats.hist_bins.length < 2) return [];
    const max = Math.max(...stats.hist_counts, 1);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < stats.hist_counts.length; i++) {
        const x = (stats.hist_bins[i] + stats.hist_bins[i + 1]) / 2;
        const y = stats.hist_counts[i] / max;
        pts.push([x, y]);
    }
    return pts;
}

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

    if (!timelineEl || !detailEl || !computeBtn || !detailColumnSelect) return;

    // Const aliases to preserve closure narrowing after the null guard.
    const detailColumnSelectEl = detailColumnSelect;
    const computeBtnEl = computeBtn;
    const timelineElNN = timelineEl;
    const detailElNN = detailEl;

    const numericCols: string[] = Array.isArray(metadata?.numeric_columns)
        ? metadata.numeric_columns.filter((c: string) => c && c.toLowerCase() !== 'ts')
        : [];

    // ── Picker state ─────────────────────────────────────────────────────────
    // selectedCols is the single source of truth for which columns are chosen.
    let selectedCols = new Set<string>(numericCols.length > 0 ? [numericCols[0]!] : []);

    function syncPickerLabel(): void {
        if (!colPickerLabel) return;
        const n = selectedCols.size;
        colPickerLabel.textContent = n === 0 ? 'none' : n === 1 ? `${[...selectedCols][0]}` : `${n} columns`;
    }

    function syncHiddenSelect(allCols: string[]): void {
        if (!colSelect) return;
        // Rebuild hidden <select> options to match current selectedCols.
        colSelect.innerHTML = '';
        allCols.forEach((col) => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            opt.selected = selectedCols.has(col);
            colSelect.appendChild(opt);
        });
    }

    function getCheckboxes(): NodeListOf<HTMLInputElement> {
        return (colPickerList ?? document).querySelectorAll<HTMLInputElement>('.drift-col-cb');
    }

    function syncCheckboxes(): void {
        getCheckboxes().forEach((cb) => {
            cb.checked = selectedCols.has(cb.value);
        });
        syncPickerLabel();
    }

    function repopulateColumnSelect(nextColumns: string[]): void {
        if (!colPickerList) return;
        // Preserve previously selected columns that still exist.
        selectedCols = new Set([...selectedCols].filter((c) => nextColumns.includes(c)));
        if (selectedCols.size === 0 && nextColumns.length > 0) selectedCols.add(nextColumns[0]!);

        colPickerList.innerHTML = '';
        nextColumns.forEach((col) => {
            const label = document.createElement('label');
            label.className = 'drift-col-picker-item';
            label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:0.75rem;color:var(--text-dim,#788bae);user-select:none;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'drift-col-cb';
            cb.value = col;
            cb.checked = selectedCols.has(col);
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedCols.add(col);
                } else {
                    selectedCols.delete(col);
                    // Always keep at least one selected.
                    if (selectedCols.size === 0 && nextColumns.length > 0) selectedCols.add(nextColumns[0]!);
                    syncCheckboxes();
                }
                syncPickerLabel();
                syncHiddenSelect(nextColumns);
            });
            const span = document.createElement('span');
            span.textContent = col;
            label.appendChild(cb);
            label.appendChild(span);
            colPickerList.appendChild(label);
        });
        syncPickerLabel();
        syncHiddenSelect(nextColumns);
    }

    function openPicker(): void {
        if (!colPickerPanel || !colPickerBtn) return;
        // Teleport panel to <body> to escape backdrop-filter containment on the toolbar.
        // backdrop-filter creates a new containing block for position:fixed children,
        // so we must place the panel directly on body to get true viewport positioning.
        if (colPickerPanel.parentElement !== document.body) {
            document.body.appendChild(colPickerPanel);
        }
        const rect = colPickerBtn.getBoundingClientRect();
        colPickerPanel.style.position = 'fixed';
        colPickerPanel.style.top = `${rect.bottom + 4}px`;
        colPickerPanel.style.left = `${rect.left}px`;
        colPickerPanel.style.bottom = 'auto';
        colPickerPanel.style.right = 'auto';
        colPickerPanel.hidden = false;
        colPickerBtn.setAttribute('aria-expanded', 'true');
    }

    function closePicker(): void {
        if (!colPickerPanel || !colPickerBtn) return;
        colPickerPanel.hidden = true;
        colPickerBtn.setAttribute('aria-expanded', 'false');
    }

    function getSelectedColumns(): string[] {
        return [...selectedCols];
    }

    // Picker open/close toggle.
    colPickerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (colPickerPanel?.hidden === false) {
            closePicker();
        } else {
            openPicker();
        }
    });

    // Close picker when clicking outside.
    document.addEventListener('click', (e) => {
        if (!colPickerPanel || colPickerPanel.hidden) return;
        const wrap = document.getElementById('drift-col-picker-wrap');
        const target = e.target as Node;
        // Check both the picker wrapper and the panel itself (panel may have been teleported to body)
        if (wrap && !wrap.contains(target) && !colPickerPanel.contains(target)) closePicker();
    });

    // Close picker on Escape.
    colPickerPanel?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { closePicker(); colPickerBtn?.focus(); }
    });

    repopulateColumnSelect(numericCols);

    const timeRange = metadata?.time_range as { min: number; max: number } | undefined;
    function applyReferencePreset(preset: string): void {
        if (!timeRange || preset === 'custom') return;
        const pct = Number(preset);
        if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return;
        const end = timeRange.min + ((timeRange.max - timeRange.min) * pct) / 100;
        if (refStartInput) refStartInput.value = toDatetimeLocal(timeRange.min);
        if (refEndInput) refEndInput.value = toDatetimeLocal(end);
    }
    applyReferencePreset(refPresetSelect?.value || '50');

    let timelineChart: EChartLike | null = null;
    let detailChart: EChartLike | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const responsesByColumn = new Map<string, DriftResponse>();
    let activeDetailColumn: string | null = null;
    let selectedWindowIdx: number | null = null;
    let windowSort = sortSelect?.value || 'time-asc';
    /** When true, the next renderTimeline/renderDetail call uses notMerge:true (full reset). */
    let _pendingFullReset = false;

    const isRenderable = (element: HTMLElement | null): boolean => (
        !!element && element.clientWidth > 0 && element.clientHeight > 0
    );

    function isDriftChartReadyForInit(): boolean {
        const page = document.getElementById('page-drift') as HTMLElement | null;
        return !!(page && !page.hidden && isRenderable(timelineElNN) && isRenderable(detailElNN));
    }

    // Pre-load ECharts so it is available immediately on first compute (issue #3).
    getECharts().catch(() => { /* non-critical; will retry on first ensureCharts() call */ });

    function ensureCharts(): void {
        if (!isDriftChartReadyForInit()) return;
        if (!timelineChart) {
            // Dispose any lingering ECharts instance on the same DOM node before creating
            // a new one (issue #3: guard against double-instance on repeated page visits).
            if (_echartsModule && timelineElNN) {
                (_echartsModule as any).getInstanceByDom?.(timelineElNN)?.dispose?.();
            }
            if (!_echartsModule) return; // module not yet loaded; caller should retry
            timelineChart = _echartsModule.init(timelineElNN, undefined, { renderer: 'canvas' }) as unknown as EChartLike;
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

        if (!detailChart) {
            if (_echartsModule && detailElNN) {
                (_echartsModule as any).getInstanceByDom?.(detailElNN)?.dispose?.();
            }
            if (!_echartsModule) return;
            detailChart = _echartsModule.init(detailElNN, undefined, { renderer: 'canvas' }) as unknown as EChartLike;
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

    // Async variant — used when ECharts may not yet be loaded.
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
                case 'time-desc':
                    return wb.start_ms - wa.start_ms;
                case 'psi-desc':
                    return (wb.psi - wa.psi) || (wb.start_ms - wa.start_ms);
                case 'wasserstein-desc':
                    return (wb.wasserstein - wa.wasserstein) || (wb.start_ms - wa.start_ms);
                case 'severity-desc':
                    return (severityScore(wb.drift_level) - severityScore(wa.drift_level))
                        || ((wb.psi - wa.psi) || (wb.start_ms - wa.start_ms));
                case 'time-asc':
                default:
                    return wa.start_ms - wb.start_ms;
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
        // Show a single global overlay rather than per-chart loading spinners (issue #13).
        if (loadingOverlay) loadingOverlay.hidden = false;
        syncEmptyState(false);

        // Ensure ECharts is loaded and charts are initialised before showing data.
        await ensureChartsAsync();

        try {
            const basePayload: Record<string, unknown> = {
                window: windowSelect?.value || 'daily',
                reference_start: new Date(refStart).toISOString(),
                reference_end: new Date(refEnd).toISOString(),
            };

            const settled = await Promise.allSettled(columns.map(async (column) => {
                const res = await fetch('/api/drift/stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...basePayload, column }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(`${column}: ${res.status} ${text || res.statusText}`);
                }
                const payload = await res.json() as DriftResponse;
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
        } catch (err: any) {
            console.error('Drift compute failed:', err);
            if (statusEl) statusEl.textContent = `Error: ${err?.message || 'unknown'}`;
            syncEmptyState(true, err?.message || 'Computation failed. Check column and date ranges.');
        } finally {
            if (loadingOverlay) loadingOverlay.hidden = true;
            computeBtnEl.disabled = false;
            computeBtnEl.textContent = 'Compute';
        }
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

    computeBtn.addEventListener('click', () => {
        runCompute();
    });

    sortSelect?.addEventListener('change', () => {
        windowSort = sortSelect.value || 'time-asc';
        renderWindowList();
    });

    detailColumnSelect.addEventListener('change', () => {
        activeDetailColumn = detailColumnSelectEl.value || null;
        const response = getActiveResponse();
        if (!response || response.windows.length === 0) {
            selectedWindowIdx = null;
        } else if (selectedWindowIdx === null || selectedWindowIdx >= response.windows.length) {
            selectedWindowIdx = 0;
        }
        renderTimeline();
        renderDetail();
        renderWindowList();
        updateDetailStats();
    });

    // Debounce rapid plot-type changes to avoid rebuilding option objects on every keypress
    // when a user cycles through options quickly (issue #4).
    let _plotTypeDebounce: ReturnType<typeof setTimeout> | null = null;
    plotTypeSelect?.addEventListener('change', () => {
        if (_plotTypeDebounce !== null) clearTimeout(_plotTypeDebounce);
        _plotTypeDebounce = setTimeout(() => {
            _plotTypeDebounce = null;
            renderDetail();
        }, 80);
    });

    refPresetSelect?.addEventListener('change', () => {
        applyReferencePreset(refPresetSelect.value || 'custom');
    });

    colSelectAllBtn?.addEventListener('click', () => {
        numericCols.forEach((c) => selectedCols.add(c));
        syncCheckboxes();
        syncHiddenSelect(numericCols);
        closePicker();
    });

    colSelectSingleBtn?.addEventListener('click', () => {
        const keep = [...selectedCols][0] || numericCols[0];
        if (keep) {
            selectedCols = new Set([keep]);
            syncCheckboxes();
            syncHiddenSelect(numericCols);
        }
        closePicker();
    });

    colSelectNoneBtn?.addEventListener('click', () => {
        // Always keep at least one – fall back to first column.
        selectedCols = new Set(numericCols.length > 0 ? [numericCols[0]!] : []);
        syncCheckboxes();
        syncHiddenSelect(numericCols);
    });

    zoomResetBtn?.addEventListener('click', () => {
        timelineChart?.dispatchAction?.({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        timelineChart?.dispatchAction?.({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
        detailChart?.dispatchAction?.({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        detailChart?.dispatchAction?.({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    });

    document.getElementById('drift-export-png')?.addEventListener('click', () => {
        if (timelineChart) exportEChartsPNG(timelineChart, `drift_timeline_${activeDetailColumn || 'chart'}.png`);
    });

    document.getElementById('drift-export-detail-png')?.addEventListener('click', () => {
        if (detailChart) exportEChartsPNG(detailChart, `drift_detail_${activeDetailColumn || 'chart'}.png`);
    });

    document.getElementById('drift-export-csv')?.addEventListener('click', exportDriftCsv);
    document.getElementById('drift-export-json')?.addEventListener('click', exportDriftJson);

    const driftPage = document.getElementById('page-drift');
    driftPage?.addEventListener('keydown', (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        switch (e.key) {
            case 'Enter':
            case 'd':
            case 'D':
                e.preventDefault();
                runCompute();
                break;
            case 'e':
            case 'E':
                e.preventDefault();
                exportDriftCsv();
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                exportDriftJson();
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                if (timelineChart) exportEChartsPNG(timelineChart, `drift_timeline_${activeDetailColumn || 'chart'}.png`);
                break;
        }
    });

    window.addEventListener('edatime:page-change', (e: any) => {
        if (e?.detail?.page !== 'drift') return;
        const cols: string[] = Array.isArray(metadata?.numeric_columns)
            ? metadata.numeric_columns.filter((c: string) => c && c.toLowerCase() !== 'ts')
            : [];
        repopulateColumnSelect(cols);
        scheduleDriftChartRefresh();
    });

    scheduleDriftChartRefresh();
}
