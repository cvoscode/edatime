/**
 * drift/viewModels.ts — Derived response shaping and formatting helpers for drift charts.
 *
 * These functions take the current drift response state and produce ECharts options
 * or formatted display data. They are intentionally free of side effects.
 */

import type { EChartLike } from './types.js';
import { getChartPalette, getPaletteColor } from '../utils/theme.js';

// ── Color constants (mirrored from driftPage for co-location) ─────────────────────

export const COLOR_GREEN = '#00C896';
export const COLOR_YELLOW = '#FFC041';
export const COLOR_RED = '#FF6B6B';
export const COLUMN_PALETTE = ['#00D4FF', '#7CFFB2', '#FF9E7A', '#E190FF', '#FDD663', '#58D8FF', '#58C8A6'];

// Theme-resolved color helpers. These read the active palette so drift charts
// stay in sync with the current data-theme. Backwards-compatible fallbacks are
// kept for any consumer that imports the constants directly.
export const COLOR_REF_FALLBACK = 'rgba(0,168,255,0.85)';
export const COLOR_TEXT_FALLBACK = '#D2DAF0';
export const COLOR_TEXT_DIM_FALLBACK = '#788BAE';
export const COLOR_DIM_FALLBACK = 'rgba(120,139,174,0.35)';

export function COLOR_REF(): string {
    return getPaletteColor('referenceStroke') ?? COLOR_REF_FALLBACK;
}

export function TOOLTIP_BG(): string {
    return getPaletteColor('surfaceElevated') ?? 'rgba(9,14,24,0.95)';
}

export function DRIFT_TEXT(): string {
    return getPaletteColor('text') ?? COLOR_TEXT_FALLBACK;
}

export function DRIFT_TEXT_DIM(): string {
    return getPaletteColor('textDim') ?? COLOR_TEXT_DIM_FALLBACK;
}

export function DRIFT_DIM(): string {
    return getPaletteColor('borderHi') ?? COLOR_DIM_FALLBACK;
}

// ── Interfaces (duplicated from driftPage for module cohesion) ────────────────────

export interface WindowDistributionStats {
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
    quantiles: number[];
    hist_bins: number[];
    hist_counts: number[];
    ecdf_x: number[];
    ecdf_y: number[];
}

export interface DriftWindowStats extends WindowDistributionStats {
    ks_stat: number;
    ks_pvalue: number;
    es_stat: number;
    es_pvalue: number;
    wasserstein: number;
    psi: number;
    jensen_shannon: number;
    drift_level: 'green' | 'yellow' | 'red';
    trigger_reasons: string[];
    completeness_delta: number;
    low_sample_warning: boolean;
}

export interface DriftResponse {
    column: string;
    reference: WindowDistributionStats;
    windows: DriftWindowStats[];
    thresholds: {
        ks_pvalue_threshold: number;
        es_pvalue_threshold: number;
        wasserstein_threshold: number;
        psi_minor_threshold: number;
        psi_major_threshold: number;
    };
    metadata?: {
        computation_time_ms: number;
        num_windows: number;
        reference_samples: number;
        bin_count_warning?: boolean;
        effective_bins?: number;
        psi_sample_ratio_warning?: boolean;
        avg_window_samples?: number;
    };
}

export type DriftEvaluationMode = 'all' | 'latest' | 'latest-n';

export interface ColumnDriftSummary {
    column: string;
    currentLevel: DriftWindowStats['drift_level'];
    worstLevel: DriftWindowStats['drift_level'];
    flaggedWindows: number;
    totalWindows: number;
    strongestReasons: string[];
    latestLabel: string;
    latestMetrics: {
        psi: number;
        wasserstein: number;
        ksPvalue: number;
        esPvalue: number;
    };
}

export interface GlobalDriftSummary {
    anyDrift: boolean;
    columnsFlagged: number;
    totalColumns: number;
    latestSeverity: DriftWindowStats['drift_level'];
    worstSeverity: DriftWindowStats['drift_level'];
}

// ── Formatters ───────────────────────────────────────────────────────────────────

export function driftColor(level: string): string {
    if (level === 'red') return COLOR_RED;
    if (level === 'yellow') return COLOR_YELLOW;
    return COLOR_GREEN;
}

export function formatValue(v: number): string {
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

export function toDatetimeLocal(ms: number): string {
    if (!isFinite(ms)) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hashColor(text: string, fallbackIndex: number): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % COLUMN_PALETTE.length;
    return COLUMN_PALETTE[idx] || COLUMN_PALETTE[fallbackIndex % COLUMN_PALETTE.length] || '#00D4FF';
}

export function normalizeDensity(stats: WindowDistributionStats): Array<[number, number]> {
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

// ── Sorting ─────────────────────────────────────────────────────────────────────

export function severityScore(level: DriftWindowStats['drift_level']): number {
    if (level === 'red') return 3;
    if (level === 'yellow') return 2;
    return 1;
}

export function formatTriggerReason(reason: string): string {
    switch (reason) {
        case 'psi_major': return 'PSI major';
        case 'psi_minor': return 'PSI minor';
        case 'wasserstein': return 'Wasserstein';
        case 'ks': return 'KS';
        case 'es': return 'E-S';
        default: return reason.replace(/_/g, ' ');
    }
}

export function formatTriggerReasons(reasons: string[] | null | undefined): string {
    if (!Array.isArray(reasons) || reasons.length === 0) return 'None';
    return reasons.map((reason) => formatTriggerReason(reason)).join(', ');
}

export function filterResponseForEvaluation(
    response: DriftResponse,
    mode: DriftEvaluationMode,
    latestCount = 1,
): DriftResponse {
    if (mode === 'all') return response;
    if (mode === 'latest') {
        return { ...response, windows: response.windows.slice(-1) };
    }
    const count = Math.max(1, Math.floor(latestCount || 1));
    return { ...response, windows: response.windows.slice(-count) };
}

export function buildColumnSummary(response: DriftResponse): ColumnDriftSummary {
    const latest = response.windows[response.windows.length - 1] ?? null;
    const worst = [...response.windows].sort((a, b) => {
        const severityDelta = severityScore(b.drift_level) - severityScore(a.drift_level);
        if (severityDelta !== 0) return severityDelta;
        return (b.trigger_reasons?.length ?? 0) - (a.trigger_reasons?.length ?? 0);
    })[0] ?? null;
    const flaggedWindows = response.windows.filter((window) => window.drift_level !== 'green').length;

    return {
        column: response.column,
        currentLevel: latest?.drift_level ?? 'green',
        worstLevel: worst?.drift_level ?? 'green',
        flaggedWindows,
        totalWindows: response.windows.length,
        strongestReasons: worst?.trigger_reasons ?? [],
        latestLabel: latest?.label ?? 'No windows',
        latestMetrics: {
            psi: latest?.psi ?? 0,
            wasserstein: latest?.wasserstein ?? 0,
            ksPvalue: latest?.ks_pvalue ?? 1,
            esPvalue: latest?.es_pvalue ?? 1,
        },
    };
}

export function buildGlobalSummary(
    responsesByColumn: Map<string, DriftResponse>,
): GlobalDriftSummary {
    const summaries = Array.from(responsesByColumn.values()).map((response) => buildColumnSummary(response));
    const columnsFlagged = summaries.filter((summary) => summary.currentLevel !== 'green').length;
    const latestSeverity = summaries.reduce<DriftWindowStats['drift_level']>((worst, summary) => {
        return severityScore(summary.currentLevel) > severityScore(worst) ? summary.currentLevel : worst;
    }, 'green');
    const worstSeverity = summaries.reduce<DriftWindowStats['drift_level']>((worst, summary) => {
        return severityScore(summary.worstLevel) > severityScore(worst) ? summary.worstLevel : worst;
    }, 'green');
    return {
        anyDrift: columnsFlagged > 0,
        columnsFlagged,
        totalColumns: summaries.length,
        latestSeverity,
        worstSeverity,
    };
}

export function sortedWindowIndices(
    response: DriftResponse,
    windowSort: string,
): number[] {
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

// ── Status summary ───────────────────────────────────────────────────────────────

export function statusSummary(
    responsesByColumn: Map<string, DriftResponse>,
    failedColumns: string[] = [],
): { text: string; windowsTotal: number; flaggedTotal: number; refSamples: number; computeMs: number; psiWarning: boolean; binWarning: boolean } {
    const cols = Array.from(responsesByColumn.values());
    if (cols.length === 0) {
        return { text: 'No drift response returned.', windowsTotal: 0, flaggedTotal: 0, refSamples: 0, computeMs: 0, psiWarning: false, binWarning: false };
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
    if (psiWarning) warnings.push('PSI may be inflated (reference ≥10× window size)');
    if (binWarning) warnings.push('histogram bins fell back to equal-width');
    const warnInfo = warnings.length > 0 ? ` ⚠ ${warnings.join('; ')}` : '';
    const text = `${cols.length} column(s) | ~${avgWindows.toFixed(0)} windows/column | ${flaggedTotal} flagged | ref avg ${avgRef.toFixed(0)} samples | ${computeMs.toFixed(0)}ms${failedInfo}${warnInfo}`;
    return { text, windowsTotal, flaggedTotal, refSamples, computeMs, psiWarning, binWarning };
}

// ── Tooltip formatter (module-level to avoid per-render closure allocation) ─────

export const timelineTooltipFormatter = (params: any): string => {
    const v = params?.value || [];
    const meta = params?.data?.meta || {};
    const lines = [
        `<strong>${meta.column || params.seriesName}</strong>`,
        `${meta.range_label || params.name || ''}`,
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
        lines.push(`Triggered by: ${formatTriggerReasons(meta.trigger_reasons)}`);
        lines.push(`Drift: ${(meta.drift_level || '-').toUpperCase()}`);
    }
    return lines.join('<br/>');
};

// ── ECharts option builders ─────────────────────────────────────────────────────

export interface TimelineOptionContext {
    responsesByColumn: Map<string, DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
}

export function buildTimelineOption(ctx: TimelineOptionContext): Record<string, unknown> {
    const { responsesByColumn, activeDetailColumn, selectedWindowIdx } = ctx;
    const columns = Array.from(responsesByColumn.keys());
    const first = columns.length > 0 ? responsesByColumn.get(columns[0]) ?? null : null;
    if (!first) {
        return {
            backgroundColor: 'transparent',
            title: { text: 'No drift data', left: 'center', top: 'center', textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 12 } },
        };
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
                    borderColor: COLOR_REF(),
                    borderWidth: refSelected ? 2.5 : 1.3,
                },
                meta: { column: col, ref: true, count: ref.count },
            },
        ];

        response.windows.forEach((w, wIdx) => {
            const colr = w.count < 5 ? DRIFT_DIM() : driftColor(w.drift_level);
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
                    range_label: w.label,
                    count: w.count,
                    psi: w.psi,
                    ks_stat: w.ks_stat,
                    wasserstein: w.wasserstein,
                    drift_level: w.drift_level,
                    trigger_reasons: w.trigger_reasons,
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
            textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 11 },
            type: 'scroll',
        },
        tooltip: {
            trigger: 'item',
            confine: true,
            borderColor: 'rgba(255,255,255,0.08)',
            backgroundColor: TOOLTIP_BG(),
            textStyle: { color: DRIFT_TEXT() },
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
            iconStyle: { borderColor: DRIFT_TEXT_DIM() },
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
            axisLabel: { color: DRIFT_TEXT_DIM(), rotate: 32, fontSize: 10 },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLabel: { color: DRIFT_TEXT_DIM() },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
        },
        series,
    };
}

export interface DetailOptionContext {
    responsesByColumn: Map<string, DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
    plotType: string;
}

export function buildDetailOption(ctx: DetailOptionContext): Record<string, unknown> {
    const { responsesByColumn, activeDetailColumn, selectedWindowIdx, plotType } = ctx;
    const response = activeDetailColumn ? responsesByColumn.get(activeDetailColumn) ?? null : null;
    if (!response) {
        return {
            backgroundColor: 'transparent',
            title: { text: 'No detail data', left: 'center', top: 'center', textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 12 } },
        };
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
            backgroundColor: TOOLTIP_BG(),
            textStyle: { color: DRIFT_TEXT() },
        },
        toolbox: {
            right: 8,
            top: 2,
            itemSize: 12,
            iconStyle: { borderColor: DRIFT_TEXT_DIM() },
            feature: {
                dataZoom: { yAxisIndex: 'none', title: { zoom: 'Box zoom', back: 'Undo zoom' } },
                restore: { title: 'Reset zoom' },
            },
        },
        legend: {
            top: 2,
            right: 70,
            textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 10 },
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
        const windowColor = win && win.count >= 5 ? driftColor(win.drift_level) : DRIFT_DIM();
        return {
            ...common,
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, height: 14, bottom: 18, borderColor: 'rgba(255,255,255,0.08)' },
            ],
            xAxis: {
                type: 'category',
                data: mids,
                axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 10 },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: DRIFT_TEXT_DIM() },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
            },
            series: [
                {
                    name: 'Reference',
                    type: 'bar',
                    barGap: '-35%',
                    data: ref.hist_counts,
                    itemStyle: { color: 'rgba(0,168,255,0.38)', borderColor: COLOR_REF(), borderWidth: 1 },
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
        const windowColor = win && win.count >= 5 ? driftColor(win.drift_level) : DRIFT_DIM();
        return {
            ...common,
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, yAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, height: 14, bottom: 18, borderColor: 'rgba(255,255,255,0.08)' },
            ],
            xAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: DRIFT_TEXT_DIM(), formatter: (v: number) => formatValue(v) },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 1,
                axisLabel: { color: DRIFT_TEXT_DIM() },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
            },
            series: [
                {
                    name: 'Reference',
                    type: 'line',
                    step: 'end',
                    symbol: 'none',
                    lineStyle: { color: COLOR_REF(), width: 2 },
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
        const windowColor = win && win.count >= 5 ? driftColor(win.drift_level) : DRIFT_DIM();
        return {
            ...common,
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, yAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, height: 14, bottom: 18, borderColor: 'rgba(255,255,255,0.08)' },
            ],
            xAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: DRIFT_TEXT_DIM(), formatter: (v: number) => formatValue(v) },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 1,
                axisLabel: { color: DRIFT_TEXT_DIM() },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
            },
            series: [
                {
                    name: 'Reference density',
                    type: 'line',
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { color: COLOR_REF(), width: 2 },
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

    const winColor = win && win.count >= 5 ? driftColor(win.drift_level) : DRIFT_DIM();
    const refQ = ref.quantiles;
    const winQ = win?.quantiles ?? [NaN, NaN, NaN, NaN, NaN];

    return {
        ...common,
        xAxis: {
            type: 'category',
            data: ['Reference', win?.label || 'Selected'],
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 10 },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLabel: { color: DRIFT_TEXT_DIM() },
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
                            borderColor: COLOR_REF(),
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

// ── Detail stats rows ───────────────────────────────────────────────────────────

export interface DetailStatRow {
    label: string;
    value: string;
    className?: string;
}

export function buildDetailStatRows(win: DriftWindowStats | null): DetailStatRow[] {
    if (!win) return [];
    const rows: DetailStatRow[] = [
        { label: 'Count', value: String(win.count) },
        { label: 'Completeness', value: `${(win.completeness * 100).toFixed(1)}%` },
        { label: 'Completeness delta', value: `${(win.completeness_delta * 100).toFixed(1)}%` },
        { label: 'Mean', value: formatValue(win.mean) },
        { label: 'Std', value: formatValue(win.std) },
        { label: 'Median (Q50)', value: formatValue(win.quantiles[2]) },
        { label: 'KS stat / p', value: `${win.ks_stat.toFixed(3)} / ${win.ks_pvalue.toFixed(3)}` },
        { label: 'E-S stat / p', value: `${isFinite(win.es_stat) ? win.es_stat.toFixed(3) : '-'} / ${isFinite(win.es_pvalue) ? win.es_pvalue.toFixed(3) : '-'}` },
        { label: 'Wasserstein', value: formatValue(win.wasserstein) },
        { label: 'Jensen-Shannon', value: formatValue(win.jensen_shannon) },
        { label: 'PSI', value: win.psi.toFixed(4), className: `drift-${win.drift_level}` },
        { label: 'Triggered by', value: formatTriggerReasons(win.trigger_reasons) },
        { label: 'Drift level', value: win.drift_level.toUpperCase(), className: `drift-${win.drift_level}` },
    ];
    if (win.low_sample_warning) {
        rows.unshift({ label: 'Low sample size', value: 'N < 5, stats are less reliable' });
    }
    if (Math.abs(win.completeness_delta) >= 0.1) {
        rows.unshift({ label: 'Missingness warning', value: 'Completeness shifted materially from the reference window' });
    }
    return rows;
}

// ── Window list HTML builder ────────────────────────────────────────────────────

export function buildWindowListHtml(
    response: DriftResponse,
    selectedWindowIdx: number | null,
    orderedIdxs: number[],
): { html: string; selectedIdx: number | null } {
    const items = orderedIdxs.map((idx) => {
        const w = response.windows[idx];
        const isSelected = idx === selectedWindowIdx;
        const badgeClass = w.count < 5 ? 'empty' : w.drift_level;
        return {
            idx,
            html: `<div class="drift-window-item${isSelected ? ' selected' : ''}" role="option" tabindex="0" aria-selected="${isSelected ? 'true' : 'false'}" data-window-idx="${idx}">
                <span class="drift-window-badge drift-window-badge--${badgeClass}"></span>
                <span class="drift-window-label">${w.label}</span>
                <span class="drift-window-psi">PSI ${isFinite(w.psi) ? w.psi.toFixed(3) : '-'}</span>
            </div>`,
        };
    });
    return { html: items.map((i) => i.html).join(''), selectedIdx: selectedWindowIdx };
}
