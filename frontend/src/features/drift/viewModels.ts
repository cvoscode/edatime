/**
 * drift/viewModels.ts — Derived response shaping and formatting helpers for drift charts.
 *
 * These functions take the current drift response state and produce ECharts options
 * or formatted display data. They are intentionally free of side effects.
 */

import type { EChartLike } from './types.js';
import { getChartPalette, getPaletteColor } from '../../utils/theme.js';
import { formatUtcDatetimeInputValue } from '../../utils/datetimeInput.js';

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

export interface DriftInvestigationOverview {
    driftScore: number;
    worstLevel: DriftWindowStats['drift_level'];
    columnsFlagged: number;
    totalColumns: number;
    windowsFlagged: number;
    firstChangePoint: string | null;
}

export interface DriftFeatureRank {
    column: string;
    driftScore: number;
    latestLevel: DriftWindowStats['drift_level'];
    flaggedWindows: number;
    firstChangePoint: string | null;
}

export interface DriftSegmentRank {
    segmentValue: string;
    driftScore: number;
    columnsFlagged: number;
    sampleCount: number;
}

export interface DriftChangePointRank {
    column: string;
    label: string;
    isoTime: string;
    driftScore: number;
    triggerReasons: string[];
}

export interface DriftQualityIssueRank {
    column: string;
    issue: string;
    label: string;
    driftScore: number;
}

export interface DriftRelationshipRank {
    leftColumn: string;
    rightColumn: string;
    reference: number;
    comparison: number;
    delta: number;
    alignedReferenceSamples: number;
    alignedComparisonSamples: number;
}

export interface DriftSegmentGroup {
    value: string;
    sampleCount: number;
    overview: DriftInvestigationOverview;
    featureRanks: DriftFeatureRank[];
}

export interface DriftQualitySummary {
    latestMissingRate: number;
    latestCompletenessDelta: number;
    latestZeroRate: number;
    flatline: boolean;
    lowSampleWarning: boolean;
    issues: string[];
}

export interface DriftInvestigationResponse {
    overview: DriftInvestigationOverview;
    columns: Record<string, DriftResponse>;
    rankings: {
        features: DriftFeatureRank[];
        segments: DriftSegmentRank[];
        changePoints: DriftChangePointRank[];
        qualityIssues: DriftQualityIssueRank[];
        relationships: DriftRelationshipRank[];
    };
    segments?: {
        segmentBy: string;
        groups: DriftSegmentGroup[];
    };
    quality?: {
        byColumn: Record<string, DriftQualitySummary>;
    };
    relationships?: {
        mode: string;
        pairs: DriftRelationshipRank[];
    };
}

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
    if (level === 'red') return getPaletteColor('danger') ?? COLOR_RED;
    if (level === 'yellow') return getPaletteColor('warning') ?? COLOR_YELLOW;
    return getPaletteColor('success') ?? COLOR_GREEN;
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
    return formatUtcDatetimeInputValue(ms);
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

function compactRangeStartDate(label: string): string | null {
    const match = label.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+-\s+(?:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})$/);
    return match?.[1] ?? null;
}

function compactTimelineLabel(label: string): string {
    return compactRangeStartDate(label) ?? label;
}

function compactWindowListLabel(label: string, index: number): string {
    const startDate = compactRangeStartDate(label);
    if (!startDate) return label;
    return `Day ${index + 1} · ${startDate}`;
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
    const meta = params?.data?.meta || {};
    if (meta.ref) {
        return [
            `<strong>${meta.column || params.seriesName}</strong>`,
            `${meta.range_label || 'Reference baseline'}`,
            `Reference samples: ${meta.count ?? '-'}`,
        ].join('<br/>');
    }
    const lines = [
        `<strong>${meta.column || params.seriesName}</strong>`,
        `${meta.range_label || params.name || ''}`,
        `Drift: ${(meta.drift_level || '-').toUpperCase()}`,
        `PSI: ${isFinite(meta.psi) ? Number(meta.psi).toFixed(4) : '-'}`,
        `Wasserstein: ${isFinite(meta.wasserstein) ? formatValue(Number(meta.wasserstein)) : '-'}`,
        `KS p-value: ${isFinite(meta.ks_pvalue) ? Number(meta.ks_pvalue).toFixed(4) : '-'}`,
        `Triggered by: ${formatTriggerReasons(meta.trigger_reasons)}`,
    ];
    return lines.join('<br/>');
};

// ── ECharts option builders ─────────────────────────────────────────────────────

export interface TimelineOptionContext {
    responsesByColumn: Map<string, DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
    timelineMode?: TimelineMode;
}

export type TimelineMode = 'heatmap' | 'grouped' | 'boxplot' | 'violin';

function distributionBox(stats: WindowDistributionStats): number[] {
    const quantiles = stats.quantiles.filter(Number.isFinite);
    if (quantiles.length >= 5) {
        return [stats.min, quantiles[1]!, quantiles[Math.floor(quantiles.length / 2)]!, quantiles[quantiles.length - 2]!, stats.max];
    }
    if (quantiles.length >= 3) return [stats.min, quantiles[0]!, quantiles[1]!, quantiles[2]!, stats.max];
    return [stats.min, stats.min, stats.mean, stats.max, stats.max];
}

function normalizedCounts(values: number[]): number[] {
    const max = Math.max(1, ...values);
    return values.map((value) => value / max);
}

function groupedTimelineOption(
    responsesByColumn: Map<string, DriftResponse>,
    activeDetailColumn: string | null,
    selectedWindowIdx: number | null,
): Record<string, unknown> {
    const responses = Array.from(responsesByColumn.values());
    const longestResponse = responses.reduce((longest, response) => (
        response.windows.length > longest.windows.length ? response : longest
    ));
    const categories = ['Reference', ...longestResponse.windows.map((window) => compactTimelineLabel(window.label))];
    const borderColor = getPaletteColor('border') ?? DRIFT_DIM();
    const visibleCount = 18;
    const start = categories.length > visibleCount ? Math.max(0, 100 - (visibleCount / categories.length) * 100) : 0;
    const series: any[] = [];

    responses.forEach((response, responseIndex) => {
        const color = COLUMN_PALETTE[responseIndex % COLUMN_PALETTE.length]!;
        const stats: WindowDistributionStats[] = [response.reference, ...response.windows];
        const referenceBox = distributionBox(response.reference);
        const referenceMedian = referenceBox[2]!;
        const referenceIqr = referenceBox[3]! - referenceBox[1]!;
        const fallbackScale = Number.isFinite(response.reference.std) && response.reference.std > 0
            ? response.reference.std
            : response.reference.max - response.reference.min;
        const scale = Number.isFinite(referenceIqr) && referenceIqr > 0
            ? referenceIqr
            : Number.isFinite(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1;
        const boxes = stats.map(distributionBox);
        const lower = boxes.map((box) => (box[1]! - referenceMedian) / scale);
        const band = boxes.map((box) => Math.max(0, (box[3]! - box[1]!) / scale));
        const medians = boxes.map((box, index) => {
            const window = index === 0 ? null : response.windows[index - 1] ?? null;
            return {
                value: (box[2]! - referenceMedian) / scale,
                symbol: index > 0 && activeDetailColumn === response.column && selectedWindowIdx === index - 1 ? 'circle' : 'none',
                symbolSize: index > 0 && activeDetailColumn === response.column && selectedWindowIdx === index - 1 ? 7 : 0,
                meta: {
                    column: response.column,
                    window_index: index - 1,
                    range_label: stats[index]?.label || categories[index],
                    ref: index === 0,
                    count: stats[index]?.count,
                    drift_level: window?.drift_level,
                    box,
                    normalized_box: box.map((value) => (value - referenceMedian) / scale),
                },
            };
        });
        const stack = `distribution-${responseIndex}`;

        series.push(
            {
                name: response.column,
                type: 'line',
                data: medians,
                connectNulls: false,
                showSymbol: false,
                lineStyle: { color, width: activeDetailColumn === response.column ? 2.2 : 1.5 },
                itemStyle: { color },
                emphasis: { focus: 'series' },
                driftDistributionPart: 'median',
            },
            {
                name: response.column,
                type: 'line',
                stack,
                stackStrategy: 'all',
                data: lower,
                symbol: 'none',
                silent: true,
                lineStyle: { opacity: 0 },
                areaStyle: { opacity: 0 },
                emphasis: { disabled: true },
                tooltip: { show: false },
                driftDistributionPart: 'lower-quartile',
            },
            {
                name: response.column,
                type: 'line',
                stack,
                stackStrategy: 'all',
                data: band,
                symbol: 'none',
                silent: true,
                lineStyle: { opacity: 0 },
                areaStyle: { color, opacity: 0.12 },
                emphasis: { disabled: true },
                tooltip: { show: false },
                driftDistributionPart: 'interquartile-range',
            },
        );
    });

    return {
        backgroundColor: 'transparent',
        animationDuration: 160,
        color: responses.map((_, index) => COLUMN_PALETTE[index % COLUMN_PALETTE.length]),
        tooltip: {
            trigger: 'axis',
            confine: true,
            borderColor,
            backgroundColor: TOOLTIP_BG(),
            textStyle: { color: DRIFT_TEXT(), fontSize: 11 },
            formatter: (params: any) => {
                const items = (Array.isArray(params) ? params : [params]).filter((item: any) => item?.data?.meta);
                const heading = items[0]?.axisValueLabel || items[0]?.name || '';
                const rows = items.map((item: any) => {
                    const meta = item.data.meta;
                    const box = meta.box ?? [];
                    return [
                        `<span style="color:${item.color}">●</span> <strong>${meta.column}</strong>: ${formatValue(box[2])}`,
                        `<span style="color:${DRIFT_TEXT_DIM()}">IQR ${formatValue(box[1])} – ${formatValue(box[3])}</span>`,
                    ].join(' ');
                });
                return [`<strong>${heading}</strong>`, ...rows].join('<br/>');
            },
        },
        legend: {
            type: 'scroll',
            data: responses.map((response) => response.column),
            top: 0,
            right: 12,
            left: 56,
            itemWidth: 14,
            itemHeight: 3,
            textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
        },
        grid: { left: 54, right: 16, top: 28, bottom: 48 },
        xAxis: {
            type: 'category',
            data: categories,
            boundaryGap: false,
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9, hideOverlap: true },
            axisTick: { show: false },
            axisLine: { lineStyle: { color: borderColor } },
        },
        yAxis: {
            type: 'value',
            name: 'Shift (reference IQRs)',
            nameTextStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9, formatter: (value: number) => formatValue(value) },
            splitLine: { lineStyle: { color: borderColor, opacity: 0.4 } },
        },
        dataZoom: [
            { type: 'inside', xAxisIndex: 0, start, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
            { type: 'slider', xAxisIndex: 0, start, end: 100, height: 12, bottom: 8, borderColor: 'transparent', fillerColor: `${COLOR_REF()}24`, handleSize: 0, textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 8 } },
        ],
        series,
    };
}

function timelineDistributionOption(
    response: DriftResponse,
    selectedWindowIdx: number | null,
    mode: 'boxplot' | 'violin',
): Record<string, unknown> {
    const borderColor = getPaletteColor('border') ?? DRIFT_DIM();
    const categories = ['Reference', ...response.windows.map((window) => compactTimelineLabel(window.label))];
    const allStats: WindowDistributionStats[] = [response.reference, ...response.windows];
    const visibleCount = 18;
    const start = categories.length > visibleCount ? Math.max(0, 100 - (visibleCount / categories.length) * 100) : 0;
    const common = {
        backgroundColor: 'transparent',
        animationDuration: 160,
        tooltip: {
            trigger: 'item',
            confine: true,
            borderColor,
            backgroundColor: TOOLTIP_BG(),
            textStyle: { color: DRIFT_TEXT(), fontSize: 11 },
            formatter: (params: any) => {
                const meta = params?.data?.meta ?? {};
                const box = meta.box ?? [];
                return [
                    `<strong>${response.column}</strong>`,
                    meta.range_label ?? params.name ?? '',
                    `Median: ${formatValue(box[2])}`,
                    `IQR: ${formatValue(box[1])} – ${formatValue(box[3])}`,
                    meta.ref ? 'Reference baseline' : `Drift: ${(meta.drift_level ?? '-').toUpperCase()}`,
                ].join('<br/>');
            },
        },
        grid: { left: 54, right: 16, top: 12, bottom: 48 },
        xAxis: {
            type: 'category',
            data: categories,
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9, hideOverlap: true },
            axisTick: { show: false },
            axisLine: { lineStyle: { color: borderColor } },
        },
        yAxis: {
            type: 'value',
            name: response.column,
            nameTextStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
            splitLine: { lineStyle: { color: borderColor, opacity: 0.4 } },
        },
        dataZoom: [
            { type: 'inside', xAxisIndex: 0, start, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
            { type: 'slider', xAxisIndex: 0, start, end: 100, height: 12, bottom: 8, borderColor: 'transparent', fillerColor: `${COLOR_REF()}24`, handleSize: 0, textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 8 } },
        ],
    };

    const items = allStats.map((stats, index) => {
        const window = index === 0 ? null : response.windows[index - 1]!;
        const selected = index > 0 && selectedWindowIdx === index - 1;
        const box = distributionBox(stats);
        const color = index === 0 ? COLOR_REF() : driftColor(window!.drift_level);
        return {
            value: box,
            itemStyle: { color: `${color}32`, borderColor: color, borderWidth: selected ? 2.2 : 1.2 },
            meta: {
                column: response.column,
                window_index: index - 1,
                range_label: stats.label || (index === 0 ? 'Reference baseline' : categories[index]),
                drift_level: window?.drift_level,
                ref: index === 0,
                box,
            },
        };
    });

    if (mode === 'boxplot') {
        return { ...common, series: [{ name: 'Distribution summary', type: 'boxplot', data: items }] };
    }

    const violinData = allStats.map((stats, index) => {
        const window = index === 0 ? null : response.windows[index - 1]!;
        const selected = index > 0 && selectedWindowIdx === index - 1;
        const color = index === 0 ? COLOR_REF() : driftColor(window!.drift_level);
        return {
            value: [index, stats.min, stats.max],
            itemStyle: { color: `${color}36`, stroke: color, lineWidth: selected ? 2.2 : 1.1 },
            meta: {
                column: response.column,
                window_index: index - 1,
                range_label: stats.label || (index === 0 ? 'Reference baseline' : categories[index]),
                drift_level: window?.drift_level,
                ref: index === 0,
                box: distributionBox(stats),
            },
        };
    });
    const renderItem = (params: any, api: any) => {
        const index = params.dataIndex;
        const stats = allStats[index];
        if (!stats || stats.hist_bins.length < 2) return null;
        const density = normalizedCounts(stats.hist_counts);
        const halfWidth = Math.max(2, Math.min(16, Math.abs(api.size([1, 0])[0]) * 0.35));
        const centers = stats.hist_bins.slice(0, -1).map((value, binIndex) => (value + stats.hist_bins[binIndex + 1]!) / 2);
        const right = centers.map((value, binIndex) => {
            const point = api.coord([index, value]);
            return [point[0] + halfWidth * (density[binIndex] ?? 0), point[1]];
        });
        const left = centers.slice().reverse().map((value, reverseIndex) => {
            const binIndex = centers.length - 1 - reverseIndex;
            const point = api.coord([index, value]);
            return [point[0] - halfWidth * (density[binIndex] ?? 0), point[1]];
        });
        const itemStyle = violinData[index]?.itemStyle;
        return {
            type: 'polygon',
            shape: { points: [...right, ...left] },
            style: { fill: itemStyle?.color, stroke: itemStyle?.stroke, lineWidth: itemStyle?.lineWidth },
        };
    };
    return { ...common, series: [{ name: 'Distribution density', type: 'custom', renderItem, data: violinData, encode: { x: 0, y: [1, 2] } }] };
}

export function buildTimelineOption(ctx: TimelineOptionContext): Record<string, unknown> {
    const { responsesByColumn, activeDetailColumn, selectedWindowIdx, timelineMode = 'heatmap' } = ctx;
    const columns = Array.from(responsesByColumn.keys());
    const first = columns.length > 0 ? responsesByColumn.get(columns[0]) ?? null : null;
    if (!first) {
        return {
            backgroundColor: 'transparent',
            title: { text: 'No drift data', left: 'center', top: 'center', textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 12 } },
        };
    }

    if (timelineMode === 'grouped') {
        return groupedTimelineOption(responsesByColumn, activeDetailColumn, selectedWindowIdx);
    }

    if (timelineMode !== 'heatmap') {
        const active = responsesByColumn.get(activeDetailColumn ?? '') ?? first;
        return timelineDistributionOption(active, selectedWindowIdx, timelineMode);
    }

    const firstWindowDuration = first.windows[0]
        ? Math.max(1, first.windows[0].end_ms - first.windows[0].start_ms)
        : Math.max(1, first.reference.end_ms - first.reference.start_ms);
    const estimatedReferenceSlots = Math.round(
        Math.max(1, first.reference.end_ms - first.reference.start_ms) / firstWindowDuration,
    );
    const referenceSlots = Math.max(1, Math.min(240, estimatedReferenceSlots));
    const referenceStartLabel = Number.isFinite(first.reference.start_ms)
        ? new Date(first.reference.start_ms).toISOString().slice(0, 10)
        : 'Reference';
    const categories = [
        ...Array.from({ length: referenceSlots }, (_, index) => index === 0 ? referenceStartLabel : ''),
        ...first.windows.map((window) => compactTimelineLabel(window.label)),
    ];
    const visibleTickStep = Math.max(1, Math.ceil(categories.length / 7));
    const surfaceColor = getPaletteColor('surface') ?? '#FFFFFF';
    const referenceColor = getPaletteColor('border') ?? '#CDD6E0';
    const heatmapData: any[] = [];

    columns.forEach((column, columnIndex) => {
        const response = responsesByColumn.get(column)!;
        for (let referenceIndex = 0; referenceIndex < referenceSlots; referenceIndex += 1) {
            heatmapData.push({
                value: [referenceIndex, columnIndex, -1],
                itemStyle: { color: referenceColor, borderColor: surfaceColor, borderWidth: 0.8 },
                meta: {
                    column,
                    ref: true,
                    count: response.reference.count,
                    range_label: response.reference.label || 'Reference baseline',
                },
            });
        }
        response.windows.forEach((window, windowIndex) => {
            const value = window.drift_level === 'red' ? 2 : window.drift_level === 'yellow' ? 1 : 0;
            const color = window.count < 5 ? DRIFT_DIM() : driftColor(window.drift_level);
            const selected = activeDetailColumn === column && selectedWindowIdx === windowIndex;
            heatmapData.push({
                value: [referenceSlots + windowIndex, columnIndex, value],
                itemStyle: {
                    color,
                    borderColor: selected ? (getPaletteColor('accent') ?? '#006FB8') : surfaceColor,
                    borderWidth: selected ? 2 : 0.8,
                },
                meta: {
                    column,
                    window_index: windowIndex,
                    range_label: window.label,
                    count: window.count,
                    psi: window.psi,
                    ks_pvalue: window.ks_pvalue,
                    wasserstein: window.wasserstein,
                    drift_level: window.drift_level,
                    trigger_reasons: window.trigger_reasons,
                },
            });
        });
    });

    return {
        backgroundColor: 'transparent',
        animationDuration: 160,
        tooltip: {
            trigger: 'item',
            confine: true,
            borderColor: 'rgba(255,255,255,0.08)',
            backgroundColor: TOOLTIP_BG(),
            textStyle: { color: DRIFT_TEXT() },
            formatter: timelineTooltipFormatter,
        },
        visualMap: {
            show: false,
            min: -1,
            max: 2,
            dimension: 2,
        },
        grid: {
            left: 62,
            right: 14,
            top: 14,
            bottom: 34,
        },
        xAxis: {
            type: 'category',
            data: categories,
            splitArea: { show: false },
            axisLabel: {
                color: DRIFT_TEXT_DIM(),
                fontSize: 9,
                hideOverlap: true,
                interval: (index: number) => index === 0 || index === referenceSlots || index === categories.length - 1 || index % visibleTickStep === 0,
            },
            axisTick: { show: false },
            axisLine: { lineStyle: { color: DRIFT_DIM() } },
        },
        yAxis: {
            type: 'category',
            data: columns,
            inverse: true,
            axisLabel: { color: DRIFT_TEXT(), fontSize: 10, fontWeight: 600 },
            axisTick: { show: false },
            axisLine: { show: false },
        },
        series: [{
            name: 'Drift severity',
            type: 'heatmap',
            data: heatmapData,
            progressive: 2000,
            emphasis: { disabled: true },
        }],
    };
}

export interface DetailOptionContext {
    responsesByColumn: Map<string, DriftResponse>;
    activeDetailColumn: string | null;
    selectedWindowIdx: number | null;
    plotType: string;
}

function buildEvidenceDetailOption(ctx: DetailOptionContext): Record<string, unknown> {
    const { responsesByColumn, activeDetailColumn, selectedWindowIdx, plotType } = ctx;
    const legacyColumn = activeDetailColumn ?? '';
    const response: DriftResponse | null = responsesByColumn.get(legacyColumn) ?? null;
    if (!response) {
        return {
            backgroundColor: 'transparent',
            title: { text: 'No evidence data', left: 'center', top: 'center', textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 12 } },
        };
    }

    const selectedIndex = selectedWindowIdx ?? Math.max(0, response.windows.length - 1);
    const selectedWindow = response.windows[selectedIndex] ?? null;
    const labels = response.windows.map((window) => compactTimelineLabel(window.label));
    const tickStep = Math.max(1, Math.ceil(labels.length / 6));
    const threshold = response.thresholds.psi_major_threshold;
    const selectedColor = selectedWindow ? driftColor(selectedWindow.drift_level) : COLOR_RED;
    const borderColor = getPaletteColor('border') ?? DRIFT_DIM();
    const resolvedPlotType = ['raincloud', 'ecdf', 'box', 'violin'].includes(plotType) ? plotType : 'raincloud';
    const selectedStats = selectedWindow ?? response.reference;
    const distributionStats = [response.reference, selectedStats];
    const distributionNames = ['Reference', 'Selected window'];
    const distributionColors = [COLOR_REF(), selectedColor];
    const rightXAxis = resolvedPlotType === 'box'
        ? {
            type: 'category', gridIndex: 1, data: distributionNames,
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9 }, axisTick: { show: false },
            axisLine: { lineStyle: { color: borderColor } },
        }
        : {
            type: 'value', gridIndex: 1,
            name: resolvedPlotType === 'ecdf' ? 'Value' : '',
            nameTextStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
            splitLine: { lineStyle: { color: borderColor, opacity: 0.35 } },
        };
    const rightYAxis = resolvedPlotType === 'box'
        ? {
            type: 'value', gridIndex: 1,
            axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
            splitLine: { lineStyle: { color: borderColor, opacity: 0.35 } },
        }
        : resolvedPlotType === 'ecdf'
            ? {
                type: 'value', gridIndex: 1, min: 0, max: 1, name: 'Cumulative probability',
                nameLocation: 'middle', nameGap: 30,
                nameTextStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
                axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9, formatter: (value: number) => value.toFixed(1) },
                splitLine: { lineStyle: { color: borderColor, opacity: 0.35 } },
            }
            : {
                type: 'category', gridIndex: 1, data: distributionNames,
                axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9 }, axisTick: { show: false },
                axisLine: { show: false },
            };

    const densityRenderItem = (params: any, api: any) => {
        const index = params.dataIndex;
        const stats = distributionStats[index];
        if (!stats || stats.hist_bins.length < 2) return null;
        const density = normalizedCounts(stats.hist_counts);
        const halfHeight = Math.max(5, Math.min(24, Math.abs(api.size([0, 1])[1]) * 0.28));
        const centers = stats.hist_bins.slice(0, -1).map((value, binIndex) => (value + stats.hist_bins[binIndex + 1]!) / 2);
        const upper = centers.map((value, binIndex) => {
            const point = api.coord([value, index]);
            return [point[0], point[1] - halfHeight * (density[binIndex] ?? 0)];
        });
        const lower = centers.slice().reverse().map((value, reverseIndex) => {
            const binIndex = centers.length - 1 - reverseIndex;
            const point = api.coord([value, index]);
            const densityOffset = resolvedPlotType === 'violin' ? halfHeight * (density[binIndex] ?? 0) : 0;
            return [point[0], point[1] + densityOffset];
        });
        const itemStyle = densityData[index]?.itemStyle;
        return {
            type: 'polygon',
            shape: { points: [...upper, ...lower] },
            style: { fill: itemStyle?.color, stroke: itemStyle?.stroke, lineWidth: itemStyle?.lineWidth },
        };
    };

    const densityData = distributionStats.map((stats, index) => ({
        value: [stats.mean, index, stats.min, stats.max],
        itemStyle: { color: `${distributionColors[index]}38`, stroke: distributionColors[index], lineWidth: 1.3 },
        meta: { name: distributionNames[index], box: distributionBox(stats) },
    }));
    const rightSeries: any[] = resolvedPlotType === 'ecdf'
        ? distributionStats.map((stats, index) => ({
            name: distributionNames[index], type: 'line', xAxisIndex: 1, yAxisIndex: 1,
            data: stats.ecdf_x.map((value, pointIndex) => [value, stats.ecdf_y[pointIndex] ?? 0]),
            step: 'end', showSymbol: false, lineStyle: { color: distributionColors[index], width: 1.8 },
            itemStyle: { color: distributionColors[index] },
        }))
        : resolvedPlotType === 'box'
            ? [{
                name: 'Distribution summary', type: 'boxplot', xAxisIndex: 1, yAxisIndex: 1,
                data: distributionStats.map((stats, index) => ({
                    value: distributionBox(stats),
                    itemStyle: { color: `${distributionColors[index]}32`, borderColor: distributionColors[index], borderWidth: 1.4 },
                })),
            }]
            : [{
                name: 'Distribution density', type: 'custom', xAxisIndex: 1, yAxisIndex: 1,
                renderItem: densityRenderItem, data: densityData, encode: { x: [0, 2, 3], y: 1 },
            }];

    if (resolvedPlotType === 'raincloud') {
        rightSeries.push({
            name: 'Quartiles', type: 'boxplot', layout: 'horizontal', xAxisIndex: 1, yAxisIndex: 1,
            boxWidth: [8, 13],
            data: distributionStats.map((stats, index) => ({
                value: distributionBox(stats),
                itemStyle: { color: `${distributionColors[index]}24`, borderColor: distributionColors[index], borderWidth: 1.2 },
            })),
        });
        distributionStats.forEach((stats, index) => {
            const step = Math.max(1, Math.floor(stats.ecdf_x.length / 14));
            rightSeries.push({
                name: `${distributionNames[index]} observations`, type: 'scatter', xAxisIndex: 1, yAxisIndex: 1,
                data: stats.ecdf_x.filter((_, pointIndex) => pointIndex % step === 0).slice(0, 16).map((value) => [value, index]),
                symbolSize: 3.5, symbolOffset: [0, 9], silent: true,
                itemStyle: { color: distributionColors[index], opacity: 0.55 },
            });
        });
    }

    return {
        backgroundColor: 'transparent',
        animationDuration: 160,
        title: [
            { text: `Drift over time (${response.column})`, left: '3%', top: 4, textStyle: { color: DRIFT_TEXT(), fontSize: 11, fontWeight: 600 } },
            { text: `Distribution comparison · ${resolvedPlotType === 'raincloud' ? 'Raincloud' : resolvedPlotType === 'ecdf' ? 'ECDF' : resolvedPlotType === 'box' ? 'Box plot' : 'Violin'}`, left: '57%', top: 4, textStyle: { color: DRIFT_TEXT(), fontSize: 11, fontWeight: 600 } },
        ],
        tooltip: {
            trigger: 'item',
            confine: true,
            borderColor,
            backgroundColor: TOOLTIP_BG(),
            textStyle: { color: DRIFT_TEXT(), fontSize: 11 },
        },
        legend: {
            data: resolvedPlotType === 'ecdf' ? ['Reference', 'Selected window'] : [],
            show: resolvedPlotType === 'ecdf',
            right: 12,
            top: 3,
            itemWidth: 10,
            itemHeight: 8,
            textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
        },
        grid: [
            { left: 44, right: '53%', top: 40, bottom: 38 },
            { left: '57%', right: 16, top: 40, bottom: 38 },
        ],
        xAxis: [
            {
                type: 'category',
                gridIndex: 0,
                data: labels,
                boundaryGap: false,
                axisLabel: {
                    color: DRIFT_TEXT_DIM(),
                    fontSize: 9,
                    hideOverlap: true,
                    interval: (index: number) => index === 0 || index === labels.length - 1 || index % tickStep === 0,
                },
                axisTick: { show: false },
                axisLine: { lineStyle: { color: borderColor } },
            },
            rightXAxis,
        ],
        yAxis: [
            {
                type: 'value',
                gridIndex: 0,
                min: 0,
                name: 'PSI',
                nameTextStyle: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
                axisLabel: { color: DRIFT_TEXT_DIM(), fontSize: 9 },
                splitLine: { lineStyle: { color: borderColor, opacity: 0.45 } },
            },
            rightYAxis,
        ],
        series: [
            {
                name: 'PSI drift score',
                type: 'line',
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: response.windows.map((window, index) => ({
                    value: window.psi,
                    symbol: index === selectedIndex ? 'circle' : 'none',
                    symbolSize: index === selectedIndex ? 7 : 0,
                    itemStyle: { color: index === selectedIndex ? getPaletteColor('accent') : selectedColor },
                })),
                showSymbol: false,
                lineStyle: { color: COLOR_RED, width: 1.8 },
                markLine: {
                    silent: true,
                    symbol: 'none',
                    label: { show: false },
                    lineStyle: { color: DRIFT_TEXT_DIM(), type: 'dashed', width: 1 },
                    data: [{ yAxis: threshold }, { xAxis: selectedIndex, lineStyle: { color: getPaletteColor('accent'), type: 'solid', opacity: 0.55 } }],
                },
            },
            ...rightSeries,
        ],
    };
}

export function buildDetailOption(ctx: DetailOptionContext): Record<string, unknown> {
    return buildEvidenceDetailOption(ctx);
    /* istanbul ignore next -- retained fallback variants for compatibility */
    const { responsesByColumn, activeDetailColumn, selectedWindowIdx, plotType } = ctx;
    const legacyColumn = activeDetailColumn ?? '';
    const response: DriftResponse | null = responsesByColumn.get(legacyColumn) ?? null;
    if (!response) {
        return {
            backgroundColor: 'transparent',
            title: { text: 'No detail data', left: 'center', top: 'center', textStyle: { color: DRIFT_TEXT_DIM(), fontSize: 12 } },
        };
    }
    const legacySelectedIndex = selectedWindowIdx ?? 0;
    const win = (response!.windows[legacySelectedIndex] ?? response!.windows[0]) as DriftWindowStats;
    const ref = response!.reference;

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
                    data: win ? win.ecdf_x.map((x: number, i: number) => [x, win.ecdf_y[i] ?? 0]) : [],
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
                <span class="drift-window-label">${compactWindowListLabel(w.label, idx)}</span>
                <span class="drift-window-psi">PSI ${isFinite(w.psi) ? w.psi.toFixed(3) : '-'}</span>
            </div>`,
        };
    });
    return { html: items.map((i) => i.html).join(''), selectedIdx: selectedWindowIdx };
}
