import {
  getSeriesColor
} from "./chunk-DJBC4VTI.js";

// frontend/src/chart/colorScale.ts
var VIRIDIS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
function getInterpolatedColor(t) {
  if (!Number.isFinite(t)) return VIRIDIS[0];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (VIRIDIS.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(VIRIDIS.length - 1, leftIndex + 1);
  const weight = scaled - leftIndex;
  const left = VIRIDIS[leftIndex].slice(1).match(/../g).map((p) => parseInt(p, 16));
  const right = VIRIDIS[rightIndex].slice(1).match(/../g).map((p) => parseInt(p, 16));
  const rgb = left.map((c, i) => Math.round(c + (right[i] - c) * weight));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
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
  for (let i = 0; i < points.length - 1; i++) {
    const segmentColor = colorForScaleValue(colorValues[i], scaleInfo) || getSeriesColor(colName, 0);
    series.push({
      type: "line",
      name: i === 0 ? colName : `__color_segment__${colName}::${i}`,
      color: segmentColor,
      visible,
      showInLegend: i === 0,
      data: [points[i], points[i + 1]]
    });
  }
  if (showMarkers && visible) {
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

export {
  VIRIDIS,
  getInterpolatedColor,
  categoryColorFor,
  analyzeColorValues,
  colorForScaleValue,
  buildColorizedSeries,
  baseSeriesName
};
//# sourceMappingURL=chunk-4MQ6TADT.js.map
