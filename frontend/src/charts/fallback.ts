/**
 * FallbackChart — 2D Canvas fallback when WebGPU is unavailable.
 * Mirrors the ChartAdapter interface expected by the chart registry.
 */

import { getColumnSeriesColor } from '../utils/seriesColors.js';
import { getChartPalette, onThemeChange } from '../utils/theme.js';
import type { ChartInstance, FilteredDataObject, CrosshairData, ClickData, ViewSnapshot } from '../types/chart.js';
import { formatTimestamp } from '../formatUtils.js';
import { downloadBlob, downloadUrl } from '../utils/dom.js';

const FALLBACK_GRID = { left: 28, right: 28, top: 28, bottom: 28 };

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[character] ?? character));
}

export class FallbackChart implements ChartInstance {
    readonly capabilities = {
        drawing: false,
        exportPNG: true,
        exportSVG: true,
        exportHTML: true,
        pointInspection: true,
    };
    private containerId: string;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private themeUnsubscribe: (() => void) | null = null;
    private selectionBox: (HTMLElement & { dispose?: () => void }) | null = null;
    private onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null;
    private onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null;
    private onZoomOutCallback: (() => void) | null;
    private xMin: number | null = null;
    private xMax: number | null = null;
    private yMin: number | null = null;
    private yMax: number | null = null;
    private dataXMin: number | null = null;
    private dataXMax: number | null = null;
    private dataYMin: number | null = null;
    private dataYMax: number | null = null;
    private lastData: FilteredDataObject | null = null;
    private lastColumns: string[] = [];
    private lastColorColumn: string | null = null;
    private crosshairCallback: ((data: CrosshairData) => void) | null = null;
    private clickCallback: ((data: ClickData) => void) | null = null;
    private chartText = { title: '', xLabel: 'Time', yLabel: 'Value' };
    private inspector: HTMLElement | null = null;
    private inspectionIndex = 0;
    private pointerMoveHandler: ((event: MouseEvent) => void) | null = null;
    private pointerClickHandler: ((event: MouseEvent) => void) | null = null;

    constructor(
        containerId: string,
        onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null = null,
        onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null = null,
        onZoomOutCallback: (() => void) | null = null,
    ) {
        this.containerId = containerId;
        this.onZoomCallback = onZoomCallback;
        this.onYRangeCallback = onYRangeCallback;
        this.onZoomOutCallback = onZoomOutCallback;
    }

    async init(): Promise<void> {
        const container = document.getElementById(this.containerId);
        if (!container) throw new Error('Fallback chart container not found');

        this.selectionBox?.dispose?.();
        this.selectionBox = null;
        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        container.appendChild(canvas);

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.pointerMoveHandler = (event: MouseEvent) => {
            const point = this.pointFromPointer(event);
            if (!point) return;
            this.updateInspector(point.x, point.seriesValues ?? {});
            this.crosshairCallback?.(point);
        };
        this.pointerClickHandler = (event: MouseEvent) => {
            const point = this.pointFromPointer(event);
            if (point) this.clickCallback?.(point);
        };
        canvas.addEventListener('mousemove', this.pointerMoveHandler);
        canvas.addEventListener('click', this.pointerClickHandler);

        const resize = () => {
            const w = Math.max(1, container.clientWidth);
            const h = Math.max(1, container.clientHeight);
            this.canvas!.width = w;
            this.canvas!.height = h;
            this.redraw();
        };
        resize();

        this.resizeObserver = new ResizeObserver(() => resize());
        this.resizeObserver.observe(container);
        this.themeUnsubscribe?.();
        this.themeUnsubscribe = onThemeChange(() => this.redraw());
        const { initBoxZoom } = await import('../chart/chartInteractions.js');
        this.selectionBox = initBoxZoom({
            container,
            grid: FALLBACK_GRID,
            getXRange: () => this.getXDomain() ?? { min: 0, max: 1 },
            getYRange: () => this.getYRange() ?? { min: 0, max: 1 },
            onZoom: (view: ViewSnapshot) => this.onZoomCallback?.(view, 'user'),
            onDblClick: () => this.onZoomOutCallback?.(),
        });
    }

    setXRange(min?: number, max?: number): void {
        if (typeof min !== 'number' || typeof max !== 'number') return;
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this.xMin = min;
        this.xMax = max;
        this.redraw();
    }

    setYRange(min?: number, max?: number): void {
        if (typeof min !== 'number' || typeof max !== 'number') return;
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        this.yMin = min;
        this.yMax = max;
        this.onYRangeCallback?.(min, max, 'api');
        this.redraw();
    }

    /**
     * Drop the user-set y range and fall back to the data-driven fit on
     * the next render. Mirrors `DataChart.resetYRange` so quick-range,
     * zoom-out, and zoom-reset all clear any prior y zoom on both
     * rendering adapters.
     */
    resetYRange(): void {
        if (this.yMin === null && this.yMax === null) return;
        this.yMin = null;
        this.yMax = null;
        this.redraw();
    }

    supportsZoomControls(): boolean { return !!this.canvas; }
    onCrosshairMove(callback?: (data: CrosshairData) => void): void { this.crosshairCallback = callback ?? null; }
    onClick(callback?: (data: unknown) => void): void { this.clickCallback = callback as ((data: ClickData) => void) | null; }
    setChartText(title = '', xLabel = 'Time', yLabel = 'Value'): void {
        this.chartText = { title: String(title || ''), xLabel: String(xLabel || 'Time'), yLabel: String(yLabel || 'Value') };
        this.redraw();
    }
    setDrawMode(mode = 'none'): void {
        // Canvas fallback cannot provide GPU drawing tools, but it does expose
        // the selected mode to the DOM so the toolbar can describe the
        // limitation instead of silently claiming a successful drawing.
        const container = document.getElementById(this.containerId);
        if (container) container.dataset.drawingSupport = mode && mode !== 'none' ? 'unavailable' : 'none';
    }
    clearDrawings(): void {
        const container = document.getElementById(this.containerId);
        if (container) container.dataset.drawingsCleared = 'true';
    }
    fitYToData(): void { }
    getXDomain(): { min: number; max: number } | null {
        if (this.xMin != null && this.xMax != null && this.xMax > this.xMin) {
            return { min: this.xMin, max: this.xMax };
        }
        if (this.dataXMin != null && this.dataXMax != null && this.dataXMax > this.dataXMin) {
            return { min: this.dataXMin, max: this.dataXMax };
        }
        return null;
    }

    getYRange(): { min: number; max: number } | null {
        if (this.yMin != null && this.yMax != null && this.yMax > this.yMin) {
            return { min: this.yMin, max: this.yMax };
        }
        if (this.dataYMin != null && this.dataYMax != null && this.dataYMax > this.dataYMin) {
            return { min: this.dataYMin, max: this.dataYMax };
        }
        return null;
    }
    exportPNG(): void {
        if (!this.canvas) return;
        const dataUrl = this.canvasDataUrl();
        if (dataUrl) {
            try { downloadUrl(dataUrl, 'edatime_chart.png'); } catch { /* test/embedded DOM without downloads */ }
        }
    }
    exportSVG(): void {
        if (!this.canvas) return;
        const href = this.canvasDataUrl();
        if (!href) return;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.canvas.width}" height="${this.canvas.height}"><image href="${href}" width="100%" height="100%"/></svg>`;
        try { downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'edatime_chart.svg'); } catch { /* test/embedded DOM without downloads */ }
    }
    exportHTML(): void {
        if (!this.canvas) return;
        const dataUrl = this.canvasDataUrl();
        if (!dataUrl) return;
        const title = escapeHtml(this.chartText.title || 'EdaTime chart');
        const alt = escapeHtml(this.chartText.title || 'Signals chart');
        const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><img alt="${alt}" src="${dataUrl}">`;
        try { downloadBlob(new Blob([html], { type: 'text/html' }), 'edatime_chart.html'); } catch { /* test/embedded DOM without downloads */ }
    }

    private canvasDataUrl(): string | null {
        try { return this.canvas?.toDataURL('image/png') || null; } catch { return null; }
    }

    updateDataMulti(
        dataObj: FilteredDataObject,
        columns: string[],
        colorColumn: string | null = null,
        _adaptiveLines = [],
    ): void {
        this.lastData = dataObj;
        this.lastColumns = columns;
        this.lastColorColumn = colorColumn;
        this.inspectionIndex = 0;
        this.ensureInspector();
        this.redraw();
    }

    setVisibleColumns(columns: readonly string[]): boolean {
        if (!this.lastData) return false;
        this.lastColumns = [...columns];
        this.redraw();
        return true;
    }

    setColumnColor(column: string, color: string): boolean {
        if (!this.lastData || !column || !color) return false;
        this.redraw();
        return true;
    }

    private ensureInspector(): void {
        const container = document.getElementById(this.containerId);
        if (!container || this.inspector?.isConnected) return;
        const inspector = document.createElement('div');
        inspector.className = 'fallback-chart-inspector';
        inspector.tabIndex = 0;
        inspector.setAttribute('role', 'status');
        inspector.setAttribute('aria-live', 'polite');
        inspector.textContent = 'Point inspection: move over the chart or focus here and use arrow keys.';
        inspector.addEventListener('focus', () => {
            const point = this.observationAtIndex(0);
            if (point) this.updateInspector(point.x, point.seriesValues ?? {});
        });
        inspector.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            const length = this.observationLength();
            if (length === 0) return;
            this.inspectionIndex = Math.max(0, Math.min(length - 1,
                this.inspectionIndex + (event.key === 'ArrowRight' ? 1 : -1)));
            const point = this.observationAtIndex(this.inspectionIndex);
            if (point) this.updateInspector(point.x, point.seriesValues ?? {});
            event.preventDefault();
        });
        container.appendChild(inspector);
        this.inspector = inspector;
    }

    private nearestPoint(xValue: number, yValue: number): ClickData & { index: number } | null {
        const data = this.lastData;
        if (!data) return null;
        let best: { x: number; y: number; index: number; distance: number } | null = null;
        for (const column of this.lastColumns) {
            const series = data.series?.[column];
            const xs = series?.x || data.ts;
            const ys = series?.y || data.values?.[column];
            if (!xs || !ys) continue;
            for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
                const x = Number(xs[i]);
                const y = Number(ys[i]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const distance = Math.abs(x - xValue) + Math.abs(y - yValue);
                if (!best || distance < best.distance) best = { x, y, index: i, distance };
            }
        }
        if (!best) return null;
        this.inspectionIndex = best.index;
        const observation = this.observationAtIndex(best.index);
        return {
            x: best.x,
            y: best.y,
            seriesValues: observation?.seriesValues ?? {},
            index: best.index,
        };
    }

    private observationLength(): number {
        const data = this.lastData;
        if (!data) return 0;
        if (data.ts?.length) return data.ts.length;
        const first = this.lastColumns.find((column) => data.series?.[column]?.x || data.values?.[column]);
        return first ? (data.series?.[first]?.x?.length ?? data.values?.[first]?.length ?? 0) : 0;
    }

    private observationAtIndex(index: number): ClickData | null {
        const data = this.lastData;
        if (!data) return null;
        const length = this.observationLength();
        if (length === 0) return null;
        const safeIndex = Math.max(0, Math.min(length - 1, index));
        const baseXs = data.ts || data.series?.[this.lastColumns[0] || '']?.x;
        const x = Number(baseXs?.[safeIndex]);
        if (!Number.isFinite(x)) return null;
        const seriesValues: Record<string, number> = {};
        let firstY = Number.NaN;
        for (const column of this.lastColumns) {
            const series = data.series?.[column];
            const y = Number(series?.y?.[safeIndex] ?? data.values?.[column]?.[safeIndex]);
            if (!Number.isFinite(y)) continue;
            seriesValues[column] = y;
            if (!Number.isFinite(firstY)) firstY = y;
        }
        return { x, y: Number.isFinite(firstY) ? firstY : 0, seriesValues };
    }

    private pointFromPointer(event: MouseEvent): ClickData | null {
        const point = this.cssPointToData(event.clientX, event.clientY);
        if (!point) return null;
        const nearest = this.nearestPoint(point.x, point.y);
        return nearest ? { x: nearest.x, y: nearest.y, seriesValues: nearest.seriesValues } : null;
    }

    cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null {
        if (!this.canvas) return null;
        const xRange = this.getXDomain();
        const yRange = this.getYRange();
        const rect = this.canvas.getBoundingClientRect();
        if (!xRange || !yRange || rect.width <= 0 || rect.height <= 0) return null;
        const x = xRange.min + ((clientX - rect.left - FALLBACK_GRID.left) / Math.max(1, rect.width - FALLBACK_GRID.left - FALLBACK_GRID.right)) * (xRange.max - xRange.min);
        const y = yRange.max - ((clientY - rect.top - FALLBACK_GRID.top) / Math.max(1, rect.height - FALLBACK_GRID.top - FALLBACK_GRID.bottom)) * (yRange.max - yRange.min);
        return { x, y };
    }

    private updateInspector(x: number, values: Record<string, number>): void {
        if (!this.inspector) return;
        const span = Math.max(1, (this.dataXMax ?? x) - (this.dataXMin ?? x));
        const entries = Object.entries(values).map(([column, value]) => `${column}=${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`);
        const approximation = this.lastData?._meta?.downsampled === true;
        const kind = approximation ? 'Rendered approximation' : 'Raw observation';
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.inspector.textContent = `${kind} · ${formatTimestamp(x, span)} (${timezone}) · ${entries.join(' · ')}`;
    }

    private redraw(): void {
        const dataObj = this.lastData;
        const columns = this.lastColumns;
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const pad = FALLBACK_GRID.left;
        const theme = getChartPalette();

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, width, height);

        if (!dataObj) {
            ctx.fillStyle = theme.textDim;
            ctx.font = '12px sans-serif';
            ctx.fillText('No data to display', pad, pad + 2);
            return;
        }

        let xMin = Number.POSITIVE_INFINITY;
        let xMax = Number.NEGATIVE_INFINITY;
        let yMin = Number.POSITIVE_INFINITY;
        let yMax = Number.NEGATIVE_INFINITY;

        interface DrawEntry {
            col: string;
            xs: ArrayLike<number>;
            ys: ArrayLike<number>;
        }

        const seriesToDraw: DrawEntry[] = [];
        const normalizeEachSeries = !!(document.getElementById('timeseries-normalize-series') as HTMLInputElement | null)?.checked;
        for (const col of columns) {
            const seriesData = dataObj.series?.[col];
            const xs = seriesData?.x || dataObj.ts;
            const ys = seriesData?.y || dataObj.values?.[col];
            if (!xs || !ys || ys.length === 0) continue;

            let drawYs: ArrayLike<number> = ys;
            if (normalizeEachSeries) {
                const finite = Array.from(ys, Number).filter(Number.isFinite);
                const min = Math.min(...finite);
                const max = Math.max(...finite);
                const span = max - min;
                drawYs = Array.from(ys, (value) => Number.isFinite(Number(value)) ? (span > 0 ? (Number(value) - min) / span : 0.5) : Number.NaN);
            }
            seriesToDraw.push({ col, xs, ys: drawYs });

            for (let i = 0; i < xs.length; i++) {
                const x = Number(xs[i]);
                const y = Number(drawYs[i]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (x < xMin) xMin = x;
                if (x > xMax) xMax = x;
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
            }
        }

        const hasFiniteDomain = Number.isFinite(xMin) && Number.isFinite(xMax) && Number.isFinite(yMin) && Number.isFinite(yMax);
        if (hasFiniteDomain) {
            if (xMax === xMin) xMax = xMin + 1;
            if (yMax === yMin) yMax = yMin + 1;
            this.dataXMin = xMin;
            this.dataXMax = xMax;
            this.dataYMin = yMin;
            this.dataYMax = yMax;
        }

        if (seriesToDraw.length === 0 || !hasFiniteDomain) {
            ctx.fillStyle = theme.textDim;
            ctx.font = '12px sans-serif';
            ctx.fillText('No data to display', pad, pad + 2);
            return;
        }

        const viewXMin = this.xMin ?? xMin;
        const viewXMax = this.xMax ?? xMax;
        const viewYMin = this.yMin ?? yMin;
        const viewYMax = this.yMax ?? yMax;

        ctx.strokeStyle = theme.borderHi;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, height - pad);
        ctx.lineTo(width - pad, height - pad);
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, height - pad);
        ctx.stroke();

        // Fallback axes intentionally carry their own labels. This keeps a
        // canvas render useful when WebGPU is unavailable and makes the time
        // timezone explicit in the X-axis caption.
        const xSpan = viewXMax - viewXMin;
        const ySpan = viewYMax - viewYMin;
        ctx.fillStyle = theme.textDim;
        ctx.font = '11px sans-serif';
        for (let i = 0; i <= 4; i++) {
            const x = viewXMin + xSpan * i / 4;
            const px = pad + (i / 4) * (width - 2 * pad);
            ctx.fillText(formatTimestamp(x, xSpan), Math.max(0, px - 30), height - 8);
            const y = viewYMin + ySpan * (4 - i) / 4;
            const py = pad + (i / 4) * (height - 2 * pad);
            ctx.fillText(y.toLocaleString(undefined, { maximumFractionDigits: 4 }), 2, py + 4);
        }
        ctx.fillText(`${this.chartText.xLabel} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, Math.max(pad, width / 2 - 100), height - 2);
        if (this.chartText.title) ctx.fillText(this.chartText.title, pad, 14);

        for (let s = 0; s < seriesToDraw.length; s++) {
            const { col, xs, ys } = seriesToDraw[s];
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = getColumnSeriesColor(col);

            let started = false;
            for (let i = 0; i < xs.length; i++) {
                const x = Number(xs[i]);
                const y = Number(ys[i]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    started = false;
                    continue;
                }
                if (x < viewXMin || x > viewXMax || y < viewYMin || y > viewYMax) continue;

                const px = pad + ((x - viewXMin) / (viewXMax - viewXMin)) * (width - 2 * pad);
                const py = height - pad - ((y - viewYMin) / (viewYMax - viewYMin)) * (height - 2 * pad);

                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
        }

        const container = document.getElementById(this.containerId);
        if (container) {
            const mode = this.lastData?._meta?.downsampled === true ? 'rendered approximations' : 'raw observations';
            container.setAttribute('aria-label', `Signals chart. ${this.chartText.xLabel} in ${Intl.DateTimeFormat().resolvedOptions().timeZone}; Y axis ${this.chartText.yLabel}. Hover or focus the point inspector for ${mode}.`);
        }
    }

    destroy(): void {
        if (this.canvas && this.pointerMoveHandler) this.canvas.removeEventListener('mousemove', this.pointerMoveHandler);
        if (this.canvas && this.pointerClickHandler) this.canvas.removeEventListener('click', this.pointerClickHandler);
        this.pointerMoveHandler = null;
        this.pointerClickHandler = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.themeUnsubscribe?.();
        this.themeUnsubscribe = null;
        this.selectionBox?.dispose?.();
        this.selectionBox = null;
        this.ctx = null;
        this.canvas = null;
        this.inspector = null;
    }
}
