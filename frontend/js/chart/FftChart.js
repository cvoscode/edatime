import {
  Ad
} from "../chunk-UUSB2KLH.js";

// frontend/src/chart/FftChart.ts
var FFT_GRID = { left: 80, right: 24, top: 20, bottom: 44 };
var FFT_TRACE_COLORS = [
  "#7ad151",
  "#4ac3e8",
  "#f97316",
  "#e879f9",
  "#facc15",
  "#60a5fa",
  "#f43f5e"
];
var FftChart = class {
  _containerId;
  _container = null;
  _chart = null;
  _selectionBox = null;
  _overlayCanvas = null;
  _drag = null;
  _xMin = 0;
  _xMax = 0;
  // 0 = "use full range"
  _fullXMax = 1;
  _mode = "magnitude";
  _logScale = true;
  _annotations = [];
  // freqHz values
  _traces = [];
  /** Called with true when zoomed, false when view reset to full range. */
  onZoomChange = null;
  constructor(containerId) {
    this._containerId = containerId;
  }
  async init() {
    const container = document.getElementById(this._containerId);
    if (!container) return;
    this._container = container;
    if (window.getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    this._chart = await Ad(container, {
      grid: FFT_GRID,
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      legend: { show: true, position: "right" },
      series: []
    });
    this._initOverlay();
    this._initInteractions();
  }
  /* ── Frequency unit helpers ────────────────────────── */
  _getXMin() {
    return this._xMin;
  }
  _getXMax() {
    return this._xMax > 0 ? this._xMax : this._fullXMax;
  }
  getIsZoomed() {
    if (this._xMax <= 0) return false;
    return !(this._xMin === 0 && Math.abs(this._xMax - this._fullXMax) < 1e-30);
  }
  _xUnit() {
    const m = this._getXMax();
    if (m > 0 && m < 1e-3) return "\xB5Hz";
    if (m > 0 && m < 1) return "mHz";
    if (m >= 1e3) return "kHz";
    return "Hz";
  }
  _xScale() {
    const m = this._getXMax();
    if (m > 0 && m < 1e-3) return 1e6;
    if (m > 0 && m < 1) return 1e3;
    if (m >= 1e3) return 1e-3;
    return 1;
  }
  /* ── Data update ───────────────────────────────────── */
  updateData(traces, mode, logScale) {
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
      const raw = mode === "psd" ? t.psd : t.magnitudes;
      const points = [];
      for (let i = 0; i < t.frequencies.length; i++) {
        const f = t.frequencies[i];
        const y = logScale ? raw[i] > 0 ? Math.log10(raw[i]) : -10 : raw[i];
        if (Number.isFinite(f) && Number.isFinite(y)) points.push([f, y]);
      }
      return {
        type: "line",
        name: t.column,
        color: FFT_TRACE_COLORS[ti % FFT_TRACE_COLORS.length],
        data: points
      };
    });
    const tooltipFormatter = (params) => {
      const list = Array.isArray(params) ? params : [params];
      if (!list.length) return "";
      const x = Number(list[0]?.value?.[0]);
      const freqLabel = Number.isFinite(x) ? `${(x * sc).toFixed(4)} ${unit}` : "";
      const rows = list.map((p) => {
        const name = String(p?.seriesName ?? "");
        const y = Number(p?.value?.[1]);
        const yStr = Number.isFinite(y) ? y.toFixed(4) : "";
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span style="white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${yStr}</span></div>`;
      }).join("");
      return freqLabel ? `<div style="opacity:0.8;margin-bottom:6px;">${freqLabel}</div>${rows}` : rows;
    };
    this._chart.setOption({
      grid: FFT_GRID,
      xAxis: {
        type: "value",
        min: xMin,
        max: xMax,
        tickFormatter: (v) => (v * sc).toFixed(tickPrec)
      },
      yAxis: {
        type: "value",
        tickFormatter: (v) => v.toFixed(2)
      },
      tooltip: { show: true, trigger: "axis", formatter: tooltipFormatter },
      series: seriesList
    });
    this._renderOverlay();
  }
  /* ── View control ──────────────────────────────────── */
  setView(xMin, xMax) {
    this._xMin = xMin;
    this._xMax = xMax;
    if (this._traces.length > 0) {
      this.updateData(this._traces, this._mode, this._logScale);
    }
    this.onZoomChange?.(this.getIsZoomed());
  }
  resetView() {
    this._xMin = 0;
    this._xMax = 0;
    if (this._traces.length > 0) {
      this.updateData(this._traces, this._mode, this._logScale);
    }
    this.onZoomChange?.(false);
  }
  clear() {
    this._traces = [];
    this._annotations = [];
    this._xMin = 0;
    this._xMax = 0;
    this._fullXMax = 1;
    this._chart?.setOption({ series: [] });
    this._renderOverlay();
  }
  destroy() {
    this._chart?.dispose?.();
    this._chart = null;
  }
  /* ── Annotation overlay canvas ─────────────────────── */
  _initOverlay() {
    const container = this._container;
    if (!container) return;
    const overlay = document.createElement("canvas");
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6";
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
  _renderOverlay() {
    const canvas = this._overlayCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
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
    ctx.font = "11px Inter, system-ui, sans-serif";
    for (const freqHz of this._annotations) {
      if (freqHz < xMin || freqHz > xMax) continue;
      const ax = plotL + (freqHz - xMin) / (xMax - xMin) * plotW;
      ctx.strokeStyle = "rgba(255,220,80,0.85)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(ax, plotT);
      ctx.lineTo(ax, plotT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = `${(freqHz * sc).toFixed(4)} ${unit}`;
      ctx.fillStyle = "rgba(255,220,80,0.95)";
      ctx.textAlign = ax > w / 2 ? "right" : "left";
      ctx.fillText(label, ax + (ax > w / 2 ? -5 : 5), plotT + 14);
    }
    ctx.restore();
  }
  /* ── Box zoom + scroll + click-annotate ────────────── */
  _initInteractions() {
    const container = this._container;
    if (!container) return;
    const selection = document.createElement("div");
    selection.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);pointer-events:none;display:none;z-index:5";
    container.appendChild(selection);
    this._selectionBox = selection;
    container.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rect = container.getBoundingClientRect();
      this._drag = {
        pointerId: e.pointerId,
        startX: e.clientX - rect.left,
        endX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        endY: e.clientY - rect.top
      };
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
      }
    });
    container.addEventListener("pointermove", (e) => {
      if (!this._drag || e.pointerId !== this._drag.pointerId) return;
      const rect = container.getBoundingClientRect();
      this._drag.endX = e.clientX - rect.left;
      this._drag.endY = e.clientY - rect.top;
      this._showSelBox(rect);
    });
    const finishDrag = (e) => {
      if (!this._drag || e.pointerId !== this._drag.pointerId) return;
      const rect = container.getBoundingClientRect();
      const { startX, endX } = this._drag;
      this._drag = null;
      selection.style.display = "none";
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
      }
      const dx = Math.abs(endX - startX);
      const plotL = FFT_GRID.left;
      const plotW = Math.max(1, rect.width - FFT_GRID.left - FFT_GRID.right);
      if (dx >= 8 && this._traces.length > 0) {
        const x0 = Math.max(plotL, Math.min(startX, endX));
        const x1 = Math.min(plotL + plotW, Math.max(startX, endX));
        const curMin = this._getXMin();
        const curMax = this._getXMax();
        const xRange = curMax - curMin;
        const newMin = curMin + (x0 - plotL) / plotW * xRange;
        const newMax = curMin + (x1 - plotL) / plotW * xRange;
        if (newMax > newMin) {
          this.setView(Math.max(0, newMin), Math.min(this._fullXMax, newMax));
        }
      } else if (dx < 4 && this._traces.length > 0) {
        const cssX = startX;
        if (cssX < plotL || cssX > plotL + plotW) return;
        const xMin = this._getXMin();
        const xMax = this._getXMax();
        const freqHz = xMin + (cssX - plotL) / plotW * (xMax - xMin);
        if (!Number.isFinite(freqHz) || freqHz < 0) return;
        const existIdx = this._annotations.findIndex((f) => {
          const ax = plotL + (f - xMin) / (xMax - xMin) * plotW;
          return Math.abs(ax - cssX) < 8;
        });
        if (existIdx >= 0) this._annotations.splice(existIdx, 1);
        else this._annotations.push(freqHz);
        this._renderOverlay();
      }
    };
    container.addEventListener("pointerup", finishDrag);
    container.addEventListener("pointercancel", (e) => {
      if (this._drag?.pointerId === e.pointerId) {
        this._drag = null;
        selection.style.display = "none";
      }
    });
    container.addEventListener("dblclick", () => {
      this._annotations = [];
      this.resetView();
    });
    container.addEventListener("wheel", (e) => {
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
  _showSelBox(rect) {
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
    sel.style.display = "block";
  }
};
export {
  FFT_TRACE_COLORS,
  FftChart
};
//# sourceMappingURL=FftChart.js.map
