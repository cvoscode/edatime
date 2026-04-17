/**
 * FftChart — ChartGPU adapter for FFT / Power Spectral Density visualisation.
 *
 * Mirrors the DataChart API (box-drag zoom with selection box div, same visual
 * style, canvas annotation overlay) but uses a numeric value x-axis for
 * frequency data instead of a time axis.
 */

import { createChart } from '../../libs/chartgpu/dist/index.js';

const FFT_GRID = { left: 80, right: 24, top: 20, bottom: 44 };

export const FFT_TRACE_COLORS = [
    '#7ad151', '#4ac3e8', '#f97316', '#e879f9',
    '#facc15', '#60a5fa', '#f43f5e',
];

export interface FftTrace {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
}

interface DragState {
    pointerId: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
}

export class FftChart {
    private _containerId: string;
    private _container: HTMLElement | null = null;
    private _chart: any = null;
    private _selectionBox: HTMLElement | null = null;
    private _overlayCanvas: HTMLCanvasElement | null = null;
    private _drag: DragState | null = null;

    private _xMin = 0;
    private _xMax = 0;   // 0 = "use full range"
    private _fullXMax = 1;
    private _mode = 'magnitude';
    private _logScale = true;
    private _annotations: number[] = [];  // freqHz values
    private _traces: FftTrace[] = [];

    /** Called with true when zoomed, false when view reset to full range. */
    onZoomChange: ((isZoomed: boolean) => void) | null = null;

    constructor(containerId: string) {
        this._containerId = containerId;
    }

    async init(): Promise<void> {
        const container = document.getElementById(this._containerId);
        if (!container) return;
        this._container = container;
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        this._chart = await createChart(container, {
            grid: FFT_GRID,
            xAxis: { type: 'value' },
            yAxis: { type: 'value' },
            legend: { show: true, position: 'right' },
            series: [],
        });

        this._initOverlay();
        this._initInteractions();
    }

    /* ── Frequency unit helpers ────────────────────────── */

    private _getXMin(): number { return this._xMin; }
    private _getXMax(): number { return this._xMax > 0 ? this._xMax : this._fullXMax; }

    getIsZoomed(): boolean {
        if (this._xMax <= 0) return false;
        return !(this._xMin === 0 && Math.abs(this._xMax - this._fullXMax) < 1e-30);
    }

    private _xUnit(): string {
        const m = this._getXMax();
        if (m > 0 && m < 0.001) return 'µHz';
        if (m > 0 && m < 1) return 'mHz';
        if (m >= 1000) return 'kHz';
        return 'Hz';
    }

    private _xScale(): number {
        const m = this._getXMax();
        if (m > 0 && m < 0.001) return 1e6;
        if (m > 0 && m < 1) return 1000;
        if (m >= 1000) return 0.001;
        return 1;
    }

    /* ── Data update ───────────────────────────────────── */

    updateData(traces: FftTrace[], mode: string, logScale: boolean): void {
        if (!this._chart) return;
        this._traces = traces;
        this._mode = mode;
        this._logScale = logScale;

        this._fullXMax = 0;
        for (const t of traces) {
            for (const f of t.frequencies) {
                if (f > this._fullXMax) this._fullXMax = f;
            }
        }
        if (this._fullXMax <= 0) this._fullXMax = 1;

        const xMin = this._getXMin();
        const xMax = this._getXMax();
        const sc = this._xScale();
        const unit = this._xUnit();
        const rng = (xMax - xMin) * sc;
        const tickPrec = rng >= 100 ? 0 : rng >= 10 ? 1 : rng >= 1 ? 2 : 3;

        const seriesList = traces.map((t, ti) => {
            const raw = mode === 'psd' ? t.psd : t.magnitudes;
            const points: [number, number][] = [];
            for (let i = 0; i < t.frequencies.length; i++) {
                const f = t.frequencies[i];
                const y = logScale ? (raw[i] > 0 ? Math.log10(raw[i]) : -10) : raw[i];
                if (Number.isFinite(f) && Number.isFinite(y)) points.push([f, y]);
            }
            return {
                type: 'line' as const,
                name: t.column,
                color: FFT_TRACE_COLORS[ti % FFT_TRACE_COLORS.length],
                data: points,
            };
        });

        const tooltipFormatter = (params: unknown): string => {
            const list = Array.isArray(params) ? params : [params as any];
            if (!list.length) return '';
            const x = Number((list[0] as any)?.value?.[0]);
            const freqLabel = Number.isFinite(x) ? `${(x * sc).toFixed(4)} ${unit}` : '';
            const rows = list.map((p: any) => {
                const name = String(p?.seriesName ?? '');
                const y = Number(p?.value?.[1]);
                const yStr = Number.isFinite(y) ? y.toFixed(4) : '';
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">`
                    + `<span style="white-space:nowrap;">${name}</span>`
                    + `<span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${yStr}</span>`
                    + `</div>`;
            }).join('');
            return freqLabel
                ? `<div style="opacity:0.8;margin-bottom:6px;">${freqLabel}</div>${rows}`
                : rows;
        };

        this._chart.setOption({
            grid: FFT_GRID,
            xAxis: {
                type: 'value',
                min: xMin,
                max: xMax,
                tickFormatter: (v: number) => (v * sc).toFixed(tickPrec),
            },
            yAxis: {
                type: 'value',
                tickFormatter: (v: number) => v.toFixed(2),
            },
            tooltip: { show: true, trigger: 'axis', formatter: tooltipFormatter },
            series: seriesList,
        });
        this._renderOverlay();
    }

    /* ── View control ──────────────────────────────────── */

    setView(xMin: number, xMax: number): void {
        this._xMin = xMin;
        this._xMax = xMax;
        if (this._traces.length > 0) {
            this.updateData(this._traces, this._mode, this._logScale);
        }
        this.onZoomChange?.(this.getIsZoomed());
    }

    resetView(): void {
        this._xMin = 0;
        this._xMax = 0;
        if (this._traces.length > 0) {
            this.updateData(this._traces, this._mode, this._logScale);
        }
        this.onZoomChange?.(false);
    }

    clear(): void {
        this._traces = [];
        this._annotations = [];
        this._xMin = 0;
        this._xMax = 0;
        this._fullXMax = 1;
        this._chart?.setOption({ series: [] });
        this._renderOverlay();
    }

    destroy(): void {
        this._chart?.dispose?.();
        this._chart = null;
    }

    /* ── Annotation overlay canvas ─────────────────────── */

    private _initOverlay(): void {
        const container = this._container;
        if (!container) return;
        const overlay = document.createElement('canvas');
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6';
        container.appendChild(overlay);
        this._overlayCanvas = overlay;
        const ro = new ResizeObserver((entries) => {
            for (const en of entries) {
                overlay.width = en.contentRect.width;
                overlay.height = en.contentRect.height;
                this._renderOverlay();
            }
        });
        ro.observe(container);
    }

    private _renderOverlay(): void {
        const canvas = this._overlayCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this._annotations.length === 0) return;

        const w = canvas.width;
        const xMin = this._getXMin();
        const xMax = this._getXMax();
        if (xMax <= xMin) return;
        const sc = this._xScale();
        const unit = this._xUnit();
        const plotL = FFT_GRID.left;
        const plotT = FFT_GRID.top;
        const plotW = w - FFT_GRID.left - FFT_GRID.right;
        const plotH = canvas.height - FFT_GRID.top - FFT_GRID.bottom;
        if (plotW <= 0 || plotH <= 0) return;

        ctx.save();
        ctx.font = '11px Inter, system-ui, sans-serif';
        for (const freqHz of this._annotations) {
            if (freqHz < xMin || freqHz > xMax) continue;
            const ax = plotL + ((freqHz - xMin) / (xMax - xMin)) * plotW;
            ctx.strokeStyle = 'rgba(255,220,80,0.85)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(ax, plotT);
            ctx.lineTo(ax, plotT + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
            const label = `${(freqHz * sc).toFixed(4)} ${unit}`;
            ctx.fillStyle = 'rgba(255,220,80,0.95)';
            ctx.textAlign = ax > w / 2 ? 'right' : 'left';
            ctx.fillText(label, ax + (ax > w / 2 ? -5 : 5), plotT + 14);
        }
        ctx.restore();
    }

    /* ── Box zoom + scroll + click-annotate ────────────── */

    private _initInteractions(): void {
        const container = this._container;
        if (!container) return;

        // Selection box div — same style as DataChart
        const selection = document.createElement('div');
        selection.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;'
            + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
            + 'pointer-events:none;display:none;z-index:5';
        container.appendChild(selection);
        this._selectionBox = selection;

        container.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const rect = container.getBoundingClientRect();
            this._drag = {
                pointerId: e.pointerId,
                startX: e.clientX - rect.left,
                endX: e.clientX - rect.left,
                startY: e.clientY - rect.top,
                endY: e.clientY - rect.top,
            };
            try { container.setPointerCapture(e.pointerId); } catch { /* ignored */ }
        });

        container.addEventListener('pointermove', (e) => {
            if (!this._drag || e.pointerId !== this._drag.pointerId) return;
            const rect = container.getBoundingClientRect();
            this._drag.endX = e.clientX - rect.left;
            this._drag.endY = e.clientY - rect.top;
            this._showSelBox(rect);
        });

        const finishDrag = (e: PointerEvent) => {
            if (!this._drag || e.pointerId !== this._drag.pointerId) return;
            const rect = container.getBoundingClientRect();
            const { startX, endX } = this._drag;
            this._drag = null;
            selection.style.display = 'none';
            try { container.releasePointerCapture(e.pointerId); } catch { /* ignored */ }

            const dx = Math.abs(endX - startX);
            const plotL = FFT_GRID.left;
            const plotW = Math.max(1, rect.width - FFT_GRID.left - FFT_GRID.right);

            if (dx >= 8 && this._traces.length > 0) {
                // Box zoom
                const x0 = Math.max(plotL, Math.min(startX, endX));
                const x1 = Math.min(plotL + plotW, Math.max(startX, endX));
                const curMin = this._getXMin();
                const curMax = this._getXMax();
                const xRange = curMax - curMin;
                const newMin = curMin + ((x0 - plotL) / plotW) * xRange;
                const newMax = curMin + ((x1 - plotL) / plotW) * xRange;
                if (newMax > newMin) {
                    this.setView(Math.max(0, newMin), Math.min(this._fullXMax, newMax));
                }
            } else if (dx < 4 && this._traces.length > 0) {
                // Click → toggle frequency annotation
                const cssX = startX;
                if (cssX < plotL || cssX > plotL + plotW) return;
                const xMin = this._getXMin();
                const xMax = this._getXMax();
                const freqHz = xMin + ((cssX - plotL) / plotW) * (xMax - xMin);
                if (!Number.isFinite(freqHz) || freqHz < 0) return;
                const existIdx = this._annotations.findIndex((f) => {
                    const ax = plotL + ((f - xMin) / (xMax - xMin)) * plotW;
                    return Math.abs(ax - cssX) < 8;
                });
                if (existIdx >= 0) this._annotations.splice(existIdx, 1);
                else this._annotations.push(freqHz);
                this._renderOverlay();
            }
        };

        container.addEventListener('pointerup', finishDrag);
        container.addEventListener('pointercancel', (e) => {
            if (this._drag?.pointerId === e.pointerId) {
                this._drag = null;
                selection.style.display = 'none';
            }
        });

        // Double-click: reset zoom and clear annotations
        container.addEventListener('dblclick', () => {
            this._annotations = [];
            this.resetView();
        });

        // Scroll wheel: fine zoom around cursor
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this._traces.length === 0) return;
            const rect = container.getBoundingClientRect();
            const plotL = FFT_GRID.left;
            const plotW = Math.max(1, rect.width - FFT_GRID.left - FFT_GRID.right);
            const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left - plotL) / plotW));
            const curMin = this._getXMin();
            const curMax = this._getXMax();
            const range = curMax - curMin;
            const focus = curMin + xNorm * range;
            const factor = e.deltaY > 0 ? 1.25 : 0.8;
            const newRange = range * factor;
            const newMin = Math.max(0, focus - xNorm * newRange);
            const newMax = Math.min(this._fullXMax, newMin + newRange);
            if (newMax > newMin + 1e-30) this.setView(newMin, newMax);
        }, { passive: false });
    }

    private _showSelBox(rect: DOMRect): void {
        const sel = this._selectionBox;
        if (!sel || !this._drag) return;
        const { startX, endX, startY, endY } = this._drag;
        const left = Math.max(0, Math.min(startX, endX));
        const right = Math.min(rect.width, Math.max(startX, endX));
        const top = Math.max(0, Math.min(startY, endY));
        const bottom = Math.min(rect.height, Math.max(startY, endY));
        sel.style.left = `${left}px`;
        sel.style.width = `${Math.max(0, right - left)}px`;
        sel.style.top = `${top}px`;
        sel.style.height = `${Math.max(0, bottom - top)}px`;
        sel.style.display = 'block';
    }
}
