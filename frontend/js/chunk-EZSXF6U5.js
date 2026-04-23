import {
  SERIES_COLORS,
  appState,
  buildAdaptiveLineFiltersForQuery,
  formatTimestamp,
  formatTwoDecimals,
  getEl,
  isTemporalDtype
} from "./chunk-SVFUPBER.js";

// frontend/src/scatter/helpers.ts
var MATRIX_POINT_LIMIT = 8e3;
var MATRIX_MAX_COLUMNS = 4;
var HISTOGRAM_BINS = 24;
var KDE_SAMPLES = 64;
var LOW_CARDINALITY_LIMIT = 8;
var DISTRIBUTION_GROUP_COLORS = [
  ...SERIES_COLORS,
  "#5ad8a6",
  "#ff9d4d",
  "#7ec8ff",
  "#f78fb3",
  "#9bde6d",
  "#ffd166"
];
var fmt = new Intl.NumberFormat(void 0);
function showError(message) {
  const el = getEl("scatter-error");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.textContent = String(message);
  el.hidden = false;
}
function setPanelStatus(id, message) {
  const el = getEl(id);
  if (el) el.textContent = String(message || "");
}
function paletteForScale(scale) {
  if (scale === "plasma") return ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"];
  if (scale === "inferno") return ["#000004", "#420a68", "#932667", "#dd513a", "#fba40a", "#fcffa4"];
  return ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
}
function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  const v = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(v, 16);
  return { r: num >> 16 & 255, g: num >> 8 & 255, b: num & 255 };
}
function rgbToHex({ r, g, b }) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(Math.max(0, Math.min(255, Math.round(g))))}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}
function sampleGradient(stops, t) {
  const n = stops.length;
  if (n === 0) return "#4a9eff";
  if (n === 1) return stops[0];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (n - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(n - 1, i0 + 1);
  const frac = scaled - i0;
  const a = hexToRgb(stops[i0]);
  const b = hexToRgb(stops[i1]);
  return rgbToHex({ r: a.r + (b.r - a.r) * frac, g: a.g + (b.g - a.g) * frac, b: a.b + (b.b - a.b) * frac });
}
function computeColorExtent(values) {
  if (!Array.isArray(values)) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
  return { min, max };
}
function quantileSorted(sortedValues, ratio) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const position = Math.max(0, Math.min(sortedValues.length - 1, ratio * (sortedValues.length - 1)));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}
function lowerBoundByX(points, x) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (points[mid][0] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function upperBoundByX(points, x) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (points[mid][0] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function normalizeCategoryLabel(label) {
  if (label == null) return "Missing";
  const text = String(label).trim();
  return text || "Missing";
}
function getCategoryColor(index) {
  return DISTRIBUTION_GROUP_COLORS[index % DISTRIBUTION_GROUP_COLORS.length];
}
function buildCategoricalColorGroups(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return null;
  const categories = [];
  const labelToIndex = /* @__PURE__ */ new Map();
  for (const rawLabel of labels) {
    const label = normalizeCategoryLabel(rawLabel);
    if (labelToIndex.has(label)) continue;
    labelToIndex.set(label, categories.length);
    categories.push(label);
    if (categories.length > LOW_CARDINALITY_LIMIT) return null;
  }
  if (categories.length === 0) return null;
  return { categories, colorByLabel: new Map(categories.map((l, i) => [l, getCategoryColor(i)])) };
}
function getDevicePixelRatio() {
  return Math.max(1, window.devicePixelRatio || 1);
}
function createMiniCanvas(className, heightPx) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.dataset.cssHeight = String(heightPx);
  return canvas;
}
function getCanvasFrame(canvas, fallbackWidth = 180, fallbackHeight = 92) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || fallbackWidth));
  const height = Math.max(1, Math.round(rect.height || Number(canvas.dataset.cssHeight) || fallbackHeight));
  const dpr = getDevicePixelRatio();
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}
function isTemporalColumn(name, columnTypes) {
  const dtype = columnTypes.get(String(name || "").toLowerCase()) || "";
  return isTemporalDtype(dtype);
}
function formatValueForColumn(columnName, value, spanMs, columnTypes) {
  return isTemporalColumn(columnName, columnTypes) ? formatTimestamp(value, spanMs) : formatTwoDecimals(value);
}
function buildHistogramForDomain(values, min, max, binCount = HISTOGRAM_BINS) {
  const finite = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (finite.length === 0 || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (!(max > min)) return { min, max, counts: [finite.length], edges: [min, max] };
  const counts = Array.from({ length: binCount }, () => 0);
  const span = max - min;
  const edges = Array.from({ length: binCount + 1 }, (_, i) => min + span * i / binCount);
  for (const v of finite) {
    let bucket = Math.floor((v - min) / span * binCount);
    if (bucket < 0) bucket = 0;
    if (bucket >= binCount) bucket = binCount - 1;
    counts[bucket] += 1;
  }
  return { min, max, counts, edges };
}
function estimateBandwidth(values) {
  if (!Array.isArray(values) || values.length < 2) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length;
  const std = Math.sqrt(variance);
  const sigma = Math.min(std || 0, ((q3 ?? mean) - (q1 ?? mean)) / 1.34 || std || 1) || 1;
  return Math.max(1e-3, 0.9 * sigma * sorted.length ** -0.2);
}
function buildKdeCurve(values, min, max, sampleCount = KDE_SAMPLES) {
  const finite = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];
  if (!(max > min)) return [{ x: min, y: 1 }, { x: max, y: 1 }];
  const bandwidth = estimateBandwidth(finite);
  const scale = 1 / (finite.length * bandwidth * Math.sqrt(2 * Math.PI));
  const points = [];
  for (let i = 0; i < sampleCount; i++) {
    const x = min + (max - min) * i / Math.max(1, sampleCount - 1);
    let sum = 0;
    for (const v of finite) {
      const z = (x - v) / bandwidth;
      sum += Math.exp(-0.5 * z * z);
    }
    points.push({ x, y: sum * scale });
  }
  return points;
}
function computeBoxStats(values) {
  const sorted = values.map((v) => Number(v)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return { min: sorted[0], q1: quantileSorted(sorted, 0.25), median: quantileSorted(sorted, 0.5), q3: quantileSorted(sorted, 0.75), max: sorted[sorted.length - 1] };
}
function paddedBounds(minV, maxV) {
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return { min: 0, max: 1 };
  if (maxV <= minV) {
    const pad2 = Math.max(1, Math.abs(minV) * 0.02);
    return { min: minV - pad2, max: maxV + pad2 };
  }
  const span = maxV - minV;
  const pad = Math.max(span * 0.02, 1e-9);
  return { min: minV - pad, max: maxV + pad };
}
function computeDomains(points) {
  let xMinRaw = Number.POSITIVE_INFINITY;
  let xMaxRaw = Number.NEGATIVE_INFINITY;
  let yMinRaw = Number.POSITIVE_INFINITY;
  let yMaxRaw = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    const xn = Number(x);
    const yn = Number(y);
    if (!Number.isFinite(xn) || !Number.isFinite(yn)) continue;
    if (xn < xMinRaw) xMinRaw = xn;
    if (xn > xMaxRaw) xMaxRaw = xn;
    if (yn < yMinRaw) yMinRaw = yn;
    if (yn > yMaxRaw) yMaxRaw = yn;
  }
  const xb = paddedBounds(xMinRaw, xMaxRaw);
  const yb = paddedBounds(yMinRaw, yMaxRaw);
  return { xMin: xb.min, xMax: xb.max, yMin: yb.min, yMax: yb.max };
}
function computeValueBounds(seriesList) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of seriesList) {
    for (const v of s.values || []) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}
function drawDistributionCanvas(canvas, mode, seriesList) {
  const frame = getCanvasFrame(canvas, 320, 120);
  if (!frame) return;
  const { ctx, width, height } = frame;
  const usableSeries = (seriesList || []).filter((s) => Array.isArray(s?.values) && s.values.length > 0);
  if (usableSeries.length === 0) {
    ctx.fillStyle = "rgba(122, 134, 164, 0.7)";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No distribution", width / 2, height / 2);
    return;
  }
  ctx.strokeStyle = "rgba(54, 63, 98, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  const padX = 10;
  const padY = 10;
  const bounds = computeValueBounds(usableSeries);
  if (!bounds) return;
  const { min, max } = bounds;
  const span = Math.max(1e-9, max - min);
  const projectX = (v) => padX + (v - min) / span * (width - padX * 2);
  if (mode === "boxplot") {
    const rowHeight = (height - padY * 2) / usableSeries.length;
    usableSeries.forEach((s, i) => {
      const stats = computeBoxStats(s.values);
      if (!stats) return;
      const centerY = padY + rowHeight * i + rowHeight / 2;
      const boxH = Math.max(8, rowHeight * 0.36);
      ctx.strokeStyle = s.color;
      ctx.fillStyle = `${s.color}33`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(projectX(stats.min), centerY);
      ctx.lineTo(projectX(stats.q1), centerY);
      ctx.moveTo(projectX(stats.q3), centerY);
      ctx.lineTo(projectX(stats.max), centerY);
      ctx.stroke();
      ctx.fillRect(projectX(stats.q1), centerY - boxH / 2, Math.max(2, projectX(stats.q3) - projectX(stats.q1)), boxH);
      ctx.strokeRect(projectX(stats.q1), centerY - boxH / 2, Math.max(2, projectX(stats.q3) - projectX(stats.q1)), boxH);
      ctx.beginPath();
      ctx.moveTo(projectX(stats.median), centerY - boxH / 2);
      ctx.lineTo(projectX(stats.median), centerY + boxH / 2);
      ctx.stroke();
    });
    return;
  }
  if (mode === "kde") {
    const curves = usableSeries.map((s) => ({ ...s, curve: buildKdeCurve(s.values, min, max) }));
    const maxDensity = curves.reduce((best, s) => Math.max(best, s.curve.reduce((b, p) => Math.max(b, p.y), 0)), 0);
    const projectY = (v) => height - padY - v / Math.max(1e-9, maxDensity) * (height - padY * 2);
    for (const s of curves) {
      if (s.curve.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(projectX(s.curve[0].x), height - padY);
      for (const p of s.curve) ctx.lineTo(projectX(p.x), projectY(p.y));
      ctx.lineTo(projectX(s.curve[s.curve.length - 1].x), height - padY);
      ctx.closePath();
      ctx.fillStyle = `${s.color}22`;
      ctx.fill();
      ctx.beginPath();
      s.curve.forEach((p, i) => {
        const x = projectX(p.x);
        const y = projectY(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    return;
  }
  const histograms = usableSeries.map((s) => ({ ...s, histogram: buildHistogramForDomain(s.values, min, max) }));
  const maxCount = histograms.reduce((best, s) => Math.max(best, s.histogram?.counts?.reduce((a, v) => Math.max(a, Number(v) || 0), 0) || 0), 0);
  const binCount = histograms[0]?.histogram?.counts?.length || HISTOGRAM_BINS;
  const barWidth = (width - padX * 2) / Math.max(1, binCount);
  histograms.forEach((s, si) => {
    const counts = s.histogram?.counts || [];
    counts.forEach((count, i) => {
      const ratio = maxCount > 0 ? (Number(count) || 0) / maxCount : 0;
      const barH = Math.max(2, ratio * (height - padY * 2));
      ctx.fillStyle = s.color;
      ctx.globalAlpha = usableSeries.length > 1 ? 0.18 + si * 0.05 : 0.35 + ratio * 0.45;
      ctx.fillRect(padX + i * barWidth + 1, height - padY - barH, Math.max(1, barWidth - 2), barH);
    });
  });
  ctx.globalAlpha = 1;
}
function drawMiniScatterCanvas(canvas, points, options = {}) {
  const frame = getCanvasFrame(canvas, 180, 92);
  if (!frame) return;
  const { ctx, width, height } = frame;
  const config = typeof options === "string" ? { color: options } : options || {};
  const baseColor = config.color || "#4a9eff";
  const colorValues = Array.isArray(config.colorValues) ? config.colorValues : null;
  const colorLabels = Array.isArray(config.colorLabels) ? config.colorLabels : null;
  const colorScale = config.colorScale || "viridis";
  const categoryColors = config.categoryColors instanceof Map ? config.categoryColors : null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = Number(p?.[0]);
    const y = Number(p?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    ctx.fillStyle = "rgba(122, 134, 164, 0.7)";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No points", width / 2, height / 2);
    return;
  }
  const pad = 8;
  const xSpan = Math.max(1e-9, maxX - minX);
  const ySpan = Math.max(1e-9, maxY - minY);
  const stride = Math.max(1, Math.ceil(points.length / 1200));
  ctx.strokeStyle = "rgba(54, 63, 98, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  const palette = paletteForScale(colorScale);
  const colorExtent = computeColorExtent(colorValues);
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < points.length; i += stride) {
    const x = Number(points[i]?.[0]);
    const y = Number(points[i]?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const px = pad + (x - minX) / xSpan * (width - pad * 2);
    const py = height - pad - (y - minY) / ySpan * (height - pad * 2);
    let fill = baseColor;
    if (colorLabels && categoryColors) {
      fill = categoryColors.get(normalizeCategoryLabel(colorLabels[i])) || baseColor;
    } else if (colorValues && colorExtent && colorExtent.max > colorExtent.min) {
      const v = Number(colorValues[i]);
      if (Number.isFinite(v)) fill = sampleGradient(palette, (v - colorExtent.min) / (colorExtent.max - colorExtent.min));
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawMiniDensityCanvas(canvas, points, options = {}) {
  const frame = getCanvasFrame(canvas, 180, 92);
  if (!frame) return;
  const { ctx, width, height } = frame;
  if (!points.length) {
    ctx.fillStyle = "rgba(122, 134, 164, 0.7)";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No points", width / 2, height / 2);
    return;
  }
  const BINS = 20;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = Number(p?.[0]);
    const y = Number(p?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) {
    ctx.fillStyle = "rgba(122, 134, 164, 0.7)";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No points", width / 2, height / 2);
    return;
  }
  const xSpan = Math.max(1e-9, maxX - minX);
  const ySpan = Math.max(1e-9, maxY - minY);
  const grid = new Float32Array(BINS * BINS);
  let maxCount = 0;
  for (const p of points) {
    const x = Number(p?.[0]);
    const y = Number(p?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const bx = Math.min(BINS - 1, Math.floor((x - minX) / xSpan * BINS));
    const by = Math.min(BINS - 1, Math.floor((y - minY) / ySpan * BINS));
    const idx = (BINS - 1 - by) * BINS + bx;
    grid[idx] += 1;
    if (grid[idx] > maxCount) maxCount = grid[idx];
  }
  if (maxCount === 0) return;
  const palette = paletteForScale(options.colorScale || "viridis");
  const pad = 0;
  const cellW = (width - pad * 2) / BINS;
  const cellH = (height - pad * 2) / BINS;
  for (let row = 0; row < BINS; row++) {
    for (let col = 0; col < BINS; col++) {
      const count = grid[row * BINS + col];
      if (count === 0) continue;
      const t = Math.sqrt(count / maxCount);
      ctx.fillStyle = sampleGradient(palette, t);
      ctx.fillRect(pad + col * cellW, pad + row * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }
  ctx.strokeStyle = "rgba(54, 63, 98, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}
function buildGroupedDistributionSeries(values, labels) {
  if (!Array.isArray(labels) || !Array.isArray(values) || values.length !== labels.length) return null;
  const groups = buildCategoricalColorGroups(labels);
  if (!groups) return null;
  const seriesByLabel = new Map(groups.categories.map((l) => [l, []]));
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    const label = normalizeCategoryLabel(labels[i]);
    seriesByLabel.get(label)?.push(v);
  }
  const series = [];
  for (const label of groups.categories) {
    const groupValues = seriesByLabel.get(label) || [];
    if (groupValues.length === 0) continue;
    series.push({ label, color: groups.colorByLabel.get(label) || "#4a9eff", values: groupValues });
  }
  return series.length > 1 ? series : null;
}

// frontend/src/scatter/state.ts
var state = {
  chart: null,
  initialized: false,
  pageInitialized: false,
  activeView: "plot",
  metadata: null,
  totalPoints: 0,
  allPoints: [],
  points: [],
  allColorValues: null,
  allColorLabels: null,
  full: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
  view: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
  zoomHistory: [],
  drag: null,
  selectionBox: null,
  colorColumn: "",
  colorValues: null,
  colorLabels: null,
  colorMin: null,
  colorMax: null,
  correlationsByColumn: /* @__PURE__ */ new Map(),
  lastBinnedText: "",
  lastUpdateMs: 0,
  densityTooltipCache: null,
  lastOptionSeries: null,
  columnTypes: /* @__PURE__ */ new Map(),
  lastSuggestions: [],
  lastRenderSignature: "",
  matrixCache: /* @__PURE__ */ new Map(),
  matrixColumnOrder: [],
  overviewRequestId: 0
};
function currentControls() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const binSizeInput = getEl("scatter-bin-size");
  const colormapSelect = getEl("scatter-colormap");
  const normalizationSelect = getEl("scatter-normalization");
  const renderModeSelect = getEl("scatter-render-mode");
  const diagonalModeSelect = getEl("scatter-diagonal-mode");
  const colorColumnSelect = getEl("scatter-color-column");
  const colorScaleSelect = getEl("scatter-color-scale");
  const matrixModeSelect = getEl("scatter-matrix-mode");
  const matrixSizeInput = getEl("scatter-matrix-cell-size");
  const renderMode = renderModeSelect?.value || "density";
  const selectedColorColumn = colorColumnSelect?.value || "";
  return {
    x: xSelect?.value || "",
    y: ySelect?.value || "",
    binSize: Number(binSizeInput?.value ?? 10),
    colormap: colormapSelect?.value ?? "viridis",
    normalization: normalizationSelect?.value ?? "linear",
    renderMode,
    diagonalMode: diagonalModeSelect?.value || "histogram",
    colorColumn: renderMode === "density" ? "" : selectedColorColumn,
    selectedColorColumn,
    colorScale: colorScaleSelect?.value || "viridis",
    matrixMode: matrixModeSelect?.value || "scatter",
    matrixCellSize: Math.max(80, Math.min(400, Number(matrixSizeInput?.value ?? 160)))
  };
}
function isLinkedBrushEnabled() {
  return !!getEl("scatter-link-brush")?.checked || !!getEl("scatter-matrix-link-range")?.checked;
}
function buildScatterQueryContext() {
  const start = Number(appState.currentStart);
  const end = Number(appState.currentEnd);
  const filters = Object.entries(appState.columnRanges || {}).map(([column, range]) => {
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    return { column, from, to };
  }).filter((f) => f !== null);
  const linkedRangeValid = isLinkedBrushEnabled() && Number.isFinite(start) && Number.isFinite(end) && start < end;
  return {
    start: linkedRangeValid ? start : void 0,
    end: linkedRangeValid ? end : void 0,
    filters,
    lineFilters: buildAdaptiveLineFiltersForQuery()
  };
}
function buildRenderSignature(controls) {
  return [
    controls.x || "",
    controls.y || "",
    controls.renderMode || "",
    controls.selectedColorColumn || "",
    controls.colorScale || "",
    controls.colormap || "",
    controls.normalization || "",
    controls.diagonalMode || ""
  ].join("|");
}
function buildOverviewContextKey(context) {
  return JSON.stringify({
    start: Number.isFinite(context?.start) ? context.start : null,
    end: Number.isFinite(context?.end) ? context.end : null,
    filters: Array.isArray(context?.filters) ? context.filters : [],
    lineFilters: Array.isArray(context?.lineFilters) ? context.lineFilters : []
  });
}
function clampView(view) {
  const f = state.full;
  let xMin = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMin)));
  let xMax = Math.max(f.xMin, Math.min(f.xMax, Number(view.xMax)));
  let yMin = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMin)));
  let yMax = Math.max(f.yMin, Math.min(f.yMax, Number(view.yMax)));
  if (!(xMax > xMin)) {
    const span = Math.max(1e-9, f.xMax - f.xMin);
    xMin = f.xMin;
    xMax = f.xMin + span;
  }
  if (!(yMax > yMin)) {
    const span = Math.max(1e-9, f.yMax - f.yMin);
    yMin = f.yMin;
    yMax = f.yMin + span;
  }
  return { xMin, xMax, yMin, yMax };
}
function applyScatterStateFromCache(resetView = true) {
  state.points = Array.isArray(state.allPoints) ? state.allPoints : [];
  state.colorValues = Array.isArray(state.allColorValues) ? state.allColorValues : null;
  state.colorLabels = Array.isArray(state.allColorLabels) ? state.allColorLabels : null;
  const colorExtent = computeColorExtent(state.colorValues);
  state.colorMin = colorExtent?.min ?? null;
  state.colorMax = colorExtent?.max ?? null;
  const domains = computeDomains(state.points);
  state.full = { xMin: domains.xMin, xMax: domains.xMax, yMin: domains.yMin, yMax: domains.yMax };
  if (resetView) {
    state.view = { ...state.full };
    state.zoomHistory = [];
  } else {
    state.view = clampView(state.view);
  }
  setStats({ totalPoints: fmt.format(Number(state.totalPoints ?? state.points.length)) });
}
function setStats(partial) {
  const totalEl = getEl("scatter-total-points");
  const visibleEl = getEl("scatter-binned-points");
  const pearsonEl = getEl("scatter-pearson");
  const spearmanEl = getEl("scatter-spearman");
  if (Object.prototype.hasOwnProperty.call(partial, "totalPoints") && totalEl) {
    totalEl.textContent = `Total points: ${partial.totalPoints ?? "\u2014"}`;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "visiblePoints") && visibleEl) {
    visibleEl.textContent = `Visible points: ${partial.visiblePoints ?? "\u2014"}`;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "pearson") && pearsonEl) {
    pearsonEl.textContent = `Pearson: ${partial.pearson ?? "\u2014"}`;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "spearman") && spearmanEl) {
    spearmanEl.textContent = `Spearman: ${partial.spearman ?? "\u2014"}`;
  }
}
function getPlotMetrics(container) {
  const rect = container?.getBoundingClientRect?.();
  if (!rect) return null;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const grid = { left: 72, right: 32, top: 24, bottom: 50 };
  const plotLeft = grid.left;
  const plotRight = Math.max(plotLeft + 1, width - grid.right);
  const plotTop = grid.top;
  const plotBottom = Math.max(plotTop + 1, height - grid.bottom);
  return {
    width,
    height,
    grid,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth: Math.max(1, plotRight - plotLeft),
    plotHeight: Math.max(1, plotBottom - plotTop)
  };
}
function getProfileForColumn(column) {
  return state.metadata?.column_profiles?.find((e) => e?.name === column) || null;
}
function getProfileHistogram(column) {
  const profile = getProfileForColumn(column);
  const counts = Array.isArray(profile?.histogram?.counts) ? profile.histogram.counts.map((v) => Math.max(0, Number(v) || 0)) : [];
  const edges = Array.isArray(profile?.histogram?.bin_edges) ? profile.histogram.bin_edges.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  if (counts.length === 0 || edges.length !== counts.length + 1) return null;
  return { min: Number(edges[0]), max: Number(edges[edges.length - 1]), counts, edges };
}
function getCurrentScatterValues(column) {
  const controls = currentControls();
  if (column === controls.x) {
    return state.points.map((p) => Number(p?.[0])).filter((v) => Number.isFinite(v));
  }
  if (column === controls.y) {
    return state.points.map((p) => Number(p?.[1])).filter((v) => Number.isFinite(v));
  }
  if (column === controls.selectedColorColumn && Array.isArray(state.colorValues)) {
    return state.colorValues.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  return [];
}
function normalizeAnalyticsView(viewName) {
  if (viewName === "matrix") return viewName;
  return "plot";
}
function disposeScatterChart(resetSignature = false) {
  state.chart?.dispose?.();
  state.chart = null;
  state.selectionBox = null;
  state.drag = null;
  state.densityTooltipCache = null;
  if (resetSignature) state.lastRenderSignature = "";
}
function resetScatterContainer() {
  const existing = getEl("scatter-chart");
  if (!existing) return null;
  const replacement = existing.cloneNode(false);
  existing.replaceWith(replacement);
  return replacement;
}
function ensureOptions(selectEl, values, preferredValue) {
  if (!selectEl) return null;
  const current = preferredValue || selectEl.value;
  selectEl.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  if (values.includes(current)) selectEl.value = current;
  else if (values.length > 0) selectEl.value = values[0];
  return selectEl.value;
}

export {
  MATRIX_POINT_LIMIT,
  MATRIX_MAX_COLUMNS,
  fmt,
  showError,
  setPanelStatus,
  paletteForScale,
  sampleGradient,
  lowerBoundByX,
  upperBoundByX,
  normalizeCategoryLabel,
  buildCategoricalColorGroups,
  createMiniCanvas,
  getCanvasFrame,
  isTemporalColumn,
  formatValueForColumn,
  buildHistogramForDomain,
  drawDistributionCanvas,
  drawMiniScatterCanvas,
  drawMiniDensityCanvas,
  buildGroupedDistributionSeries,
  state,
  currentControls,
  isLinkedBrushEnabled,
  buildScatterQueryContext,
  buildRenderSignature,
  buildOverviewContextKey,
  clampView,
  applyScatterStateFromCache,
  setStats,
  getPlotMetrics,
  getProfileForColumn,
  getProfileHistogram,
  getCurrentScatterValues,
  normalizeAnalyticsView,
  disposeScatterChart,
  resetScatterContainer,
  ensureOptions
};
//# sourceMappingURL=chunk-EZSXF6U5.js.map
