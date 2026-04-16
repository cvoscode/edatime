import {
  escapeHtml
} from "./chunk-JY7RLO2T.js";
import {
  formatTwoDecimals
} from "./chunk-LZAZQ2R3.js";

// frontend/src/state.ts
var SERIES_COLORS = [
  "#00d4ff",
  "#6c63ff",
  "#00c896",
  "#f5a623",
  "#ff4a6e",
  "#c77dff"
];
var PROFILE_ROW_HEIGHT = 38;
var PROFILE_OVERSCAN = 8;
var PROFILE_COLUMNS = [
  { key: "selected", label: "", minWidth: 56, defaultWidth: 56, sortable: false },
  { key: "name", label: "Name", minWidth: 160, defaultWidth: 220, sortable: true },
  { key: "dtype", label: "Type", minWidth: 110, defaultWidth: 120, sortable: true },
  { key: "nonNullCount", label: "Non-Null", minWidth: 130, defaultWidth: 140, sortable: true },
  { key: "nullCount", label: "Null", minWidth: 90, defaultWidth: 100, sortable: true },
  { key: "min", label: "Min", minWidth: 120, defaultWidth: 130, sortable: true },
  { key: "max", label: "Max", minWidth: 120, defaultWidth: 130, sortable: true },
  { key: "histCounts", label: "Distribution", minWidth: 220, defaultWidth: 260, sortable: false }
];
function getDefaultProfileColumnWidths() {
  return PROFILE_COLUMNS.map((col) => col.defaultWidth);
}
var appState = {
  metadata: null,
  numericCols: [],
  seriesColors: {},
  columnProfiles: [],
  previewSelectedColumns: [],
  previewTimeColumn: null,
  profileFilterText: "",
  filterText: "",
  selectedCols: [],
  adaptiveFilterColumn: null,
  columnRanges: {},
  adaptiveLineFilters: [],
  pendingAdaptivePoint: null,
  lastFetchedData: null,
  currentStart: null,
  currentEnd: null,
  chart: null,
  fetchDebounceId: null,
  selectedColorColumn: null,
  analysisBound: false,
  refetchOnZoom: true,
  initialView: null,
  zoomHistory: [],
  pendingYMode: "fit",
  pendingRestoreY: null,
  profileGridBound: false,
  profileGridHeaderBound: false,
  profileGridSort: { key: "name", dir: "asc" },
  profileGridColWidths: [56, 220, 120, 140, 100, 130, 130, 260],
  chartText: { title: "", xLabel: "", yLabel: "" }
};
window.__edatime = window.__edatime || {};
Object.defineProperty(window.__edatime, "state", { get: () => appState });
window.__edatime.DEBUG = true;
function normalizeSeriesColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}
function getSeriesColor(column, fallbackIndex = 0) {
  const name = String(column || "").trim();
  const custom = normalizeSeriesColor(appState.seriesColors?.[name]);
  if (custom) return custom;
  return SERIES_COLORS[Math.abs(fallbackIndex) % SERIES_COLORS.length];
}
function setSeriesColor(column, value) {
  const name = String(column || "").trim();
  const normalized = normalizeSeriesColor(value);
  if (!name || !normalized) return null;
  appState.seriesColors = {
    ...appState.seriesColors || {},
    [name]: normalized
  };
  return normalized;
}
function formatAnalysisTime(tsMs) {
  if (!Number.isFinite(tsMs)) return "\u2014";
  return new Date(tsMs).toLocaleString();
}
var formatAnalysisNumber = formatTwoDecimals;
function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "0";
  return Math.round(n).toLocaleString();
}
function isTemporalDtype(dtype) {
  const dt = String(dtype || "").toLowerCase();
  return dt.includes("datetime") || dt === "date" || dt.startsWith("date[");
}
function normalizeDtypeLabel(dtype) {
  if (isTemporalDtype(dtype)) return "datetime[ns]";
  return String(dtype || "");
}
function formatProfileValue(value, dtype) {
  if (value == null || !Number.isFinite(Number(value))) return "\u2014";
  const numeric = Number(value);
  if (isTemporalDtype(dtype)) {
    const d = new Date(numeric);
    if (!Number.isFinite(d.getTime())) return "\u2014";
    return d.toLocaleString();
  }
  return formatAnalysisNumber(numeric);
}
function formatToDatetimeLocal(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
function toFiniteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function computeBounds(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}
function setMetaText(text) {
  const el = document.getElementById("stat-rows");
  if (el) el.innerHTML = text;
}
function buildMetaBar(metadata) {
  const rows = metadata?.total_rows?.toLocaleString() ?? "?";
  const cols = appState.numericCols?.length ?? 0;
  const series = escapeHtml(appState.selectedCols.join(", ") || "\u2014");
  const el = document.getElementById("header-meta");
  if (el) {
    el.innerHTML = `
      <div class="meta-stat live"><strong>${rows}</strong> rows</div>
      <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
      <div class="meta-stat">Plotting <strong>${series}</strong></div>
    `;
  }
}
function sanitizeSelectedColumns() {
  const blockedNames = /* @__PURE__ */ new Set(["ts", "timestamp", "time"]);
  const datetimeCols = new Set(
    (appState.metadata?.columns || []).filter((col) => /date|time/i.test(String(col?.dtype || ""))).map((col) => String(col?.name || "").toLowerCase())
  );
  appState.selectedCols = (appState.selectedCols || []).filter((col) => {
    const name = String(col || "").trim();
    if (!name) return false;
    const lower = name.toLowerCase();
    if (blockedNames.has(lower)) return false;
    if (datetimeCols.has(lower)) return false;
    return true;
  });
  if (appState.selectedCols.length === 0) {
    const fallback = (appState.numericCols || []).find((col) => {
      const lower = String(col || "").toLowerCase();
      return !blockedNames.has(lower) && !datetimeCols.has(lower);
    });
    if (fallback) appState.selectedCols = [fallback];
  }
}
function ensureRangeStateFromData(dataObj) {
  for (const col of appState.selectedCols) {
    const values = dataObj.values?.[col];
    if (!values || values.length === 0) continue;
    if (!appState.columnRanges[col]) {
      const bounds = computeBounds(values);
      if (!bounds) continue;
      appState.columnRanges[col] = { from: bounds.min, to: bounds.max };
    }
  }
}
function buildAdaptiveLineY(filter, tsMs) {
  const x1 = Number(filter?.x1);
  const x2 = Number(filter?.x2);
  const y1 = Number(filter?.y1);
  const y2 = Number(filter?.y2);
  const x = Number(tsMs);
  if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2) || !Number.isFinite(x) || x1 === x2) {
    return null;
  }
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  if (x < minX || x > maxX) return null;
  const slope = (y2 - y1) / (x2 - x1);
  return y1 + (x - x1) * slope;
}
function passesAdaptiveLineFilters(tsMs, valuesByColumn) {
  const filters = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters : [];
  for (const filter of filters) {
    const column = String(filter?.column || "");
    if (!column) continue;
    const y = Number(valuesByColumn?.[column]);
    if (!Number.isFinite(y)) return false;
    const lineY = buildAdaptiveLineY(filter, tsMs);
    if (!Number.isFinite(lineY)) continue;
    const keepAbove = !!filter.keepAbove;
    if (keepAbove) {
      if (y < lineY) return false;
    } else if (y > lineY) {
      return false;
    }
  }
  return true;
}
function buildAdaptiveLineFiltersForQuery() {
  return (appState.adaptiveLineFilters || []).map((filter) => ({
    column: filter.column,
    x1: Number(filter.x1),
    y1: Number(filter.y1),
    x2: Number(filter.x2),
    y2: Number(filter.y2),
    keepAbove: !!filter.keepAbove
  })).filter(
    (filter) => !!filter.column && Number.isFinite(filter.x1) && Number.isFinite(filter.y1) && Number.isFinite(filter.x2) && Number.isFinite(filter.y2) && filter.x1 !== filter.x2
  );
}
function applyColumnRanges(dataObj) {
  const filtered = { ...dataObj, series: {}, colorByColumn: {} };
  const lineFilters = Array.isArray(appState.adaptiveLineFilters) ? appState.adaptiveLineFilters : [];
  for (const col of appState.selectedCols) {
    const yValues = dataObj.values?.[col];
    if (!yValues) continue;
    const range = appState.columnRanges[col];
    const xs = [];
    const ys = [];
    const colorValues = [];
    for (let i = 0; i < yValues.length; i++) {
      const y = yValues[i];
      const ts = dataObj.ts?.[i];
      if (!Number.isFinite(y)) continue;
      if (!Number.isFinite(ts)) continue;
      if (range && (y < range.from || y > range.to)) continue;
      if (lineFilters.length > 0) {
        const valuesByColumn = {};
        const neededColumns = /* @__PURE__ */ new Set([
          ...appState.selectedCols || [],
          ...lineFilters.map((f) => f.column)
        ]);
        for (const name of neededColumns) {
          valuesByColumn[name] = dataObj.values?.[name]?.[i];
        }
        if (!passesAdaptiveLineFilters(ts, valuesByColumn)) continue;
      }
      xs.push(ts);
      ys.push(y);
      if (Array.isArray(dataObj.color)) {
        colorValues.push(dataObj.color[i]);
      }
    }
    filtered.series[col] = {
      x: Float64Array.from(xs),
      y: Float64Array.from(ys)
    };
    if (Array.isArray(dataObj.color)) {
      filtered.colorByColumn[col] = colorValues;
    }
  }
  return filtered;
}

export {
  SERIES_COLORS,
  PROFILE_ROW_HEIGHT,
  PROFILE_OVERSCAN,
  PROFILE_COLUMNS,
  getDefaultProfileColumnWidths,
  appState,
  normalizeSeriesColor,
  getSeriesColor,
  setSeriesColor,
  formatAnalysisTime,
  formatAnalysisNumber,
  formatCount,
  isTemporalDtype,
  normalizeDtypeLabel,
  formatProfileValue,
  formatToDatetimeLocal,
  toFiniteNumberOrNull,
  computeBounds,
  setMetaText,
  buildMetaBar,
  sanitizeSelectedColumns,
  ensureRangeStateFromData,
  buildAdaptiveLineY,
  buildAdaptiveLineFiltersForQuery,
  applyColumnRanges
};
//# sourceMappingURL=chunk-EXJWZBL5.js.map
