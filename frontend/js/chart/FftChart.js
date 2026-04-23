import {
  createCanvasOverlay,
  ensureRelativePosition,
  initBoxZoom,
  initWheelZoom,
  tooltipRow,
  tooltipWrap
} from "../chunk-667JW4DN.js";
import {
  Ad
} from "../chunk-UUSB2KLH.js";
import {
  defaultGpuPowerPreference
} from "../chunk-PMOHFZ3J.js";
import "../chunk-PZ5AY32C.js";

// frontend/src/utils/spectralPresets.ts
function frequencyToPeriod(hz) {
  if (!Number.isFinite(hz) || hz <= 0) return "\u2014";
  const seconds = 1 / hz;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(1)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} sec`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

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
  _overlayCanvas = null;
  _overlayObserver = null;
  _xMin = 0;
  _xMax = 0;
  // 0 = "use full range"
  _fullXMax = 1;
  _mode = "magnitude";
  _logScale = true;
  _annotations = [];
  // freqHz values
  _traces = [];
  _showPeakLabels = true;
  _sampleRateHz = 0;
  _nyquistHz = 0;
  _dominantPeaks = [];
  /** Called with true when zoomed, false when view reset to full range. */
  onZoomChange = null;
  /** Called when spectral info is updated (for external UI updates). */
  onSpectralInfoUpdate = null;
  constructor(containerId) {
    this._containerId = containerId;
  }
  async init() {
    const container = document.getElementById(this._containerId);
    if (!container) return;
    this._container = container;
    ensureRelativePosition(container);
    this._chart = await Ad(container, {
      grid: FFT_GRID,
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      legend: { show: true, position: "right" },
      series: [],
      powerPreference: defaultGpuPowerPreference()
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
  _yAxisLabel() {
    const base = this._mode === "psd" ? "PSD" : "Magnitude";
    return this._logScale ? `log10(${base})` : base;
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
      if (t.sample_rate_hz && this._sampleRateHz === 0) {
        this._sampleRateHz = t.sample_rate_hz;
      }
      if (t.nyquist_hz && this._nyquistHz === 0) {
        this._nyquistHz = t.nyquist_hz;
      }
      if (t.dominant_peaks && this._dominantPeaks.length === 0) {
        this._dominantPeaks = t.dominant_peaks;
      }
    }
    if (this._fullXMax <= 0) this._fullXMax = 1;
    this.onSpectralInfoUpdate?.({
      sampleRateHz: this._sampleRateHz,
      nyquistHz: this._nyquistHz,
      peaks: this._dominantPeaks
    });
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
        color: t.color || FFT_TRACE_COLORS[ti % FFT_TRACE_COLORS.length],
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
        return tooltipRow(name, yStr);
      }).join("");
      return freqLabel ? tooltipWrap(freqLabel, rows) : rows;
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
    this._sampleRateHz = 0;
    this._nyquistHz = 0;
    this._dominantPeaks = [];
    this._chart?.setOption({ series: [] });
    this._renderOverlay();
  }
  /** Toggle peak label display. */
  setShowPeakLabels(show) {
    this._showPeakLabels = show;
    this._renderOverlay();
  }
  /** Get spectral info for display. */
  getSpectralInfo() {
    return {
      sampleRateHz: this._sampleRateHz,
      nyquistHz: this._nyquistHz,
      peaks: this._dominantPeaks
    };
  }
  destroy() {
    this._overlayObserver?.disconnect();
    this._overlayObserver = null;
    this._chart?.dispose?.();
    this._chart = null;
  }
  /* ── Annotation overlay canvas ─────────────────────── */
  _initOverlay() {
    const container = this._container;
    if (!container) return;
    const { canvas, observer } = createCanvasOverlay(container, () => this._renderOverlay());
    this._overlayCanvas = canvas;
    this._overlayObserver = observer;
  }
  _renderOverlay() {
    const canvas = this._overlayCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    ctx.fillStyle = "rgba(159, 177, 209, 0.92)";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Frequency (${unit})`, plotL + plotW / 2, canvas.height - 10);
    ctx.translate(16, plotT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(this._yAxisLabel(), 0, 0);
    ctx.restore();
    if (this._showPeakLabels && this._dominantPeaks.length > 0) {
      this._renderPeakLabels(ctx, xMin, xMax, plotL, plotT, plotW, plotH, sc, unit);
    }
    if (this._annotations.length === 0) return;
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
    initBoxZoom({
      container,
      grid: FFT_GRID,
      getXRange: () => ({ min: this._getXMin(), max: this._getXMax() }),
      onZoom: (min, max) => {
        this.setView(Math.max(0, min), Math.min(this._fullXMax, max));
      },
      onClick: (cssX) => {
        if (this._traces.length === 0) return;
        const rect = container.getBoundingClientRect();
        const plotL = FFT_GRID.left;
        const plotW = Math.max(1, rect.width - FFT_GRID.left - FFT_GRID.right);
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
      },
      onDblClick: () => {
        this._annotations = [];
        this.resetView();
      }
    });
    initWheelZoom({
      container,
      grid: FFT_GRID,
      getXRange: () => ({ min: this._getXMin(), max: this._getXMax() }),
      onZoom: (min, max) => this.setView(min, max),
      clamp: { min: 0, max: this._fullXMax }
    });
  }
  /** Render dominant frequency peak labels on the overlay. */
  _renderPeakLabels(ctx, xMin, xMax, plotL, plotT, plotW, plotH, sc, unit) {
    ctx.save();
    ctx.font = "10px Inter, system-ui, sans-serif";
    const peaksToShow = this._dominantPeaks.slice(0, 3);
    for (const peak of peaksToShow) {
      const freqHz = peak.frequency_hz;
      if (freqHz < xMin || freqHz > xMax) continue;
      const ax = plotL + (freqHz - xMin) / (xMax - xMin) * plotW;
      const traceData = this._traces[0];
      if (!traceData) continue;
      const raw = this._mode === "psd" ? traceData.psd : traceData.magnitudes;
      const freqIdx = traceData.frequencies.findIndex((f) => Math.abs(f - freqHz) < 1e-10);
      if (freqIdx < 0) continue;
      const yVal = this._logScale ? raw[freqIdx] > 0 ? Math.log10(raw[freqIdx]) : -10 : raw[freqIdx];
      let yMin = Infinity, yMax = -Infinity;
      for (const t of this._traces) {
        const vals = this._mode === "psd" ? t.psd : t.magnitudes;
        for (const v of vals) {
          const y = this._logScale ? v > 0 ? Math.log10(v) : -10 : v;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) continue;
      const ay = plotT + plotH - (yVal - yMin) / (yMax - yMin) * plotH;
      ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fill();
      const label = `${(freqHz * sc).toFixed(2)} ${unit}`;
      const period = frequencyToPeriod(freqHz);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.textAlign = ax > plotL + plotW / 2 ? "right" : "left";
      const xOffset = ax > plotL + plotW / 2 ? -8 : 8;
      ctx.fillText(label, ax + xOffset, ay - 8);
      ctx.fillStyle = "rgba(180, 180, 180, 0.85)";
      ctx.fillText(`(${period})`, ax + xOffset, ay + 4);
    }
    ctx.restore();
  }
};
export {
  FftChart
};
//# sourceMappingURL=FftChart.js.map
