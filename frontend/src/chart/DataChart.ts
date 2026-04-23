/**
 * DataChart — ChartGPU WebGPU adapter with drawing overlay,
 * mouse-selection zoom, and PNG / SVG / HTML export.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';
import { DEBUG, dbg } from '../debug.js';
import { escapeHtml, downloadUrl, downloadBlob } from '../utils/dom.js';
import { defaultGpuPowerPreference } from '../utils/platform.js';
import { formatTwoDecimals } from '../formatUtils.js';
import { appState, getSeriesColor, buildAdaptiveLineY } from '../state.js';
import type { AdaptiveLineFilter, ChartTextOverlays, DataObject, FilteredDataObject } from '../types.js';
import {
    VIRIDIS, analyzeColorValues, baseSeriesName,
    buildColorizedSeries, categoryColorFor, colorForScaleValue,
} from './colorScale.js';
import {
    niceLinearTicks, niceTimeTicks, formatTimeTick, formatTimeTooltip,
} from './ticks.js';
import {
    type GridLayout,
    createCanvasOverlay, ensureRelativePosition,
    initBoxZoom,
} from './chartInteractions.js';

const CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 };

/* ── Drawing item ──────────────────────────────────────── */

interface DrawItem {
    type: string;
    color: string;
    width: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

/* ── DataChart class ──────────────────────────────────── */

export class DataChart {
    containerId: string;
    onZoomCallback: ((start: number, end: number, sourceKind: string) => void) | null;
    onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null;
    onZoomOutCallback: (() => void) | null;
    chartInstance: any;

    _xMin: number | null = null;
    _xMax: number | null = null;
    _container: HTMLElement | null = null;
    _selectionBox: HTMLElement | null = null;
    _yMin: number | null = null;
    _yMax: number | null = null;
    _yAuto = true;
    _lastDataYMin: number | null = null;
    _lastDataYMax: number | null = null;
    _lastSeriesList: any[] | null = null;
    _lastXDomainMin: number | null = null;
    _lastXDomainMax: number | null = null;

    _chartTitle = '';
    _xAxisLabel = '';
    _yAxisLabel = '';
    _titleEl: HTMLElement | null = null;
    _xLabelEl: HTMLElement | null = null;
    _yLabelEl: HTMLElement | null = null;

    _overlayCanvas: HTMLCanvasElement | null = null;
    _overlayCtx: CanvasRenderingContext2D | null = null;
    _drawingResizeObserver: ResizeObserver | null = null;
    _chartResizeObserver: ResizeObserver | null = null;
    _drawings: DrawItem[] = [];
    _currentDraw: DrawItem | null = null;
    _drawMode: string = 'none';
    _drawColor = '#ff0055';
    _drawWidth = 2;
    _drawingRafId: number | null = null;

    constructor(
        containerId: string,
        onZoomCallback: ((start: number, end: number, sourceKind: string) => void) | null,
        onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null = null,
        onZoomOutCallback: (() => void) | null = null,
    ) {
        this.containerId = containerId;
        this.onZoomCallback = onZoomCallback;
        this.onYRangeCallback = onYRangeCallback;
        this.onZoomOutCallback = onZoomOutCallback;
        this.chartInstance = null;
    }

    /* ── Public surface ─────────────────────────────────── */

    destroy(): void {
        if (this._drawingRafId !== null) {
            cancelAnimationFrame(this._drawingRafId);
            this._drawingRafId = null;
        }
        this._drawingResizeObserver?.disconnect();
        this._drawingResizeObserver = null;
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = null;
        this.chartInstance = null;
    }

    setChartText(title: string, xLabel: string, yLabel: string): void {
        this._chartTitle = String(title ?? '').trim();
        this._xAxisLabel = String(xLabel ?? '').trim();
        this._yAxisLabel = String(yLabel ?? '').trim();
        this._syncTextOverlays();
    }

    setDrawMode(mode: string, color?: string, width?: number): void {
        this._drawMode = mode;
        if (color) this._drawColor = color;
        if (width) this._drawWidth = width;
        if (this._overlayCanvas) {
            this._overlayCanvas.style.pointerEvents = mode === 'none' ? 'none' : 'auto';
        }
    }

    clearDrawings(): void {
        this._drawings = [];
        this._currentDraw = null;
        this._renderDrawings();
    }

    requestOverlayRender(): void {
        this._renderDrawings();
    }

    resize(): void {
        this.chartInstance?.resize?.();
        this._renderDrawings();
    }

    /** Schedule a drawing render on the next animation frame (coalesces rapid calls). */
    private _scheduleDrawingRender(): void {
        if (this._drawingRafId !== null) return;
        this._drawingRafId = requestAnimationFrame(() => {
            this._drawingRafId = null;
            this._renderDrawings();
        });
    }

    setXRange(minMs: number, maxMs: number): void {
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return;
        this._xMin = minMs;
        this._xMax = maxMs;
        if (DEBUG) dbg('setXRange', { minMs, maxMs });
    }

    async init(): Promise<void> {
        const container = document.getElementById(this.containerId);
        this._container = container;
        this.chartInstance = await createChart(container!, {
            grid: CHART_GRID,
            xAxis: { type: 'time' },
            yAxis: { type: 'value' },
            legend: { show: true, position: 'right' },
            series: [],
            powerPreference: defaultGpuPowerPreference(),
        });
        this._chartResizeObserver?.disconnect();
        this._chartResizeObserver = new ResizeObserver(() => this.resize());
        this._chartResizeObserver.observe(container!);
        this._initDrawingOverlay();
        this._initTextOverlays();
        this._initMouseSelectionZoom();
        requestAnimationFrame(() => this.resize());
    }

    supportsZoomControls(): boolean {
        return !!this.chartInstance;
    }

    getXDomain(): { min: number; max: number } | null {
        if (Number.isFinite(this._lastXDomainMin) && Number.isFinite(this._lastXDomainMax) && this._lastXDomainMax! > this._lastXDomainMin!) {
            return { min: this._lastXDomainMin!, max: this._lastXDomainMax! };
        }
        return null;
    }

    setYRange(min: number, max: number): void {
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this._applyYRange(min, max, 'api', false);
    }

    getYRange(): { min: number; max: number } | null {
        if (Number.isFinite(this._lastDataYMin) && Number.isFinite(this._lastDataYMax) && this._lastDataYMax! > this._lastDataYMin!) {
            return { min: this._lastDataYMin!, max: this._lastDataYMax! };
        }
        if (Number.isFinite(this._yMin) && Number.isFinite(this._yMax) && this._yMax! > this._yMin!) {
            return { min: this._yMin!, max: this._yMax! };
        }
        return null;
    }

    cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null {
        if (!this._container) return null;
        if (!Number.isFinite(this._xMin) || !Number.isFinite(this._xMax) || this._xMax! <= this._xMin!) return null;
        const yRange = this.getYRange();
        if (!yRange || yRange.max <= yRange.min) return null;

        const rect = this._container.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const plotLeft = CHART_GRID.left;
        const plotTop = CHART_GRID.top;
        const plotRight = Math.max(plotLeft + 1, rect.width - CHART_GRID.right);
        const plotBottom = Math.max(plotTop + 1, rect.height - CHART_GRID.bottom);
        if (localX < plotLeft || localX > plotRight || localY < plotTop || localY > plotBottom) return null;

        const xNorm = (localX - plotLeft) / Math.max(1, plotRight - plotLeft);
        const yNorm = (localY - plotTop) / Math.max(1, plotBottom - plotTop);
        return {
            x: this._xMin! + xNorm * (this._xMax! - this._xMin!),
            y: yRange.max - yNorm * (yRange.max - yRange.min),
        };
    }

    zoomY(_factor: number, _anchorNormalized = 0.5): void { /* intentionally blank */ }
    resetYRange(): void { /* intentionally blank */ }

    fitYToData(): void {
        if (!Number.isFinite(this._lastDataYMin) || !Number.isFinite(this._lastDataYMax)) return;
        if (this.onYRangeCallback) this.onYRangeCallback(this._lastDataYMin!, this._lastDataYMax!, 'data');
    }

    onCrosshairMove(callback: (data: any) => void): void {
        this.chartInstance?.on('crosshairMove', callback);
    }

    onClick(callback: (data: any) => void): void {
        this.chartInstance?.on('click', callback);
    }

    /* ── Data update ────────────────────────────────────── */

    updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void {
        if (!this.chartInstance) return;
        const showMarkers = (dataObj as any)?._meta?.downsampled === false;
        const prevVisibility = this._getVisibilityByBaseNameFromChart();

        let dataYMin = Number.POSITIVE_INFINITY;
        let dataYMax = Number.NEGATIVE_INFINITY;
        let xDomainMin = Number.POSITIVE_INFINITY;
        let xDomainMax = Number.NEGATIVE_INFINITY;
        const seriesAnnotations: any[] = [];

        const seriesList = columns
            .filter((colName) => {
                const name = String(colName || '').toLowerCase();
                if (name === 'ts' || name === 'timestamp' || name === 'time') return false;
                return (dataObj as any).values?.[colName] || (dataObj as any).series?.[colName];
            })
            .map((colName, idx) => {
                const seriesData = (dataObj as any).series?.[colName];
                const yValues = seriesData ? seriesData.y : (dataObj as any).values[colName];
                const xValues = seriesData ? seriesData.x : (dataObj as any).ts;

                const points: [number, number][] = [];
                const n = Math.min(xValues?.length ?? 0, yValues?.length ?? 0);
                for (let i = 0; i < n; i++) {
                    const x = Number(xValues[i]);
                    const y = Number(yValues[i]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    points.push([x, y]);
                    if (x < xDomainMin) xDomainMin = x;
                    if (x > xDomainMax) xDomainMax = x;
                    if (y < dataYMin) dataYMin = y;
                    if (y > dataYMax) dataYMax = y;
                }

                const visible = prevVisibility.get(colName) !== false;
                const seriesColors = Array.isArray((dataObj as any).colorByColumn?.[colName])
                    ? (dataObj as any).colorByColumn[colName]
                    : (dataObj as any).color;
                const wantsColorBy = !!appState.selectedColorColumn
                    && Array.isArray(seriesColors)
                    && seriesColors.length === points.length;

                if (wantsColorBy) {
                    return [{ __colorCandidate: true, colName, idx, visible, points, colorValues: seriesColors }];
                }

                const numColIdx = appState.numericCols.indexOf(colName);
                const color = getSeriesColor(colName, numColIdx >= 0 ? numColIdx : idx);
                const lineSeries = { type: 'line' as const, name: colName, color, visible, data: points };
                if (showMarkers && visible) {
                    for (const pt of points) {
                        seriesAnnotations.push({ type: 'point', x: pt[0], y: pt[1], layer: 'aboveSeries', marker: { symbol: 'circle', size: 5, style: { color } } });
                    }
                }
                return [lineSeries];
            });

        const colorColumn = appState.selectedColorColumn;
        const colorDecoratedSeries: any[] = [];
        const colorbarWrap = document.getElementById('timeseries-colorbar-wrap');
        const categoricalWrap = document.getElementById('timeseries-categorical-wrap');
        if (colorbarWrap) { colorbarWrap.hidden = true; colorbarWrap.style.display = 'none'; }
        if (categoricalWrap) { categoricalWrap.hidden = true; categoricalWrap.style.display = 'none'; }

        const colorCandidates: any[] = [];
        const baseSeriesList: any[] = [];
        for (const entry of seriesList.flat()) {
            if ((entry as any)?.__colorCandidate) colorCandidates.push(entry);
            else baseSeriesList.push(entry);
        }

        const displayedColorValues = colorCandidates.flatMap((e) => e.colorValues || []);
        const scaleInfo = colorColumn ? analyzeColorValues(displayedColorValues) : null;

        if (colorColumn && scaleInfo && colorCandidates.length > 0) {
            for (const entry of colorCandidates) {
                const { series: colorSeries, annotations: colorAnnotations } = buildColorizedSeries(
                    entry.colName, entry.points, entry.colorValues, scaleInfo, entry.visible, showMarkers,
                );
                colorDecoratedSeries.push(...colorSeries);
                seriesAnnotations.push(...colorAnnotations);
            }

            if (scaleInfo.isNumeric) {
                if (colorbarWrap) {
                    colorbarWrap.hidden = false;
                    colorbarWrap.style.display = 'grid';
                    document.getElementById('timeseries-colorbar-name')!.textContent = colorColumn;
                    document.getElementById('timeseries-colorbar-min')!.textContent = formatTwoDecimals(scaleInfo.min);
                    document.getElementById('timeseries-colorbar-max')!.textContent = formatTwoDecimals(scaleInfo.max);
                    document.getElementById('timeseries-colorbar')!.style.background = `linear-gradient(90deg, ${VIRIDIS.join(',')})`;
                }
            } else if (categoricalWrap) {
                categoricalWrap.hidden = false;
                categoricalWrap.style.display = 'grid';
                document.getElementById('timeseries-categorical-name')!.textContent = colorColumn;
                const legend = document.getElementById('timeseries-categorical-legend')!;
                legend.innerHTML = '';
                scaleInfo.categories.forEach((category) => {
                    const item = document.createElement('div');
                    item.className = 'scatter-distribution-legend-item';
                    item.innerHTML = `<span class="scatter-distribution-legend-swatch" style="background: ${categoryColorFor(category, scaleInfo.categories)}"></span><span>${String(category)}</span>`;
                    legend.appendChild(item);
                });
            }
        }

        const flattenedSeriesList = [...baseSeriesList, ...colorDecoratedSeries];
        this._lastSeriesList = flattenedSeriesList;
        this._lastXDomainMin = Number.isFinite(xDomainMin) ? xDomainMin : null;
        this._lastXDomainMax = Number.isFinite(xDomainMax) ? xDomainMax : null;

        if (Number.isFinite(dataYMin) && Number.isFinite(dataYMax)) {
            this._lastDataYMin = dataYMin;
            this._lastDataYMax = dataYMax;
            if (this.onYRangeCallback) this.onYRangeCallback(dataYMin, dataYMax, 'data');
        }

        if (flattenedSeriesList.length > 0) {
            const tooltipFormatter = (params: any): string => {
                const rawList: any[] = Array.isArray(params) ? params : [params];
                const seen = new Set<string>();
                const list = rawList.filter((p) => {
                    const base = baseSeriesName(p?.seriesName ?? '');
                    if (!base || seen.has(base)) return false;
                    seen.add(base);
                    return true;
                });
                if (list.length === 0) return '';
                const x = Number(list[0]?.value?.[0]);
                const spanMs = Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax)
                    ? Math.max(1, xDomainMax - xDomainMin) : 86400_000;
                const header = Number.isFinite(x) ? formatTimeTooltip(x, spanMs) : '';
                const rows = list.map((p: any) => {
                    const name = escapeHtml(baseSeriesName(p?.seriesName ?? 'series') || 'series');
                    const y = formatTwoDecimals(p?.value?.[1]);
                    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(y)}</span></div>`;
                }).join('');
                return header ? `<div style="opacity:0.8;margin-bottom:6px;">${escapeHtml(header)}</div>${rows}` : rows;
            };

            const nextOption = {
                grid: CHART_GRID,
                xAxis: {
                    type: 'time',
                    min: Number.isFinite(xDomainMin) ? xDomainMin : undefined,
                    max: Number.isFinite(xDomainMax) ? xDomainMax : undefined,
                    tickFormatter: (value: number) => formatTimeTick(
                        value,
                        Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax)
                            ? Math.max(1, xDomainMax - xDomainMin) : 86400_000,
                    ),
                },
                yAxis: this._buildYAxisOption(),
                tooltip: { show: true, trigger: 'axis', formatter: tooltipFormatter },
                series: flattenedSeriesList,
                annotations: seriesAnnotations,
            };
            try {
                this.chartInstance.setOption(nextOption);
                if (this.chartInstance.getZoomRange && this.chartInstance.setZoomRange) {
                    this.chartInstance.setZoomRange(0, 100, 'api');
                }
            } catch (e) {
                console.error('[edatime:chart] setOption failed', e);
            }
        }

        this._renderDrawings();
    }

    /* ── Export ──────────────────────────────────────────── */

    async exportPNG(): Promise<void> {
        const canvas = await this._getCombinedExportCanvas(true);
        if (!canvas) return;
        downloadUrl(canvas.toDataURL('image/png'), 'edatime_chart.png');
    }

    async exportSVG(): Promise<void> {
        const canvas = await this._getCombinedExportCanvas(false);
        if (!canvas) return;
        const pngData = canvas.toDataURL('image/png');
        const w = canvas.width || 1;
        const h = canvas.height || 1;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n`;
        svg += `  <image href="${pngData}" x="0" y="0" width="${w}" height="${h}" />\n`;
        svg += this.exportSVGDrawings(w, h);
        svg += '</svg>';
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, 'edatime_chart.svg');
    }

    async exportHTML(): Promise<void> {
        const canvas = await this._getCombinedExportCanvas(true);
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const html = `<!DOCTYPE html><html><head><title>EdaTime Export</title><style>body{margin:0;background:#1a1a1a;display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto;box-shadow:0 4px 12px rgba(0,0,0,0.5)}</style></head><body><img src="${dataUrl}" alt="EdaTime Chart"/></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, 'edatime_chart.html');
    }

    exportSVGDrawings(viewWidth: number, viewHeight: number): string {
        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);
        if (allDraws.length === 0) return '';
        const baseW = this._overlayCanvas?.width || this._container?.getBoundingClientRect?.().width || viewWidth || 1;
        const baseH = this._overlayCanvas?.height || this._container?.getBoundingClientRect?.().height || viewHeight || 1;
        const scaleX = viewWidth / (baseW || 1);
        const scaleY = viewHeight / (baseH || 1);
        const strokeScale = Math.min(scaleX, scaleY);
        let body = '';
        for (const item of allDraws) {
            if (item.type === 'arrow') {
                body += this._drawArrowSVG(item, scaleX, scaleY);
            } else if (item.type === 'box') {
                const x = Math.min(item.startX, item.endX) * scaleX;
                const y = Math.min(item.startY, item.endY) * scaleY;
                const w = Math.abs(item.endX - item.startX) * scaleX;
                const h = Math.abs(item.endY - item.startY) * scaleY;
                body += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${item.color}" stroke-width="${item.width * strokeScale}" stroke-linecap="round" stroke-linejoin="round" />\n`;
            }
        }
        return body;
    }

    /* ── Private helpers ────────────────────────────────── */

    private _applyYRange(min: number, max: number, sourceKind: string, setAuto: boolean | null): void {
        if (setAuto === true) this._yAuto = true;
        if (setAuto === false) this._yAuto = false;
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this._yMin = min;
        this._yMax = max;
        if (this.onYRangeCallback) this.onYRangeCallback(min, max, sourceKind);
    }

    private _buildYAxisOption() {
        return { type: 'value', tickFormatter: (value: number) => formatTwoDecimals(value) };
    }

    private _getVisibilityByBaseNameFromChart(): Map<string, boolean> {
        const vis = new Map<string, boolean>();
        const series = this.chartInstance?.options?.series;
        if (!Array.isArray(series)) return vis;
        for (const s of series) {
            const name = typeof s?.name === 'string' ? s.name : '';
            const base = baseSeriesName(name);
            if (!base) continue;
            vis.set(base, s.visible !== false);
        }
        return vis;
    }

    /* ── Text overlays ──────────────────────────────────── */

    private _initTextOverlays(): void {
        if (!this._container) return;
        const container = this._container;
        ensureRelativePosition(container);
        const mk = (cls: string): HTMLElement => {
            const el = document.createElement('div');
            el.className = `chart-text-overlay ${cls}`;
            el.style.display = 'none';
            container.appendChild(el);
            return el;
        };
        this._titleEl = mk('chart-title-overlay');
        this._xLabelEl = mk('chart-xlabel-overlay');
        this._yLabelEl = mk('chart-ylabel-overlay');
        this._syncTextOverlays();
    }

    private _syncTextOverlays(): void {
        const set = (el: HTMLElement | null, text: string) => {
            if (!el) return;
            const t = String(text ?? '').trim();
            el.textContent = t;
            el.style.display = t ? 'block' : 'none';
        };
        set(this._titleEl, this._chartTitle);
        set(this._xLabelEl, this._xAxisLabel);
        set(this._yLabelEl, this._yAxisLabel);
    }

    /* ── Drawing overlay ────────────────────────────────── */

    private _initDrawingOverlay(): void {
        if (!this._container) return;
        const container = this._container;
        ensureRelativePosition(container);

        const { canvas, observer } = createCanvasOverlay(container, () => this._renderDrawings());
        this._drawingResizeObserver = observer;
        this._overlayCanvas = canvas;
        this._overlayCtx = canvas.getContext('2d');

        canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || this._drawMode === 'none') return;
            const rect = canvas.getBoundingClientRect();
            this._currentDraw = { type: this._drawMode, color: this._drawColor, width: this._drawWidth, startX: e.clientX - rect.left, startY: e.clientY - rect.top, endX: e.clientX - rect.left, endY: e.clientY - rect.top };
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!this._currentDraw || this._drawMode === 'none') return;
            const rect = canvas.getBoundingClientRect();
            this._currentDraw.endX = e.clientX - rect.left;
            this._currentDraw.endY = e.clientY - rect.top;
            this._scheduleDrawingRender();
        });
        canvas.addEventListener('pointerup', (e) => {
            if (!this._currentDraw || this._drawMode === 'none') return;
            this._drawings.push(this._currentDraw);
            this._currentDraw = null;
            canvas.releasePointerCapture(e.pointerId);
            this._renderDrawings();
        });
        canvas.addEventListener('pointercancel', () => { this._currentDraw = null; this._renderDrawings(); });
    }

    /* ── Drawing render ─────────────────────────────────── */

    private _drawArrow(ctx: CanvasRenderingContext2D, sx: number, sy: number, ex: number, ey: number): void {
        const headlen = 10;
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    private _renderDrawings(): void {
        if (!this._overlayCtx || !this._overlayCanvas) return;
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);
        this._renderRollingBandsToCtx(ctx, { x: 1, y: 1 });
        this._renderAnomalyRegionsToCtx(ctx, { x: 1, y: 1 });
        this._renderAdaptiveFilterLinesToCtx(ctx, { x: 1, y: 1 });
        this._renderAnnotationsToCtx(ctx, { x: 1, y: 1 });
        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);
        for (const item of allDraws) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (item.type === 'arrow') this._drawArrow(ctx, item.startX, item.startY, item.endX, item.endY);
            else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(Math.min(item.startX, item.endX), Math.min(item.startY, item.endY), Math.abs(item.endX - item.startX), Math.abs(item.endY - item.startY));
                ctx.stroke();
            }
        }
    }

    private _renderRollingBandsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const bands = appState.rollingBands;
        if (!bands || bands.length === 0 || !appState.rollingEnabled) return;
        if (!this._container) return;

        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        const yRange = this.getYRange();
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin) || !yRange) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
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

            // 2-sigma band (lighter)
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

            // 1-sigma band (slightly darker)
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

            // Mean line
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
        if (!this._container) return;

        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin)) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
        const plotLeft = CHART_GRID.left * scale.x;
        const plotTop = CHART_GRID.top * scale.y;
        const plotRight = Math.max(plotLeft + 1, (cssWidth - CHART_GRID.right) * scale.x);
        const plotBottom = Math.max(plotTop + 1, (cssHeight - CHART_GRID.bottom) * scale.y);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);

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

            ctx.fillRect(sx, plotTop, w, plotHeight);
            ctx.strokeRect(sx, plotTop, w, plotHeight);
        }
        ctx.restore();
    }

    private _renderAdaptiveFilterLinesToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const filters = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters : [];
        const pending = appState.pendingAdaptivePoint;
        if (filters.length === 0 && !pending) return;
        if (!this._container) return;

        const visibleCols = new Set(appState.selectedCols || []);
        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        const yRange = this.getYRange();
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin) || !yRange) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
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
            if (!visibleCols.has(filter?.column)) continue;
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

        if (pending && visibleCols.has(pending.column)) {
            const px = Number(pending.x);
            const py = Number(pending.y);
            const hasTwoPoints = Number.isFinite(pending.x2) && Number.isFinite(pending.y2);
            if (hasTwoPoints) {
                // Draw preview line between the two pending points.
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
                    // Draw dots at both endpoints.
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

    /** Render annotations (notes, bookmarks) on the overlay. */
    private _renderAnnotationsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        // Import annotations module dynamically to avoid circular dependencies
        const annotations = (window as any).__edatimeAnnotations;
        if (!annotations || typeof annotations.getAnnotationsForPage !== 'function') return;

        const timeAnnotations = annotations.getAnnotationsForPage('timeseries');
        if (!timeAnnotations || timeAnnotations.length === 0) return;
        if (!this._container) return;

        const xMin = Number(this._xMin);
        const xMax = Number(this._xMax);
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin)) return;

        const rect = this._container.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width || this._overlayCanvas?.width || 1);
        const cssHeight = Math.max(1, rect.height || this._overlayCanvas?.height || 1);
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

            // Skip if completely outside view
            if (end < xMin || start > xMax) continue;

            const visStart = Math.max(xMin, start);
            const visEnd = Math.min(xMax, end);
            const sx = plotLeft + ((visStart - xMin) / (xMax - xMin)) * plotWidth;
            const ex = plotLeft + ((visEnd - xMin) / (xMax - xMin)) * plotWidth;

            const color = ann.color || '#ffc041';

            if (ann.type === 'bookmark' || start === end) {
                // Bookmark: vertical line
                ctx.strokeStyle = color;
                ctx.lineWidth = 2 * strokeScale;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(sx, plotTop);
                ctx.lineTo(sx, plotBottom);
                ctx.stroke();

                // Bookmark marker
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(sx, plotTop);
                ctx.lineTo(sx - 6 * strokeScale, plotTop - 10 * strokeScale);
                ctx.lineTo(sx + 6 * strokeScale, plotTop - 10 * strokeScale);
                ctx.closePath();
                ctx.fill();

                // Title
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.textAlign = 'left';
                ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
            } else if (ann.type === 'note' || ann.type === 'region') {
                // Note/region: shaded area
                ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('##', '#');
                if (!ctx.fillStyle.includes('rgba')) {
                    ctx.fillStyle = `${color}26`; // 15% opacity
                }
                ctx.fillRect(sx, plotTop, ex - sx, plotHeight);

                // Border
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 * strokeScale;
                ctx.setLineDash([4 * strokeScale, 2 * strokeScale]);
                ctx.strokeRect(sx, plotTop, ex - sx, plotHeight);
                ctx.setLineDash([]);

                // Title label
                ctx.fillStyle = color;
                ctx.textAlign = 'left';
                ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
            }
        }

        ctx.restore();
    }

    /* ── Mouse selection zoom ───────────────────────────── */

    private _initMouseSelectionZoom(): void {
        if (!this._container) return;
        const container = this._container;

        this._selectionBox = initBoxZoom({
            container,
            grid: CHART_GRID,
            getXRange: () => ({ min: this._xMin ?? 0, max: this._xMax ?? 0 }),
            onZoom: (min, max) => this.onZoomCallback?.(min, max, 'user'),
            shouldIgnore: (e) => this._drawMode !== 'none' || e.ctrlKey,
            onDblClick: () => this.onZoomOutCallback?.(),
        });
    }

    /* ── Export internals ───────────────────────────────── */

    private _getExportViewport() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this._container?.getBoundingClientRect?.();
        const cssWidth = Math.max(1, Math.round(rect?.width ?? this._overlayCanvas?.width ?? 1));
        const cssHeight = Math.max(1, Math.round(rect?.height ?? this._overlayCanvas?.height ?? 1));
        return { cssWidth, cssHeight, width: Math.max(1, Math.round(cssWidth * dpr)), height: Math.max(1, Math.round(cssHeight * dpr)), dpr };
    }

    private _getExportDomains() {
        const xMin = Number.isFinite(this._xMin) ? this._xMin! : this._lastXDomainMin;
        const xMax = Number.isFinite(this._xMax) ? this._xMax! : this._lastXDomainMax;
        const yRange = this.getYRange();
        const yMin = yRange?.min;
        const yMax = yRange?.max;
        if (!Number.isFinite(xMin!) || !Number.isFinite(xMax!) || xMax! <= xMin!) return null;
        if (!Number.isFinite(yMin!) || !Number.isFinite(yMax!) || yMax! <= yMin!) return null;
        const ySpan = yMax! - yMin!;
        const pad = ySpan * 0.04;
        return { xMin: xMin!, xMax: xMax!, yMin: yMin! - pad, yMax: yMax! + pad };
    }

    private async _getCombinedExportCanvas(includeDrawings: boolean): Promise<HTMLCanvasElement | null> {
        if (!this._container) return null;
        const domains = this._getExportDomains();
        if (!domains) return null;
        const viewport = this._getExportViewport();
        const outCanvas = document.createElement('canvas');
        outCanvas.width = viewport.width;
        outCanvas.height = viewport.height;
        this._renderExportChartToCanvas(outCanvas, viewport, domains, includeDrawings);
        return outCanvas;
    }

    private _renderExportChartToCanvas(
        canvas: HTMLCanvasElement,
        viewport: { cssWidth: number; cssHeight: number; width: number; height: number },
        domains: { xMin: number; xMax: number; yMin: number; yMax: number },
        includeDrawings: boolean,
    ): void {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { cssWidth, cssHeight, width, height } = viewport;
        const scale = width / cssWidth;
        const styles = getComputedStyle(document.body);
        const bg = styles.getPropertyValue('--bg').trim() || '#080a10';
        const surface2 = styles.getPropertyValue('--surface-2').trim() || '#181c2a';
        const border = styles.getPropertyValue('--border').trim() || '#272d45';
        const borderHi = styles.getPropertyValue('--border-hi').trim() || '#363f62';
        const text = styles.getPropertyValue('--text').trim() || '#c8d0e4';
        const textDim = styles.getPropertyValue('--text-dim').trim() || '#7a86a4';

        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const grid = { left: CHART_GRID.left * scale, right: CHART_GRID.right * scale, top: CHART_GRID.top * scale, bottom: CHART_GRID.bottom * scale };
        const plotLeft = grid.left;
        const plotTop = grid.top;
        const plotRight = Math.max(plotLeft + 1, width - grid.right);
        const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
        const plotWidth = Math.max(1, plotRight - plotLeft);
        const plotHeight = Math.max(1, plotBottom - plotTop);
        const xSpan = domains.xMax - domains.xMin;
        const ySpan = domains.yMax - domains.yMin;

        ctx.save();
        ctx.beginPath();
        ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
        ctx.clip();
        const seriesList = Array.isArray(this._lastSeriesList) ? this._lastSeriesList : [];
        for (const s of seriesList) {
            if (!s || s.type !== 'line') continue;
            const pts = Array.isArray(s.data) ? s.data : [];
            if (pts.length === 0) continue;
            ctx.beginPath();
            ctx.strokeStyle = s.color || '#00E5FF';
            ctx.lineWidth = 1.5 * scale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            let started = false;
            for (const p of pts) {
                const x = Number(p?.[0]);
                const y = Number(p?.[1]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const px = plotLeft + ((x - domains.xMin) / xSpan) * plotWidth;
                const py = plotBottom - ((y - domains.yMin) / ySpan) * plotHeight;
                if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            }
            if (started) ctx.stroke();
        }
        ctx.restore();

        // Axes
        const fontSize = Math.max(10, Math.round(12 * scale));
        ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(plotLeft, plotTop);
        ctx.lineTo(plotLeft, plotBottom);
        ctx.lineTo(plotRight, plotBottom);
        ctx.stroke();

        const tickLen = 6 * scale;
        const labelPad = 4 * scale;

        // Y ticks
        const yTicks = niceLinearTicks(domains.yMin, domains.yMax, 6);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textDim;
        for (const y of yTicks) {
            const py = plotBottom - ((y - domains.yMin) / ySpan) * plotHeight;
            ctx.strokeStyle = borderHi; ctx.globalAlpha = 0.35;
            ctx.beginPath(); ctx.moveTo(plotLeft, py); ctx.lineTo(plotRight, py); ctx.stroke();
            ctx.globalAlpha = 1; ctx.strokeStyle = border;
            ctx.beginPath(); ctx.moveTo(plotLeft - tickLen, py); ctx.lineTo(plotLeft, py); ctx.stroke();
            ctx.fillText(formatTwoDecimals(y), plotLeft - tickLen - labelPad, py);
        }

        // X ticks
        const xTicks = niceTimeTicks(domains.xMin, domains.xMax, 6);
        const spanMs = domains.xMax - domains.xMin;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = textDim;
        for (const x of xTicks) {
            const px = plotLeft + ((x - domains.xMin) / xSpan) * plotWidth;
            ctx.strokeStyle = borderHi; ctx.globalAlpha = 0.25;
            ctx.beginPath(); ctx.moveTo(px, plotTop); ctx.lineTo(px, plotBottom); ctx.stroke();
            ctx.globalAlpha = 1; ctx.strokeStyle = border;
            ctx.beginPath(); ctx.moveTo(px, plotBottom); ctx.lineTo(px, plotBottom + tickLen); ctx.stroke();
            ctx.fillText(formatTimeTick(x, spanMs), px, plotBottom + tickLen + labelPad);
        }

        // Title + axis names
        const title = String(this._chartTitle ?? '').trim();
        if (title) {
            ctx.save(); ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
            ctx.fillText(title, width / 2, Math.max(2 * scale, (plotTop - (Math.max(12, Math.round(14 * scale)) + 2 * scale)) / 2));
            ctx.restore();
        }
        const xAxisName = String(this._xAxisLabel ?? '').trim();
        if (xAxisName) {
            ctx.save(); ctx.fillStyle = textDim; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(xAxisName, width / 2, height - fontSize - 2 * scale); ctx.restore();
        }
        const yAxisName = String(this._yAxisLabel ?? '').trim();
        if (yAxisName) {
            ctx.save(); ctx.fillStyle = textDim;
            ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
            ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(yAxisName, 0, 0); ctx.restore();
        }

        // Legend
        const legendEntries = seriesList
            .filter((s: any) => s && s.type === 'line' && typeof s.name === 'string' && !s.name.endsWith('__markers'))
            .map((s: any) => ({ name: s.name, color: s.color || '#00E5FF' }));
        if (legendEntries.length > 0) {
            const pad2 = 8 * scale;
            const gap = 6 * scale;
            const sw = 18 * scale;
            const lh = Math.max(14 * scale, fontSize + 2 * scale);
            let maxTextW = 0;
            for (const e of legendEntries) maxTextW = Math.max(maxTextW, ctx.measureText(e.name).width);
            const boxW = pad2 * 2 + sw + gap + maxTextW;
            const boxH = pad2 * 2 + legendEntries.length * lh;
            const x0 = Math.max(plotLeft, plotRight - boxW - 6 * scale);
            const y0 = plotTop + 6 * scale;
            ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = surface2; ctx.fillRect(x0, y0, boxW, boxH);
            ctx.globalAlpha = 1; ctx.strokeStyle = border; ctx.lineWidth = 1 * scale; ctx.strokeRect(x0, y0, boxW, boxH);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = text;
            for (let i = 0; i < legendEntries.length; i++) {
                const e = legendEntries[i];
                const cy = y0 + pad2 + i * lh + lh / 2;
                ctx.strokeStyle = e.color; ctx.lineWidth = 2 * scale;
                ctx.beginPath(); ctx.moveTo(x0 + pad2, cy); ctx.lineTo(x0 + pad2 + sw, cy); ctx.stroke();
                ctx.fillText(e.name, x0 + pad2 + sw + gap, cy);
            }
            ctx.restore();
        }

        if (includeDrawings) {
            this._renderDrawingsToCtx(ctx, { x: width / cssWidth, y: height / cssHeight });
        }
        ctx.restore();
    }

    private _renderDrawingsToCtx(ctx: CanvasRenderingContext2D, scale: { x: number; y: number }): void {
        const allDraws = [...this._drawings];
        if (this._currentDraw) allDraws.push(this._currentDraw);
        const strokeScale = Math.min(scale.x, scale.y);
        for (const item of allDraws) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width * strokeScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const sx = item.startX * scale.x;
            const sy = item.startY * scale.y;
            const ex = item.endX * scale.x;
            const ey = item.endY * scale.y;
            if (item.type === 'arrow') {
                const headlen = 10 * strokeScale;
                const angle = Math.atan2(ey - sy, ex - sx);
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            } else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
                ctx.stroke();
            }
        }
    }

    private _drawArrowSVG(item: DrawItem, scaleX: number, scaleY: number): string {
        const strokeScale = Math.min(scaleX, scaleY);
        const headlen = 10 * strokeScale;
        const startX = item.startX * scaleX;
        const startY = item.startY * scaleY;
        const endX = item.endX * scaleX;
        const endY = item.endY * scaleY;
        const angle = Math.atan2(endY - startY, endX - startX);
        let d = `M ${startX} ${startY} L ${endX} ${endY}`;
        d += ` L ${endX - headlen * Math.cos(angle - Math.PI / 6)} ${endY - headlen * Math.sin(angle - Math.PI / 6)}`;
        d += ` M ${endX} ${endY}`;
        d += ` L ${endX - headlen * Math.cos(angle + Math.PI / 6)} ${endY - headlen * Math.sin(angle + Math.PI / 6)}`;
        return `  <path d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.width * strokeScale}" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }

}
