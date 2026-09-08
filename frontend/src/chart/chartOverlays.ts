/**
 * ChartOverlays — renders rolling bands, anomaly regions, adaptive filter
 * lines, and annotations on a transparent canvas overlaying the chart.
 * Extracted from DataChart.ts to reduce its size and improve maintainability.
 */

import { analyticsState } from '../store/analyticsState.js';
import { buildAdaptiveLineY } from '../services/timeseries/filtering.js';
import { getChartPalette } from '../utils/theme.js';
import { getColumnSeriesColor } from '../utils/seriesColors.js';
import { getAnnotationsForPage } from './annotations.js';
import type { AdaptiveLineFilter, ColumnRange } from '../types/store.js';

interface ChartOverlayOptions {
    getXMin: () => number | null;
    getXMax: () => number | null;
    getContainer: () => HTMLElement | null;
    getOverlayCanvas: () => HTMLCanvasElement | null;
    getGrid: () => { left: number; right: number; top: number; bottom: number };
    getYRange: () => { min: number; max: number } | null;
    getColumnRangeFilters?: () => Readonly<Record<string, ColumnRange>>;
    getAdaptiveLineFilters: () => readonly AdaptiveLineFilter[];
    getPendingAdaptivePoint: () => { column: string; x: number; y: number; x2?: number; y2?: number } | null;
}

/**
 * Shared plot-geometry result for chart overlays.
 *
 * Centralises the plotLeft / plotTop / plotRight / plotBottom / plotWidth
 * / plotHeight / strokeScale arithmetic that every overlay (rolling
 * bands, anomaly regions, adaptive filters, annotations) needs before
 * it can draw anything. Returns `null` when the container or overlay
 * canvas is missing so callers can short-circuit cleanly.
 */
export interface ChartOverlayPlotMetrics {
    cssWidth: number;
    cssHeight: number;
    plotLeft: number;
    plotTop: number;
    plotRight: number;
    plotBottom: number;
    plotWidth: number;
    plotHeight: number;
    strokeScale: number;
}

function getOverlayPlotMetrics(
    container: HTMLElement | null,
    overlayCanvas: HTMLCanvasElement | null,
    grid: { left: number; right: number; top: number; bottom: number },
    scale: { x: number; y: number },
): ChartOverlayPlotMetrics | null {
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || overlayCanvas?.width || 1);
    const cssHeight = Math.max(1, rect.height || overlayCanvas?.height || 1);
    const plotLeft = grid.left * scale.x;
    const plotTop = grid.top * scale.y;
    const plotRight = Math.max(plotLeft + 1, (cssWidth - grid.right) * scale.x);
    const plotBottom = Math.max(plotTop + 1, (cssHeight - grid.bottom) * scale.y);
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const strokeScale = Math.min(scale.x, scale.y);
    return { cssWidth, cssHeight, plotLeft, plotTop, plotRight, plotBottom, plotWidth, plotHeight, strokeScale };
}

export class ChartOverlays {
    private _opts: ChartOverlayOptions;
    private _selectedColumns: readonly string[] = [];

    constructor(opts: ChartOverlayOptions) {
        this._opts = opts;
    }

    /** Keep overlay visibility aligned with the series supplied to the chart. */
    setSelectedColumns(columns: readonly string[]): void {
        this._selectedColumns = [...columns];
    }

    renderAll(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        this._renderRollingBandsToCtx(ctx, scale);
        this._renderAnomalyRegionsToCtx(ctx, scale);
        this._renderColumnRangeFiltersToCtx(ctx, scale);
        this._renderAdaptiveFilterLinesToCtx(ctx, scale);
        this._renderAnnotationsToCtx(ctx, scale);
    }

    private _renderColumnRangeFiltersToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const ranges = this._opts.getColumnRangeFilters?.() ?? {};
        const visibleRanges = Object.entries(ranges).filter(([column, range]) => (
            this._selectedColumns.includes(column)
            && Number.isFinite(Number(range.from))
            && Number.isFinite(Number(range.to))
        ));
        if (visibleRanges.length === 0) return;

        const yRange = this._opts.getYRange();
        if (!yRange || !(yRange.max > yRange.min)) return;
        const metrics = getOverlayPlotMetrics(
            this._opts.getContainer(),
            this._opts.getOverlayCanvas(),
            this._opts.getGrid(),
            scale,
        );
        if (!metrics) return;
        const { plotLeft, plotTop, plotBottom, plotWidth, plotHeight, strokeScale } = metrics;
        const ySpan = yRange.max - yRange.min;
        const toY = (value: number) => plotBottom - ((value - yRange.min) / ySpan) * plotHeight;

        ctx.save();
        // Range bands belong to the data area. Clipping at the plot edge keeps
        // their fill, dashed border, and label clear of the Y-axis tick labels.
        ctx.beginPath();
        ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
        ctx.clip();
        ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (const [column, range] of visibleRanges) {
            const from = Math.min(Number(range.from), Number(range.to));
            const to = Math.max(Number(range.from), Number(range.to));
            if (to < yRange.min || from > yRange.max) continue;

            const bandTop = Math.max(plotTop, toY(Math.min(to, yRange.max)));
            const bandBottom = Math.min(plotBottom, toY(Math.max(from, yRange.min)));
            const bandHeight = Math.max(1, bandBottom - bandTop);
            const color = getColumnSeriesColor(column);

            ctx.fillStyle = this._applyAlphaToColor(color, 0.12);
            ctx.fillRect(plotLeft, bandTop, plotWidth, bandHeight);
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, 1.5 * strokeScale);
            ctx.setLineDash([6 * strokeScale, 4 * strokeScale]);
            ctx.strokeRect(plotLeft, bandTop, plotWidth, bandHeight);
            ctx.setLineDash([]);

            const label = `${column} [${from.toFixed(2)}, ${to.toFixed(2)}]`;
            const labelWidth = ctx.measureText(label).width;
            const labelHeight = 17 * strokeScale;
            const labelX = plotLeft + 6 * strokeScale;
            const labelY = Math.max(
                plotTop + labelHeight / 2 + 2 * strokeScale,
                Math.min(plotBottom - labelHeight / 2 - 2 * strokeScale, bandTop + labelHeight / 2 + 3 * strokeScale),
            );
            ctx.fillStyle = 'rgba(8, 12, 20, 0.88)';
            ctx.fillRect(
                labelX - 3 * strokeScale,
                labelY - labelHeight / 2,
                labelWidth + 6 * strokeScale,
                labelHeight,
            );
            ctx.fillStyle = color;
            ctx.fillText(label, labelX, labelY);
        }
        ctx.restore();
    }

    private _renderRollingBandsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const bands = analyticsState.rollingBands;
        if (
            !bands
            || bands.length === 0
            || !analyticsState.rollingEnabled
            || analyticsState.rollingDisplayMode === 'raw'
        ) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        const yRange = this._opts.getYRange();
        if (xMin == null || xMax == null || !(xMax > xMin) || !yRange) return;

        const metrics = getOverlayPlotMetrics(this._opts.getContainer(), this._opts.getOverlayCanvas(), this._opts.getGrid(), scale);
        if (!metrics) return;
        const { plotLeft, plotTop, plotRight, plotBottom, plotWidth, plotHeight } = metrics;
        const ySpan = Math.max(1e-9, yRange.max - yRange.min);

        const toX = (ms: number) => plotLeft + ((ms - xMin) / (xMax - xMin)) * plotWidth;
        const toY = (v: number) => plotBottom - ((v - yRange.min) / ySpan) * plotHeight;

        ctx.save();
        const rollingPalette = getChartPalette();
        const selectedColumns = new Set(this._selectedColumns);
        for (const band of bands) {
            if (!selectedColumns.has(band.column)) continue;
            const n = band.ts.length;
            if (n < 2) continue;
            const bandColor = getColumnSeriesColor(band.column);

            ctx.fillStyle = this._applyAlphaToColor(bandColor, 0.18) || rollingPalette.rollingBandOuter;
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < n; i++) {
                const v = band.upper2[i];
                if (v == null) continue;
                const px = toX(band.ts[i]); const py = toY(v);
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            for (let i = n - 1; i >= 0; i--) {
                const v = band.lower2[i];
                if (v == null) continue;
                ctx.lineTo(toX(band.ts[i]), toY(v));
            }
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = this._applyAlphaToColor(bandColor, 0.32) || rollingPalette.rollingBandInner;
            ctx.beginPath();
            started = false;
            for (let i = 0; i < n; i++) {
                const v = band.upper1[i];
                if (v == null) continue;
                const px = toX(band.ts[i]); const py = toY(v);
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            for (let i = n - 1; i >= 0; i--) {
                const v = band.lower1[i];
                if (v == null) continue;
                ctx.lineTo(toX(band.ts[i]), toY(v));
            }
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = this._applyAlphaToColor(bandColor, 0.9) || rollingPalette.rollingMeanStroke;
            ctx.lineWidth = 1.5 * Math.min(scale.x, scale.y);
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            started = false;
            for (let i = 0; i < n; i++) {
                const v = band.mean[i];
                if (v == null) continue;
                const px = toX(band.ts[i]); const py = toY(v);
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    private _renderAnomalyRegionsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const regions = analyticsState.anomalyRegions;
        if (!regions || regions.length === 0 || !analyticsState.anomalyEnabled) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        if (xMin == null || xMax == null || !(xMax > xMin)) return;

        const metrics = getOverlayPlotMetrics(this._opts.getContainer(), this._opts.getOverlayCanvas(), this._opts.getGrid(), scale);
        if (!metrics) return;
        const { plotLeft, plotTop, plotRight, plotBottom, plotWidth, plotHeight, strokeScale } = metrics;

        ctx.save();
        const anomalyPalette = getChartPalette();
        ctx.lineWidth = 1 * strokeScale;

        if (analyticsState.anomalyGlobalEnabled && analyticsState.anomalySummaryStats) {
            const mergedRanges = regions
                .map((region) => [Math.max(xMin, region.start_ms), Math.min(xMax, region.end_ms)] as const)
                .filter(([start, end]) => start < end)
                .sort((a, b) => a[0] - b[0]);
            const unionRanges: Array<[number, number]> = [];
            for (const [start, end] of mergedRanges) {
                const prev = unionRanges[unionRanges.length - 1];
                if (prev && start <= prev[1]) prev[1] = Math.max(prev[1], end);
                else unionRanges.push([start, end]);
            }
            ctx.fillStyle = this._applyAlphaToColor(anomalyPalette.anomalyStroke, 0.09);
            for (const [rStart, rEnd] of unionRanges) {
                const sx = plotLeft + ((rStart - xMin) / (xMax - xMin)) * plotWidth;
                const ex = plotLeft + ((rEnd - xMin) / (xMax - xMin)) * plotWidth;
                ctx.fillRect(sx, plotTop, Math.max(2, ex - sx), plotHeight);
            }
        }

        for (const region of regions) {
            if (!this._selectedColumns.includes(region.column)) continue;
            const rStart = Math.max(xMin, region.start_ms);
            const rEnd = Math.min(xMax, region.end_ms);
            if (rStart >= rEnd) continue;

            const sx = plotLeft + ((rStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((rEnd - xMin) / (xMax - xMin)) * plotWidth;
            const w = Math.max(2, ex - sx);
            const regionColor = getColumnSeriesColor(region.column);
            ctx.fillStyle = this._applyAlphaToColor(regionColor, 0.16) || anomalyPalette.anomalyFill;
            ctx.strokeStyle = this._applyAlphaToColor(regionColor, 0.55) || anomalyPalette.anomalyStroke;
            ctx.fillRect(sx, plotTop, w, plotHeight);
            ctx.strokeRect(sx, plotTop, w, plotHeight);
        }
        ctx.restore();
    }

    private _renderAdaptiveFilterLinesToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const filters = this._opts.getAdaptiveLineFilters();
        const pending = this._opts.getPendingAdaptivePoint();
        if (filters.length === 0 && !pending) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        const yRange = this._opts.getYRange();
        if (xMin == null || xMax == null || !(xMax > xMin) || !yRange) return;

        const metrics = getOverlayPlotMetrics(this._opts.getContainer(), this._opts.getOverlayCanvas(), this._opts.getGrid(), scale);
        if (!metrics) return;
        const { plotLeft, plotTop, plotRight, plotBottom, plotWidth, plotHeight, strokeScale } = metrics;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // A filter may extend beyond the current Y viewport after filtering or
        // resize. Clip every adaptive primitive to the plot rectangle so it
        // cannot paint over ticks, labels, or neighboring controls.
        ctx.beginPath();
        ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
        ctx.clip();
        ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);
        const adaptivePalette = getChartPalette();

        for (const filter of filters) {
            if (!this._selectedColumns.includes(filter.column)) continue;
            const segStart = Math.max(xMin, Math.min(Number(filter.x1), Number(filter.x2)));
            const segEnd = Math.min(xMax, Math.max(Number(filter.x1), Number(filter.x2)));
            if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || !(segEnd > segStart)) continue;
            const y1 = buildAdaptiveLineY(filter, segStart);
            const y2 = buildAdaptiveLineY(filter, segEnd);
            if (!Number.isFinite(y1!) || !Number.isFinite(y2!)) continue;
            const sx = plotLeft + ((segStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((segEnd - xMin) / (xMax - xMin)) * plotWidth;
            const sy = plotBottom - ((y1! - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
            const ey = plotBottom - ((y2! - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
            const stroke = filter.keepAbove ? adaptivePalette.keepAboveStroke : adaptivePalette.keepBelowStroke;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2 * strokeScale;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            const fullLabel = `${filter.column} ${filter.keepAbove ? 'keep above' : 'keep below'}`;
            ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            const maxLabelWidth = Math.max(1, plotWidth - 12 * strokeScale);
            let label = fullLabel;
            if (ctx.measureText(label).width > maxLabelWidth) {
                const suffix = '…';
                while (label.length > 1 && ctx.measureText(label + suffix).width > maxLabelWidth) {
                    label = label.slice(0, -1);
                }
                label += suffix;
            }
            const labelWidth = Math.min(maxLabelWidth, ctx.measureText(label).width);
            const labelX = Math.max(plotLeft + 4 * strokeScale, Math.min(ex, plotRight - labelWidth - 6 * strokeScale));
            const labelY = Math.max(plotTop + 18 * strokeScale, Math.min(plotBottom - 8 * strokeScale, Math.min(sy, ey) - 6 * strokeScale));
            ctx.fillStyle = 'rgba(8, 12, 20, 0.82)';
            ctx.fillRect(labelX - 3 * strokeScale, labelY - 14 * strokeScale, labelWidth + 6 * strokeScale, 17 * strokeScale);
            ctx.fillStyle = stroke;
            ctx.fillText(label, labelX, labelY);
        }

        if (pending && this._selectedColumns.includes(pending.column)) {
            const px = Number(pending.x);
            const py = Number(pending.y);
            const hasTwoPoints = Number.isFinite(pending.x2) && Number.isFinite(pending.y2);
            if (hasTwoPoints) {
                const px2 = Number(pending.x2);
                const py2 = Number(pending.y2);
                const toSx = (v: number) => plotLeft + ((v - xMin) / (xMax - xMin)) * plotWidth;
                const toSy = (v: number) => plotBottom - ((v - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
                const sx1 = toSx(px); const sy1 = toSy(py);
                const sx2 = toSx(px2); const sy2 = toSy(py2);
                if (Number.isFinite(sx1) && Number.isFinite(sy1) && Number.isFinite(sx2) && Number.isFinite(sy2)) {
                    ctx.setLineDash([6 * strokeScale, 4 * strokeScale]);
                    ctx.strokeStyle = adaptivePalette.pendingPoint;
                    ctx.lineWidth = 2 * strokeScale;
                    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
                    ctx.setLineDash([]);
                    for (const [ex, ey] of [[sx1, sy1], [sx2, sy2]] as [number, number][]) {
                        ctx.fillStyle = adaptivePalette.pendingPoint;
                        ctx.beginPath(); ctx.arc(ex, ey, Math.max(3, 4 * strokeScale), 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = adaptivePalette.pendingPointBorder; ctx.lineWidth = Math.max(1, 1.5 * strokeScale); ctx.stroke();
                    }
                }
            } else if (Number.isFinite(px) && Number.isFinite(py) && px >= xMin && px <= xMax) {
                const sx = plotLeft + ((px - xMin) / (xMax - xMin)) * plotWidth;
                const sy = plotBottom - ((py - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = adaptivePalette.pendingPoint;
                    ctx.beginPath();
                    ctx.arc(sx, sy, Math.max(3, 4 * strokeScale), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = adaptivePalette.pendingPointBorder;
                    ctx.lineWidth = Math.max(1, 1.5 * strokeScale);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    private _renderAnnotationsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const timeAnnotations = getAnnotationsForPage('timeseries');
        if (!timeAnnotations || timeAnnotations.length === 0) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        if (xMin == null || xMax == null || !(xMax > xMin)) return;

        const metrics = getOverlayPlotMetrics(this._opts.getContainer(), this._opts.getOverlayCanvas(), this._opts.getGrid(), scale);
        if (!metrics) return;
        const { plotLeft, plotTop, plotRight, plotBottom, plotWidth, plotHeight, strokeScale } = metrics;

        ctx.save();
        ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, sans-serif`;
        const annotationPalette = getChartPalette();

        for (const ann of timeAnnotations) {
            if (!ann.timeRange) continue;
            const start = ann.timeRange.start;
            const end = ann.timeRange.end;

            if (end < xMin || start > xMax) continue;

            const visStart = Math.max(xMin, start);
            const visEnd = Math.min(xMax, end);
            const sx = plotLeft + ((visStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((visEnd - xMin) / (xMax - xMin)) * plotWidth;

            const color = ann.color || '#ffc041';

            if (ann.type === 'bookmark' || start === end) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2 * strokeScale;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(sx, plotTop);
                ctx.lineTo(sx, plotBottom);
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(sx, plotTop);
                ctx.lineTo(sx - 6 * strokeScale, plotTop - 10 * strokeScale);
                ctx.lineTo(sx + 6 * strokeScale, plotTop - 10 * strokeScale);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = annotationPalette.annotationLabel;
                ctx.textAlign = 'left';
                ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
            } else if (ann.type === 'note' || ann.type === 'region') {
                const fillColor = this._applyAlphaToColor(color, 0.15);
                ctx.fillStyle = fillColor;
                ctx.fillRect(sx, plotTop, ex - sx, plotHeight);

                ctx.strokeStyle = color;
                ctx.lineWidth = 1 * strokeScale;
                ctx.setLineDash([4 * strokeScale, 2 * strokeScale]);
                ctx.strokeRect(sx, plotTop, ex - sx, plotHeight);
                ctx.setLineDash([]);

                ctx.fillStyle = color;
                ctx.textAlign = 'left';
                ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
            }
        }

        ctx.restore();
    }

    private _applyAlphaToColor(color: string, alpha: number): string {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
        if (color.startsWith('rgb(')) {
            return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
        }
        return `${color}26`;
    }
}
