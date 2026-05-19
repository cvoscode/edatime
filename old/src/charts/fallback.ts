/**
 * FallbackChart — 2D Canvas fallback when WebGPU is unavailable.
 * Mirrors the ChartAdapter interface expected by the chart registry.
 */

import { SERIES_COLORS } from '../state.js';
import type { ChartInstance, FilteredDataObject, CrosshairData, ClickData } from '../types.js';

export class FallbackChart implements ChartInstance {
    private containerId: string;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;

    constructor(containerId: string) {
        this.containerId = containerId;
    }

    async init(): Promise<void> {
        const container = document.getElementById(this.containerId);
        if (!container) throw new Error('Fallback chart container not found');

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
    }

    setXRange(): void { }
    setYRange(): void { }
    supportsZoomControls(): boolean { return false; }
    onCrosshairMove(): void { }
    onClick(): void { }
    setChartText(): void { }
    setDrawMode(): void { }
    clearDrawings(): void { }
    fitYToData(): void { }
    getXDomain(): { min: number; max: number } | null { return null; }
    getYRange(): { min: number; max: number } | null { return null; }
    exportPNG(): void { }
    exportSVG(): void { }
    exportHTML(): void { }

    updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const pad = 28;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#080a10';
        ctx.fillRect(0, 0, width, height);

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

        if (
            seriesToDraw.length === 0 ||
            !Number.isFinite(xMin) || !Number.isFinite(xMax) ||
            !Number.isFinite(yMin) || !Number.isFinite(yMax)
        ) {
            ctx.fillStyle = '#7a86a4';
            ctx.font = '12px sans-serif';
            ctx.fillText('No data to display', pad, pad + 2);
            return;
        }

        if (xMax === xMin) xMax = xMin + 1;
        if (yMax === yMin) yMax = yMin + 1;

        ctx.strokeStyle = '#272d45';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, height - pad);
        ctx.lineTo(width - pad, height - pad);
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, height - pad);
        ctx.stroke();

        for (let s = 0; s < seriesToDraw.length; s++) {
            const { xs, ys } = seriesToDraw[s];
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = SERIES_COLORS[s % SERIES_COLORS.length];

            let started = false;
            for (let i = 0; i < xs.length; i++) {
                const x = Number(xs[i]);
                const y = Number(ys[i]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

                const px = pad + ((x - xMin) / (xMax - xMin)) * (width - 2 * pad);
                const py = height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad);

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
        this.ctx = null;
        this.canvas = null;
    }
}
