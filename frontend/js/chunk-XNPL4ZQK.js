import {
  clampView,
  currentControls,
  getPlotMetrics,
  setStats,
  state
} from "./chunk-B6MDIWXF.js";
import {
  buildCategoricalColorGroups,
  buildHistogramForDomain,
  downloadBlob,
  downloadUrl,
  escapeHtml,
  fmt,
  formatValueForColumn,
  getCanvasFrame,
  getEl,
  isTemporalColumn,
  lowerBoundByX,
  normalizeCategoryLabel,
  paletteForScale,
  sampleGradient,
  upperBoundByX
} from "./chunk-76MF3RJR.js";
import {
  formatTimestamp,
  formatTwoDecimals
} from "./chunk-6X7ODBV6.js";

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
  const hasP = Number.isFinite(pearson);
  const hasS = Number.isFinite(spearman);
  if (!hasP && !hasS) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `<div>Pearson: <strong>${escapeHtml(hasP ? pearson.toFixed(3) : "\u2014")}</strong> / Spearman: <strong>${escapeHtml(hasS ? spearman.toFixed(3) : "\u2014")}</strong></div>`;
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
  const ySelect = getEl("scatter-y-col");
  const corr = state.correlationsByColumn.get(ySelect?.value || "");
  const pearson = Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : "\u2014";
  const spearman = Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : "\u2014";
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
  const isDist = view === "distributions";
  const isDensity = isPlot && ctl.renderMode === "density";
  const toggle = (el, visible) => {
    if (el) el.style.display = visible ? "" : "none";
  };
  toggle(document.querySelector('label[for="scatter-x-col"]'), !isDist);
  toggle(getEl("scatter-x-col"), !isDist);
  toggle(document.querySelector('label[for="scatter-y-col"]'), !isDist);
  toggle(getEl("scatter-y-col"), !isDist);
  toggle(getEl("scatter-mode-label"), isPlot);
  toggle(getEl("scatter-render-mode"), isPlot);
  toggle(document.querySelector(".scatter-link-toggle"), !isDist);
  toggle(getEl("scatter-density-controls"), isDensity);
  toggle(getEl("scatter-color-controls"), !isDist);
  toggle(getEl("scatter-color-scale"), isPlot && !isDensity);
  toggle(document.querySelector(".scatter-export-group"), isPlot);
  toggle(document.querySelector(".scatter-stats-bar"), isPlot);
  toggle(document.querySelector(".scatter-suggestions-bar"), !isDist);
  updateColorbarUI();
}
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
  const context = (await import("./scatter/state.js")).buildScatterQueryContext();
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

export {
  SCATTER_GRID_LEFT,
  SCATTER_GRID_RIGHT,
  SCATTER_GRID_TOP,
  SCATTER_GRID_BOTTOM,
  buildNormalScatterSeries,
  buildDensitySeries,
  buildDensityTooltipCache,
  densityTooltipFormatterFactory,
  scatterTooltipFormatterFactory,
  updateColorbarUI,
  setCorrelationOverlayText,
  updateMarginalPlots,
  buildOption,
  renderCurrentOption,
  applyView,
  resetView,
  updateBinnedReadout,
  updateCorrelationStats,
  initSelectionZoom,
  syncModeUI,
  buildLinearTicks,
  getScatterExportViewport,
  drawScatterSeriesToCanvas,
  renderScatterExportToCanvas,
  buildVisibleScatterRows,
  exportScatterData,
  exportScatterPNG,
  exportScatterSVG,
  exportScatterHTML,
  exportScatterParquet
};
//# sourceMappingURL=chunk-XNPL4ZQK.js.map
