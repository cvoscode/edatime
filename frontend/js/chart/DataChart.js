import {
  createCanvasOverlay,
  ensureRelativePosition,
  initBoxZoom
} from "../chunk-667JW4DN.js";
import {
  DEBUG,
  dbg
} from "../chunk-P2MGEQ7G.js";
import {
  Ad,
  defaultGpuPowerPreference
} from "../chunk-LYBNNLKR.js";
import {
  appState,
  buildAdaptiveLineY,
  formatTimeTooltip,
  formatTimestamp,
  formatTwoDecimals,
  getSeriesColor
} from "../chunk-QM2AJNKI.js";
import {
  downloadBlob,
  downloadUrl,
  escapeHtml
} from "../chunk-W3LBOP5Z.js";
import "../chunk-PZ5AY32C.js";

// frontend/src/chart/colorScale.ts
var VIRIDIS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
var VIRIDIS_RGB = VIRIDIS.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]);
function getInterpolatedColor(t) {
  if (!Number.isFinite(t)) return VIRIDIS[0];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (VIRIDIS_RGB.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(VIRIDIS_RGB.length - 1, leftIndex + 1);
  const weight = scaled - leftIndex;
  const left = VIRIDIS_RGB[leftIndex];
  const right = VIRIDIS_RGB[rightIndex];
  const r = Math.round(left[0] + (right[0] - left[0]) * weight);
  const g = Math.round(left[1] + (right[1] - left[1]) * weight);
  const b = Math.round(left[2] + (right[2] - left[2]) * weight);
  return `rgb(${r}, ${g}, ${b})`;
}
var COLOR_BUCKETS = 64;
var _bucketPalette = [];
for (let i = 0; i < COLOR_BUCKETS; i++) {
  _bucketPalette.push(getInterpolatedColor(i / (COLOR_BUCKETS - 1)));
}
function bucketIndexForValue(value, min, span) {
  if (span <= 0) return 0;
  const t = (value - min) / span;
  return Math.max(0, Math.min(COLOR_BUCKETS - 1, Math.floor(t * (COLOR_BUCKETS - 1) + 0.5)));
}
function categoryColorFor(label, categories) {
  const index = categories.indexOf(label);
  return getSeriesColor(label, index >= 0 ? index : categories.length);
}
function analyzeColorValues(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const uniqueValues = /* @__PURE__ */ new Set();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let numericCount = 0;
  let nonNumericCount = 0;
  const sampleSize = Math.min(values.length, 1e3);
  for (let i = 0; i < sampleSize; i++) {
    const raw = values[i];
    if (raw == null) continue;
    uniqueValues.add(String(raw));
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) numericCount += 1;
    else nonNumericCount += 1;
  }
  const isNumeric = numericCount > 0 && nonNumericCount === 0;
  if (isNumeric) {
    for (let i = 0; i < values.length; i++) {
      const value = Number(values[i]);
      if (!Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { isNumeric: true, min, max, categories: [] };
  }
  const categories = [];
  for (const value of uniqueValues) categories.push(value);
  return { isNumeric: false, min: null, max: null, categories };
}
function colorForScaleValue(rawValue, scaleInfo) {
  if (!scaleInfo) return null;
  if (scaleInfo.isNumeric) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return null;
    const span = scaleInfo.max - scaleInfo.min;
    const t = span > 0 ? (numeric - scaleInfo.min) / span : 0;
    return getInterpolatedColor(t);
  }
  return categoryColorFor(String(rawValue), scaleInfo.categories);
}
function buildColorizedSeries(colName, points, colorValues, scaleInfo, visible, showMarkers) {
  const series = [];
  const annotations = [];
  if (!Array.isArray(points) || points.length === 0 || !Array.isArray(colorValues) || !scaleInfo) {
    return { series, annotations };
  }
  if (points.length === 1) {
    const pointColor = colorForScaleValue(colorValues[0], scaleInfo) || getSeriesColor(colName, 0);
    series.push({ type: "line", name: colName, color: pointColor, visible, data: [points[0], points[0]] });
    if (showMarkers && visible) {
      annotations.push({ type: "point", x: points[0][0], y: points[0][1], layer: "aboveSeries", marker: { symbol: "circle", size: 5, style: { color: pointColor } } });
    }
    return { series, annotations };
  }
  if (scaleInfo.isNumeric) {
    const min = scaleInfo.min;
    const span = scaleInfo.max - min;
    const buckets = new Uint8Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const v = Number(colorValues[i]);
      buckets[i] = Number.isFinite(v) ? bucketIndexForValue(v, min, span) : 0;
    }
    let segIdx = 0;
    let runStart = 0;
    while (runStart < points.length) {
      const bucket = buckets[runStart];
      let runEnd = runStart + 1;
      while (runEnd < points.length && buckets[runEnd] === bucket) runEnd++;
      const segStart = runStart;
      const segEnd = Math.min(runEnd, points.length);
      const segData = [];
      for (let j = segStart; j < segEnd; j++) segData.push(points[j]);
      if (segEnd < points.length) segData.push(points[segEnd]);
      const color = _bucketPalette[bucket];
      series.push({
        type: "line",
        name: segIdx === 0 ? colName : `__color_segment__${colName}::${segIdx}`,
        color,
        visible,
        showInLegend: segIdx === 0,
        data: segData
      });
      segIdx++;
      runStart = runEnd;
    }
  } else {
    const labels = colorValues.map((v) => String(v ?? ""));
    let segIdx = 0;
    let runStart = 0;
    while (runStart < labels.length) {
      const label = labels[runStart];
      let runEnd = runStart + 1;
      while (runEnd < labels.length && labels[runEnd] === label) runEnd++;
      const segStart = runStart;
      const segEnd = Math.min(runEnd, points.length);
      const segData = [];
      for (let j = segStart; j < segEnd; j++) segData.push(points[j]);
      if (segEnd < points.length) segData.push(points[segEnd]);
      const color = categoryColorFor(label, scaleInfo.categories);
      series.push({
        type: "line",
        name: segIdx === 0 ? colName : `__color_segment__${colName}::${segIdx}`,
        color,
        visible,
        showInLegend: segIdx === 0,
        data: segData
      });
      segIdx++;
      runStart = runEnd;
    }
  }
  if (showMarkers && visible && points.length <= 500) {
    for (let i = 0; i < points.length; i++) {
      const pointColor = colorForScaleValue(colorValues[i], scaleInfo) || getSeriesColor(colName, 0);
      annotations.push({ type: "point", x: points[i][0], y: points[i][1], layer: "aboveSeries", marker: { symbol: "circle", size: 5, style: { color: pointColor } } });
    }
  }
  return { series, annotations };
}
function baseSeriesName(name) {
  const text = String(name || "");
  if (!text) return "";
  if (text.endsWith("__markers")) return text.slice(0, -"__markers".length);
  if (text.startsWith("__color_segment__")) {
    const body = text.slice("__color_segment__".length);
    return body.split("::")[0] || "";
  }
  if (text.startsWith("__color_markers__")) {
    const body = text.slice("__color_markers__".length);
    return body.split("::")[0] || "";
  }
  return text;
}

// frontend/src/chart/ticks.ts
function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}
function niceLinearTicks(min, max, count = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const n = Math.max(2, Math.floor(count));
  const range = niceNum(max - min, false);
  const step = niceNum(range / (n - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  const guard = Math.max(2, Math.min(1024, Math.ceil((niceMax - niceMin) / step) + 2));
  for (let i = 0; i < guard; i++) {
    const v = niceMin + i * step;
    if (v > niceMax + step * 0.5) break;
    ticks.push(v);
  }
  return ticks;
}
function niceTimeTicks(minMs, maxMs, count = 6) {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [];
  const span = maxMs - minMs;
  const n = Math.max(2, Math.floor(count));
  const target = span / (n - 1);
  const steps = [
    1e3,
    2e3,
    5e3,
    1e4,
    3e4,
    6e4,
    2 * 6e4,
    5 * 6e4,
    10 * 6e4,
    30 * 6e4,
    60 * 6e4,
    2 * 36e5,
    6 * 36e5,
    12 * 36e5,
    864e5,
    2 * 864e5,
    7 * 864e5,
    30 * 864e5
  ];
  const step = steps.find((s) => s >= target) ?? steps[steps.length - 1];
  const start = Math.ceil(minMs / step) * step;
  const ticks = [];
  const guard = Math.max(2, Math.min(2048, Math.ceil((maxMs - start) / step) + 3));
  for (let i = 0; i < guard; i++) {
    const t = start + i * step;
    if (t > maxMs + step * 0.25) break;
    ticks.push(t);
  }
  return ticks;
}

// frontend/src/chart/DataChart.ts
var CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 };
var DataChart = class {
  containerId;
  onZoomCallback;
  onYRangeCallback;
  onZoomOutCallback;
  chartInstance;
  _xMin = null;
  _xMax = null;
  _container = null;
  _selectionBox = null;
  _yMin = null;
  _yMax = null;
  _yAuto = true;
  _lastDataYMin = null;
  _lastDataYMax = null;
  _lastSeriesList = null;
  _lastXDomainMin = null;
  _lastXDomainMax = null;
  _chartTitle = "";
  _xAxisLabel = "";
  _yAxisLabel = "";
  _titleEl = null;
  _xLabelEl = null;
  _yLabelEl = null;
  _overlayCanvas = null;
  _overlayCtx = null;
  _drawingResizeObserver = null;
  _chartResizeObserver = null;
  _drawings = [];
  _currentDraw = null;
  _drawMode = "none";
  _drawColor = "#ff0055";
  _drawWidth = 2;
  _drawingRafId = null;
  constructor(containerId, onZoomCallback, onYRangeCallback = null, onZoomOutCallback = null) {
    this.containerId = containerId;
    this.onZoomCallback = onZoomCallback;
    this.onYRangeCallback = onYRangeCallback;
    this.onZoomOutCallback = onZoomOutCallback;
    this.chartInstance = null;
  }
  /* ── Public surface ─────────────────────────────────── */
  destroy() {
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
  setChartText(title, xLabel, yLabel) {
    this._chartTitle = String(title ?? "").trim();
    this._xAxisLabel = String(xLabel ?? "").trim();
    this._yAxisLabel = String(yLabel ?? "").trim();
    this._syncTextOverlays();
  }
  setDrawMode(mode, color, width) {
    this._drawMode = mode;
    if (color) this._drawColor = color;
    if (width) this._drawWidth = width;
    if (this._overlayCanvas) {
      this._overlayCanvas.style.pointerEvents = mode === "none" ? "none" : "auto";
    }
  }
  clearDrawings() {
    this._drawings = [];
    this._currentDraw = null;
    this._renderDrawings();
  }
  requestOverlayRender() {
    this._renderDrawings();
  }
  resize() {
    this.chartInstance?.resize?.();
    this._renderDrawings();
  }
  /** Schedule a drawing render on the next animation frame (coalesces rapid calls). */
  _scheduleDrawingRender() {
    if (this._drawingRafId !== null) return;
    this._drawingRafId = requestAnimationFrame(() => {
      this._drawingRafId = null;
      this._renderDrawings();
    });
  }
  setXRange(minMs, maxMs) {
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return;
    this._xMin = minMs;
    this._xMax = maxMs;
    if (DEBUG) dbg("setXRange", { minMs, maxMs });
  }
  async init() {
    const container = document.getElementById(this.containerId);
    this._container = container;
    const chartOptions = {
      grid: CHART_GRID,
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      legend: { show: true, position: "right" },
      series: []
    };
    const powerPreference = defaultGpuPowerPreference();
    if (powerPreference) chartOptions.powerPreference = powerPreference;
    this.chartInstance = await Ad(container, chartOptions);
    this._chartResizeObserver?.disconnect();
    this._chartResizeObserver = new ResizeObserver(() => this.resize());
    this._chartResizeObserver.observe(container);
    this._initDrawingOverlay();
    this._initTextOverlays();
    this._initMouseSelectionZoom();
    requestAnimationFrame(() => this.resize());
  }
  supportsZoomControls() {
    return !!this.chartInstance;
  }
  getXDomain() {
    if (Number.isFinite(this._lastXDomainMin) && Number.isFinite(this._lastXDomainMax) && this._lastXDomainMax > this._lastXDomainMin) {
      return { min: this._lastXDomainMin, max: this._lastXDomainMax };
    }
    return null;
  }
  setYRange(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
    this._applyYRange(min, max, "api", false);
  }
  getYRange() {
    if (Number.isFinite(this._lastDataYMin) && Number.isFinite(this._lastDataYMax) && this._lastDataYMax > this._lastDataYMin) {
      return { min: this._lastDataYMin, max: this._lastDataYMax };
    }
    if (Number.isFinite(this._yMin) && Number.isFinite(this._yMax) && this._yMax > this._yMin) {
      return { min: this._yMin, max: this._yMax };
    }
    return null;
  }
  cssPointToData(clientX, clientY) {
    if (!this._container) return null;
    if (!Number.isFinite(this._xMin) || !Number.isFinite(this._xMax) || this._xMax <= this._xMin) return null;
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
      x: this._xMin + xNorm * (this._xMax - this._xMin),
      y: yRange.max - yNorm * (yRange.max - yRange.min)
    };
  }
  zoomY(_factor, _anchorNormalized = 0.5) {
  }
  resetYRange() {
  }
  fitYToData() {
    if (!Number.isFinite(this._lastDataYMin) || !Number.isFinite(this._lastDataYMax)) return;
    if (this.onYRangeCallback) this.onYRangeCallback(this._lastDataYMin, this._lastDataYMax, "data");
  }
  onCrosshairMove(callback) {
    this.chartInstance?.on("crosshairMove", callback);
  }
  onClick(callback) {
    this.chartInstance?.on("click", callback);
  }
  /* ── Data update ────────────────────────────────────── */
  updateDataMulti(dataObj, columns) {
    if (!this.chartInstance) return;
    const showMarkers = dataObj?._meta?.downsampled === false;
    const prevVisibility = this._getVisibilityByBaseNameFromChart();
    let dataYMin = Number.POSITIVE_INFINITY;
    let dataYMax = Number.NEGATIVE_INFINITY;
    let xDomainMin = Number.POSITIVE_INFINITY;
    let xDomainMax = Number.NEGATIVE_INFINITY;
    const seriesAnnotations = [];
    const seriesList = columns.filter((colName) => {
      const name = String(colName || "").toLowerCase();
      if (name === "ts" || name === "timestamp" || name === "time") return false;
      return dataObj.values?.[colName] || dataObj.series?.[colName];
    }).map((colName, idx) => {
      const seriesData = dataObj.series?.[colName];
      const yValues = seriesData ? seriesData.y : dataObj.values[colName];
      const xValues = seriesData ? seriesData.x : dataObj.ts;
      const points = [];
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
      const seriesColors = Array.isArray(dataObj.colorByColumn?.[colName]) ? dataObj.colorByColumn[colName] : dataObj.color;
      const wantsColorBy = !!appState.selectedColorColumn && Array.isArray(seriesColors) && seriesColors.length === points.length;
      if (wantsColorBy) {
        return [{ __colorCandidate: true, colName, idx, visible, points, colorValues: seriesColors }];
      }
      const numColIdx = appState.numericCols.indexOf(colName);
      const color = getSeriesColor(colName, numColIdx >= 0 ? numColIdx : idx);
      const lineSeries = { type: "line", name: colName, color, visible, data: points };
      if (showMarkers && visible) {
        for (const pt of points) {
          seriesAnnotations.push({ type: "point", x: pt[0], y: pt[1], layer: "aboveSeries", marker: { symbol: "circle", size: 5, style: { color } } });
        }
      }
      return [lineSeries];
    });
    const colorColumn = appState.selectedColorColumn;
    const colorDecoratedSeries = [];
    const colorbarWrap = document.getElementById("timeseries-colorbar-wrap");
    const categoricalWrap = document.getElementById("timeseries-categorical-wrap");
    if (colorbarWrap) {
      colorbarWrap.hidden = true;
      colorbarWrap.style.display = "none";
    }
    if (categoricalWrap) {
      categoricalWrap.hidden = true;
      categoricalWrap.style.display = "none";
    }
    const colorCandidates = [];
    const baseSeriesList = [];
    for (const entry of seriesList.flat()) {
      if (entry?.__colorCandidate) colorCandidates.push(entry);
      else baseSeriesList.push(entry);
    }
    const displayedColorValues = colorCandidates.flatMap((e) => e.colorValues || []);
    const scaleInfo = colorColumn ? analyzeColorValues(displayedColorValues) : null;
    if (colorColumn && scaleInfo && colorCandidates.length > 0) {
      for (const entry of colorCandidates) {
        const { series: colorSeries, annotations: colorAnnotations } = buildColorizedSeries(
          entry.colName,
          entry.points,
          entry.colorValues,
          scaleInfo,
          entry.visible,
          showMarkers
        );
        colorDecoratedSeries.push(...colorSeries);
        seriesAnnotations.push(...colorAnnotations);
      }
      if (scaleInfo.isNumeric) {
        if (colorbarWrap) {
          colorbarWrap.hidden = false;
          colorbarWrap.style.display = "grid";
          document.getElementById("timeseries-colorbar-name").textContent = colorColumn;
          document.getElementById("timeseries-colorbar-min").textContent = formatTwoDecimals(scaleInfo.min);
          document.getElementById("timeseries-colorbar-max").textContent = formatTwoDecimals(scaleInfo.max);
          document.getElementById("timeseries-colorbar").style.background = `linear-gradient(90deg, ${VIRIDIS.join(",")})`;
        }
      } else if (categoricalWrap) {
        categoricalWrap.hidden = false;
        categoricalWrap.style.display = "grid";
        document.getElementById("timeseries-categorical-name").textContent = colorColumn;
        const legend = document.getElementById("timeseries-categorical-legend");
        legend.innerHTML = "";
        scaleInfo.categories.forEach((category) => {
          const item = document.createElement("div");
          item.className = "scatter-distribution-legend-item";
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
      if (this.onYRangeCallback) this.onYRangeCallback(dataYMin, dataYMax, "data");
    }
    if (flattenedSeriesList.length > 0) {
      const tooltipFormatter = (params) => {
        const rawList = Array.isArray(params) ? params : [params];
        const seen = /* @__PURE__ */ new Set();
        const list = rawList.filter((p) => {
          const base = baseSeriesName(p?.seriesName ?? "");
          if (!base || seen.has(base)) return false;
          seen.add(base);
          return true;
        });
        if (list.length === 0) return "";
        const x = Number(list[0]?.value?.[0]);
        const spanMs = Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax) ? Math.max(1, xDomainMax - xDomainMin) : 864e5;
        const header = Number.isFinite(x) ? formatTimeTooltip(x, spanMs) : "";
        const rows = list.map((p) => {
          const name = escapeHtml(baseSeriesName(p?.seriesName ?? "series") || "series");
          const y = formatTwoDecimals(p?.value?.[1]);
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(y)}</span></div>`;
        }).join("");
        return header ? `<div style="opacity:0.8;margin-bottom:6px;">${escapeHtml(header)}</div>${rows}` : rows;
      };
      const nextOption = {
        grid: CHART_GRID,
        xAxis: {
          type: "time",
          min: Number.isFinite(xDomainMin) ? xDomainMin : void 0,
          max: Number.isFinite(xDomainMax) ? xDomainMax : void 0,
          tickFormatter: (value) => formatTimestamp(
            value,
            Number.isFinite(xDomainMin) && Number.isFinite(xDomainMax) ? Math.max(1, xDomainMax - xDomainMin) : 864e5
          )
        },
        yAxis: this._buildYAxisOption(),
        tooltip: { show: true, trigger: "axis", formatter: tooltipFormatter },
        series: flattenedSeriesList,
        annotations: seriesAnnotations
      };
      try {
        this.chartInstance.setOption(nextOption);
        if (this.chartInstance.getZoomRange && this.chartInstance.setZoomRange) {
          this.chartInstance.setZoomRange(0, 100, "api");
        }
      } catch (e) {
        console.error("[edatime:chart] setOption failed", e);
      }
    }
    this._renderDrawings();
  }
  /* ── Export ──────────────────────────────────────────── */
  async exportPNG() {
    const canvas = await this._getCombinedExportCanvas(true);
    if (!canvas) return;
    downloadUrl(canvas.toDataURL("image/png"), "edatime_chart.png");
  }
  async exportSVG() {
    const canvas = await this._getCombinedExportCanvas(false);
    if (!canvas) return;
    const pngData = canvas.toDataURL("image/png");
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
`;
    svg += `  <image href="${pngData}" x="0" y="0" width="${w}" height="${h}" />
`;
    svg += this.exportSVGDrawings(w, h);
    svg += "</svg>";
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, "edatime_chart.svg");
  }
  async exportHTML() {
    const canvas = await this._getCombinedExportCanvas(true);
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const html = `<!DOCTYPE html><html><head><title>EdaTime Export</title><style>body{margin:0;background:#1a1a1a;display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto;box-shadow:0 4px 12px rgba(0,0,0,0.5)}</style></head><body><img src="${dataUrl}" alt="EdaTime Chart"/></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, "edatime_chart.html");
  }
  exportSVGDrawings(viewWidth, viewHeight) {
    const allDraws = [...this._drawings];
    if (this._currentDraw) allDraws.push(this._currentDraw);
    if (allDraws.length === 0) return "";
    const baseW = this._overlayCanvas?.width || this._container?.getBoundingClientRect?.().width || viewWidth || 1;
    const baseH = this._overlayCanvas?.height || this._container?.getBoundingClientRect?.().height || viewHeight || 1;
    const scaleX = viewWidth / (baseW || 1);
    const scaleY = viewHeight / (baseH || 1);
    const strokeScale = Math.min(scaleX, scaleY);
    let body = "";
    for (const item of allDraws) {
      if (item.type === "arrow") {
        body += this._drawArrowSVG(item, scaleX, scaleY);
      } else if (item.type === "box") {
        const x = Math.min(item.startX, item.endX) * scaleX;
        const y = Math.min(item.startY, item.endY) * scaleY;
        const w = Math.abs(item.endX - item.startX) * scaleX;
        const h = Math.abs(item.endY - item.startY) * scaleY;
        body += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${item.color}" stroke-width="${item.width * strokeScale}" stroke-linecap="round" stroke-linejoin="round" />
`;
      }
    }
    return body;
  }
  /* ── Private helpers ────────────────────────────────── */
  _applyYRange(min, max, sourceKind, setAuto) {
    if (setAuto === true) this._yAuto = true;
    if (setAuto === false) this._yAuto = false;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
    this._yMin = min;
    this._yMax = max;
    if (this.onYRangeCallback) this.onYRangeCallback(min, max, sourceKind);
  }
  _buildYAxisOption() {
    return { type: "value", tickFormatter: (value) => formatTwoDecimals(value) };
  }
  _getVisibilityByBaseNameFromChart() {
    const vis = /* @__PURE__ */ new Map();
    const series = this.chartInstance?.options?.series;
    if (!Array.isArray(series)) return vis;
    for (const s of series) {
      const name = typeof s?.name === "string" ? s.name : "";
      const base = baseSeriesName(name);
      if (!base) continue;
      vis.set(base, s.visible !== false);
    }
    return vis;
  }
  /* ── Text overlays ──────────────────────────────────── */
  _initTextOverlays() {
    if (!this._container) return;
    const container = this._container;
    ensureRelativePosition(container);
    const mk = (cls) => {
      const el = document.createElement("div");
      el.className = `chart-text-overlay ${cls}`;
      el.style.display = "none";
      container.appendChild(el);
      return el;
    };
    this._titleEl = mk("chart-title-overlay");
    this._xLabelEl = mk("chart-xlabel-overlay");
    this._yLabelEl = mk("chart-ylabel-overlay");
    this._syncTextOverlays();
  }
  _syncTextOverlays() {
    const set = (el, text) => {
      if (!el) return;
      const t = String(text ?? "").trim();
      el.textContent = t;
      el.style.display = t ? "block" : "none";
    };
    set(this._titleEl, this._chartTitle);
    set(this._xLabelEl, this._xAxisLabel);
    set(this._yLabelEl, this._yAxisLabel);
  }
  /* ── Drawing overlay ────────────────────────────────── */
  _initDrawingOverlay() {
    if (!this._container) return;
    const container = this._container;
    ensureRelativePosition(container);
    const { canvas, observer } = createCanvasOverlay(container, () => this._renderDrawings());
    this._drawingResizeObserver = observer;
    this._overlayCanvas = canvas;
    this._overlayCtx = canvas.getContext("2d");
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this._drawMode === "none") return;
      const rect = canvas.getBoundingClientRect();
      this._currentDraw = { type: this._drawMode, color: this._drawColor, width: this._drawWidth, startX: e.clientX - rect.left, startY: e.clientY - rect.top, endX: e.clientX - rect.left, endY: e.clientY - rect.top };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this._currentDraw || this._drawMode === "none") return;
      const rect = canvas.getBoundingClientRect();
      this._currentDraw.endX = e.clientX - rect.left;
      this._currentDraw.endY = e.clientY - rect.top;
      this._scheduleDrawingRender();
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!this._currentDraw || this._drawMode === "none") return;
      this._drawings.push(this._currentDraw);
      this._currentDraw = null;
      canvas.releasePointerCapture(e.pointerId);
      this._renderDrawings();
    });
    canvas.addEventListener("pointercancel", () => {
      this._currentDraw = null;
      this._renderDrawings();
    });
  }
  /* ── Drawing render ─────────────────────────────────── */
  _drawArrow(ctx, sx, sy, ex, ey) {
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
  _renderDrawings() {
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
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (item.type === "arrow") this._drawArrow(ctx, item.startX, item.startY, item.endX, item.endY);
      else if (item.type === "box") {
        ctx.beginPath();
        ctx.rect(Math.min(item.startX, item.endX), Math.min(item.startY, item.endY), Math.abs(item.endX - item.startX), Math.abs(item.endY - item.startY));
        ctx.stroke();
      }
    }
  }
  _renderRollingBandsToCtx(ctx, scale) {
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
    const toX = (ms) => plotLeft + (ms - xMin) / (xMax - xMin) * plotWidth;
    const toY = (v) => plotBottom - (v - yRange.min) / ySpan * plotHeight;
    ctx.save();
    for (const band of bands) {
      const n = band.ts.length;
      if (n < 2) continue;
      ctx.fillStyle = "rgba(100, 180, 255, 0.22)";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = band.upper2[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        const v = band.lower2[i];
        if (v == null) continue;
        ctx.lineTo(toX(band.ts[i]), toY(v));
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(100, 180, 255, 0.38)";
      ctx.beginPath();
      started = false;
      for (let i = 0; i < n; i++) {
        const v = band.upper1[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) {
        const v = band.lower1[i];
        if (v == null) continue;
        ctx.lineTo(toX(band.ts[i]), toY(v));
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(180, 220, 255, 0.90)";
      ctx.lineWidth = 1.5 * Math.min(scale.x, scale.y);
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      started = false;
      for (let i = 0; i < n; i++) {
        const v = band.mean[i];
        if (v == null) continue;
        const px = toX(band.ts[i]);
        const py = toY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  _renderAnomalyRegionsToCtx(ctx, scale) {
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
    ctx.fillStyle = "rgba(255, 74, 110, 0.15)";
    ctx.strokeStyle = "rgba(255, 74, 110, 0.5)";
    ctx.lineWidth = 1 * Math.min(scale.x, scale.y);
    for (const region of regions) {
      const rStart = Math.max(xMin, region.start_ms);
      const rEnd = Math.min(xMax, region.end_ms);
      if (rStart >= rEnd) continue;
      const sx = plotLeft + (rStart - xMin) / (xMax - xMin) * plotWidth;
      const ex = plotLeft + (rEnd - xMin) / (xMax - xMin) * plotWidth;
      const w = Math.max(2, ex - sx);
      ctx.fillRect(sx, plotTop, w, plotHeight);
      ctx.strokeRect(sx, plotTop, w, plotHeight);
    }
    ctx.restore();
  }
  _renderAdaptiveFilterLinesToCtx(ctx, scale) {
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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([8 * strokeScale, 6 * strokeScale]);
    for (const filter of filters) {
      if (!visibleCols.has(filter?.column)) continue;
      const segStart = Math.max(xMin, Math.min(Number(filter.x1), Number(filter.x2)));
      const segEnd = Math.min(xMax, Math.max(Number(filter.x1), Number(filter.x2)));
      if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || !(segEnd > segStart)) continue;
      const y1 = buildAdaptiveLineY(filter, segStart);
      const y2 = buildAdaptiveLineY(filter, segEnd);
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
      const sx = plotLeft + (segStart - xMin) / (xMax - xMin) * plotWidth;
      const ex = plotLeft + (segEnd - xMin) / (xMax - xMin) * plotWidth;
      const sy = plotBottom - (y1 - yRange.min) / Math.max(1e-9, yRange.max - yRange.min) * plotHeight;
      const ey = plotBottom - (y2 - yRange.min) / Math.max(1e-9, yRange.max - yRange.min) * plotHeight;
      const stroke = filter.keepAbove ? "rgba(0, 200, 150, 0.95)" : "rgba(255, 74, 110, 0.95)";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2 * strokeScale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      const label = `${filter.column} ${filter.keepAbove ? "keep above" : "keep below"}`;
      ctx.fillStyle = stroke;
      ctx.font = `${Math.max(10, 11 * strokeScale)}px Inter, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, Math.min(ex, plotRight - 140 * strokeScale), Math.min(sy, ey) - 4 * strokeScale);
    }
    if (pending && visibleCols.has(pending.column)) {
      const px = Number(pending.x);
      const py = Number(pending.y);
      const hasTwoPoints = Number.isFinite(pending.x2) && Number.isFinite(pending.y2);
      if (hasTwoPoints) {
        const px2 = Number(pending.x2);
        const py2 = Number(pending.y2);
        const toSx = (v) => plotLeft + (v - xMin) / (xMax - xMin) * plotWidth;
        const toSy = (v) => plotBottom - (v - yRange.min) / Math.max(1e-9, yRange.max - yRange.min) * plotHeight;
        const sx1 = toSx(px);
        const sy1 = toSy(py);
        const sx2 = toSx(px2);
        const sy2 = toSy(py2);
        if (Number.isFinite(sx1) && Number.isFinite(sy1) && Number.isFinite(sx2) && Number.isFinite(sy2)) {
          ctx.setLineDash([6 * strokeScale, 4 * strokeScale]);
          ctx.strokeStyle = "rgba(0, 212, 255, 0.85)";
          ctx.lineWidth = 2 * strokeScale;
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
          ctx.setLineDash([]);
          for (const [ex, ey] of [[sx1, sy1], [sx2, sy2]]) {
            ctx.fillStyle = "rgba(0, 212, 255, 0.95)";
            ctx.beginPath();
            ctx.arc(ex, ey, Math.max(3, 4 * strokeScale), 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = Math.max(1, 1.5 * strokeScale);
            ctx.stroke();
          }
        }
      } else if (Number.isFinite(px) && Number.isFinite(py) && px >= xMin && px <= xMax) {
        const sx = plotLeft + (px - xMin) / (xMax - xMin) * plotWidth;
        const sy = plotBottom - (py - yRange.min) / Math.max(1e-9, yRange.max - yRange.min) * plotHeight;
        if (Number.isFinite(sx) && Number.isFinite(sy)) {
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(0, 212, 255, 0.95)";
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(3, 4 * strokeScale), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.lineWidth = Math.max(1, 1.5 * strokeScale);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  /** Render annotations (notes, bookmarks) on the overlay. */
  _renderAnnotationsToCtx(ctx, scale) {
    const annotations = window.__edatimeAnnotations;
    if (!annotations || typeof annotations.getAnnotationsForPage !== "function") return;
    const timeAnnotations = annotations.getAnnotationsForPage("timeseries");
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
      if (end < xMin || start > xMax) continue;
      const visStart = Math.max(xMin, start);
      const visEnd = Math.min(xMax, end);
      const sx = plotLeft + (visStart - xMin) / (xMax - xMin) * plotWidth;
      const ex = plotLeft + (visEnd - xMin) / (xMax - xMin) * plotWidth;
      const color = ann.color || "#ffc041";
      if (ann.type === "bookmark" || start === end) {
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
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.textAlign = "left";
        ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
      } else if (ann.type === "note" || ann.type === "region") {
        ctx.fillStyle = color.replace(")", ", 0.15)").replace("rgb", "rgba").replace("##", "#");
        if (typeof ctx.fillStyle !== "string" || !ctx.fillStyle.includes("rgba")) {
          ctx.fillStyle = `${color}26`;
        }
        ctx.fillRect(sx, plotTop, ex - sx, plotHeight);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 * strokeScale;
        ctx.setLineDash([4 * strokeScale, 2 * strokeScale]);
        ctx.strokeRect(sx, plotTop, ex - sx, plotHeight);
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.fillText(ann.title, sx + 4 * strokeScale, plotTop + 14 * strokeScale);
      }
    }
    ctx.restore();
  }
  /* ── Mouse selection zoom ───────────────────────────── */
  _initMouseSelectionZoom() {
    if (!this._container) return;
    const container = this._container;
    this._selectionBox = initBoxZoom({
      container,
      grid: CHART_GRID,
      getXRange: () => ({ min: this._xMin ?? 0, max: this._xMax ?? 0 }),
      onZoom: (min, max) => this.onZoomCallback?.(min, max, "user"),
      shouldIgnore: (e) => this._drawMode !== "none" || e.ctrlKey,
      onDblClick: () => this.onZoomOutCallback?.()
    });
  }
  /* ── Export internals ───────────────────────────────── */
  _getExportViewport() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this._container?.getBoundingClientRect?.();
    const cssWidth = Math.max(1, Math.round(rect?.width ?? this._overlayCanvas?.width ?? 1));
    const cssHeight = Math.max(1, Math.round(rect?.height ?? this._overlayCanvas?.height ?? 1));
    return { cssWidth, cssHeight, width: Math.max(1, Math.round(cssWidth * dpr)), height: Math.max(1, Math.round(cssHeight * dpr)), dpr };
  }
  _getExportDomains() {
    const xMin = Number.isFinite(this._xMin) ? this._xMin : this._lastXDomainMin;
    const xMax = Number.isFinite(this._xMax) ? this._xMax : this._lastXDomainMax;
    const yRange = this.getYRange();
    const yMin = yRange?.min;
    const yMax = yRange?.max;
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return null;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) return null;
    const ySpan = yMax - yMin;
    const pad = ySpan * 0.04;
    return { xMin, xMax, yMin: yMin - pad, yMax: yMax + pad };
  }
  async _getCombinedExportCanvas(includeDrawings) {
    if (!this._container) return null;
    const domains = this._getExportDomains();
    if (!domains) return null;
    const viewport = this._getExportViewport();
    const outCanvas = document.createElement("canvas");
    outCanvas.width = viewport.width;
    outCanvas.height = viewport.height;
    this._renderExportChartToCanvas(outCanvas, viewport, domains, includeDrawings);
    return outCanvas;
  }
  _renderExportChartToCanvas(canvas, viewport, domains, includeDrawings) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { cssWidth, cssHeight, width, height } = viewport;
    const scale = width / cssWidth;
    const styles = getComputedStyle(document.body);
    const bg = styles.getPropertyValue("--bg").trim() || "#080a10";
    const surface2 = styles.getPropertyValue("--surface-2").trim() || "#181c2a";
    const border = styles.getPropertyValue("--border").trim() || "#272d45";
    const borderHi = styles.getPropertyValue("--border-hi").trim() || "#363f62";
    const text = styles.getPropertyValue("--text").trim() || "#c8d0e4";
    const textDim = styles.getPropertyValue("--text-dim").trim() || "#7a86a4";
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
      if (!s || s.type !== "line") continue;
      const pts = Array.isArray(s.data) ? s.data : [];
      if (pts.length === 0) continue;
      ctx.beginPath();
      ctx.strokeStyle = s.color || "#00E5FF";
      ctx.lineWidth = 1.5 * scale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      let started = false;
      for (const p of pts) {
        const x = Number(p?.[0]);
        const y = Number(p?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = plotLeft + (x - domains.xMin) / xSpan * plotWidth;
        const py = plotBottom - (y - domains.yMin) / ySpan * plotHeight;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      if (started) ctx.stroke();
    }
    ctx.restore();
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
    const yTicks = niceLinearTicks(domains.yMin, domains.yMax, 6);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textDim;
    for (const y of yTicks) {
      const py = plotBottom - (y - domains.yMin) / ySpan * plotHeight;
      ctx.strokeStyle = borderHi;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(plotLeft, py);
      ctx.lineTo(plotRight, py);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(plotLeft - tickLen, py);
      ctx.lineTo(plotLeft, py);
      ctx.stroke();
      ctx.fillText(formatTwoDecimals(y), plotLeft - tickLen - labelPad, py);
    }
    const xTicks = niceTimeTicks(domains.xMin, domains.xMax, 6);
    const spanMs = domains.xMax - domains.xMin;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = textDim;
    for (const x of xTicks) {
      const px = plotLeft + (x - domains.xMin) / xSpan * plotWidth;
      ctx.strokeStyle = borderHi;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(px, plotTop);
      ctx.lineTo(px, plotBottom);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(px, plotBottom);
      ctx.lineTo(px, plotBottom + tickLen);
      ctx.stroke();
      ctx.fillText(formatTimestamp(x, spanMs), px, plotBottom + tickLen + labelPad);
    }
    const title = String(this._chartTitle ?? "").trim();
    if (title) {
      ctx.save();
      ctx.fillStyle = text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
      ctx.fillText(title, width / 2, Math.max(2 * scale, (plotTop - (Math.max(12, Math.round(14 * scale)) + 2 * scale)) / 2));
      ctx.restore();
    }
    const xAxisName = String(this._xAxisLabel ?? "").trim();
    if (xAxisName) {
      ctx.save();
      ctx.fillStyle = textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(xAxisName, width / 2, height - fontSize - 2 * scale);
      ctx.restore();
    }
    const yAxisName = String(this._yAxisLabel ?? "").trim();
    if (yAxisName) {
      ctx.save();
      ctx.fillStyle = textDim;
      ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(yAxisName, 0, 0);
      ctx.restore();
    }
    const legendEntries = seriesList.filter((s) => s && s.type === "line" && typeof s.name === "string" && !s.name.endsWith("__markers")).map((s) => ({ name: s.name, color: s.color || "#00E5FF" }));
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
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = surface2;
      ctx.fillRect(x0, y0, boxW, boxH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(x0, y0, boxW, boxH);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = text;
      for (let i = 0; i < legendEntries.length; i++) {
        const e = legendEntries[i];
        const cy = y0 + pad2 + i * lh + lh / 2;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(x0 + pad2, cy);
        ctx.lineTo(x0 + pad2 + sw, cy);
        ctx.stroke();
        ctx.fillText(e.name, x0 + pad2 + sw + gap, cy);
      }
      ctx.restore();
    }
    if (includeDrawings) {
      this._renderDrawingsToCtx(ctx, { x: width / cssWidth, y: height / cssHeight });
    }
    ctx.restore();
  }
  _renderDrawingsToCtx(ctx, scale) {
    const allDraws = [...this._drawings];
    if (this._currentDraw) allDraws.push(this._currentDraw);
    const strokeScale = Math.min(scale.x, scale.y);
    for (const item of allDraws) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.width * strokeScale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const sx = item.startX * scale.x;
      const sy = item.startY * scale.y;
      const ex = item.endX * scale.x;
      const ey = item.endY * scale.y;
      if (item.type === "arrow") {
        const headlen = 10 * strokeScale;
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (item.type === "box") {
        ctx.beginPath();
        ctx.rect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy));
        ctx.stroke();
      }
    }
  }
  _drawArrowSVG(item, scaleX, scaleY) {
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
    return `  <path d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.width * strokeScale}" stroke-linecap="round" stroke-linejoin="round" />
`;
  }
};
export {
  DataChart
};
//# sourceMappingURL=DataChart.js.map
