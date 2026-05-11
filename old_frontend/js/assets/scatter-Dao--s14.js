import { A as Ad } from './chartgpu-CqrjGxnD.js';
import { g as getEl, i as isTemporalDtype, f as formatTimestamp, a as formatTwoDecimals, S as SERIES_COLORS, b as buildAdaptiveLineFiltersForQuery, c as appStateComposite, s as scatterState, d as downloadBlob, e as downloadUrl, _ as __vitePreload, h as escapeHtml, j as fetchFft, k as fetchScatterPoints, l as isRangeOutsideDataset, m as fetchScatterCorrelations, n as defaultGpuPowerPreference, o as createEmptyStateController, r as requestGpuAdapter } from './frequency-BkpduCZb.js';

const MATRIX_POINT_LIMIT = 8e3;
const MATRIX_MAX_COLUMNS = 4;
const HISTOGRAM_BINS = 24;
const DEFAULT_SCATTER_SUGGESTION_THRESHOLD = 0.7;
const KDE_SAMPLES = 64;
const LOW_CARDINALITY_LIMIT = 8;
const DISTRIBUTION_GROUP_COLORS = [
  ...SERIES_COLORS,
  "#5ad8a6",
  "#ff9d4d",
  "#7ec8ff",
  "#f78fb3",
  "#9bde6d",
  "#ffd166"
];
const fmt = new Intl.NumberFormat(void 0);
function showError(message) {
  const el = getEl("scatter-error");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  let displayMessage = String(message);
  try {
    const trimmed = message.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.includes('"error"')) {
      const parsed = JSON.parse(trimmed);
      if (parsed.message) {
        displayMessage = parsed.message;
      } else if (parsed.error) {
        displayMessage = parsed.error;
      } else if (parsed.detail) {
        displayMessage = parsed.detail;
      }
    }
  } catch {
    if (message.includes("Need at least two numeric columns")) {
      displayMessage = "Need at least two numeric columns to create a scatter plot.";
    } else if (message.includes("correlation")) {
      displayMessage = displayMessage.replace(/^\d+\s*/, "").replace(/\s*\{.*$/, "").trim();
    }
  }
  el.textContent = displayMessage;
  el.hidden = false;
}
function setPanelStatus(id, message) {
  const el = getEl(id);
  if (el) el.textContent = String(message || "");
}
function normalizeScatterSuggestionThreshold(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SCATTER_SUGGESTION_THRESHOLD;
  return Math.min(0.95, Math.max(0.3, Math.round(numeric * 20) / 20));
}
function paletteForScale(scale) {
  if (scale === "plasma") return ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"];
  if (scale === "inferno") return ["#000004", "#420a68", "#932667", "#dd513a", "#fba40a", "#fcffa4"];
  return ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
}
function normalizeHexColor(hex) {
  const clean = String(hex).replace("#", "");
  return clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
}
function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function toFiniteNumbers(values) {
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}
function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  const num = Number.parseInt(normalized, 16);
  return { r: num >> 16 & 255, g: num >> 8 & 255, b: num & 255 };
}
function rgbToHex({ r, g, b }) {
  const toHex = (value) => clampColorChannel(value).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
  const finite = toFiniteNumbers(values);
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
  const finite = toFiniteNumbers(values);
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
  const sorted = toFiniteNumbers(values).sort((a, b) => a - b);
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

const state = scatterState;
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
const collectColumnRangeFilters = () => Object.entries(appStateComposite.columnRanges || {}).map(([column, range]) => {
  const from = Number(range?.from);
  const to = Number(range?.to);
  if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { column, from, to };
}).filter((f) => f !== null);
const scopeFiltersToColumns = (filters, columns) => {
  const allowed = new Set(columns.filter(Boolean));
  if (allowed.size === 0) return [];
  return filters.filter((f) => allowed.has(f.column));
};
function isLinkedBrushEnabled() {
  return !!getEl("scatter-link-brush")?.checked || !!getEl("scatter-matrix-link-range")?.checked;
}
function buildScatterQueryContext(columns = {}) {
  const start = Number(appStateComposite.currentStart);
  const end = Number(appStateComposite.currentEnd);
  const allFilters = collectColumnRangeFilters();
  const filters = scopeFiltersToColumns(allFilters, [columns.x || "", columns.y || "", columns.colorColumn || ""]);
  const linkedRangeValid = isLinkedBrushEnabled() && Number.isFinite(start) && Number.isFinite(end) && start < end;
  return {
    start: linkedRangeValid ? start : void 0,
    end: linkedRangeValid ? end : void 0,
    filters,
    lineFilters: buildAdaptiveLineFiltersForQuery()
  };
}
function getActiveScatterFilterColumns(columns = {}) {
  const allFilters = collectColumnRangeFilters();
  const scoped = scopeFiltersToColumns(allFilters, [columns.x || "", columns.y || "", columns.colorColumn || ""]);
  return scoped.map((f) => f.column);
}
function buildRenderSignature(controls) {
  return [
    controls.x || "",
    controls.y || "",
    controls.renderMode,
    controls.selectedColorColumn || "",
    controls.colorScale,
    controls.colormap || "",
    controls.normalization || "",
    controls.diagonalMode
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
  appStateComposite.scatter.points = Array.isArray(appStateComposite.scatter.allPoints) ? appStateComposite.scatter.allPoints : [];
  appStateComposite.scatter.colorValues = Array.isArray(appStateComposite.scatter.allColorValues) ? appStateComposite.scatter.allColorValues : null;
  appStateComposite.scatter.colorLabels = Array.isArray(appStateComposite.scatter.allColorLabels) ? appStateComposite.scatter.allColorLabels : null;
  const colorExtent = computeColorExtent(appStateComposite.scatter.colorValues);
  appStateComposite.scatter.colorMin = colorExtent?.min ?? null;
  appStateComposite.scatter.colorMax = colorExtent?.max ?? null;
  const domains = computeDomains(appStateComposite.scatter.points);
  appStateComposite.scatter.full = { xMin: domains.xMin, xMax: domains.xMax, yMin: domains.yMin, yMax: domains.yMax };
  if (resetView) {
    appStateComposite.scatter.view = { ...appStateComposite.scatter.full };
    appStateComposite.scatter.zoomHistory = [];
  } else {
    appStateComposite.scatter.view = clampView(appStateComposite.scatter.view);
  }
  setStats({ totalPoints: fmt.format(Number(appStateComposite.scatter.totalPoints ?? appStateComposite.scatter.points.length)) });
}
function setStats(partial) {
  const totalEl = getEl("scatter-total-points");
  const visibleEl = getEl("scatter-binned-points");
  const pearsonEl = getEl("scatter-pearson");
  const spearmanEl = getEl("scatter-spearman");
  if (Object.prototype.hasOwnProperty.call(partial, "totalPoints") && totalEl) {
    totalEl.textContent = `Total points: ${partial.totalPoints ?? "—"}`;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "visiblePoints") && visibleEl) {
    visibleEl.textContent = `Visible points: ${partial.visiblePoints ?? "—"}`;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "pearson") && pearsonEl) {
    pearsonEl.textContent = `Pearson: ${partial.pearson ?? "—"}`;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "spearman") && spearmanEl) {
    spearmanEl.textContent = `Spearman: ${partial.spearman ?? "—"}`;
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

const state$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    appState: appStateComposite,
    applyScatterStateFromCache,
    buildCategoricalColorGroups,
    buildOverviewContextKey,
    buildRenderSignature,
    buildScatterQueryContext,
    clampView,
    computeColorExtent,
    computeDomains,
    currentControls,
    disposeScatterChart,
    ensureOptions,
    fmt,
    getActiveScatterFilterColumns,
    getEl,
    getPlotMetrics,
    isLinkedBrushEnabled,
    normalizeAnalyticsView,
    normalizeCategoryLabel,
    resetScatterContainer,
    scatterState,
    setStats,
    state
}, Symbol.toStringTag, { value: 'Module' }));

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
  const xSpan = Math.max(1e-9, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin);
  const ySpan = Math.max(1e-9, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin);
  const points = appStateComposite.scatter.points;
  const categoricalGroups = buildCategoricalColorGroups(appStateComposite.scatter.colorLabels);
  if (controls.renderMode === "density") {
    const binSize = Math.max(2, (Number(controls.binSize) || 10) * scale);
    const cols = Math.max(1, Math.ceil(plotWidth / binSize));
    const rows = Math.max(1, Math.ceil(plotHeight / binSize));
    const counts = new Uint32Array(cols * rows);
    let maxCount = 0;
    for (const [x, y] of points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const nx = (x - appStateComposite.scatter.view.xMin) / xSpan;
      const ny = (y - appStateComposite.scatter.view.yMin) / ySpan;
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
    const px = plotLeft + (x - appStateComposite.scatter.view.xMin) / xSpan * plotWidth;
    const py = plotTop + (1 - (y - appStateComposite.scatter.view.yMin) / ySpan) * plotHeight;
    let fill = "#4a9eff";
    if (controls.selectedColorColumn && categoricalGroups) {
      fill = categoricalGroups.colorByLabel.get(normalizeCategoryLabel(appStateComposite.scatter.colorLabels?.[i])) || fill;
    } else if (controls.selectedColorColumn && Array.isArray(appStateComposite.scatter.colorValues) && Number.isFinite(appStateComposite.scatter.colorMin) && Number.isFinite(appStateComposite.scatter.colorMax) && appStateComposite.scatter.colorMax > appStateComposite.scatter.colorMin) {
      const v = Number(appStateComposite.scatter.colorValues[i]);
      if (Number.isFinite(v)) fill = sampleGradient(palette, (v - appStateComposite.scatter.colorMin) / (appStateComposite.scatter.colorMax - appStateComposite.scatter.colorMin));
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
  const yTicks = buildLinearTicks(appStateComposite.scatter.view.yMin, appStateComposite.scatter.view.yMax, 6);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textDim;
  for (const tick of yTicks) {
    const py = plotBottom - (tick - appStateComposite.scatter.view.yMin) / Math.max(1e-9, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin) * plotHeight;
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
    ctx.fillText(formatValueForColumn(controls.y, tick, Math.max(1, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin), appStateComposite.scatter.columnTypes), plotLeft - tickLen - labelPad, py);
  }
  const xTicks = buildLinearTicks(appStateComposite.scatter.view.xMin, appStateComposite.scatter.view.xMax, 6);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of xTicks) {
    const px = plotLeft + (tick - appStateComposite.scatter.view.xMin) / Math.max(1e-9, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin) * plotWidth;
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
    ctx.fillText(formatValueForColumn(controls.x, tick, Math.max(1, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin), appStateComposite.scatter.columnTypes), px, plotBottom + tickLen + labelPad);
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
  const corr = appStateComposite.scatter.correlationsByColumn.get(controls.y || "");
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
  ctx.fillText(`Pearson correlation: ${Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : "—"}`, corrX + 10 * scale, corrY + 8 * scale);
  ctx.fillText(`Spearman correlation: ${Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : "—"}`, corrX + 10 * scale, corrY + 24 * scale);
  ctx.restore();
  const showContinuousLegend = controls.renderMode === "density" || controls.selectedColorColumn && !buildCategoricalColorGroups(appStateComposite.scatter.colorLabels) && Number.isFinite(appStateComposite.scatter.colorMin) && Number.isFinite(appStateComposite.scatter.colorMax) && appStateComposite.scatter.colorMax > appStateComposite.scatter.colorMin;
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
    ctx.fillText(controls.renderMode === "density" ? "Low" : formatTwoDecimals(appStateComposite.scatter.colorMin), legendX + 10 * scale, legendY + 34 * scale);
    ctx.textAlign = "right";
    ctx.fillText(controls.renderMode === "density" ? "High" : formatTwoDecimals(appStateComposite.scatter.colorMax), legendX + legendW - 10 * scale, legendY + 34 * scale);
    ctx.restore();
  }
  return true;
}
function buildVisibleScatterRows() {
  const controls = currentControls();
  const rows = [];
  const xSpan = Math.max(1, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin);
  const ySpan = Math.max(1, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin);
  for (let i = 0; i < appStateComposite.scatter.points.length; i++) {
    const x = Number(appStateComposite.scatter.points[i]?.[0]);
    const y = Number(appStateComposite.scatter.points[i]?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < appStateComposite.scatter.view.xMin || x > appStateComposite.scatter.view.xMax || y < appStateComposite.scatter.view.yMin || y > appStateComposite.scatter.view.yMax) continue;
    const row = {
      x,
      y,
      x_label: formatValueForColumn(controls.x, x, xSpan, appStateComposite.scatter.columnTypes),
      y_label: formatValueForColumn(controls.y, y, ySpan, appStateComposite.scatter.columnTypes)
    };
    if (controls.selectedColorColumn && Array.isArray(appStateComposite.scatter.colorLabels)) {
      row.color = normalizeCategoryLabel(appStateComposite.scatter.colorLabels[i]);
    } else if (controls.selectedColorColumn && Array.isArray(appStateComposite.scatter.colorValues)) {
      const cv = Number(appStateComposite.scatter.colorValues[i]);
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
  const context = (await __vitePreload(async () => { const {buildScatterQueryContext} = await Promise.resolve().then(() => state$1);return { buildScatterQueryContext }},true              ?void 0:void 0)).buildScatterQueryContext({
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

const SCATTER_GRID_LEFT = 72;
const SCATTER_GRID_RIGHT = 72;
const SCATTER_GRID_TOP = 24;
const SCATTER_GRID_BOTTOM = 50;
function buildNormalScatterSeries(points, controls) {
  const colorColumn = controls.selectedColorColumn;
  const values = appStateComposite.scatter.colorValues;
  const categoricalGroups = colorColumn ? buildCategoricalColorGroups(appStateComposite.scatter.colorLabels) : null;
  if (categoricalGroups) {
    return categoricalGroups.categories.map((label) => {
      const data = [];
      for (let i = 0; i < points.length; i++) {
        if (normalizeCategoryLabel(appStateComposite.scatter.colorLabels?.[i]) !== label) continue;
        data.push(points[i]);
      }
      return { type: "scatter", name: label, data, symbolSize: 3, color: categoricalGroups.colorByLabel.get(label) || "#4a9eff", sampling: "none" };
    }).filter((s) => s.data.length > 0);
  }
  if (!colorColumn || !Array.isArray(values) || values.length === 0) {
    return [{ type: "scatter", name: `${controls.x || "x"} vs ${controls.y || "y"}`, data: points, symbolSize: 3, color: "#4a9eff", sampling: "none" }];
  }
  const min = Number.isFinite(appStateComposite.scatter.colorMin) ? appStateComposite.scatter.colorMin : null;
  const max = Number.isFinite(appStateComposite.scatter.colorMax) ? appStateComposite.scatter.colorMax : null;
  if (min === null || max === null || !(max > min)) {
    return [{ type: "scatter", name: `${controls.x || "x"} vs ${controls.y || "y"}`, data: points, symbolSize: 3, color: "#4a9eff", sampling: "none" }];
  }
  const valueCount = Math.min(points.length, appStateComposite.scatter.allColorValues?.length ?? points.length);
  const bins = 64;
  const span = max - min;
  const grouped = Array.from({ length: bins }, () => []);
  for (let idx = 0; idx < points.length; idx++) {
    const rawV = idx < valueCount ? Number(appStateComposite.scatter.allColorValues?.[idx]) : Number.NaN;
    if (!Number.isFinite(rawV)) continue;
    const v = rawV;
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
  const xSpan = appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin;
  const ySpan = appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin;
  if (!(xSpan > 0) || !(ySpan > 0)) return null;
  const binSize = Math.max(1, Number(controls.binSize) || 10);
  const key = [
    appStateComposite.scatter.view.xMin,
    appStateComposite.scatter.view.xMax,
    appStateComposite.scatter.view.yMin,
    appStateComposite.scatter.view.yMax,
    metrics.plotWidth,
    metrics.plotHeight,
    binSize,
    controls.colorColumn || "",
    controls.renderMode || ""
  ].join("|");
  if (appStateComposite.scatter.densityTooltipCache?.key === key) return appStateComposite.scatter.densityTooltipCache;
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
      if (x < appStateComposite.scatter.view.xMin || x > appStateComposite.scatter.view.xMax || y < appStateComposite.scatter.view.yMin || y > appStateComposite.scatter.view.yMax) continue;
      const nx = (x - appStateComposite.scatter.view.xMin) / xSpan;
      const ny = (y - appStateComposite.scatter.view.yMin) / ySpan;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      const bx = Math.floor(nx * metrics.plotWidth / binSize);
      const by = Math.floor((1 - ny) * metrics.plotHeight / binSize);
      const k = `${bx},${by}`;
      map.set(k, (map.get(k) || 0) + 1);
    }
    binsBySeriesIndex.set(si, map);
  }
  appStateComposite.scatter.densityTooltipCache = { key, binSize, metrics, binsBySeriesIndex, metaBySeriesIndex };
  return appStateComposite.scatter.densityTooltipCache;
}
function densityTooltipFormatterFactory(controls, container) {
  return (params) => {
    const p = Array.isArray(params) ? params[0] : params;
    if (!p) return "";
    const cache = appStateComposite.scatter.densityTooltipCache || buildDensityTooltipCache(appStateComposite.scatter.lastOptionSeries || [], controls, container);
    const x = Number(p?.value?.[0]);
    const y = Number(p?.value?.[1]);
    const seriesIndex = Number(p?.seriesIndex);
    let density = null;
    const bins = cache?.binsBySeriesIndex?.get(seriesIndex);
    const m = cache?.metrics;
    const xSpan = appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin;
    const ySpan = appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin;
    const binSize = cache?.binSize;
    if (bins && m && Number.isFinite(x) && Number.isFinite(y) && xSpan > 0 && ySpan > 0 && Number.isFinite(binSize) && binSize > 0) {
      const nx = (x - appStateComposite.scatter.view.xMin) / xSpan;
      const ny = (y - appStateComposite.scatter.view.yMin) / ySpan;
      const bx = Math.floor(nx * m.plotWidth / binSize);
      const by = Math.floor((1 - ny) * m.plotHeight / binSize);
      density = bins.get(`${bx},${by}`) ?? null;
    }
    const parts = [];
    const xSpanLabel = Math.max(1, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin);
    const ySpanLabel = Math.max(1, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin);
    parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.x || "X")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpanLabel, appStateComposite.scatter.columnTypes))}</span></div>`);
    parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.y || "Y")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpanLabel, appStateComposite.scatter.columnTypes))}</span></div>`);
    const meta = cache?.metaBySeriesIndex?.get(seriesIndex);
    if (controls.colorColumn && meta && Number.isFinite(meta.colorCenter)) {
      parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.colorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatTwoDecimals(meta.colorCenter))}</span></div>`);
    }
    parts.push(`<div><span style="opacity:0.85;">Density:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(density == null ? "—" : fmt.format(density))}</span></div>`);
    return parts.join("");
  };
}
function scatterTooltipFormatterFactory(controls) {
  return (params) => {
    const p = Array.isArray(params) ? params[0] : params;
    if (!p) return "";
    const x = Number(p?.value?.[0]);
    const y = Number(p?.value?.[1]);
    const xSpan = Math.max(1, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin);
    const ySpan = Math.max(1, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin);
    const parts = [
      `<div><span style="opacity:0.85;">${escapeHtml(controls.x || "X")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.x, x, xSpan, appStateComposite.scatter.columnTypes))}</span></div>`,
      `<div><span style="opacity:0.85;">${escapeHtml(controls.y || "Y")}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatValueForColumn(controls.y, y, ySpan, appStateComposite.scatter.columnTypes))}</span></div>`
    ];
    if (controls.selectedColorColumn && Array.isArray(appStateComposite.scatter.colorLabels)) {
      const label = p?.seriesName || null;
      if (label) parts.push(`<div><span style="opacity:0.85;">${escapeHtml(controls.selectedColorColumn)}:</span> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(label))}</span></div>`);
    } else if (controls.selectedColorColumn && Array.isArray(appStateComposite.scatter.colorValues)) {
      const colorValue = Number(appStateComposite.scatter.colorValues[Number(p?.dataIndex)]);
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
  if (appStateComposite.scatter.activeView !== "plot") {
    setColorbarVisible(false);
    return;
  }
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const hasContinuousColor = !!ctl.selectedColorColumn && Array.isArray(appStateComposite.scatter.colorValues) && appStateComposite.scatter.colorValues.length > 0 && Number.isFinite(appStateComposite.scatter.colorMin) && Number.isFinite(appStateComposite.scatter.colorMax) && appStateComposite.scatter.colorMax > appStateComposite.scatter.colorMin;
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
    if (minEl) minEl.textContent = formatTwoDecimals(appStateComposite.scatter.colorMin);
    if (maxEl) maxEl.textContent = formatTwoDecimals(appStateComposite.scatter.colorMax);
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
  const isPlot = appStateComposite.scatter.activeView === "plot";
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const hasPoints = appStateComposite.scatter.points.length > 0;
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
  const xValues = appStateComposite.scatter.points.map((p) => Number(p[0])).filter((v) => Number.isFinite(v));
  const yValues = appStateComposite.scatter.points.map((p) => Number(p[1])).filter((v) => Number.isFinite(v));
  if (marginalX) requestAnimationFrame(() => drawMarginalX(marginalX, xValues, appStateComposite.scatter.view.xMin, appStateComposite.scatter.view.xMax));
  if (marginalY) requestAnimationFrame(() => drawMarginalY(marginalY, yValues, appStateComposite.scatter.view.yMin, appStateComposite.scatter.view.yMax));
}
function buildOption(points, container) {
  const ctl = currentControls();
  const isDensity = ctl.renderMode === "density";
  const xSpan = Math.max(1, appStateComposite.scatter.view.xMax - appStateComposite.scatter.view.xMin);
  const ySpan = Math.max(1, appStateComposite.scatter.view.yMax - appStateComposite.scatter.view.yMin);
  const xTickFormatter = isTemporalColumn(ctl.x, appStateComposite.scatter.columnTypes) ? (v) => formatTimestamp(v, xSpan) : (v) => formatTwoDecimals(v);
  const yTickFormatter = isTemporalColumn(ctl.y, appStateComposite.scatter.columnTypes) ? (v) => formatTimestamp(v, ySpan) : (v) => formatTwoDecimals(v);
  const series = isDensity ? buildDensitySeries(points, ctl) : buildNormalScatterSeries(points, ctl);
  appStateComposite.scatter.lastOptionSeries = series;
  const option = {
    theme: "dark",
    grid: { left: 72, right: 200, top: 24, bottom: 50 },
    xAxis: { type: "value", name: ctl.x || "x", min: appStateComposite.scatter.view.xMin, max: appStateComposite.scatter.view.xMax, tickFormatter: xTickFormatter },
    yAxis: { type: "value", name: ctl.y || "y", min: appStateComposite.scatter.view.yMin, max: appStateComposite.scatter.view.yMax, tickFormatter: yTickFormatter },
    legend: { show: false },
    series
  };
  if (isDensity) {
    option.tooltip = { show: true, trigger: "item", formatter: densityTooltipFormatterFactory(ctl, container) };
    buildDensityTooltipCache(series, ctl, container);
  } else {
    appStateComposite.scatter.densityTooltipCache = null;
    option.tooltip = { show: true, trigger: "item", formatter: scatterTooltipFormatterFactory(ctl) };
  }
  return option;
}
function renderCurrentOption() {
  if (!appStateComposite.scatter.chart) return;
  const container = getEl("scatter-chart");
  appStateComposite.scatter.chart.setOption(buildOption(appStateComposite.scatter.points, container));
  requestAnimationFrame(() => appStateComposite.scatter.chart?.resize?.());
  updateColorbarUI();
  updateBinnedReadout();
  updateMarginalPlots();
}
function applyView(nextView, pushHistory = false) {
  const current = { ...appStateComposite.scatter.view };
  const next = clampView(nextView);
  if (pushHistory) appStateComposite.scatter.zoomHistory = [...appStateComposite.scatter.zoomHistory, current].slice(-30);
  appStateComposite.scatter.view = next;
  renderCurrentOption();
}
function resetView(clearHistory = true) {
  if (clearHistory) appStateComposite.scatter.zoomHistory = [];
  appStateComposite.scatter.view = { ...appStateComposite.scatter.full };
  renderCurrentOption();
}
function updateBinnedReadout() {
  if (!appStateComposite.scatter.chart || appStateComposite.scatter.points.length === 0) {
    setStats({ visiblePoints: "0" });
    return;
  }
  const i0 = lowerBoundByX(appStateComposite.scatter.points, appStateComposite.scatter.view.xMin);
  const i1 = upperBoundByX(appStateComposite.scatter.points, appStateComposite.scatter.view.xMax);
  const visibleCount = Math.max(0, i1 - i0);
  const text = fmt.format(visibleCount);
  if (text !== appStateComposite.scatter.lastBinnedText) {
    appStateComposite.scatter.lastBinnedText = text;
    setStats({ visiblePoints: text });
  }
}
function updateCorrelationStats() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const pairEl = getEl("scatter-current-pair");
  const openCausalBtn = getEl("scatter-open-causal-btn");
  const corr = appStateComposite.scatter.correlationsByColumn.get(ySelect?.value || "");
  const pearson = Number.isFinite(corr?.pearson) ? corr.pearson.toFixed(3) : "—";
  const spearman = Number.isFinite(corr?.spearman) ? corr.spearman.toFixed(3) : "—";
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
  if (!container || appStateComposite.scatter.selectionBox) return;
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
  appStateComposite.scatter.selectionBox = box;
  const renderSelectionBox = () => {
    if (!appStateComposite.scatter.selectionBox || !appStateComposite.scatter.drag) return;
    const left = Math.min(appStateComposite.scatter.drag.startX, appStateComposite.scatter.drag.endX);
    const right = Math.max(appStateComposite.scatter.drag.startX, appStateComposite.scatter.drag.endX);
    const top = Math.min(appStateComposite.scatter.drag.startY, appStateComposite.scatter.drag.endY);
    const bottom = Math.max(appStateComposite.scatter.drag.startY, appStateComposite.scatter.drag.endY);
    appStateComposite.scatter.selectionBox.style.left = `${left}px`;
    appStateComposite.scatter.selectionBox.style.top = `${top}px`;
    appStateComposite.scatter.selectionBox.style.width = `${Math.max(0, right - left)}px`;
    appStateComposite.scatter.selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
    appStateComposite.scatter.selectionBox.style.display = "block";
  };
  const hideSelectionBox = () => {
    if (appStateComposite.scatter.selectionBox) appStateComposite.scatter.selectionBox.style.display = "none";
  };
  container.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const rect = container.getBoundingClientRect();
    appStateComposite.scatter.drag = { pointerId: ev.pointerId, startX: ev.clientX - rect.left, endX: ev.clientX - rect.left, startY: ev.clientY - rect.top, endY: ev.clientY - rect.top };
    try {
      container.setPointerCapture(ev.pointerId);
    } catch {
    }
    renderSelectionBox();
  });
  container.addEventListener("pointermove", (ev) => {
    if (!appStateComposite.scatter.drag || ev.pointerId !== appStateComposite.scatter.drag.pointerId) return;
    const rect = container.getBoundingClientRect();
    appStateComposite.scatter.drag.endX = ev.clientX - rect.left;
    appStateComposite.scatter.drag.endY = ev.clientY - rect.top;
    renderSelectionBox();
  });
  const finishDrag = (ev) => {
    if (!appStateComposite.scatter.drag || ev.pointerId !== appStateComposite.scatter.drag.pointerId) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const left = Math.max(0, Math.min(appStateComposite.scatter.drag.startX, appStateComposite.scatter.drag.endX));
    const right = Math.min(width, Math.max(appStateComposite.scatter.drag.startX, appStateComposite.scatter.drag.endX));
    const top = Math.max(0, Math.min(appStateComposite.scatter.drag.startY, appStateComposite.scatter.drag.endY));
    const bottom = Math.min(height, Math.max(appStateComposite.scatter.drag.startY, appStateComposite.scatter.drag.endY));
    appStateComposite.scatter.drag = null;
    hideSelectionBox();
    if (right - left < 8 || bottom - top < 8) {
      try {
        container.releasePointerCapture(ev.pointerId);
      } catch {
      }
      return;
    }
    const cur = appStateComposite.scatter.view;
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
    if (appStateComposite.scatter.zoomHistory.length > 0) {
      applyView(appStateComposite.scatter.zoomHistory.pop(), false);
      return;
    }
    resetView(false);
  });
}
function syncModeUI() {
  const ctl = currentControls();
  const view = appStateComposite.scatter.activeView || "plot";
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

let draggingMatrixColumn = null;
const MATRIX_FETCH_CONCURRENCY = 4;
function collectOverviewColumns() {
  const controls = currentControls();
  const columns = [];
  const push = (c) => {
    if (!c || columns.includes(c)) return;
    columns.push(c);
  };
  push(controls.x);
  push(controls.y);
  for (const item of appStateComposite.scatter.lastSuggestions || []) {
    push(item?.column);
    if (columns.length >= MATRIX_MAX_COLUMNS) break;
  }
  for (const column of appStateComposite.scatter.metadata?.numeric_columns || []) {
    push(column);
    if (columns.length >= MATRIX_MAX_COLUMNS) break;
  }
  return columns.slice(0, MATRIX_MAX_COLUMNS);
}
function buildOverviewColumns() {
  const derived = collectOverviewColumns();
  const next = appStateComposite.scatter.matrixColumnOrder.filter((column) => derived.includes(column));
  for (const column of derived) {
    if (!next.includes(column)) next.push(column);
  }
  appStateComposite.scatter.matrixColumnOrder = next.slice(0, MATRIX_MAX_COLUMNS);
  return appStateComposite.scatter.matrixColumnOrder;
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
  const cached = appStateComposite.scatter.matrixCache.get(cacheKey);
  if (cached) return cached;
  const request = fetchScatterPoints(x, y, MATRIX_POINT_LIMIT, colorColumn || null, context).then((response) => ({
    totalPoints: Number(response?.total_points ?? 0),
    points: Array.isArray(response?.points) ? response.points : [],
    colorValues: Array.isArray(response?.color_values) ? response.color_values : null,
    colorLabels: Array.isArray(response?.color_labels) ? response.color_labels : null
  })).catch((error) => {
    appStateComposite.scatter.matrixCache.delete(cacheKey);
    throw error;
  });
  appStateComposite.scatter.matrixCache.set(cacheKey, request);
  const MAX_MATRIX_CACHE = 256;
  if (appStateComposite.scatter.matrixCache.size > MAX_MATRIX_CACHE) {
    const keys = appStateComposite.scatter.matrixCache.keys();
    let toRemove = appStateComposite.scatter.matrixCache.size - MAX_MATRIX_CACHE;
    for (const k of keys) {
      if (toRemove-- <= 0) break;
      appStateComposite.scatter.matrixCache.delete(k);
    }
  }
  return request;
}
async function selectMatrixPair(x, y, refreshCorrelations, renderScatter, setScatterView) {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  if (!xSelect || !ySelect) return;
  xSelect.value = x;
  await refreshCorrelations();
  ySelect.value = y;
  await setScatterView("plot", { render: false });
  await renderScatter();
}
function describeDistributionMode(mode) {
  if (mode === "kde") return "KDE";
  if (mode === "boxplot") return "Box Plot";
  return "Histogram";
}
function matrixPairPriority(pair, controls, suggestionRank) {
  const [column, row] = pair;
  if (column === controls.x && row === controls.y) return 0;
  if (column === controls.y && row === controls.x) return 1;
  const isDiagonal = column === row;
  const currentAxisRank = [column, row].includes(controls.x) || [column, row].includes(controls.y) ? 0 : 1;
  const suggestionColumnRank = suggestionRank.get(column) ?? Number.POSITIVE_INFINITY;
  const suggestionRowRank = suggestionRank.get(row) ?? Number.POSITIVE_INFINITY;
  const bestSuggestionRank = Math.min(suggestionColumnRank, suggestionRowRank);
  if (currentAxisRank === 0 && Number.isFinite(bestSuggestionRank)) return 10 + bestSuggestionRank;
  if (isDiagonal && currentAxisRank === 0) return 20;
  if (isDiagonal && Number.isFinite(bestSuggestionRank)) return 30 + bestSuggestionRank;
  if (Number.isFinite(bestSuggestionRank)) return 40 + bestSuggestionRank;
  if (isDiagonal) return 60;
  return 100;
}
function buildMatrixFetchPairs(columns, controls, suggestions = []) {
  const suggestionRank = /* @__PURE__ */ new Map();
  suggestions.forEach((item, index) => {
    const column = String(item?.column || "").trim();
    if (!column || suggestionRank.has(column)) return;
    suggestionRank.set(column, index);
  });
  return columns.flatMap((row) => columns.map((column) => [column, row])).sort((left, right) => {
    const leftPriority = matrixPairPriority(left, controls, suggestionRank);
    const rightPriority = matrixPairPriority(right, controls, suggestionRank);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    if (left[1] !== right[1]) return columns.indexOf(left[1]) - columns.indexOf(right[1]);
    return columns.indexOf(left[0]) - columns.indexOf(right[0]);
  });
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
      meta.innerHTML = `<span>${escapeHtml(column)} → ${escapeHtml(rowColumn)}</span><span>${escapeHtml(fmt.format(Number(data.totalPoints || data.points.length || 0)))} pts</span>`;
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
  const requestId = ++appStateComposite.scatter.overviewRequestId;
  const pairs = buildMatrixFetchPairs(columns, controls, appStateComposite.scatter.lastSuggestions);
  const datasets = /* @__PURE__ */ new Map();
  const rerenderOrderedGrid = (nextColumns) => {
    appStateComposite.scatter.matrixColumnOrder = nextColumns.slice(0, MATRIX_MAX_COLUMNS);
    renderMatrixGrid(appStateComposite.scatter.matrixColumnOrder, datasets, onCellClick, rerenderOrderedGrid);
  };
  renderMatrixGrid(columns, datasets, onCellClick, rerenderOrderedGrid);
  let completed = 0;
  let hadErrors = false;
  const updateStatus = () => {
    const groups = buildCategoricalColorGroups(appStateComposite.scatter.colorLabels);
    const groupText = groups && controls.selectedColorColumn ? ` Grouped distributions use ${controls.selectedColorColumn}.` : "";
    const base = `Matrix loaded ${completed}/${pairs.length} cells with ${describeDistributionMode(controls.diagonalMode)} diagonals.`;
    const hint = completed < pairs.length ? " Prioritizing the current pair and suggested columns first." : " Drag headers to reorder.";
    const warning = hadErrors ? " Some cells are temporarily unavailable." : "";
    setPanelStatus("scatter-matrix-status", `${base}${hint}${warning}${groupText}`);
  };
  let renderQueued = false;
  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (requestId !== appStateComposite.scatter.overviewRequestId) return;
      renderMatrixGrid(appStateComposite.scatter.matrixColumnOrder.length > 0 ? appStateComposite.scatter.matrixColumnOrder : columns, datasets, onCellClick, rerenderOrderedGrid);
    });
  };
  try {
    let nextPairIndex = 0;
    const runWorker = async () => {
      while (nextPairIndex < pairs.length) {
        const pairIndex = nextPairIndex;
        nextPairIndex += 1;
        const [col, row] = pairs[pairIndex];
        try {
          const data = await fetchMatrixCellData(col, row, context, controls.selectedColorColumn);
          if (requestId !== appStateComposite.scatter.overviewRequestId) return;
          datasets.set(`${col}|${row}`, data);
        } catch (error) {
          if (requestId !== appStateComposite.scatter.overviewRequestId) return;
          console.error(error);
          hadErrors = true;
        } finally {
          if (requestId !== appStateComposite.scatter.overviewRequestId) return;
          completed += 1;
          updateStatus();
          scheduleRender();
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MATRIX_FETCH_CONCURRENCY, pairs.length) }, () => runWorker())
    );
    if (requestId !== appStateComposite.scatter.overviewRequestId) return;
    renderMatrixGrid(appStateComposite.scatter.matrixColumnOrder.length > 0 ? appStateComposite.scatter.matrixColumnOrder : columns, datasets, onCellClick, rerenderOrderedGrid);
    updateStatus();
  } catch (error) {
    if (requestId !== appStateComposite.scatter.overviewRequestId) return;
    console.error(error);
    renderMatrixGrid(columns, /* @__PURE__ */ new Map(), onCellClick, null);
    setPanelStatus("scatter-matrix-status", "Matrix preview is temporarily unavailable for this query.");
  }
}
async function renderScatterMatrixView(onCellClick) {
  await renderScatterOverview(onCellClick);
  requestAnimationFrame(() => {
    void renderMatrixFftPanel();
  });
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
  setPanelStatus("scatter-matrix-fft-status", "Computing FFT…");
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

let _gpuUnavailable = null;
function handleErr(err) {
  console.error(err);
  showError(String(err?.message ?? err));
}
let scatterEmptyStateController = null;
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
  const isLoading = appStateComposite.scatter.loading && hasAxes && !(_gpuUnavailable && !appStateComposite.scatter.chart);
  syncScatterFilterBadge();
  const linkedRangeOutside = isLinkedBrushEnabled() && isRangeOutsideDataset(appStateComposite.metadata?.time_range, appStateComposite.currentStart, appStateComposite.currentEnd);
  let reason;
  if (_gpuUnavailable && !appStateComposite.scatter.chart) {
    reason = "gpu-unavailable";
  } else if (!hasAxes) {
    reason = "no-columns-selected";
  } else if (isLoading) {
    reason = "loading";
  } else if (appStateComposite.scatter.totalPoints === 0) {
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
  const adaptiveFilterCount = Array.isArray(appStateComposite.adaptiveLineFilters) ? appStateComposite.adaptiveLineFilters.length : 0;
  const text = message || (_gpuUnavailable && !appStateComposite.scatter.chart ? "WebGPU is not available. Scatter rendering requires a WebGPU-capable browser (Chrome 113+, Edge 113+, Safari 18+)." : !hasAxes ? "Choose X and Y numeric columns to render the scatter plot." : isLoading ? "Loading scatter points…" : linkedRangeOutside ? "Linked time range is outside the current dataset. Reset range to recover points." : scopedFilterCount > 0 || adaptiveFilterCount > 0 ? `No points match active filters (${scopedFilterCount} column, ${adaptiveFilterCount} adaptive).` : "No points match the current query.");
  emptyState.update({
    visible: !isLoading && !(hasAxes && appStateComposite.scatter.totalPoints > 0 && !(_gpuUnavailable && !appStateComposite.scatter.chart)),
    reason,
    title: _gpuUnavailable && !appStateComposite.scatter.chart ? "WebGPU unavailable" : !hasAxes ? "Choose scatter axes" : isLoading ? "Loading scatter plot" : linkedRangeOutside ? "Linked range outside dataset" : "No scatter points found",
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
  appStateComposite.scatter.activeView = nextView;
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
  requestAnimationFrame(() => appStateComposite.scatter.chart?.resize?.());
}
function refreshActiveScatterView() {
  return setScatterView(appStateComposite.scatter.activeView, { render: true });
}
function renderSuggestions(suggestions) {
  const box = getEl("scatter-suggestions");
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  const contextEl = getEl("scatter-active-pair-label");
  if (!box) return;
  appStateComposite.scatter.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
  box.innerHTML = "";
  if (contextEl) {
    const x = xSelect?.value || "X";
    const y = ySelect?.value || "Y";
    contextEl.textContent = `Inspecting ${x} vs ${y}`;
  }
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    const empty = document.createElement("span");
    empty.className = "scatter-suggestion-empty";
    empty.textContent = `No suggestions above |corr| ≥ ${appStateComposite.scatter.suggestionThreshold.toFixed(2)}.`;
    box.appendChild(empty);
    return;
  }
  for (const item of suggestions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scatter-suggestion-btn";
    if (ySelect?.value === item.column) btn.classList.add("active");
    const r = Number.isFinite(item.pearson) ? item.pearson.toFixed(2) : "—";
    const rho = Number.isFinite(item.spearman) ? item.spearman.toFixed(2) : "—";
    btn.textContent = `${item.column}  Pearson ${r}  Spearman ${rho}`;
    btn.addEventListener("click", async () => {
      if (!ySelect || ySelect.value === item.column) return;
      ySelect.value = item.column;
      updateCorrelationStats();
      renderSuggestions(appStateComposite.scatter.lastSuggestions);
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
  const meta = appStateComposite.scatter.metadata;
  const numericCols = Array.isArray(meta?.numeric_columns) ? meta.numeric_columns : [];
  if (numericCols.length < 2) return;
  const response = await fetchScatterCorrelations(xSelect.value || null, appStateComposite.scatter.suggestionThreshold);
  const numeric = Array.isArray(response.numeric_columns) ? response.numeric_columns : [];
  if (numeric.length < 2) throw new Error("Need at least two numeric columns for scatter plotting.");
  ensureOptions(xSelect, numeric, xSelect.value || response.base_column || numeric[0]);
  const yCandidates = numeric.filter((c) => c !== xSelect.value);
  const selectedY = ensureOptions(ySelect, yCandidates, ySelect.value);
  if (colorSelect) {
    const colorOptions = [""].concat(
      (appStateComposite.scatter.metadata?.columns || []).map((col) => String(col?.name || "")).filter(Boolean)
    );
    const preferredColor = appStateComposite.scatter.colorColumn || colorSelect.value;
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
  appStateComposite.scatter.correlationsByColumn = /* @__PURE__ */ new Map();
  for (const row of response.correlations || []) {
    appStateComposite.scatter.correlationsByColumn.set(row.column, row);
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
let _scatterAbort = null;
let _scatterDebounceTimer = null;
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
    appStateComposite.scatter.loading = false;
    appStateComposite.scatter.totalPoints = 0;
    syncScatterEmptyState();
    return;
  }
  if (_scatterAbort) {
    _scatterAbort.abort();
    _scatterAbort = null;
  }
  showError("");
  const scatterLoading = getEl("scatter-chart-loading");
  const requestId = ++appStateComposite.scatter.scatterRequestId;
  appStateComposite.scatter.loading = true;
  syncScatterEmptyState();
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
    if (requestId !== appStateComposite.scatter.scatterRequestId) return;
    _scatterAbort = null;
    const points = Array.isArray(response.points) ? response.points : [];
    appStateComposite.scatter.totalPoints = Number(response.total_points ?? points.length);
    appStateComposite.scatter.allPoints = points;
    appStateComposite.scatter.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
    appStateComposite.scatter.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
    appStateComposite.scatter.colorColumn = response.color || "";
    applyScatterStateFromCache(true);
    if (appStateComposite.scatter.chart && appStateComposite.scatter.lastRenderSignature !== renderSignature) {
      disposeScatterChart();
      container = resetScatterContainer() || getEl("scatter-chart");
    }
    const nextOption = buildOption(appStateComposite.scatter.points, container);
    if (!appStateComposite.scatter.chart) {
      if (!await isGPUAvailable()) {
        appStateComposite.scatter.totalPoints = points.length;
        syncScatterEmptyState();
        return;
      }
      const chartOptions = { ...nextOption };
      const powerPreference = defaultGpuPowerPreference();
      if (powerPreference) ;
      appStateComposite.scatter.chart = await Ad(container, chartOptions);
      appStateComposite.scatter.lastRenderSignature = renderSignature;
      initSelectionZoom(container);
      appStateComposite.scatter.chart.onPerformanceUpdate?.(() => {
        const now = performance.now();
        if (now - appStateComposite.scatter.lastUpdateMs < 100) return;
        appStateComposite.scatter.lastUpdateMs = now;
        updateBinnedReadout();
      });
    } else {
      appStateComposite.scatter.chart.setOption(nextOption);
      appStateComposite.scatter.lastRenderSignature = renderSignature;
      requestAnimationFrame(() => appStateComposite.scatter.chart?.resize?.());
    }
    updateColorbarUI();
    updateBinnedReadout();
    updateCorrelationStats();
    renderSuggestions(appStateComposite.scatter.lastSuggestions);
    updateMarginalPlots();
    await refreshActiveScatterView();
  } catch (err) {
    if (err?.name === "AbortError") return;
    if (requestId !== appStateComposite.scatter.scatterRequestId) return;
    appStateComposite.scatter.totalPoints = 0;
    const isGpuErr = /gpu|webgpu|adapter|device/i.test(String(err?.message || ""));
    if (isGpuErr) _gpuUnavailable = true;
    syncScatterEmptyState(
      isGpuErr ? "WebGPU rendering failed. Scatter requires a GPU-capable browser." : "Scatter rendering is unavailable for the current query."
    );
    throw err;
  } finally {
    if (requestId === appStateComposite.scatter.scatterRequestId) {
      appStateComposite.scatter.loading = false;
      syncScatterEmptyState();
      if (scatterLoading) scatterLoading.hidden = true;
    }
  }
}
async function rerenderScatterFromCache(resetViewFlag = true) {
  if (Array.isArray(appStateComposite.scatter.allPoints) && appStateComposite.scatter.allPoints.length > 0) {
    applyScatterStateFromCache(resetViewFlag);
    if (appStateComposite.scatter.chart) renderCurrentOption();
    updateCorrelationStats();
    renderSuggestions(appStateComposite.scatter.lastSuggestions);
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
    appStateComposite.scatter.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
    suggestionThresholdInput.value = appStateComposite.scatter.suggestionThreshold.toFixed(2);
  }
  if (suggestionThresholdValue) suggestionThresholdValue.textContent = appStateComposite.scatter.suggestionThreshold.toFixed(2);
  if (suggestionThresholdLabel) suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${appStateComposite.scatter.suggestionThreshold.toFixed(2)})`;
  syncModeUI();
  void setScatterView(appStateComposite.scatter.activeView, { render: false });
  document.querySelectorAll("[data-scatter-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextView = normalizeAnalyticsView(btn.dataset.scatterView || "plot");
      void setScatterView(nextView);
    });
  });
  const rerender = () => {
    const container = getEl("scatter-chart");
    if (!appStateComposite.scatter.chart) return;
    appStateComposite.scatter.chart.setOption(buildOption(appStateComposite.scatter.points, container));
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
    appStateComposite.scatter.suggestionThreshold = normalizeScatterSuggestionThreshold(suggestionThresholdInput.value);
    suggestionThresholdInput.value = appStateComposite.scatter.suggestionThreshold.toFixed(2);
    if (suggestionThresholdValue) suggestionThresholdValue.textContent = appStateComposite.scatter.suggestionThreshold.toFixed(2);
    if (suggestionThresholdLabel) {
      suggestionThresholdLabel.textContent = `Suggestions (|corr| ≥ ${appStateComposite.scatter.suggestionThreshold.toFixed(2)})`;
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
    if (appStateComposite.scatter.activeView === "matrix") void refreshActiveScatterView();
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
    appStateComposite.scatter.chart?.resize?.();
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
    if (!appStateComposite.scatter.metadata) {
      await new Promise((resolve) => {
        const handler = () => {
          if (appStateComposite.scatter.metadata) {
            window.removeEventListener("edatime:metadata-ready", handler);
            resolve();
          }
        };
        window.addEventListener("edatime:metadata-ready", handler);
        if (appStateComposite.scatter.metadata) {
          window.removeEventListener("edatime:metadata-ready", handler);
          resolve();
        }
      });
    }
    appStateComposite.scatter.activeView = normalizeAnalyticsView(ev?.detail?.analyticsView);
    await setScatterView(appStateComposite.scatter.activeView, { render: false });
    if (!appStateComposite.scatter.pageInitialized) {
      refreshCorrelationsAndSuggestions().then(() => renderScatter()).then(() => {
        appStateComposite.scatter.pageInitialized = true;
      }).catch((err) => {
        handleErr(err);
      });
    } else {
      try {
        if (isLinkedBrushEnabled() || Object.keys(appStateComposite.columnRanges || {}).length > 0 || (appStateComposite.adaptiveLineFilters || []).length > 0) {
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
  appStateComposite.scatter.metadata = metadata;
  appStateComposite.scatter.columnTypes = new Map(
    (metadata?.columns || []).map((col) => [
      String(col?.name || "").toLowerCase(),
      String(col?.dtype || "")
    ])
  );
  if (numeric.length > 0) {
    ensureOptions(xSelect, numeric, xSelect.value || numeric[0]);
    ensureOptions(ySelect, numeric.filter((c) => c !== xSelect.value), ySelect.value || numeric[1] || numeric[0]);
  }
  appStateComposite.scatter.loading = !appStateComposite.scatter.pageInitialized && !page.hidden && !!xSelect.value && !!ySelect.value;
  syncScatterEmptyState();
  syncScatterFilterBadge();
  if (!appStateComposite.scatter.initialized) {
    bindControls();
    appStateComposite.scatter.initialized = true;
  }
  if (appStateComposite.scatter.pageInitialized) return;
  const isVisible = !page.hidden;
  if (!isVisible) return;
  try {
    await refreshCorrelationsAndSuggestions();
    await renderScatter();
    appStateComposite.scatter.pageInitialized = true;
  } catch (err) {
    handleErr(err);
  }
}

export { initScatterPage };
//# sourceMappingURL=scatter-Dao--s14.js.map
