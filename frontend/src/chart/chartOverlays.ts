/**
 * ChartOverlays — renders rolling bands, anomaly regions, adaptive filter
 * lines, and annotations on a transparent canvas overlaying the chart.
 * Extracted from DataChart.ts to reduce its size and improve maintainability.
 */

import { appState } from '../state.js';
import { buildAdaptiveLineY } from '../state.js';

const CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 };

interface ChartOverlayOptions {
    getXMin: () => number | null;
    getXMax: () => number | null;
    getContainer: () => HTMLElement | null;
    getOverlayCanvas: () => HTMLCanvasElement | null;
    getYRange: () => { min: number; max: number } | null;
    getPendingAdaptivePoint: () => { column: string; x: number; y: number; x2?: number; y2?: number } | null;
}

export class ChartOverlays {
    private _opts: ChartOverlayOptions;

    constructor(opts: ChartOverlayOptions) {
        this._opts = opts;
    }

    renderAll(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        this._renderRollingBandsToCtx(ctx, scale);
        this._renderAnomalyRegionsToCtx(ctx, scale);
        this._renderAdaptiveFilterLinesToCtx(ctx, scale);
        this._renderAnnotationsToCtx(ctx, scale);
    }

    private _renderRollingBandsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const bands = appState.rollingBands;
        if (!bands || bands.length === 0 || !appState.rollingEnabled) return;
        const container = this._opts.getContainer();
        if (!container) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        const yRange = this._opts.getYRange();
        if (xMin == null || xMax == null || !(xMax > xMin) || !yRange) return;

        const rect = container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._opts.getOverlayCanvas()?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._opts.getOverlayCanvas()?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const ySpan = Math.max(1e-9, yRange.max - yRange.min);

        const toX = (ms: number) => plotLeft + ((ms - xMin) / (xMax - xMin)) * plotWidth;
        const toY = (v: number) => plotBottom - ((v - yRange.min) / ySpan) * plotHeight;

        ctx.save();
        for (const band of bands) {
            const n = band.ts.length;
            if (n < 2) continue;

            ctx.fillStyle = 'rgba(100, 180, 255, 0.22)';
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

            ctx.fillStyle = 'rgba(100, 180, 255, 0.38)';
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

            ctx.strokeStyle = 'rgba(180, 220, 255, 0.90)';
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
        const regions = appState.anomalyRegions;
        if (!regions || regions.length === 0 || !appState.anomalyEnabled) return;
        const container = this._opts.getContainer();
        if (!container) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        if (xMin == null || xMax == null || !(xMax > xMin)) return;

        const rect = container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._opts.getOverlayCanvas()?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._opts.getOverlayCanvas()?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);

        ctx.save();
        ctx.fillStyle = 'rgba(255, 74, 110, 0.15)';
        ctx.strokeStyle = 'rgba(255, 74, 110, 0.5)';
        ctx.lineWidth = 1 * Math.min(scale.x, scale.y);

        for (const region of regions) {
            const rStart = Math.max(xMin, region.start_ms);
            const rEnd = Math.min(xMax, region.end_ms);
            if (rStart >= rEnd) continue;

            const sx = plotLeft + ((rStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((rEnd - xMin) / (xMax - xMin)) * plotWidth;
            const w = Math.max(2, ex - sx);
            const plotHeight = plotBottom - plotTop;
            ctx.fillRect(sx, plotTop, w, plotHeight);
            ctx.strokeRect(sx, plotTop, w, plotHeight);
        }
        ctx.restore();
    }

    private _renderAdaptiveFilterLinesToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const filters = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters : [];
        const pending = this._opts.getPendingAdaptivePoint();
        if (filters.length === 0 && !pending) return;
        const container = this._opts.getContainer();
        if (!container) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        const yRange = this._opts.getYRange();
        if (xMin == null || xMax == null || !(xMax > xMin) || !yRange) return;

        const rect = container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._opts.getOverlayCanvas()?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._opts.getOverlayCanvas()?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const strokeScale = Math.min(scale.x, scale.y);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);

        for (const filter of filters) {
            if (!appState.selectedCols?.includes(filter.column)) continue;
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
            const stroke = filter.keepAbove ? 'rgba(0, 200, 150, 0.95)' : 'rgba(255, 74, 110, 0.95)';
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2 * strokeScale;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            const label = `${filter.column} ${filter.keepAbove ? 'keep above' : 'keep below'}`;
            ctx.fillStyle = stroke;
            ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, Math.min(ex, plotRight - 140 * strokeScale), Math.min(sy, ey) - 4 * strokeScale);
        }

        if (pending && appState.selectedCols?.includes(pending.column)) {
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
                    ctx.strokeStyle = 'rgba(0, 212, 255, 0.85)';
                    ctx.lineWidth = 2 * strokeScale;
                    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
                    ctx.setLineDash([]);
                    for (const [ex, ey] of [[sx1, sy1], [sx2, sy2]] as [number, number][]) {
                        ctx.fillStyle = 'rgba(0, 212, 255, 0.95)';
                        ctx.beginPath(); ctx.arc(ex, ey, Math.max(3, 4 * strokeScale), 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, 1.5 * strokeScale); ctx.stroke();
                    }
                }
            } else if (Number.isFinite(px) && Number.isFinite(py) && px >= xMin && px <= xMax) {
                const sx = plotLeft + ((px - xMin) / (xMax - xMin)) * plotWidth;
                const sy = plotBottom - ((py - yRange.min) / Math.max(1e-9, yRange.max - yRange.min)) * plotHeight;
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(0, 212, 255, 0.95)';
                    ctx.beginPath();
                    ctx.arc(sx, sy, Math.max(3, 4 * strokeScale), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.lineWidth = Math.max(1, 1.5 * strokeScale);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    private _renderAnnotationsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const annotations = (window as any).__edatimeAnnotations;
        if (!annotations || typeof annotations.getAnnotationsForPage !== 'function') return;

        const timeAnnotations = annotations.getAnnotationsForPage('timeseries');
        if (!timeAnnotations || timeAnnotations.length === 0) return;
        const container = this._opts.getContainer();
        if (!container) return;

        const xMin = this._opts.getXMin();
        const xMax = this._opts.getXMax();
        if (xMin == null || xMax == null || !(xMax > xMin)) return;

        const rect = container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._opts.getOverlayCanvas()?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._opts.getOverlayCanvas()?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const strokeScale = Math.min(scale.x, scale.y);

        ctx.save();
        ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, sans-serif`;

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

                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
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