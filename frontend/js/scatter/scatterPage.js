import {
  createEmptyStateController,
  isRangeOutsideDataset
} from "../chunk-EB7OGCRI.js";
import {
  fetchFft,
  fetchScatterCorrelations,
  fetchScatterPoints
} from "../chunk-M7RFYJA6.js";
import "../chunk-P2MGEQ7G.js";
import {
  Ad,
  defaultGpuPowerPreference,
  requestGpuAdapter
} from "../chunk-HIE322HX.js";
import {
  MATRIX_MAX_COLUMNS,
  MATRIX_POINT_LIMIT,
  applyScatterStateFromCache,
  buildCategoricalColorGroups,
  buildGroupedDistributionSeries,
  buildHistogramForDomain,
  buildOverviewContextKey,
  buildRenderSignature,
  buildScatterQueryContext,
  clampView,
  createMiniCanvas,
  currentControls,
  disposeScatterChart,
  drawDistributionCanvas,
  drawMiniDensityCanvas,
  drawMiniScatterCanvas,
  ensureOptions,
  fmt,
  formatValueForColumn,
  getActiveScatterFilterColumns,
  getCanvasFrame,
  getPlotMetrics,
  isLinkedBrushEnabled,
  isTemporalColumn,
  lowerBoundByX,
  normalizeAnalyticsView,
  normalizeCategoryLabel,
  normalizeScatterSuggestionThreshold,
  paletteForScale,
  resetScatterContainer,
  sampleGradient,
  setPanelStatus,
  setStats,
  showError,
  state,
  upperBoundByX
} from "../chunk-3BFTKZYS.js";
import {
  appState,
  formatTimestamp,
  formatTwoDecimals
} from "../chunk-CLZT53LK.js";
import {
  downloadBlob,
  downloadUrl,
  escapeHtml,
  getEl
} from "../chunk-W3LBOP5Z.js";
import "../chunk-PZ5AY32C.js";

// frontend/src/scatter/export.ts
function buildLinearTicks(min, max, count = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return [];
  const n = Math.max(2, Math.floor(count));
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + step * i);
}
function getScatterExportViewport() {
  const container = getEl("scatter-chart");
  const rect = container?.getBoundingClientRect?.();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(1, Math.round(rect?.width ?? 1200));
  const cssHeight = Math.max(1, Math.round(rect?.height ?? 720));
  return { cssWidth, cssHeight, width: Math.max(1, Math.round(cssWidth * dpr)), height: Math.max(1, Math.round(cssHeight * dpr)), dpr };
}
function drawScatterSeriesToCanvas(ctx, plotLeft, plotTop, plotWidth, plotHeight, controls, scale) {
  const xSpan = Math.max(1e-9, state.view.xMax - state.view.xMin);
  const ySpan = Math.max(1e-9, state.view.yMax - state.view.yMin);
  const points = state.points;
  const categoricalGroups = buildCategoricalColorGroups(state.colorLabels);
  if (controls.renderMode === "density") {
    const binSize = Math.max(2, (Number(controls.binSize) || 10) * scale);
    const cols = Math.max(1, Math.ceil(plotWidth / binSize));
    const rows = Math.max(1, Math.ceil(plotHeight / binSize));
    const counts = new Uint32Array(cols * rows);
    let maxCount = 0;
    for (const [x, y] of points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const nx = (x - state.view.xMin) / xSpan;
      const ny = (y - state.view.yMin) / ySpan;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      const col = Math.max(0, Math.min(cols - 1, Math.floor(nx * cols)));
      const row = Math.max(0, Math.min(rows - 1, Math.floor((1 - ny) * rows)));
      const bucket = row * cols + col;
      counts[bucket] += 1;
      if (counts[bucket] > maxCount) maxCount = counts[bucket];
    }
    const palette2 = paletteForScale(controls.colormap);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const count = counts[row * cols + col];
        if (count <= 0) continue;
        const ratio = controls.normalization === "log" ? Math.log1p(count) / Math.log1p(Math.max(1, maxCount)) : count / Math.max(1, maxCount);
        ctx.globalAlpha = 0.18 + ratio * 0.82;
        ctx.fillStyle = sampleGradient(palette2, ratio);
        ctx.fillRect(plotLeft + col * binSize, plotTop + row * binSize, Math.ceil(binSize), Math.ceil(binSize));
      }
    }
    ctx.globalAlpha = 1;
    return;
  }
  const maxPoints = 2e5;
  const stride = Math.max(1, Math.ceil(points.length / maxPoints));
  const palette = paletteForScale(controls.colorScale);
  const radius = Math.max(1.8, 2.6 * scale);
  for (let i = 0; i < points.length; i += stride) {
    const [x, y] = points[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const px = plotLeft + (x - state.view.xMin) / xSpan * plotWidth;
    const py = plotTop + (1 - (y - state.view.yMin) / ySpan) * plotHeight;
    let fill = "#4a9eff";
    if (controls.selectedColorColumn && categoricalGroups) {
      fill = categoricalGroups.colorByLabel.get(normalizeCategoryLabel(state.colorLabels?.[i])) || fill;
    } else if (controls.selectedColorColumn && Array.isArray(state.colorValues) && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax) && state.colorMax > state.colorMin) {
      const v = Number(state.colorValues[i]);
      if (Number.isFinite(v)) fill = sampleGradient(palette, (v - state.colorMin) / (state.colorMax - state.colorMin));
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
function renderScatterExportToCanvas(canvas) {
  const controls = currentControls();
  const viewport = getScatterExportViewport();
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const scale = viewport.width / viewport.cssWidth;
  const styles = getComputedStyle(document.body);
  const bg = styles.getPropertyValue("--bg").trim() || "#080a10";
  const surface = styles.getPropertyValue("--surface-2").trim() || "#181c2a";
  const border = styles.getPropertyValue("--border").trim() || "#272d45";
  const borderHi = styles.getPropertyValue("--border-hi").trim() || "#363f62";
  const text = styles.getPropertyValue("--text").trim() || "#c8d0e4";
  const textDim = styles.getPropertyValue("--text-dim").trim() || "#7a86a4";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  const grid = { left: 72 * scale, right: 200 * scale, top: 24 * scale, bottom: 50 * scale };
  const plotLeft = grid.left;
  const plotTop = grid.top;
  const plotRight = Math.max(plotLeft + 1, viewport.width - grid.right);
  const plotBottom = Math.max(plotTop + 1, viewport.height - grid.bottom);
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
  ctx.clip();
  drawScatterSeriesToCanvas(ctx, plotLeft, plotTop, plotWidth, plotHeight, controls, scale);
  ctx.restore();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();
  const fontSize = Math.max(10, Math.round(12 * scale));
  const tickLen = 6 * scale;
  const labelPad = 4 * scale;
  ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
  const yTicks = buildLinearTicks(state.view.yMin, state.view.yMax, 6);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textDim;
  for (const tick of yTicks) {
    const py = plotBottom - (tick - state.view.yMin) / Math.max(1e-9, state.view.yMax - state.view.yMin) * plotHeight;
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
    ctx.fillText(formatValueForColumn(controls.y, tick, Math.max(1, state.view.yMax - state.view.yMin), state.columnTypes), plotLeft - tickLen - labelPad, py);
  }
  const xTicks = buildLinearTicks(state.view.xMin, state.view.xMax, 6);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of xTicks) {
    const px = plotLeft + (tick - state.view.xMin) / Math.max(1e-9, state.view.xMax - state.view.xMin) * plotWidth;
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
    ctx.fillText(formatValueForColumn(controls.x, tick, Math.max(1, state.view.xMax - state.view.xMin), state.columnTypes), px, plotBottom + tickLen + labelPad);
  }
  ctx.save();
  ctx.fillStyle = text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `${Math.max(12, Math.round(14 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.fillText(`${controls.renderMode === "density" ? "Density" : "Scatter"}: ${controls.x || "x"} vs ${controls.y || "y"}`, viewport.width / 2, 4 * scale);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = textDim;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.fillText(controls.x || "x", viewport.width / 2, viewport.height - fontSize - 4 * scale);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = textDim;
  ctx.font = `${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.translate(Math.max(10 * scale, fontSize), (plotTop + plotBottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(controls.y || "y", 0, 0);
  ctx.restore();
  const corr = state.correlationsByColumn.get(controls.y || "");
  ctx.save();
  ctx.fillStyle = surface;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1 * scale;
  const corrX = viewport.width - 190 * scale;
  const corrY = 10 * scale;
  const corrW = 170 * scale;
  const corrH = 44 * scale;
  ctx.fillRect(corrX, corrY, corrW, corrH);
  ctx.strokeRect(corrX, corrY, corrW, corrH);
  ctx.fillStyle = text;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.fillText(`Pearson correlation: ${Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : "\u2014"}`, corrX + 10 * scale, corrY + 8 * scale);
  ctx.fillText(`Spearman correlation: ${Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : "\u2014"}`, corrX + 10 * scale, corrY + 24 * scale);
  ctx.restore();
  const showContinuousLegend = controls.renderMode === "density" || controls.selectedColorColumn && !buildCategoricalColorGroups(state.colorLabels) && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax) && state.colorMax > state.colorMin;
  if (showContinuousLegend) {
    const palette = paletteForScale(controls.renderMode === "density" ? controls.colormap : controls.colorScale);
    const legendX = viewport.width - 190 * scale;
    const legendY = 64 * scale;
    const legendW = 220 * scale;
    const legendH = 40 * scale;
    ctx.save();
    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * scale;
    ctx.fillRect(legendX, legendY, legendW, legendH);
    ctx.strokeRect(legendX, legendY, legendW, legendH);
    const gradient = ctx.createLinearGradient(legendX + 10 * scale, 0, legendX + legendW - 10 * scale, 0);
    palette.forEach((c, i) => gradient.addColorStop(i / Math.max(1, palette.length - 1), c));
    ctx.fillStyle = text;
    ctx.font = `${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(controls.renderMode === "density" ? `Density (${controls.colormap})` : `${controls.selectedColorColumn} (${controls.colorScale})`, legendX + 10 * scale, legendY + 6 * scale);
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX + 10 * scale, legendY + 22 * scale, legendW - 20 * scale, 8 * scale);
    ctx.fillStyle = textDim;
    ctx.textBaseline = "middle";
    ctx.fillText(controls.renderMode === "density" ? "Low" : formatTwoDecimals(state.colorMin), legendX + 10 * scale, legendY + 34 * scale);
    ctx.textAlign = "right";
    ctx.fillText(controls.renderMode === "density" ? "High" : formatTwoDecimals(state.colorMax), legendX + legendW - 10 * scale, legendY + 34 * scale);
    ctx.restore();
  }
  return true;
}
function buildVisibleScatterRows() {
  const controls = currentControls();
  const rows = [];
  const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
  const ySpan = Math.max(1, state.view.yMax - state.view.yMin);
  for (let i = 0; i < state.points.length; i++) {
    const x = Number(state.points[i]?.[0]);
    const y = Number(state.points[i]?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < state.view.xMin || x > state.view.xMax || y < state.view.yMin || y > state.view.yMax) continue;
    const row = {
      x,
      y,
      x_label: formatValueForColumn(controls.x, x, xSpan, state.columnTypes),
      y_label: formatValueForColumn(controls.y, y, ySpan, state.columnTypes)
    };
    if (controls.selectedColorColumn && Array.isArray(state.colorLabels)) {
      row.color = normalizeCategoryLabel(state.colorLabels[i]);
    } else if (controls.selectedColorColumn && Array.isArray(state.colorValues)) {
      const cv = Number(state.colorValues[i]);
      row.color = Number.isFinite(cv) ? cv : null;
    }
    rows.push(row);
  }
  return rows;
}
function exportScatterData(format = "csv") {
  const controls = currentControls();
  const rows = buildVisibleScatterRows();
  if (rows.length === 0) return false;
  if (format === "json") {
    downloadBlob(
      new Blob([JSON.stringify({ x: controls.x, y: controls.y, color: controls.selectedColorColumn || null, rows }, null, 2)], { type: "application/json;charset=utf-8" }),
      "edatime_scatter_filtered.json"
    );
    return true;
  }
  const header = ["x", "y", "x_label", "y_label"];
  if (controls.selectedColorColumn) header.push("color");
  const lines = [header.join(",")];
  for (const row of rows) {
    const values = [row.x, row.y, `"${String(row.x_label).replaceAll('"', '""')}"`, `"${String(row.y_label).replaceAll('"', '""')}"`];
    if (controls.selectedColorColumn) values.push(row.color == null ? "" : String(row.color));
    lines.push(values.join(","));
  }
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "edatime_scatter_filtered.csv");
  return true;
}
async function exportScatterPNG() {
  const canvas = document.createElement("canvas");
  if (!renderScatterExportToCanvas(canvas)) return;
  downloadUrl(canvas.toDataURL("image/png"), "edatime_scatter.png");
}
async function exportScatterSVG() {
  const canvas = document.createElement("canvas");
  if (!renderScatterExportToCanvas(canvas)) return;
  const pngData = canvas.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${pngData}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" /></svg>`;
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "edatime_scatter.svg");
}
async function exportScatterHTML() {
  const canvas = document.createElement("canvas");
  if (!renderScatterExportToCanvas(canvas)) return;
  const dataUrl = canvas.toDataURL("image/png");
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>EdaTime Scatter Export</title>
    <style>body { margin: 0; background: #1a1a1a; display: flex; justify-content: center; align-items: center; min-height: 100vh; } img { max-width: 100%; height: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }</style>
</head>
<body><img src="${dataUrl}" alt="EdaTime Scatter Export" /></body>
</html>`;
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "edatime_scatter.html");
}
async function exportScatterParquet() {
  const controls = currentControls();
  if (!controls.x || !controls.y) return false;
  const payload = { x: String(controls.x), y: String(controls.y), color: controls.selectedColorColumn || void 0, limit: 1e6 };
  const context = (await import("./state.js")).buildScatterQueryContext({
    x: controls.x,
    y: controls.y,
    colorColumn: controls.selectedColorColumn
  });
  if (Number.isFinite(context.start) && Number.isFinite(context.end)) {
    payload.start = context.start;
    payload.end = context.end;
  }
  if (Array.isArray(context.filters) && context.filters.length > 0) payload.filters = JSON.stringify(context.filters);
  if (Array.isArray(context.lineFilters) && context.lineFilters.length > 0) payload.line_filters = JSON.stringify(context.lineFilters);
  const res = await fetch("/api/scatter/export/parquet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const text = await res.text().catch(() => "Scatter parquet export failed");
    throw new Error(text || "Scatter parquet export failed");
  }
  downloadBlob(await res.blob(), "edatime_scatter_filtered.parquet");
  return true;
}

// frontend/src/scatter/rendering.ts
var SCATTER_GRID_LEFT = 72;
var SCATTER_GRID_RIGHT = 72;
var SCATTER_GRID_TOP = 24;
var SCATTER_GRID_BOTTOM = 50;
function buildNormalScatterSeries(points, controls) {
  const colorColumn = controls.selectedColorColumn;
  const values = state.colorValues;
  const categoricalGroups = colorColumn ? buildCategoricalColorGroups(state.colorLabels) : null;
  if (categoricalGroups) {
    return categoricalGroups.categories.map((label) => {
      const data = [];
      for (let i = 0; i < points.length; i++) {
        if (normalizeCategoryLabel(state.colorLabels?.[i]) !== label) continue;
        data.push(points[i]);
      }
      return { type: "scatter", name: label, data, symbolSize: 3, color: categoricalGroups.colorByLabel.get(label) || "#4a9eff", sampling: "none" };
    }).filter((s) => s.data.length > 0);
  }
  if (!colorColumn || !Array.isArray(values) || values.length === 0) {
    return [{ type: "scatter", name: `${controls.x || "x"} vs ${controls.y || "y"}`, data: points, symbolSize: 3, color: "#4a9eff", sampling: "none" }];
  }
  const min = Number.isFinite(state.colorMin) ? state.colorMin : null;
  const max = Number.isFinite(state.colorMax) ? state.colorMax : null;
  if (min === null || max === null || !(max > min)) {
    return [{ type: "scatter", name: `${controls.x || "x"} vs ${controls.y || "y"}`, data: points, symbolSize: 3, color: "#4a9eff", sampling: "none" }];
  }
  const bins = 64;
  const span = max - min;
  const grouped = Array.from({ length: bins }, () => []);
  const valueCount = Math.min(points.length, values.length);
  for (let idx = 0; idx < points.length; idx++) {
    const v = idx < valueCount ? Number(values[idx]) : Number.NaN;
    if (!Number.isFinite(v)) continue;
    let b = Math.floor((v - min) / span * bins);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    grouped[b].push(points[idx]);
  }
  const gradient = paletteForScale(controls.colorScale);
  const series = [];
  for (let b = 0; b < bins; b++) {
    if (!grouped[b] || grouped[b].length === 0) continue;
    series.push({
      type: "scatter",
      name: `${colorColumn}`,
      data: grouped[b],
      symbolSize: 3,
      color: sampleGradient(gradient, (b + 0.5) / bins),
      sampling: "none"
    });
  }
  return series;
}
function buildDensitySeries(points, controls) {
  return [{
    type: "scatter",
    name: "density",
    data: points,
    mode: "density",
    binSize: controls.binSize,
    densityColormap: paletteForScale(controls.colormap),
    densityNormalization: controls.normalization,
    sampling: "none"
  }];
}
function buildDensityTooltipCache(series, controls, container) {
  const metrics = getPlotMetrics(container);
  if (!metrics) return null;
  const xSpan = state.view.xMax - state.view.xMin;
  const ySpan = state.view.yMax - state.view.yMin;
  if (!(xSpan > 0) || !(ySpan > 0)) return null;
  const binSize = Math.max(1, Number(controls.binSize) || 10);
  const key = [
    state.view.xMin,
    state.view.xMax,
    state.view.yMin,
    state.view.yMax,
    metrics.plotWidth,
    metrics.plotHeight,
    binSize,
    controls.colorColumn || "",
    controls.renderMode || ""
  ].join("|");
  if (state.densityTooltipCache?.key === key) return state.densityTooltipCache;
  const binsBySeriesIndex = /* @__PURE__ */ new Map();
  const metaBySeriesIndex = /* @__PURE__ */ new Map();
  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    if (!s || !Array.isArray(s.data)) continue;
    const map = /* @__PURE__ */ new Map();
    if (Object.prototype.hasOwnProperty.call(s, "__edatimeColorCenter")) {
      metaBySeriesIndex.set(si, { colorCenter: s.__edatimeColorCenter, colorLo: s.__edatimeColorLo, colorHi: s.__edatimeColorHi });
    }
    for (const p of s.data) {
      const x = Number(p?.[0]);
      const y = Number(p?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < state.view.xMin || x > state.view.xMax || y < state.view.yMin || y > state.view.yMax) continue;
      const nx = (x - state.view.xMin) / xSpan;
      const ny = (y - state.view.yMin) / ySpan;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      const bx = Math.floor(nx * metrics.plotWidth / binSize);
      const by = Math.floor((1 - ny) * metrics.plotHeight / binSize);
      const k = `${bx},${by}`;
      map.set(k, (map.get(k) || 0) + 1);
    }
    binsBySeriesIndex.set(si, map);
  }
  state.densityTooltipCache = { key, binSize, metrics, binsBySeriesIndex, metaBySeriesIndex };
  return state.densityTooltipCache;
}
function densityTooltipFormatterFactory(controls, container) {
  return (params) => {
    const p = Array.isArray(params) ? params[0] : params;
    if (!p) return "";
    const cache = state.densityTooltipCache || buildDensityTooltipCache(state.lastOptionSeries || [], controls, container);
    const x = Number(p?.value?.[0]);
    const y = Number(p?.value?.[1]);
    const seriesIndex = Number(p?.seriesIndex);
    let density = null;
    const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
    const m = cache?.metrics;
    const xSpan = state.view.xMax - state.view.xMin;
    const ySpan = state.view.yMax - state.view.yMin;
    const binSize = cache?.binSize;
    if (bins && m && Number.isFinite(x) && Number.isFinite(y) && xSpan > 0 && ySpan > 0 && Number.isFinite(binSize) && binSize > 0) {
      const nx = (x - state.view.xMin) / xSpan;
      const ny = (y - state.view.yMin) / ySpan;
      const bx = Math.floor(nx * m.plotWidth / binSize);
      const by = Math.floor((1 - ny) * m.plotHeight / binSize);
      density = bins.get(`${bx},${by}`) ?? null;
    }
    const parts = [];
    const xSpanLabel = Math.max(1, state.view.xMax - state.view.xMin);
    const ySpanLabel = Math.max(1, state.view.yMax - state.view.yMin);
    parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.x || "X")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpanLabel, state.columnTypes))}</span></div>`);
    parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.y || "Y")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpanLabel, state.columnTypes))}</span></div>`);
    const meta = cache?.metaBySeriesIndex?.get(seriesIndex);
    if (controls.colorColumn && meta && Number.isFinite(meta.colorCenter)) {
      parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(meta.colorCenter))}</span></div>`);
    }
    parts.push(`<div><span style="opacity:0.85;">Density:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(density == null ? "\u2014" : fmt.format(density))}</span></div>`);
    return parts.join("");
  };
}
function scatterTooltipFormatterFactory(controls) {
  return (params) => {
    const p = Array.isArray(params) ? params[0] : params;
    if (!p) return "";
    const x = Number(p?.value?.[0]);
    const y = Number(p?.value?.[1]);
    const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
    const ySpan = Math.max(1, state.view.yMax - state.view.yMin);
    const parts = [
      `<div><span style="opacity:0.85;">${escapeHtml(controls.x || "X")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpan, state.columnTypes))}</span></div>`,
      `<div><span style="opacity:0.85;">${escapeHtml(controls.y || "Y")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpan, state.columnTypes))}</span></div>`
    ];
    if (controls.selectedColorColumn && Array.isArray(state.colorLabels)) {
      const label = p?.seriesName || null;
      if (label) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(label))}</span></div>`);
    } else if (controls.selectedColorColumn && Array.isArray(state.colorValues)) {
      const colorValue = Number(state.colorValues[Number(p?.dataIndex)]);
      if (Number.isFinite(colorValue)) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(colorValue))}</span></div>`);
    }
    return parts.join("");
  };
}
function setColorbarVisible(visible) {
  const panel = getEl("scatter-right-panel");
  const wrap = getEl("scatter-colorbar-wrap");
  if (wrap) wrap.hidden = !visible;
  if (panel) panel.hidden = !visible && panel.dataset.marginalActive !== "1";
}
function renderColorbarCanvas() {
  const barCanvas = getEl("scatter-colorbar");
  if (!barCanvas) return;
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const palette = paletteForScale(isDensity ? ctl.colormap : ctl.colorScale);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.max(1, barCanvas.offsetWidth || 14);
  const cssH = Math.max(1, barCanvas.offsetHeight || 160);
  barCanvas.width = Math.round(cssW * dpr);
  barCanvas.height = Math.round(cssH * dpr);
  const ctx = barCanvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const grad = ctx.createLinearGradient(0, 0, 0, cssH);
  palette.forEach((stop, i) => grad.addColorStop(1 - i / (palette.length - 1), stop));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, cssW, cssH, 3);
  ctx.fill();
}
function updateColorbarUI() {
  if (state.activeView !== "plot") {
    setColorbarVisible(false);
    return;
  }
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const hasContinuousColor = !!ctl.selectedColorColumn && Array.isArray(state.colorValues) && state.colorValues.length > 0 && Number.isFinite(state.colorMin) && Number.isFinite(state.colorMax) && state.colorMax > state.colorMin;
  if (!isDensity && !hasContinuousColor) {
    setColorbarVisible(false);
    return;
  }
  const show = isDensity || hasContinuousColor;
  setColorbarVisible(show);
  if (!show) return;
  const nameEl = getEl("scatter-colorbar-name");
  const minEl = getEl("scatter-colorbar-min");
  const maxEl = getEl("scatter-colorbar-max");
  if (isDensity) {
    if (nameEl) nameEl.textContent = `Density (${ctl.colormap})`;
    if (minEl) minEl.textContent = "Low";
    if (maxEl) maxEl.textContent = "High";
  } else {
    if (nameEl) nameEl.textContent = `${ctl.selectedColorColumn} (${ctl.colorScale})`;
    if (minEl) minEl.textContent = formatTwoDecimals(state.colorMin);
    if (maxEl) maxEl.textContent = formatTwoDecimals(state.colorMax);
  }
  requestAnimationFrame(renderColorbarCanvas);
}
function setCorrelationOverlayText(pearson, spearman) {
  const el = getEl("scatter-correlation-overlay");
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}
function drawMarginalX(canvas, values, viewMin, viewMax) {
  const frame = getCanvasFrame(canvas, 600, 64);
  if (!frame) return;
  const { ctx, width, height } = frame;
  const histogram = buildHistogramForDomain(values, viewMin, viewMax, 40);
  if (!histogram) return;
  const plotLeft = SCATTER_GRID_LEFT;
  const plotRight = Math.max(plotLeft + 1, width - SCATTER_GRID_RIGHT);
  const plotW = plotRight - plotLeft;
  const { counts } = histogram;
  const maxCount = Math.max(1, ...counts);
  const barW = plotW / counts.length;
  const drawH = height - 4;
  ctx.fillStyle = "rgba(74, 158, 255, 0.45)";
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0) continue;
    const barH = Math.max(2, counts[i] / maxCount * drawH);
    ctx.fillRect(plotLeft + i * barW + 0.5, height - barH - 2, Math.max(1, barW - 1), barH);
  }
}
function drawMarginalY(canvas, values, viewMin, viewMax) {
  const frame = getCanvasFrame(canvas, 40, 400);
  if (!frame) return;
  const { ctx, width, height } = frame;
  const histogram = buildHistogramForDomain(values, viewMin, viewMax, 32);
  if (!histogram) return;
  const plotTop = SCATTER_GRID_TOP;
  const plotBottom = Math.max(plotTop + 1, height - SCATTER_GRID_BOTTOM);
  const plotH = plotBottom - plotTop;
  const { counts } = histogram;
  const maxCount = Math.max(1, ...counts);
  const binH = plotH / counts.length;
  const maxBarW = width - 4;
  ctx.fillStyle = "rgba(74, 158, 255, 0.35)";
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0) continue;
    const barW = Math.max(2, counts[i] / maxCount * maxBarW);
    const y = plotBottom - (i + 1) * binH;
    ctx.fillRect(0, y + 0.5, barW, Math.max(1, binH - 1));
  }
}
function updateMarginalPlots() {
  const isPlot = state.activeView === "plot";
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const hasPoints = state.points.length > 0;
  const showMarginals = isPlot && !isDensity && hasPoints;
  const rightPanel = getEl("scatter-right-panel");
  const chartEl = getEl("scatter-chart");
  const marginalX = getEl("scatter-marginal-x");
  const marginalY = getEl("scatter-marginal-y");
  if (rightPanel) rightPanel.dataset.marginalActive = showMarginals ? "1" : "0";
  if (marginalX) marginalX.hidden = !showMarginals;
  if (chartEl) chartEl.classList.toggle("with-x-marginal", showMarginals);
  const colorbarActive = rightPanel ? !(getEl("scatter-colorbar-wrap")?.hidden ?? true) : false;
  if (rightPanel) rightPanel.hidden = !showMarginals && !colorbarActive;
  if (!showMarginals) {
    if (marginalY) marginalY.hidden = true;
    return;
  }
  if (marginalY) marginalY.hidden = false;
  const xValues = state.points.map((p) => Number(p[0])).filter((v) => Number.isFinite(v));
  const yValues = state.points.map((p) => Number(p[1])).filter((v) => Number.isFinite(v));
  if (marginalX) requestAnimationFrame(() => drawMarginalX(marginalX, xValues, state.view.xMin, state.view.xMax));
  if (marginalY) requestAnimationFrame(() => drawMarginalY(marginalY, yValues, state.view.yMin, state.view.yMax));
}
function buildOption(points, container) {
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const xSpan = Math.max(1, state.view.xMax - state.view.xMin);
  const ySpan = Math.max(1, state.view.yMax - state.view.yMin);
  const xTickFormatter = isTemporalColumn(ctl.x, state.columnTypes) ? (v) => formatTimestamp(v, xSpan) : (v) => formatTwoDecimals(v);
  const yTickFormatter = isTemporalColumn(ctl.y, state.columnTypes) ? (v) => formatTimestamp(v, ySpan) : (v) => formatTwoDecimals(v);
  const series = isDensity ? buildDensitySeries(points, ctl) : buildNormalScatterSeries(points, ctl);
  state.lastOptionSeries = series;
  const option = {
    theme: "dark",
    grid: { left: 72, right: 200, top: 24, bottom: 50 },
    xAxis: { type: "value", name: ctl.x || "x", min: state.view.xMin, max: state.view.xMax, tickFormatter: xTickFormatter },
    yAxis: { type: "value", name: ctl.y || "y", min: state.view.yMin, max: state.view.yMax, tickFormatter: yTickFormatter },
    legend: { show: false },
    series
  };
  if (isDensity) {
    option.tooltip = { show: true, trigger: "item", formatter: densityTooltipFormatterFactory(ctl, container) };
    buildDensityTooltipCache(series, ctl, container);
  } else {
    state.densityTooltipCache = null;
    option.tooltip = { show: true, trigger: "item", formatter: scatterTooltipFormatterFactory(ctl) };
  }
  return option;
}
function renderCurrentOption() {
  if (!state.chart) return;
  const container = getEl("scatter-chart");
  state.chart.setOption(buildOption(state.points, container));
  requestAnimationFrame(() => state.chart?.resize?.());
  updateColorbarUI();
  updateBinnedReadout();
  updateMarginalPlots();
}
function applyView(nextView, pushHistory = false) {
  const current = { ...state.view };
  const next = clampView(nextView);
  if (pushHistory) state.zoomHistory = [...state.zoomHistory, current].slice(-30);
  state.view = next;
  renderCurrentOption();
}
function resetView(clearHistory = true) {
  if (clearHistory) state.zoomHistory = [];
  state.view = { ...state.full };
  renderCurrentOption();
}
function updateBinnedReadout() {
  if (!state.chart || state.points.length === 0) {
    setStats({ visiblePoints: "0" });
    return;
  }
  const i0 = lowerBoundByX(state.points, state.view.xMin);
  const i1 = upperBoundByX(state.points, state.view.xMax);
  const visibleCount = Math.max(0, i1 - i0);
  const text = fmt.format(visibleCount);
  if (text !== state.lastBinnedText) {
    state.lastBinnedText = text;
    setStats({ visiblePoints: text });
  }
}
function updateCorrelationStats() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const pairEl = getEl("scatter-current-pair");
  const openCausalBtn = getEl("scatter-open-causal-btn");
  const corr = state.correlationsByColumn.get(ySelect?.value || "");
  const pearson = Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : "\u2014";
  const spearman = Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : "\u2014";
  if (pairEl) {
    const x = xSelect?.value || "X";
    const y = ySelect?.value || "Y";
    pairEl.textContent = `Pair: ${x} vs ${y}`;
  }
  if (openCausalBtn) openCausalBtn.disabled = !(xSelect?.value && ySelect?.value);
  setStats({ pearson, spearman });
  setCorrelationOverlayText(corr?.pearson, corr?.spearman);
}
function initSelectionZoom(container) {
  if (!container || state.selectionBox) return;
  if (window.getComputedStyle(container).position === "static") container.style.position = "relative";
  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
    border: "1px solid rgba(0, 212, 255, 0.9)",
    background: "rgba(0, 212, 255, 0.15)",
    pointerEvents: "none",
    display: "none",
    zIndex: "8"
  });
  container.appendChild(box);
  state.selectionBox = box;
  const renderSelectionBox = () => {
    if (!state.selectionBox || !state.drag) return;
    const left = Math.min(state.drag.startX, state.drag.endX);
    const right = Math.max(state.drag.startX, state.drag.endX);
    const top = Math.min(state.drag.startY, state.drag.endY);
    const bottom = Math.max(state.drag.startY, state.drag.endY);
    state.selectionBox.style.left = `${left}px`;
    state.selectionBox.style.top = `${top}px`;
    state.selectionBox.style.width = `${Math.max(0, right - left)}px`;
    state.selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
    state.selectionBox.style.display = "block";
  };
  const hideSelectionBox = () => {
    if (state.selectionBox) state.selectionBox.style.display = "none";
  };
  container.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const rect = container.getBoundingClientRect();
    state.drag = { pointerId: ev.pointerId, startX: ev.clientX - rect.left, endX: ev.clientX - rect.left, startY: ev.clientY - rect.top, endY: ev.clientY - rect.top };
    try {
      container.setPointerCapture(ev.pointerId);
    } catch {
    }
    renderSelectionBox();
  });
  container.addEventListener("pointermove", (ev) => {
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return;
    const rect = container.getBoundingClientRect();
    state.drag.endX = ev.clientX - rect.left;
    state.drag.endY = ev.clientY - rect.top;
    renderSelectionBox();
  });
  const finishDrag = (ev) => {
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const left = Math.max(0, Math.min(state.drag.startX, state.drag.endX));
    const right = Math.min(width, Math.max(state.drag.startX, state.drag.endX));
    const top = Math.max(0, Math.min(state.drag.startY, state.drag.endY));
    const bottom = Math.min(height, Math.max(state.drag.startY, state.drag.endY));
    state.drag = null;
    hideSelectionBox();
    if (right - left < 8 || bottom - top < 8) {
      try {
        container.releasePointerCapture(ev.pointerId);
      } catch {
      }
      return;
    }
    const cur = state.view;
    const xSpan = cur.xMax - cur.xMin;
    const ySpan = cur.yMax - cur.yMin;
    applyView({
      xMin: cur.xMin + left / width * xSpan,
      xMax: cur.xMin + right / width * xSpan,
      yMax: cur.yMax - top / height * ySpan,
      yMin: cur.yMax - bottom / height * ySpan
    }, true);
    try {
      container.releasePointerCapture(ev.pointerId);
    } catch {
    }
  };
  container.addEventListener("pointerup", finishDrag);
  container.addEventListener("pointercancel", finishDrag);
  container.addEventListener("dblclick", (ev) => {
    if (ev.shiftKey) return;
    if (state.zoomHistory.length > 0) {
      applyView(state.zoomHistory.pop(), false);
      return;
    }
    resetView(false);
  });
}
function syncModeUI() {
  const ctl = currentControls();
  const view = state.activeView || "plot";
  const isPlot = view === "plot";
  const isMatrix = view === "matrix";
  const isDensity = isPlot && ctl.renderMode === "density";
  const toggle = (el, visible) => {
    if (el) el.style.display = visible ? "" : "none";
  };
  toggle(getEl("scatter-analytics-group"), !isMatrix);
  toggle(getEl("scatter-mode-label"), isPlot);
  toggle(getEl("scatter-render-mode"), isPlot);
  toggle(getEl("scatter-density-controls"), isDensity);
  toggle(getEl("scatter-color-controls"), true);
  toggle(getEl("scatter-color-scale"), isPlot && !isDensity);
  toggle(document.querySelector(".scatter-export-group"), isPlot);
  toggle(document.querySelector(".scatter-stats-bar"), isPlot);
  toggle(document.querySelector(".scatter-suggestions-bar"), !isMatrix);
  updateColorbarUI();
}

// frontend/src/scatter/matrix.ts
var draggingMatrixColumn = null;
function collectOverviewColumns() {
  const controls = currentControls();
  const columns = [];
  const push = (c) => {
    if (!c || columns.includes(c)) return;
    columns.push(c);
  };
  push(controls.x);
  push(controls.y);
  for (const item of state.lastSuggestions || []) {
    push(item?.column);
    if (columns.length >= MATRIX_MAX_COLUMNS) break;
  }
  for (const column of state.metadata?.numeric_columns || []) {
    push(column);
    if (columns.length >= MATRIX_MAX_COLUMNS) break;
  }
  return columns.slice(0, MATRIX_MAX_COLUMNS);
}
function buildOverviewColumns() {
  const derived = collectOverviewColumns();
  const next = state.matrixColumnOrder.filter((column) => derived.includes(column));
  for (const column of derived) {
    if (!next.includes(column)) next.push(column);
  }
  state.matrixColumnOrder = next.slice(0, MATRIX_MAX_COLUMNS);
  return state.matrixColumnOrder;
}
function moveColumn(columns, source, target) {
  if (!source || !target || source === target) return columns.slice();
  const sourceIndex = columns.indexOf(source);
  const targetIndex = columns.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return columns.slice();
  const next = columns.slice();
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}
function bindReorderHandle(handle, column, columns, onColumnReorder) {
  if (!onColumnReorder) return;
  handle.draggable = true;
  handle.dataset.column = column;
  handle.addEventListener("dragstart", (event) => {
    draggingMatrixColumn = column;
    handle.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", column);
    }
  });
  handle.addEventListener("dragend", () => {
    draggingMatrixColumn = null;
    handle.classList.remove("dragging");
    document.querySelectorAll(".scatter-matrix-drop-target").forEach((element) => {
      element.classList.remove("scatter-matrix-drop-target");
    });
  });
  handle.addEventListener("dragover", (event) => {
    const source = draggingMatrixColumn || event.dataTransfer?.getData("text/plain") || "";
    if (!source || source === column) return;
    event.preventDefault();
    handle.classList.add("scatter-matrix-drop-target");
  });
  handle.addEventListener("dragleave", () => {
    handle.classList.remove("scatter-matrix-drop-target");
  });
  handle.addEventListener("drop", (event) => {
    const source = draggingMatrixColumn || event.dataTransfer?.getData("text/plain") || "";
    handle.classList.remove("scatter-matrix-drop-target");
    if (!source || source === column) return;
    event.preventDefault();
    onColumnReorder(moveColumn(columns, source, column));
  });
}
async function fetchMatrixCellData(x, y, context, colorColumn) {
  const cacheKey = `${x}|${y}|${colorColumn || ""}|${buildOverviewContextKey(context)}`;
  const cached = state.matrixCache.get(cacheKey);
  if (cached) return cached;
  const request = fetchScatterPoints(x, y, MATRIX_POINT_LIMIT, colorColumn || null, context).then((response) => ({
    totalPoints: Number(response?.total_points ?? 0),
    points: Array.isArray(response?.points) ? response.points : [],
    colorValues: Array.isArray(response?.color_values) ? response.color_values : null,
    colorLabels: Array.isArray(response?.color_labels) ? response.color_labels : null
  })).catch((error) => {
    state.matrixCache.delete(cacheKey);
    throw error;
  });
  state.matrixCache.set(cacheKey, request);
  const MAX_MATRIX_CACHE = 256;
  if (state.matrixCache.size > MAX_MATRIX_CACHE) {
    const keys = state.matrixCache.keys();
    let toRemove = state.matrixCache.size - MAX_MATRIX_CACHE;
    for (const k of keys) {
      if (toRemove-- <= 0) break;
      state.matrixCache.delete(k);
    }
  }
  return request;
}
async function selectMatrixPair(x, y, refreshCorrelations, renderScatter2, setScatterView2) {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  if (!xSelect || !ySelect) return;
  xSelect.value = x;
  await refreshCorrelations();
  ySelect.value = y;
  await setScatterView2("plot", { render: false });
  await renderScatter2();
}
function describeDistributionMode(mode) {
  if (mode === "kde") return "KDE";
  if (mode === "boxplot") return "Box Plot";
  return "Histogram";
}
function renderMatrixGrid(columns, datasets, onCellClick, onColumnReorder = null) {
  const container = getEl("scatter-matrix");
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(columns) || columns.length < 2) {
    container.innerHTML = '<div class="scatter-placeholder">Choose scatter axes first. The matrix will then add related numeric columns, and you can drag the row or column headers to reorder the grid.</div>';
    return;
  }
  const controls = currentControls();
  const diagonalMode = controls.diagonalMode;
  const matrixMode = controls.matrixMode;
  const cellSize = controls.matrixCellSize;
  const grid = document.createElement("div");
  grid.className = "scatter-matrix-grid";
  grid.style.gridTemplateColumns = `60px repeat(${columns.length}, ${cellSize}px)`;
  const corner = document.createElement("div");
  corner.className = "scatter-matrix-corner";
  corner.innerHTML = '<span class="scatter-matrix-corner-axis">Y</span><span class="scatter-matrix-corner-sep">/</span><span class="scatter-matrix-corner-axis">X</span>';
  grid.appendChild(corner);
  for (const column of columns) {
    const header = document.createElement("div");
    header.className = "scatter-matrix-header";
    header.textContent = column;
    bindReorderHandle(header, column, columns, onColumnReorder);
    grid.appendChild(header);
  }
  const drawJobs = [];
  for (const rowColumn of columns) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "scatter-matrix-row-header";
    rowHeader.textContent = rowColumn;
    bindReorderHandle(rowHeader, rowColumn, columns, onColumnReorder);
    grid.appendChild(rowHeader);
    for (const column of columns) {
      const data = datasets.get(`${column}|${rowColumn}`) || { totalPoints: 0, points: [], colorValues: null, colorLabels: null };
      if (rowColumn === column) {
        const diagonal = document.createElement("div");
        diagonal.className = "scatter-matrix-diagonal";
        diagonal.style.width = `${cellSize}px`;
        diagonal.style.height = `${cellSize}px`;
        const canvas2 = createMiniCanvas("scatter-matrix-diagonal-canvas", cellSize - 32);
        canvas2.style.width = "100%";
        const values = data.points.map((p) => Number(p?.[0])).filter((v) => Number.isFinite(v));
        const groupedSeries = controls.selectedColorColumn ? buildGroupedDistributionSeries(values, data.colorLabels) : null;
        drawJobs.push(() => {
          drawDistributionCanvas(
            canvas2,
            diagonalMode,
            groupedSeries || [{ label: column, color: "#00c896", values }]
          );
        });
        const meta2 = document.createElement("div");
        meta2.className = "scatter-diagonal-meta";
        meta2.textContent = groupedSeries ? `${describeDistributionMode(diagonalMode)} grouped by ${controls.selectedColorColumn}` : describeDistributionMode(diagonalMode);
        diagonal.append(canvas2, meta2);
        grid.appendChild(diagonal);
        continue;
      }
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "scatter-matrix-cell";
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      if (controls.x === column && controls.y === rowColumn) cell.classList.add("active");
      const canvas = createMiniCanvas("scatter-matrix-cell-canvas", cellSize - 32);
      canvas.style.width = "100%";
      const categoryGroups = buildCategoricalColorGroups(data.colorLabels);
      drawJobs.push(() => {
        if (matrixMode === "density") {
          drawMiniDensityCanvas(canvas, data.points, { colorScale: controls.colorScale });
        } else {
          drawMiniScatterCanvas(canvas, data.points, {
            color: "#4a9eff",
            colorValues: data.colorValues,
            colorLabels: categoryGroups ? data.colorLabels : null,
            colorScale: controls.colorScale,
            categoryColors: categoryGroups?.colorByLabel
          });
        }
      });
      const meta = document.createElement("div");
      meta.className = "scatter-matrix-meta";
      meta.innerHTML = `<span>${escapeHtml(column)} \u2192 ${escapeHtml(rowColumn)}</span><span>${escapeHtml(fmt.format(Number(data.totalPoints || data.points.length || 0)))} pts</span>`;
      cell.append(canvas, meta);
      cell.addEventListener("click", () => onCellClick(column, rowColumn));
      grid.appendChild(cell);
    }
  }
  container.appendChild(grid);
  for (const draw of drawJobs) draw();
}
async function renderScatterOverview(onCellClick) {
  const columns = buildOverviewColumns();
  if (columns.length < 2) {
    renderMatrixGrid(columns, /* @__PURE__ */ new Map(), onCellClick, null);
    return;
  }
  const controls = currentControls();
  setPanelStatus("scatter-matrix-status", "Refreshing matrix for the current filters and linked time window...");
  const context = buildScatterQueryContext({
    x: controls.x,
    y: controls.y,
    colorColumn: controls.selectedColorColumn
  });
  const requestId = ++state.overviewRequestId;
  const pairs = [];
  for (const row of columns) for (const col of columns) pairs.push([col, row]);
  try {
    const resolved = await Promise.all(pairs.map(async ([col, row]) => {
      const data = await fetchMatrixCellData(col, row, context, controls.selectedColorColumn);
      return { key: `${col}|${row}`, data };
    }));
    if (requestId !== state.overviewRequestId) return;
    const datasets = new Map(resolved.map((e) => [e.key, e.data]));
    const rerenderOrderedGrid = (nextColumns) => {
      state.matrixColumnOrder = nextColumns.slice(0, MATRIX_MAX_COLUMNS);
      renderMatrixGrid(state.matrixColumnOrder, datasets, onCellClick, rerenderOrderedGrid);
      void renderMatrixFftPanel();
    };
    renderMatrixGrid(columns, datasets, onCellClick, rerenderOrderedGrid);
    const groups = buildCategoricalColorGroups(state.colorLabels);
    const groupText = groups && controls.selectedColorColumn ? ` Grouped distributions use ${controls.selectedColorColumn}.` : "";
    setPanelStatus("scatter-matrix-status", `Matrix shows ${columns.length} linked columns with ${describeDistributionMode(controls.diagonalMode)} diagonals. Drag headers to reorder.${groupText}`);
  } catch (error) {
    if (requestId !== state.overviewRequestId) return;
    console.error(error);
    renderMatrixGrid(columns, /* @__PURE__ */ new Map(), onCellClick, null);
    setPanelStatus("scatter-matrix-status", "Matrix preview is temporarily unavailable for this query.");
  }
}
async function renderScatterMatrixView(onCellClick) {
  await Promise.all([
    renderScatterOverview(onCellClick),
    renderMatrixFftPanel()
  ]);
}
function drawMiniFftCanvas(canvas, frequencies, values, label) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width || 200, 60);
  const h = Math.max(rect.height || 120, 60);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { left: 8, right: 8, top: 22, bottom: 8 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const yVals = values.map((v) => v > 0 ? Math.log10(v) : -10);
  let yMin = Infinity, yMax = -Infinity, xMaxRaw = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] > xMaxRaw) xMaxRaw = frequencies[i];
    if (Number.isFinite(yVals[i])) {
      if (yVals[i] < yMin) yMin = yVals[i];
      if (yVals[i] > yMax) yMax = yVals[i];
    }
  }
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;
  if (yMax <= yMin) yMax = yMin + 1;
  let xScale = 1;
  if (xMaxRaw > 0 && xMaxRaw < 1e-3) xScale = 1e6;
  else if (xMaxRaw > 0 && xMaxRaw < 1) xScale = 1e3;
  else if (xMaxRaw >= 1e3) xScale = 1e-3;
  const xMax = Math.max(xMaxRaw * xScale, 1e-12);
  ctx.fillStyle = "rgba(14, 18, 32, 0.95)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `bold 11px Inter, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, pad.left, 6);
  ctx.strokeStyle = "#7ad151";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < frequencies.length; i++) {
    if (!Number.isFinite(yVals[i])) continue;
    const px = pad.left + frequencies[i] * xScale / xMax * plotW;
    const py = pad.top + plotH - (yVals[i] - yMin) / (yMax - yMin) * plotH;
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(54, 63, 98, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
async function renderMatrixFftPanel() {
  const panel = getEl("scatter-matrix-fft-panel");
  const chartsContainer = getEl("scatter-matrix-fft-charts");
  if (!panel || !chartsContainer) return;
  const controls = currentControls();
  const context = buildScatterQueryContext({
    x: controls.x,
    y: controls.y,
    colorColumn: controls.selectedColorColumn
  });
  if (!context.start || !context.end) {
    panel.hidden = true;
    return;
  }
  const columns = buildOverviewColumns();
  if (columns.length < 1) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  setPanelStatus("scatter-matrix-fft-status", "Computing FFT\u2026");
  try {
    const startIso = new Date(context.start).toISOString();
    const endIso = new Date(context.end).toISOString();
    const resp = await fetchFft(startIso, endIso, columns.join(","), 4096);
    chartsContainer.innerHTML = "";
    for (const result of resp.results || []) {
      const card = document.createElement("div");
      card.className = "scatter-matrix-fft-card";
      const canvas = document.createElement("canvas");
      canvas.className = "scatter-matrix-fft-canvas";
      canvas.style.width = "100%";
      canvas.style.height = "120px";
      card.appendChild(canvas);
      chartsContainer.appendChild(card);
      const colName = result.column;
      card.title = `Open FFT page for ${colName}`;
      card.style.cursor = "pointer";
      card.addEventListener("click", () => {
        const navBtn = document.querySelector('.sidebar .nav-item[data-page="fft"]');
        navBtn?.click();
        requestAnimationFrame(() => {
          const chip = document.querySelector(`.fft-trace-chip[data-col="${colName}"]`);
          if (chip && !chip.classList.contains("active")) chip.click();
        });
      });
      requestAnimationFrame(() => {
        drawMiniFftCanvas(canvas, result.frequencies, result.magnitudes, result.column);
      });
    }
    setPanelStatus("scatter-matrix-fft-status", `${resp.sample_count ?? 0} samples`);
  } catch {
    setPanelStatus("scatter-matrix-fft-status", "FFT unavailable for current range.");
    panel.hidden = true;
  }
}

// frontend/src/scatter/scatterPage.ts
var _gpuUnavailable = null;
function handleErr(err) {
  console.error(err);
  showError(String(err?.message ?? err));
}
var scatterEmptyStateController = null;
function getScatterEmptyStateController() {
  if (!scatterEmptyStateController) {
    scatterEmptyStateController = createEmptyStateController({
      rootId: "scatter-empty-state",
      titleId: "scatter-empty-title",
      messageId: "scatter-empty-message",
      resetButtonId: "scatter-reset-range-btn",
      clearButtonId: "scatter-clear-filters-btn",
      resetEventName: "edatime:request-chart-range-reset",
      clearEventName: "edatime:clear-all-filters",
      eventSource: "scatter-empty-state"
    });
  }
  return scatterEmptyStateController;
}
function syncScatterEmptyState(message) {
  const emptyState = getScatterEmptyStateController();
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const hasAxes = !!xSelect?.value && !!ySelect?.value;
  syncScatterFilterBadge();
  const linkedRangeOutside = isLinkedBrushEnabled() && isRangeOutsideDataset(appState.metadata?.time_range, appState.currentStart, appState.currentEnd);
  let reason;
  if (_gpuUnavailable && !state.chart) {
    reason = "gpu-unavailable";
  } else if (!hasAxes) {
    reason = "no-columns-selected";
  } else if (state.totalPoints === 0) {
    reason = linkedRangeOutside ? "linked-range-outside-dataset" : "no-data-after-filters";
  } else {
    reason = "";
  }
  const controls = currentControls();
  const activeColumns = getActiveScatterFilterColumns({
    x: controls.x,
    y: controls.y,
    colorColumn: controls.selectedColorColumn
  });
  const scopedFilterCount = new Set(activeColumns).size;
  const adaptiveFilterCount = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters.length : 0;
  const text = message || (_gpuUnavailable && !state.chart ? "WebGPU is not available. Scatter rendering requires a WebGPU-capable browser (Chrome 113+, Edge 113+, Safari 18+)." : !hasAxes ? "Choose X and Y numeric columns to render the scatter plot." : linkedRangeOutside ? "Linked time range is outside the current dataset. Reset range to recover points." : scopedFilterCount > 0 || adaptiveFilterCount > 0 ? `No points match active filters (${scopedFilterCount} column, ${adaptiveFilterCount} adaptive).` : "No points match the current query.");
  emptyState.update({
    visible: !(hasAxes && state.totalPoints > 0 && !(_gpuUnavailable && !state.chart)),
    reason,
    title: _gpuUnavailable && !state.chart ? "WebGPU unavailable" : !hasAxes ? "Choose scatter axes" : linkedRangeOutside ? "Linked range outside dataset" : "No scatter points found",
    message: text,
    showResetAction: reason === "linked-range-outside-dataset",
    showClearAction: reason === "no-data-after-filters",
    fallbackText: text
  });
}
function syncScatterFilterBadge() {
  const badge = getEl("scatter-active-filter-badge");
  if (!badge) return;
  const controls = currentControls();
  const cols = getActiveScatterFilterColumns({
    x: controls.x,
    y: controls.y,
    colorColumn: controls.selectedColorColumn
  });
  const unique = Array.from(new Set(cols));
  if (unique.length === 0) {
    badge.hidden = true;
    badge.textContent = "";
    badge.removeAttribute("title");
    return;
  }
  badge.hidden = false;
  badge.textContent = `${unique.length} filter${unique.length === 1 ? "" : "s"} active`;
  badge.setAttribute("title", `Active scatter filters: ${unique.join(", ")}`);
}
async function isGPUAvailable() {
  if (_gpuUnavailable !== null) return !_gpuUnavailable;
  if (!navigator.gpu) {
    _gpuUnavailable = true;
    return false;
  }
  try {
    const adapter = await Promise.race([
      requestGpuAdapter(),
      new Promise((resolve) => setTimeout(() => resolve(null), 3e3))
    ]);
    _gpuUnavailable = !adapter;
  } catch {
    _gpuUnavailable = true;
  }
  return !_gpuUnavailable;
}
function setSidebarAnalyticsSelection(viewName) {
  const navPage = viewName === "matrix" ? "scattermatrix" : "scatter";
  for (const button of document.querySelectorAll(".sidebar .nav-item[data-page]")) {
    const page = button.dataset.page;
    const active = page === navPage;
    if (page === "scatter" || page === "scattermatrix") {
      button.classList.toggle("active", active);
    }
  }
}
function syncScatterViewButtons(viewName) {
  for (const button of document.querySelectorAll("[data-scatter-view]")) {
    const active = button.dataset.scatterView === viewName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}
async function setScatterView(viewName, options = {}) {
  const nextView = viewName || "plot";
  const shouldRender = options.render !== false;
  state.activeView = nextView;
  setSidebarAnalyticsSelection(nextView);
  syncScatterViewButtons(nextView);
  syncModeUI();
  for (const panel of document.querySelectorAll("[data-scatter-view-panel]")) {
    panel.hidden = panel.dataset.scatterViewPanel !== nextView;
  }
  if (!shouldRender) return;
  if (nextView === "matrix") {
    await renderScatterMatrixView(onMatrixCellClick);
    return;
  }
  requestAnimationFrame(() => state.chart?.resize?.());
}
function refreshActiveScatterView() {
  return setScatterView(state.activeView, { render: true });
}
function renderSuggestions(suggestions) {
  const box = getEl("scatter-suggestions");
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const contextEl = getEl("scatter-active-pair-label");
  if (!box) return;
  state.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
  box.innerHTML = "";
  if (contextEl) {
    const x = xSelect?.value || "X";
    const y = ySelect?.value || "Y";
    contextEl.textContent = `Inspecting ${x} vs ${y}`;
  }
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    const empty = document.createElement("span");
    empty.className = "scatter-suggestion-empty";
    empty.textContent = `No suggestions above |corr| \u2265 ${state.suggestionThreshold.toFixed(2)}.`;
    box.appendChild(empty);
    return;
  }
  for (const item of suggestions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scatter-suggestion-btn";
    if (ySelect?.value === item.column) btn.classList.add("active");
    const r = Number.isFinite(item.pearson) ? item.pearson.toFixed(2) : "\u2014";
    const rho = Number.isFinite(item.spearman) ? item.spearman.toFixed(2) : "\u2014";
    btn.textContent = `${item.column}  Pearson ${r}  Spearman ${rho}`;
    btn.addEventListener("click", async () => {
      if (!ySelect || ySelect.value === item.column) return;
      ySelect.value = item.column;
      updateCorrelationStats();
      renderSuggestions(state.lastSuggestions);
      try {
        await renderScatter();
      } catch (err) {
        handleErr(err);
      }
    });
    box.appendChild(btn);
  }
}
async function refreshCorrelationsAndSuggestions() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const colorSelect = getEl("scatter-color-column");
  if (!xSelect || !ySelect) return;
  const response = await fetchScatterCorrelations(xSelect.value || null, state.suggestionThreshold);
  const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
  if (numeric.length < 2) throw new Error("Need at least two numeric columns for scatter plotting.");
  ensureOptions(xSelect, numeric, xSelect.value || response.base_column || numeric[0]);
  const yCandidates = numeric.filter((c) => c !== xSelect.value);
  const selectedY = ensureOptions(ySelect, yCandidates, ySelect.value);
  if (colorSelect) {
    const colorOptions = [""].concat(
      (state.metadata?.columns || []).map((col) => String(col?.name || "")).filter(Boolean)
    );
    const preferredColor = state.colorColumn || colorSelect.value;
    colorSelect.innerHTML = "";
    for (const col of colorOptions) {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col || "None";
      colorSelect.appendChild(opt);
    }
    if (colorOptions.includes(preferredColor)) colorSelect.value = preferredColor;
    else colorSelect.value = "";
  }
  state.correlationsByColumn = /* @__PURE__ */ new Map();
  for (const row of response.correlations || []) {
    state.correlationsByColumn.set(row.column, row);
  }
  if (!selectedY && yCandidates.length > 0) ySelect.value = yCandidates[0];
  renderSuggestions(response.suggestions || []);
  updateCorrelationStats();
  updateColorbarUI();
}
function openScatterPairInCausal() {
  const xCol = getEl("scatter-x-col")?.value;
  const yCol = getEl("scatter-y-col")?.value;
  if (!xCol || !yCol) return;
  window.dispatchEvent(new CustomEvent("edatime:causal-preselect", {
    detail: { columns: [xCol, yCol] }
  }));
  document.querySelector('.sidebar .nav-item[data-page="causal"]')?.click?.();
}
var _scatterAbort = null;
var _scatterDebounceTimer = null;
function renderScatterDebounced() {
  if (_scatterDebounceTimer) clearTimeout(_scatterDebounceTimer);
  _scatterDebounceTimer = setTimeout(() => {
    _scatterDebounceTimer = null;
    renderScatter();
  }, 32);
}
async function renderScatter() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  let container = getEl("scatter-chart");
  if (!container || !xSelect || !ySelect || !xSelect.value || !ySelect.value) {
    state.totalPoints = 0;
    syncScatterEmptyState();
    return;
  }
  if (_scatterAbort) {
    _scatterAbort.abort();
    _scatterAbort = null;
  }
  showError("");
  const scatterLoading = getEl("scatter-chart-loading");
  if (scatterLoading) scatterLoading.hidden = false;
  try {
    const ctl = currentControls();
    const renderSignature = buildRenderSignature(ctl);
    const colorColumn = ctl.selectedColorColumn || null;
    _scatterAbort = new AbortController();
    const response = await fetchScatterPoints(
      xSelect.value,
      ySelect.value,
      1e6,
      colorColumn,
      buildScatterQueryContext({ x: xSelect.value, y: ySelect.value, colorColumn: colorColumn || void 0 }),
      _scatterAbort.signal
    );
    _scatterAbort = null;
    const points = Array.isArray(response.points) ? response.points : [];
    state.totalPoints = Number(response.total_points ?? points.length);
    state.allPoints = points;
    state.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
    state.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
    state.colorColumn = response.color || "";
    applyScatterStateFromCache(true);
    syncScatterEmptyState();
    if (state.chart && state.lastRenderSignature !== renderSignature) {
      disposeScatterChart();
      container = resetScatterContainer() || getEl("scatter-chart");
    }
    const nextOption = buildOption(state.points, container);
    if (!state.chart) {
      if (!await isGPUAvailable()) {
        state.totalPoints = points.length;
        syncScatterEmptyState();
        return;
      }
      const chartOptions = { ...nextOption };
      const powerPreference = defaultGpuPowerPreference();
      if (powerPreference) chartOptions.powerPreference = powerPreference;
      state.chart = await Ad(container, chartOptions);
      state.lastRenderSignature = renderSignature;
      initSelectionZoom(container);
      state.chart.onPerformanceUpdate?.(() => {
        const now = performance.now();
        if (now - state.lastUpdateMs < 100) return;
        state.lastUpdateMs = now;
        updateBinnedReadout();
      });
    } else {
      state.chart.setOption(nextOption);
      state.lastRenderSignature = renderSignature;
      requestAnimationFrame(() => state.chart?.resize?.());
    }
    updateColorbarUI();
    updateBinnedReadout();
    updateCorrelationStats();
    renderSuggestions(state.lastSuggestions);
    updateMarginalPlots();
    await refreshActiveScatterView();
  } catch (err) {
    if (err?.name === "AbortError") return;
    state.totalPoints = 0;
    const isGpuErr = /gpu|webgpu|adapter|device/i.test(String(err?.message || ""));
    if (isGpuErr) _gpuUnavailable = true;
    syncScatterEmptyState(
      isGpuErr ? "WebGPU rendering failed. Scatter requires a GPU-capable browser." : "Scatter rendering is unavailable for the current query."
    );
    throw err;
  } finally {
    if (scatterLoading) scatterLoading.hidden = true;
  }
}
async function rerenderScatterFromCache(resetViewFlag = true) {
  if (Array.isArray(state.allPoints) && state.allPoints.length > 0) {
    applyScatterStateFromCache(resetViewFlag);
    if (state.chart) renderCurrentOption();
    updateCorrelationStats();
    renderSuggestions(state.lastSuggestions);
  }
  syncScatterEmptyState();
  await refreshActiveScatterView();
}
async function onMatrixCellClick(x, y) {
  const matrixLoading = getEl("scatter-matrix-loading");
  if (matrixLoading) matrixLoading.hidden = false;
  try {
    await selectMatrixPair(x, y, refreshCorrelationsAndSuggestions, renderScatter, setScatterView);
  } catch (error) {
    handleErr(error);
  } finally {
    if (matrixLoading) matrixLoading.hidden = true;
  }
}
function bindControls() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const binSizeInput = getEl("scatter-bin-size");
  const binSizeValue = getEl("scatter-bin-size-value");
  const colormapSelect = getEl("scatter-colormap");
  const normalizationSelect = getEl("scatter-normalization");
  const renderModeSelect = getEl("scatter-render-mode");
  const diagonalModeSelect = getEl("scatter-diagonal-mode");
  const colorColumnSelect = getEl("scatter-color-column");
  const colorScaleSelect = getEl("scatter-color-scale");
  const linkBrushInput = getEl("scatter-link-brush");
  const suggestionThresholdInput = getEl("scatter-suggestion-threshold");
  const suggestionThresholdValue = getEl("scatter-suggestion-threshold-value");
  const suggestionThresholdLabel = getEl("scatter-suggestions-label");
  const openCausalBtn = getEl("scatter-open-causal-btn");
  if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !colormapSelect || !normalizationSelect || !renderModeSelect) return;
  window.__edatime = window.__edatime || {};
  window.__edatime.exportScatterData = exportScatterData;
  binSizeValue.textContent = binSizeInput.value;
  if (suggestionThresholdInput) {
    state.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
    suggestionThresholdInput.value = state.suggestionThreshold.toFixed(2);
  }
  if (suggestionThresholdValue) suggestionThresholdValue.textContent = state.suggestionThreshold.toFixed(2);
  if (suggestionThresholdLabel) suggestionThresholdLabel.textContent = `Suggestions (|corr| \u2265 ${state.suggestionThreshold.toFixed(2)})`;
  syncModeUI();
  void setScatterView(state.activeView, { render: false });
  document.querySelectorAll("[data-scatter-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextView = normalizeAnalyticsView(btn.dataset.scatterView || "plot");
      void setScatterView(nextView);
    });
  });
  const rerender = () => {
    const container = getEl("scatter-chart");
    if (!state.chart) return;
    state.chart.setOption(buildOption(state.points, container));
    updateColorbarUI();
    updateBinnedReadout();
  };
  binSizeInput.addEventListener("input", () => {
    binSizeValue.textContent = binSizeInput.value;
    rerender();
  });
  colormapSelect.addEventListener("change", rerender);
  normalizationSelect.addEventListener("change", rerender);
  renderModeSelect.addEventListener("change", () => {
    syncModeUI();
    rerender();
  });
  diagonalModeSelect?.addEventListener("change", () => {
    void refreshActiveScatterView();
  });
  colorColumnSelect?.addEventListener("change", () => {
    void renderScatter();
  });
  colorScaleSelect?.addEventListener("change", () => {
    rerender();
    updateColorbarUI();
  });
  suggestionThresholdInput?.addEventListener("input", () => {
    state.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
    suggestionThresholdInput.value = state.suggestionThreshold.toFixed(2);
    if (suggestionThresholdValue) suggestionThresholdValue.textContent = state.suggestionThreshold.toFixed(2);
    if (suggestionThresholdLabel) {
      suggestionThresholdLabel.textContent = `Suggestions (|corr| \u2265 ${state.suggestionThreshold.toFixed(2)})`;
    }
  });
  suggestionThresholdInput?.addEventListener("change", async () => {
    try {
      await refreshCorrelationsAndSuggestions();
    } catch (err) {
      handleErr(err);
    }
  });
  linkBrushInput?.addEventListener("change", async () => {
    try {
      await renderScatter();
    } catch (err) {
      handleErr(err);
    }
  });
  openCausalBtn?.addEventListener("click", openScatterPairInCausal);
  getScatterEmptyStateController();
  const matrixModeHidden = getEl("scatter-matrix-mode");
  const matrixSizeInput = getEl("scatter-matrix-cell-size");
  const matrixSizeValue = getEl("scatter-matrix-cell-size-value");
  document.querySelectorAll("[data-matrix-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.matrixMode || "scatter";
      if (matrixModeHidden) matrixModeHidden.value = mode;
      document.querySelectorAll("[data-matrix-mode]").forEach((b) => {
        b.classList.toggle("active", b.dataset.matrixMode === mode);
        b.setAttribute("aria-pressed", b.dataset.matrixMode === mode ? "true" : "false");
      });
      void refreshActiveScatterView();
    });
  });
  matrixSizeInput?.addEventListener("input", () => {
    if (matrixSizeValue) matrixSizeValue.textContent = matrixSizeInput.value;
    if (state.activeView === "matrix") void refreshActiveScatterView();
  });
  getEl("scatter-export-png-btn")?.addEventListener("click", () => exportScatterPNG());
  getEl("scatter-export-svg-btn")?.addEventListener("click", () => exportScatterSVG());
  getEl("scatter-export-html-btn")?.addEventListener("click", () => exportScatterHTML());
  getEl("scatter-export-csv-btn")?.addEventListener("click", () => exportScatterData("csv"));
  getEl("scatter-export-json-btn")?.addEventListener("click", () => exportScatterData("json"));
  getEl("scatter-export-parquet-btn")?.addEventListener("click", async () => {
    try {
      await exportScatterParquet();
    } catch (error) {
      handleErr(error);
    }
  });
  ySelect.addEventListener("change", async () => {
    updateCorrelationStats();
    await renderScatter();
  });
  xSelect.addEventListener("change", async () => {
    await refreshCorrelationsAndSuggestions();
    await renderScatter();
  });
  window.addEventListener("resize", () => {
    state.chart?.resize?.();
  });
  const handleFilterEvent = async (requireLinkedBrush) => {
    const page = getEl("page-scatter");
    if (page?.hidden) return;
    try {
      syncScatterFilterBadge();
      if (!requireLinkedBrush || isLinkedBrushEnabled()) renderScatterDebounced();
    } catch (err) {
      handleErr(err);
    }
  };
  window.addEventListener("edatime:chart-range-change", () => handleFilterEvent(true));
  window.addEventListener("edatime:column-filters-change", () => handleFilterEvent(false));
  window.addEventListener("edatime:adaptive-filters-change", () => handleFilterEvent(false));
  window.addEventListener("edatime:page-change", async (ev) => {
    if (ev?.detail?.page !== "scatter") return;
    state.activeView = normalizeAnalyticsView(ev?.detail?.analyticsView);
    await setScatterView(state.activeView, { render: false });
    if (!state.pageInitialized) {
      refreshCorrelationsAndSuggestions().then(() => renderScatter()).then(() => {
        state.pageInitialized = true;
      }).catch((err) => {
        handleErr(err);
      });
    } else {
      try {
        if (isLinkedBrushEnabled() || Object.keys(appState.columnRanges || {}).length > 0 || (appState.adaptiveLineFilters || []).length > 0) {
          await renderScatter();
        } else {
          await rerenderScatterFromCache(true);
        }
      } catch (err) {
        handleErr(err);
      }
    }
    void refreshActiveScatterView();
  });
}
async function initScatterPage(metadata) {
  const page = getEl("page-scatter");
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  if (!page || !xSelect || !ySelect) return;
  const numeric = (metadata?.numeric_columns || []).filter((c) => c);
  state.metadata = metadata;
  state.columnTypes = new Map(
    (metadata?.columns || []).map((col) => [
      String(col?.name || "").toLowerCase(),
      String(col?.dtype || "")
    ])
  );
  if (numeric.length > 0) {
    ensureOptions(xSelect, numeric, xSelect.value || numeric[0]);
    ensureOptions(ySelect, numeric.filter((c) => c !== xSelect.value), ySelect.value || numeric[1] || numeric[0]);
  }
  syncScatterEmptyState();
  syncScatterFilterBadge();
  if (!state.initialized) {
    bindControls();
    state.initialized = true;
  }
  if (state.pageInitialized) return;
  const isVisible = !page.hidden;
  if (!isVisible) return;
  try {
    await refreshCorrelationsAndSuggestions();
    await renderScatter();
    state.pageInitialized = true;
  } catch (err) {
    handleErr(err);
  }
}
export {
  initScatterPage
};
//# sourceMappingURL=scatterPage.js.map
