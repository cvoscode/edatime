/**
 * FallbackChart — 2D Canvas fallback when WebGPU is unavailable.
 * Mirrors the ChartAdapter interface expected by the chart registry.
 */

import { getActiveSeriesPalette } from '../utils/seriesColors.js';
import type { ChartInstance, FilteredDataObject, CrosshairData, ClickData, ViewSnapshot } from '../types/chart.js';

const FALLBACK_GRID = { left: 28, right: 28, top: 28, bottom: 28 };

export class FallbackChart implements ChartInstance {
    private containerId: string;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
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

        const resize = () => {
            const w = Math.max(1, container.clientWidth);
            const h = Math.max(1, container.clientHeight);
            this.canvas!.width = w;
            this.canvas!.height = h;
        };
        resize();

        this.resizeObserver = new ResizeObserver(() => resize());
        this.resizeObserver.observe(container);
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
    onCrosshairMove(): void { }
    onClick(): void { }
    setChartText(): void { }
    setDrawMode(): void { }
    clearDrawings(): void { }
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
    exportPNG(): void { }
    exportSVG(): void { }
    exportHTML(): void { }

    updateDataMulti(
        dataObj: FilteredDataObject,
        columns: string[],
        _colorColumn: string | null = null,
        _adaptiveLines = [],
    ): void {
        this.lastData = dataObj;
        this.lastColumns = columns;
        this.redraw();
    }

    private redraw(): void {
        const dataObj = this.lastData;
        const columns = this.lastColumns;
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const pad = FALLBACK_GRID.left;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#080a10';
        ctx.fillRect(0, 0, width, height);

        if (!dataObj) {
            ctx.fillStyle = '#7a86a4';
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
        for (const col of columns) {
            const seriesData = dataObj.series?.[col];
            const xs = seriesData?.x || dataObj.ts;
            const ys = seriesData?.y || dataObj.values?.[col];
            if (!xs || !ys || ys.length === 0) continue;

            seriesToDraw.push({ col, xs, ys });

            for (let i = 0; i < xs.length; i++) {
                const x = Number(xs[i]);
                const y = Number(ys[i]);
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
            ctx.fillStyle = '#7a86a4';
            ctx.font = '12px sans-serif';
            ctx.fillText('No data to display', pad, pad + 2);
            return;
        }

        const viewXMin = this.xMin ?? xMin;
        const viewXMax = this.xMax ?? xMax;
        const viewYMin = this.yMin ?? yMin;
        const viewYMax = this.yMax ?? yMax;

        ctx.strokeStyle = '#272d45';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, height - pad);
        ctx.lineTo(width - pad, height - pad);
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, height - pad);
        ctx.stroke();

        const palette = getActiveSeriesPalette();
        for (let s = 0; s < seriesToDraw.length; s++) {
            const { xs, ys } = seriesToDraw[s];
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = palette[s % palette.length]!;

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
    }

    destroy(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.selectionBox?.dispose?.();
        this.selectionBox = null;
        this.ctx = null;
        this.canvas = null;
    }
}
