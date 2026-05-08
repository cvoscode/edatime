import { A as Ad } from './chartgpu-CqrjGxnD.js';

const scriptRel = 'modulepreload';const assetsURL = function(dep) { return "/"+dep };const seen = {};const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (true               && deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p) => Promise.resolve(p).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = allSettled2(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};

const DEBUG = (() => {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("debug") === "1") return true;
    if (qs.get("debug") === "true") return true;
    return window.localStorage?.getItem("edatimeDebug") === "1";
  } catch {
    return false;
  }
})();
function dbg(...args) {
  if (!DEBUG) return;
  console.log("[edatime]", ...args);
}
function dbgGroup(label, fn) {
  if (!DEBUG) return fn?.();
  console.groupCollapsed(`[edatime] ${label}`);
  try {
    return fn?.();
  } finally {
    console.groupEnd();
  }
}
if (DEBUG) {
  window.addEventListener("error", (e) => {
    console.error("[edatime] window.error", e?.message, e?.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[edatime] unhandledrejection", e?.reason);
  });
}

const EURO_DATE_ONLY = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
const EURO_DATE_TIME = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
const EURO_DATE_TIME_SECONDS = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
function formatTwoDecimals(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatTimestamp(ms, spanMs) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  try {
    const d = new Date(n);
    if (!Number.isFinite(d.getTime())) return "—";
    if (spanMs <= 2 * 6e4) return EURO_DATE_TIME_SECONDS.format(d);
    if (spanMs <= 2 * 24 * 60 * 6e4) return EURO_DATE_TIME.format(d);
    return EURO_DATE_ONLY.format(d);
  } catch {
    return String(ms);
  }
}
function formatTimeTooltip(ms, spanMs) {
  try {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return String(ms);
    if (spanMs <= 2 * 6e4) return EURO_DATE_TIME_SECONDS.format(d);
    return EURO_DATE_TIME.format(d);
  } catch {
    return String(ms);
  }
}

const SERIES_COLORS = [
  "#00d4ff",
  "#6c63ff",
  "#00c896",
  "#f5a623",
  "#ff4a6e",
  "#c77dff"
];
const PROFILE_ROW_HEIGHT = 38;
const PROFILE_OVERSCAN = 8;
const PROFILE_COLUMNS = [
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
const appState = {
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
  chartText: { title: "", xLabel: "", yLabel: "" },
  // Analytics overlays
  rollingEnabled: false,
  rollingWindow: 50,
  rollingBands: null,
  anomalyEnabled: false,
  anomalyMethod: "zscore",
  anomalyThreshold: 3,
  anomalyRegions: null,
  spectralFilterPreview: null,
  datasetRevision: 0,
  // Scatter slice
  scatter: {
    chart: null,
    initialized: false,
    pageInitialized: false,
    activeView: "plot",
    loading: false,
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
    suggestionThreshold: 0.7,
    lastBinnedText: "",
    lastUpdateMs: 0,
    densityTooltipCache: null,
    lastOptionSeries: null,
    columnTypes: /* @__PURE__ */ new Map(),
    lastSuggestions: [],
    lastRenderSignature: "",
    matrixCache: /* @__PURE__ */ new Map(),
    matrixColumnOrder: [],
    overviewRequestId: 0,
    scatterRequestId: 0
  }
};
window.__edatime = window.__edatime || {};
try {
  Object.defineProperty(window.__edatime, "state", { get: () => appState });
} catch (_) {
}
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
  if (!Number.isFinite(tsMs)) return "—";
  return new Date(tsMs).toLocaleString();
}
const formatAnalysisNumber = formatTwoDecimals;
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
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  if (isTemporalDtype(dtype)) {
    const d = new Date(numeric);
    if (!Number.isFinite(d.getTime())) return "—";
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
  if (el) el.textContent = text;
}
function buildMetaBar(metadata) {
  const rows = metadata?.total_rows?.toLocaleString() ?? "—";
  const cols = metadata ? String(appState.numericCols?.length ?? 0) : "—";
  const el = document.getElementById("header-meta");
  if (el) {
    el.innerHTML = `
      <div class="meta-stat live"><strong>${rows}</strong> rows</div>
      <div class="meta-stat"><strong>${cols}</strong> numeric series</div>
    `;
  }
}
function sanitizeSelectedColumns() {
  const blockedNames = /* @__PURE__ */ new Set(["ts", "timestamp", "time"]);
  const datetimeCols = new Set(
    (appState.metadata?.columns || []).filter((col) => /date|time/i.test(String(col?.dtype || ""))).map((col) => String(col?.name || "").toLowerCase())
  );
  const validColNames = new Set(
    (appState.metadata?.columns || []).map((c) => String(c?.name || "").trim())
  );
  appState.selectedCols = (appState.selectedCols || []).filter((col) => {
    const name = String(col || "").trim();
    if (!name) return false;
    const lower = name.toLowerCase();
    if (blockedNames.has(lower)) return false;
    if (datetimeCols.has(lower)) return false;
    if (!validColNames.has(name)) return false;
    return true;
  });
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
  const neededColumns = lineFilters.length > 0 ? [.../* @__PURE__ */ new Set([...appState.selectedCols || [], ...lineFilters.map((f) => f.column)])] : [];
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

function escapeHtml$1(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function downloadUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function getEl(id) {
  return document.getElementById(id);
}
function debounce(fn, ms) {
  let timer = null;
  return ((...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  });
}

let tableFromIPCFn = null;
async function ensureArrowParser() {
  if (tableFromIPCFn) return tableFromIPCFn;
  try {
    const arrow = await __vitePreload(() => import('./arrow-x6cB_e3F.js'),true              ?[]:void 0);
    if (!arrow?.tableFromIPC) {
      throw new Error("Apache Arrow module loaded but tableFromIPC is missing.");
    }
    tableFromIPCFn = arrow.tableFromIPC;
    return tableFromIPCFn;
  } catch (e) {
    throw new Error(`Failed to load Apache Arrow parser: ${e.message}`);
  }
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function assertDatasetMetadata(data) {
  if (!isObject(data)) throw new Error("Metadata response is not an object");
  if (typeof data.total_rows !== "number") throw new Error("Metadata missing total_rows");
  if (!Array.isArray(data.columns)) throw new Error("Metadata missing columns array");
  if (!Array.isArray(data.numeric_columns)) throw new Error("Metadata missing numeric_columns");
}
function assertScatterPoints(data) {
  if (!isObject(data)) throw new Error("Scatter points response is not an object");
  if (typeof data.x !== "string") throw new Error("Scatter response missing x column name");
  if (typeof data.y !== "string") throw new Error("Scatter response missing y column name");
  if (!Array.isArray(data.points)) throw new Error("Scatter response missing points array");
}
function assertScatterCorrelations(data) {
  if (!isObject(data)) throw new Error("Correlations response is not an object");
  if (!Array.isArray(data.correlations)) throw new Error("Correlations response missing correlations array");
}
async function getJson(url, label, signal) {
  dbg(`GET (${label})`, url);
  const res = await fetch(url, signal ? { signal, cache: "no-store" } : { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function postJson(url, body, label, signal) {
  dbg(`POST (${label})`, { url, body });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function fetchMetadata() {
  const data = await getJson("/api/metadata", "Metadata");
  assertDatasetMetadata(data);
  return data;
}
async function fetchData(start, end, width, columns = "value", colorColumn = null, signal) {
  const params = new URLSearchParams({
    start,
    end,
    width: String(width),
    columns
  });
  if (colorColumn) params.set("color_column", colorColumn);
  const tableFromIPC = await ensureArrowParser();
  const url = `/api/data?${params.toString()}`;
  dbg("GET", url);
  const res = await fetch(url, signal ? { signal, cache: "no-store" } : { cache: "no-store" });
  if (DEBUG) {
    dbg("status", res.status, res.statusText);
    dbg("content-type", res.headers.get("content-type"));
    dbg("content-length", res.headers.get("content-length"));
  }
  const downsampledHeader = res.headers.get("x-edatime-downsampled");
  const returnedRowsHeader = res.headers.get("x-edatime-returned-rows");
  const targetPointsHeader = res.headers.get("x-edatime-target-points");
  const hasDownsampleHeader = downsampledHeader === "0" || downsampledHeader === "1";
  let isDownsampled = downsampledHeader === "1";
  const returnedRows = Number.parseInt(returnedRowsHeader ?? "", 10);
  const targetPoints = Number.parseInt(targetPointsHeader ?? "", 10);
  if (DEBUG) {
    dbg("x-edatime-downsampled", downsampledHeader);
    dbg("x-edatime-returned-rows", returnedRowsHeader);
    dbg("x-edatime-target-points", targetPointsHeader);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Data fetch failed (${res.status}) ${text}`);
  }
  const buffer = await res.arrayBuffer();
  if (DEBUG) {
    dbg("arrow bytes", buffer.byteLength);
  }
  const table = tableFromIPC(buffer);
  if (DEBUG) {
    try {
      const fields = table.schema?.fields?.map((f) => `${f?.name}:${String(f?.type)}`) ?? [];
      dbg("arrow schema", fields);
      dbg("rows", table.numRows);
    } catch {
    }
  }
  const tsCol = table.getChild("ts");
  if (!tsCol) throw new Error("No timestamp column found");
  const len = table.numRows;
  const tsArray = new Float64Array(len);
  function toEpochMs(value) {
    if (value instanceof Date) return value.getTime();
    const numericValue = typeof value === "bigint" ? Number(value) : Number(value);
    const abs = Math.abs(numericValue);
    if (abs >= 1e17) return numericValue / 1e6;
    if (abs >= 1e14) return numericValue / 1e3;
    if (abs >= 1e11) return numericValue;
    return numericValue * 1e3;
  }
  for (let i = 0; i < len; i++) {
    tsArray[i] = toEpochMs(tsCol.get(i));
  }
  if (DEBUG && len > 0) {
    dbg("ts epoch-ms first/last", tsArray[0], tsArray[len - 1]);
  }
  if (!hasDownsampleHeader) {
    isDownsampled = len >= width * 2;
  }
  const dataObj = {
    ts: tsArray,
    values: {},
    color: null,
    color_column: null,
    _meta: {
      downsampled: isDownsampled,
      downsampleKnown: hasDownsampleHeader,
      returnedRows: Number.isFinite(returnedRows) ? returnedRows : len,
      targetPoints: Number.isFinite(targetPoints) ? targetPoints : width * 2
    }
  };
  if (DEBUG) {
    dbg("downsample meta", dataObj._meta);
  }
  const requestedCols = columns.split(",");
  for (const colName of requestedCols) {
    const valCol = table.getChild(colName);
    if (valCol) {
      const valArray = new Float64Array(len);
      for (let i = 0; i < len; i++) {
        valArray[i] = Number(valCol.get(i));
      }
      dataObj.values[colName] = valArray;
    }
  }
  if (colorColumn) {
    const colorCol = table.getChild(colorColumn);
    if (colorCol) {
      dataObj.color_column = colorColumn;
      const colorArray = new Array(len);
      for (let i = 0; i < len; i++) {
        colorArray[i] = colorCol.get(i);
      }
      dataObj.color = colorArray;
    }
  }
  return dataObj;
}
async function fetchScatterPoints(x, y, limit = 1e6, color = null, options = null, signal) {
  const payload = {
    x: String(x),
    y: String(y),
    limit: Number(limit)
  };
  if (color !== null && color !== void 0 && String(color).trim() !== "") {
    payload.color = String(color);
  }
  const start = Number(options?.start);
  const end = Number(options?.end);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    payload.start = start;
    payload.end = end;
  }
  if (Array.isArray(options?.filters) && options.filters.length > 0) {
    payload.filters = JSON.stringify(options.filters);
  }
  if (Array.isArray(options?.lineFilters) && options.lineFilters.length > 0) {
    payload.line_filters = JSON.stringify(options.lineFilters);
  }
  const url = "/api/scatter/points";
  const data = await postJson(url, payload, "Scatter points", signal);
  assertScatterPoints(data);
  return data;
}
async function fetchScatterCorrelations(base, threshold = 0.7) {
  const params = new URLSearchParams({ threshold: String(threshold) });
  if (base !== null && base !== void 0 && String(base).trim() !== "") {
    params.set("base", String(base));
  }
  const url = `/api/scatter/correlations?${params.toString()}`;
  const data = await getJson(url, "Scatter correlations");
  assertScatterCorrelations(data);
  return data;
}
async function fetchRollingBands(start, end, columns, window = 50, signal) {
  const params = new URLSearchParams({ start, end, columns, window: String(window) });
  const url = `/api/analytics/rolling?${params.toString()}`;
  return getJson(url, "Rolling bands", signal);
}
async function fetchAnomalies(start, end, columns, method = "zscore", threshold, signal) {
  const params = new URLSearchParams({ start, end, columns, method });
  if (threshold !== void 0) params.set("threshold", String(threshold));
  const url = `/api/analytics/anomalies?${params.toString()}`;
  return getJson(url, "Anomaly detection", signal);
}
async function fetchFft(start, end, columns, maxPoints = 8192, signal) {
  const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
  const url = `/api/analytics/fft?${params.toString()}`;
  return getJson(url, "FFT", signal);
}
async function fetchSpectrogram(start, end, column, windowSize = 256, hopSize, maxPoints = 32768, signal) {
  const params = new URLSearchParams({
    start,
    end,
    column,
    window_size: String(windowSize),
    max_points: String(maxPoints)
  });
  if (hopSize != null) params.set("hop_size", String(hopSize));
  const url = `/api/analytics/spectrogram?${params.toString()}`;
  return getJson(url, "Spectrogram", signal);
}
async function fetchCausalGraph(columns, tauMax = 3, alpha = 0.05, method = "pcmci", maxPoints = 5e3, signal, pcAlpha = 0.2, test = "par_corr", maxCondsDim, fdrMethod = "none") {
  const url = "/api/analytics/causal";
  const body = {
    columns: columns.join(","),
    tau_max: tauMax,
    alpha,
    method,
    max_points: maxPoints,
    pc_alpha: pcAlpha,
    test,
    fdr_method: fdrMethod
  };
  if (maxCondsDim != null) body.max_conds_dim = maxCondsDim;
  return postJson(url, body, "Causal graph", signal);
}
async function postTransform(expression, outputName) {
  const url = "/api/transform";
  return postJson(url, { expression, output_name: outputName }, "Transform");
}
async function fetchCorrelationMatrix() {
  return getJson("/api/scatter/correlations/matrix", "Correlation matrix");
}
async function postRemoveOutliers(columns, method = "zscore", threshold, window) {
  const body = { method };
  if (columns) body.columns = columns.join(",");
  if (threshold !== void 0) body.threshold = threshold;
  if (window !== void 0) body.window = window;
  const url = "/api/analytics/remove_outliers";
  return postJson(url, body, "Outlier removal");
}

const dataClient = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  fetchAnomalies,
  fetchCausalGraph,
  fetchCorrelationMatrix,
  fetchData,
  fetchFft,
  fetchMetadata,
  fetchRollingBands,
  fetchScatterCorrelations,
  fetchScatterPoints,
  fetchSpectrogram,
  postRemoveOutliers,
  postTransform
}, Symbol.toStringTag, { value: 'Module' }));

function isWindowsPlatform() {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}
function defaultGpuPowerPreference() {
  return void 0;
}
let requestAdapterShimInstalled = false;
function getRequestAdapterGpu() {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) return null;
  return navigator.gpu;
}
function stripIgnoredPowerPreference(options) {
  if (!options || typeof options !== "object" || !Object.prototype.hasOwnProperty.call(options, "powerPreference")) {
    return options;
  }
  const { powerPreference: _ignored, ...rest } = options;
  return Object.keys(rest).length > 0 ? rest : void 0;
}
function installWindowsWebGpuRequestAdapterWorkaround() {
  if (requestAdapterShimInstalled || !isWindowsPlatform()) return;
  const gpu = getRequestAdapterGpu();
  if (!gpu) return;
  const originalRequestAdapter = gpu.requestAdapter?.bind(gpu);
  if (typeof originalRequestAdapter !== "function") return;
  const requestAdapter = (options) => {
    const sanitizedOptions = stripIgnoredPowerPreference(options);
    return sanitizedOptions ? originalRequestAdapter(sanitizedOptions) : originalRequestAdapter();
  };
  Object.defineProperty(gpu, "requestAdapter", {
    configurable: true,
    value: requestAdapter
  });
  requestAdapterShimInstalled = true;
}
async function requestGpuAdapter() {
  const gpu = getRequestAdapterGpu();
  if (!gpu) return null;
  return gpu.requestAdapter();
}

const ANALYTICS_CHIP_COLORS = ["#7ad151", "#4ac3e8", "#f97316", "#e879f9", "#facc15", "#60a5fa", "#f43f5e"];
function getNumericColumns(metadata) {
  const timeCol = String(metadata?.time_column || "").trim().toLowerCase();
  return (metadata?.numeric_columns || []).filter((column) => {
    const lower = String(column || "").trim().toLowerCase();
    return lower && lower !== "ts" && lower !== timeCol;
  });
}
function getDefaultTimeseriesColumns(metadata) {
  return getNumericColumns(metadata).slice(0, 3);
}
function getAnalyticsChipColor(column, fallbackIndex, overrides) {
  return overrides?.[column] || ANALYTICS_CHIP_COLORS[Math.max(0, fallbackIndex) % ANALYTICS_CHIP_COLORS.length];
}

function dispatchEmptyStateEvent(eventName, source) {
  window.dispatchEvent(new CustomEvent(eventName, {
    detail: source ? { source } : void 0
  }));
}
function createEmptyStateController(options) {
  const elements = {
    root: document.getElementById(options.rootId),
    title: options.titleId ? document.getElementById(options.titleId) : null,
    message: options.messageId ? document.getElementById(options.messageId) : null,
    resetButton: options.resetButtonId ? document.getElementById(options.resetButtonId) : null,
    clearButton: options.clearButtonId ? document.getElementById(options.clearButtonId) : null
  };
  if (elements.resetButton && options.resetEventName) {
    elements.resetButton.addEventListener("click", () => {
      dispatchEmptyStateEvent(options.resetEventName, options.eventSource);
    });
  }
  if (elements.clearButton && options.clearEventName) {
    elements.clearButton.addEventListener("click", () => {
      dispatchEmptyStateEvent(options.clearEventName, options.eventSource);
    });
  }
  return {
    update(model) {
      if (!elements.root) return;
      elements.root.hidden = !model.visible;
      elements.root.setAttribute("data-empty-reason", model.visible ? model.reason : "");
      if (elements.title) elements.title.textContent = model.title;
      if (elements.message) elements.message.textContent = model.message;
      if (elements.resetButton) elements.resetButton.hidden = !model.showResetAction;
      if (elements.clearButton) elements.clearButton.hidden = !model.showClearAction;
      if ((!elements.title || !elements.message) && typeof model.fallbackText === "string") {
        elements.root.textContent = model.fallbackText;
      }
    }
  };
}
function isRangeOutsideDataset(timeRange, start, end) {
  const min = Number(timeRange?.min);
  const max = Number(timeRange?.max);
  const rangeStart = Number(start);
  const rangeEnd = Number(end);
  return Number.isFinite(min) && Number.isFinite(max) && min < max && Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && (rangeEnd <= min || rangeStart >= max);
}

const SELECTION_BOX_CSS = "position:absolute;top:0;left:0;width:0;height:0;border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);pointer-events:none;display:none;z-index:5";
function createSelectionBox(container) {
  const box = document.createElement("div");
  box.style.cssText = SELECTION_BOX_CSS;
  container.appendChild(box);
  return box;
}
function updateSelectionBox(box, drag, containerWidth, containerHeight) {
  const left = Math.max(0, Math.min(drag.startX, drag.endX));
  const right = Math.min(containerWidth, Math.max(drag.startX, drag.endX));
  const top = Math.max(0, Math.min(drag.startY, drag.endY));
  const bottom = Math.min(containerHeight, Math.max(drag.startY, drag.endY));
  box.style.left = `${left}px`;
  box.style.width = `${Math.max(0, right - left)}px`;
  box.style.top = `${top}px`;
  box.style.height = `${Math.max(0, bottom - top)}px`;
  box.style.display = "block";
}
function hideSelectionBox(box) {
  box.style.display = "none";
}
function createCanvasOverlay(container, onResize) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6";
  container.appendChild(canvas);
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      canvas.width = entry.contentRect.width;
      canvas.height = entry.contentRect.height;
      onResize();
    }
  });
  observer.observe(container);
  return { canvas, observer };
}
function startDrag(event, container) {
  const rect = container.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  try {
    container.setPointerCapture(event.pointerId);
  } catch {
  }
  return { pointerId: event.pointerId, startX: x, endX: x, startY: y, endY: y };
}
function moveDrag(event, drag, container) {
  const rect = container.getBoundingClientRect();
  drag.endX = event.clientX - rect.left;
  drag.endY = event.clientY - rect.top;
}
function dragToDataRange(drag, containerWidth, grid, dataMin, dataMax, minDragPx = 8) {
  const dx = Math.abs(drag.endX - drag.startX);
  if (dx < minDragPx) return null;
  const plotLeft = grid.left;
  const plotWidth = Math.max(1, containerWidth - grid.left - grid.right);
  const x0 = Math.max(plotLeft, Math.min(drag.startX, drag.endX));
  const x1 = Math.min(plotLeft + plotWidth, Math.max(drag.startX, drag.endX));
  const range = dataMax - dataMin;
  const newMin = dataMin + (x0 - plotLeft) / plotWidth * range;
  const newMax = dataMin + (x1 - plotLeft) / plotWidth * range;
  if (newMax <= newMin) return null;
  return { min: newMin, max: newMax };
}
function ensureRelativePosition(container) {
  if (window.getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
}
function initBoxZoom(opts) {
  const { container, grid, getXRange, onZoom, shouldIgnore, onClick, onDblClick } = opts;
  ensureRelativePosition(container);
  const selectionBox = createSelectionBox(container);
  let drag = null;
  container.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (shouldIgnore?.(e)) return;
    drag = startDrag(e, container);
  });
  container.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    moveDrag(e, drag, container);
    const rect = container.getBoundingClientRect();
    updateSelectionBox(selectionBox, drag, rect.width, rect.height);
  });
  const finishDrag = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    hideSelectionBox(selectionBox);
    try {
      container.releasePointerCapture(e.pointerId);
    } catch {
    }
    const rect = container.getBoundingClientRect();
    const dx = Math.abs(d.endX - d.startX);
    const { min: xMin, max: xMax } = getXRange();
    if (dx >= 8) {
      const range = dragToDataRange(d, rect.width, grid, xMin, xMax);
      if (range) onZoom(range.min, range.max);
    } else if (dx < 4 && onClick) {
      onClick(d.startX, d.startY);
    }
  };
  container.addEventListener("pointerup", finishDrag);
  container.addEventListener("pointercancel", (e) => {
    if (drag?.pointerId === e.pointerId) {
      drag = null;
      hideSelectionBox(selectionBox);
    }
  });
  if (onDblClick) {
    container.addEventListener("dblclick", (e) => {
      if (e.shiftKey || e.ctrlKey) return;
      onDblClick();
    });
  }
  return selectionBox;
}
function initWheelZoom(opts) {
  const { container, grid, getXRange, onZoom, clamp } = opts;
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const plotL = grid.left;
    const plotW = Math.max(1, rect.width - grid.left - grid.right);
    const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left - plotL) / plotW));
    const { min: curMin, max: curMax } = getXRange();
    const range = curMax - curMin;
    const focus = curMin + xNorm * range;
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const newRange = range * factor;
    let newMin = focus - xNorm * newRange;
    let newMax = newMin + newRange;
    if (clamp) {
      newMin = Math.max(clamp.min, newMin);
      newMax = Math.min(clamp.max, newMax);
    }
    if (newMax > newMin + 1e-30) onZoom(newMin, newMax);
  }, { passive: false });
}
function tooltipRow(name, value, color) {
  const dot = "";
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">${dot}<span>${name}</span><span style="font-variant-numeric:tabular-nums;font-weight:600;">${value}</span></div>`;
}
function tooltipWrap(header, rows) {
  return `<div style="opacity:0.8;margin-bottom:6px;">${header}</div>${rows}`;
}

function frequencyToPeriod(hz) {
  if (!Number.isFinite(hz) || hz <= 0) return "—";
  const seconds = 1 / hz;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(1)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} sec`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

const FFT_GRID = { left: 80, right: 24, top: 20, bottom: 44 };
const FFT_TRACE_COLORS = [
  "#7ad151",
  "#4ac3e8",
  "#f97316",
  "#e879f9",
  "#facc15",
  "#60a5fa",
  "#f43f5e"
];
class FftChart {
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
    const chartOptions = {
      grid: FFT_GRID,
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      legend: { show: true, position: "right" },
      series: []
    };
    this._chart = await Ad(container, chartOptions);
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
    if (m > 0 && m < 1e-3) return "µHz";
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
}

let _container = null;
function ensureContainer() {
  if (_container && _container.isConnected) return _container;
  _container = document.createElement("div");
  _container.className = "toast-container";
  _container.setAttribute("aria-live", "polite");
  _container.setAttribute("role", "status");
  document.body.appendChild(_container);
  return _container;
}
function toast(message, kind = "info", durationOrOpts) {
  const opts = typeof durationOrOpts === "number" ? { duration: durationOrOpts } : durationOrOpts ?? {};
  const duration = opts.duration ?? 4e3;
  const container = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.setAttribute("role", "alert");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = kind === "success" ? "✔" : kind === "error" ? "✕" : kind === "warning" ? "⚠" : "ℹ";
  el.appendChild(icon);
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  el.appendChild(text);
  if (opts.action) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = opts.action.label;
    btn.addEventListener("click", () => {
      opts.action.onClick();
      dismiss();
    });
    el.appendChild(btn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.addEventListener("click", dismiss);
  el.appendChild(closeBtn);
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--visible"));
  let timer = null;
  if (duration > 0) {
    timer = setTimeout(dismiss, duration);
    el.addEventListener("mouseenter", () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    el.addEventListener("mouseleave", () => {
      timer = setTimeout(dismiss, 2e3);
    });
  }
  function dismiss() {
    if (timer) clearTimeout(timer);
    el.classList.remove("toast--visible");
    el.classList.add("toast--exit");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 400);
  }
  return dismiss;
}

const toast$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  toast
}, Symbol.toStringTag, { value: 'Module' }));

function exportContainerCanvasPNG(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) {
    toast("No chart canvas found for export.", "warning");
    return;
  }
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const c of canvases) {
    const cr = c.getBoundingClientRect();
    const dx = (cr.left - rect.left) * dpr;
    const dy = (cr.top - rect.top) * dpr;
    try {
      ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
    } catch {
    }
  }
  downloadUrl(out.toDataURL("image/png"), filename);
  toast("PNG exported.", "success");
}
async function exportElementPNG(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) {
    toast("Element not found for export.", "warning");
    return;
  }
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const clone = el.cloneNode(true);
  inlineComputedStyles(el, clone);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("xmlns", svgNs);
  const fo = document.createElementNS(svgNs, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  fo.appendChild(clone);
  svg.appendChild(fo);
  const svgStr = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG image"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast("Canvas not available.", "error");
      return;
    }
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, w, h);
    downloadUrl(canvas.toDataURL("image/png"), filename);
    toast("PNG exported.", "success");
  } catch {
    toast("PNG export failed. Try CSV export instead.", "error");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
function inlineComputedStyles(original, clone) {
  if (original instanceof HTMLElement && clone instanceof HTMLElement) {
    const computed = getComputedStyle(original);
    for (const prop of [
      "color",
      "background",
      "background-color",
      "font-size",
      "font-family",
      "font-weight",
      "display",
      "grid-template-columns",
      "grid-template-rows",
      "gap",
      "padding",
      "margin",
      "border",
      "border-radius",
      "text-align",
      "white-space",
      "overflow",
      "text-overflow",
      "writing-mode",
      "text-orientation",
      "align-items",
      "justify-content",
      "flex-direction",
      "font-variant-numeric",
      "letter-spacing"
    ]) {
      clone.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }
  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    inlineComputedStyles(origChildren[i], cloneChildren[i]);
  }
}
function exportElementSVG(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) {
    toast("Element not found for export.", "warning");
    return;
  }
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const clone = el.cloneNode(true);
  inlineComputedStyles(el, clone);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("xmlns", svgNs);
  svg.setAttribute("xmlns:xhtml", "http://www.w3.org/1999/xhtml");
  const fo = document.createElementNS(svgNs, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  fo.appendChild(clone);
  svg.appendChild(fo);
  const svgStr = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("SVG exported.", "success");
}
function exportEChartsPNG(chartInstance, filename) {
  if (!chartInstance) {
    toast("Chart not available for export.", "warning");
    return;
  }
  try {
    const url = chartInstance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10"
    });
    downloadUrl(url, filename);
    toast("PNG exported.", "success");
  } catch {
    toast("Failed to export chart.", "error");
  }
}
function exportContainerCanvasSVG(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) {
    toast("No chart canvas found for export.", "warning");
    return;
  }
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const c of canvases) {
    const cr = c.getBoundingClientRect();
    const dx = (cr.left - rect.left) * dpr;
    const dy = (cr.top - rect.top) * dpr;
    try {
      ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
    } catch {
    }
  }
  const pngDataUrl = out.toDataURL("image/png");
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${pngDataUrl}" width="${w}" height="${h}" />
</svg>`;
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("SVG exported.", "success");
}
function exportContainerCanvasHTML(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) {
    toast("No chart canvas found for export.", "warning");
    return;
  }
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const c of canvases) {
    const cr = c.getBoundingClientRect();
    const dx = (cr.left - rect.left) * dpr;
    const dy = (cr.top - rect.top) * dpr;
    try {
      ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
    } catch {
    }
  }
  const pngDataUrl = out.toDataURL("image/png");
  const html = buildStandaloneHtml(`<img src="${pngDataUrl}" style="max-width:100%;display:block;">`, filename.replace(".html", ""));
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("HTML exported.", "success");
}
function exportEChartsSVG(chartInstance, filename) {
  if (!chartInstance) {
    toast("Chart not available for export.", "warning");
    return;
  }
  try {
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    const pngUrl = chartInstance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg });
    const domEl = chartInstance.getDom?.() ?? null;
    const w = domEl?.offsetWidth ?? 800;
    const h = domEl?.offsetHeight ?? 500;
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${pngUrl}" width="${w}" height="${h}" />
</svg>`;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, filename);
    toast("SVG exported.", "success");
  } catch {
    toast("Failed to export SVG.", "error");
  }
}
function exportEChartsHTML(chartInstance, filename) {
  if (!chartInstance) {
    toast("Chart not available for export.", "warning");
    return;
  }
  try {
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    const pngUrl = chartInstance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg });
    const html = buildStandaloneHtml(`<img src="${pngUrl}" style="max-width:100%;display:block;">`, filename.replace(".html", ""));
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, filename);
    toast("HTML exported.", "success");
  } catch {
    toast("Failed to export HTML.", "error");
  }
}
async function exportElementHTML(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) {
    toast("Element not found for export.", "warning");
    return;
  }
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const clone = el.cloneNode(true);
  inlineComputedStyles(el, clone);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("xmlns", svgNs);
  const fo = document.createElementNS(svgNs, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  fo.appendChild(clone);
  svg.appendChild(fo);
  const svgStr = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG load failed"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast("Canvas not available.", "error");
      return;
    }
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, w, h);
    const pngUrl = canvas.toDataURL("image/png");
    const html = buildStandaloneHtml(`<img src="${pngUrl}" style="max-width:100%;display:block;">`, filename.replace(".html", ""));
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, filename);
    toast("HTML exported.", "success");
  } catch {
    toast("HTML export failed.", "error");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
function buildStandaloneHtml(bodyContent, title) {
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — EdaTime</title>
  <style>body{margin:0;padding:16px;background:${bg};font-family:sans-serif;}</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function exportMatrixCSV(columns, data, filename) {
  if (!columns.length || !data.length) {
    toast("No data to export.", "warning");
    return;
  }
  const header = ["", ...columns].join(",");
  const rows = data.map(
    (row, i) => [columns[i], ...row.map((v) => v !== null ? v.toFixed(6) : "")].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("CSV exported.", "success");
}
function exportTraceCSV(traces, xLabel, filename) {
  if (traces.length === 0) {
    toast("No data to export.", "warning");
    return;
  }
  const ref = traces[0];
  const headers = [xLabel, ...traces.map((t) => t.column)];
  const lines = [headers.join(",")];
  for (let i = 0; i < ref.xs.length; i++) {
    const vals = [String(ref.xs[i]), ...traces.map((t) => t.ys[i] != null ? String(t.ys[i]) : "")];
    lines.push(vals.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("CSV exported.", "success");
}

let initialized = false;
let fftTraces = [];
let fftMode = "magnitude";
let fftLogScale = true;
let fftChart = null;
const fftTraceColors = {};
let fftEmptyStateController = null;
function getFftEmptyStateController() {
  if (!fftEmptyStateController) {
    fftEmptyStateController = createEmptyStateController({ rootId: "fft-empty-state" });
  }
  return fftEmptyStateController;
}
function fftColumns() {
  return getNumericColumns(appState.metadata);
}
function fftColorFor(column, fallbackIndex) {
  return getAnalyticsChipColor(column, fallbackIndex, fftTraceColors);
}
function updateZoomButton(isZoomed) {
  const button = document.getElementById("fft-zoom-reset-btn");
  if (button) button.hidden = !(isZoomed ?? fftChart?.getIsZoomed() ?? false);
}
function rerenderOrClear() {
  getFftEmptyStateController().update({
    visible: fftTraces.length === 0,
    reason: fftTraces.length > 0 ? "" : "no-columns-selected",
    title: "",
    message: ""
  });
  if (!fftChart) return;
  if (fftTraces.length === 0) {
    fftChart.clear();
    return;
  }
  fftChart.updateData(fftTraces, fftMode, fftLogScale);
}
async function fetchAndAddTrace(column) {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  const startMs = appState.currentStart;
  const endMs = appState.currentEnd;
  if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const response = await fetchFft(startIso, endIso, column);
  if (!response?.results?.length) throw new Error("No results");
  const result = response.results[0];
  fftTraces = fftTraces.filter((trace) => trace.column !== column);
  fftTraces.push({
    column: result.column,
    frequencies: result.frequencies,
    magnitudes: result.magnitudes,
    psd: result.psd,
    color: fftColorFor(column, fftColumns().indexOf(column))
  });
}
function renderChips() {
  const bar = document.getElementById("fft-traces-bar");
  const statusEl = document.getElementById("fft-status");
  if (!bar || !appState.metadata) return;
  const columns = fftColumns();
  const existing = /* @__PURE__ */ new Map();
  for (const element of bar.querySelectorAll(".fft-trace-chip")) {
    const column = element.dataset.col;
    if (columns.includes(column)) existing.set(column, element);
    else element.remove();
  }
  const zoomButton = bar.querySelector("#fft-zoom-reset-btn");
  for (const [index, column] of columns.entries()) {
    const isActive = fftTraces.some((trace) => trace.column === column);
    const color = fftColorFor(column, index);
    let chip = existing.get(column);
    if (!chip) {
      chip = document.createElement("button");
      chip.className = "series-chip fft-trace-chip";
      chip.type = "button";
      chip.dataset.col = column;
      chip.addEventListener("click", async (event) => {
        const currentColumn = chip?.dataset.col || "";
        if (event.target?.closest?.(".chip-color-picker")) return;
        if (event.target.classList.contains("fft-chip-remove")) {
          fftTraces = fftTraces.filter((trace) => trace.column !== currentColumn);
          renderChips();
          rerenderOrClear();
          if (statusEl) {
            statusEl.textContent = fftTraces.length ? fftTraces.map((trace) => trace.column).join(", ") : "Select a column chip to compute its FFT.";
          }
          return;
        }
        if (!currentColumn || fftTraces.some((trace) => trace.column === currentColumn)) return;
        const activeChip = chip;
        if (!activeChip) return;
        activeChip.classList.add("loading");
        activeChip.disabled = true;
        const loadingEl = document.getElementById("fft-chart-loading");
        if (loadingEl) loadingEl.hidden = false;
        if (statusEl) statusEl.textContent = `Computing FFT for ${currentColumn}…`;
        try {
          await fetchAndAddTrace(currentColumn);
          renderChips();
          rerenderOrClear();
          const bins = fftTraces.find((trace) => trace.column === currentColumn)?.frequencies.length ?? 0;
          if (statusEl) statusEl.textContent = `${fftTraces.map((trace) => trace.column).join(", ")} · ${bins} bins`;
        } catch (error) {
          if (statusEl) statusEl.textContent = `FFT failed for ${currentColumn}: ${error?.message || "error"}`;
        } finally {
          activeChip.classList.remove("loading");
          activeChip.disabled = false;
          if (loadingEl) loadingEl.hidden = true;
        }
      });
      bar.insertBefore(chip, zoomButton || null);
    }
    chip.className = `series-chip fft-trace-chip${isActive ? " active" : ""}`;
    chip.style.setProperty("--chip-accent", color);
    chip.innerHTML = `<span class="chip-label">${column}</span><input type="color" class="chip-color-picker fft-chip-color-picker" value="${color}" aria-label="Set ${column} FFT color" title="Set ${column} FFT color">` + (isActive ? '<span class="fft-chip-remove" aria-hidden="true">×</span>' : "");
    const colorInput = chip.querySelector(".chip-color-picker");
    if (colorInput) {
      for (const eventName of ["pointerdown", "mousedown", "click", "dblclick"]) {
        colorInput.addEventListener(eventName, (event) => event.stopPropagation());
      }
      colorInput.addEventListener("input", (event) => {
        const nextColor = event.target.value;
        fftTraceColors[column] = nextColor;
        chip?.style.setProperty("--chip-accent", nextColor);
        const trace = fftTraces.find((item) => item.column === column);
        if (trace) {
          trace.color = nextColor;
          rerenderOrClear();
        }
      });
    }
  }
  bar.hidden = columns.length === 0;
}
async function initFftPage(deps) {
  if (initialized) return;
  initialized = true;
  const modeSelect = document.getElementById("fft-mode-select");
  const logCheck = document.getElementById("fft-log-scale");
  const zoomResetBtn = document.getElementById("fft-zoom-reset-btn");
  fftChart = new FftChart("fft-chart");
  await fftChart.init();
  fftChart.onZoomChange = (isZoomed) => updateZoomButton(isZoomed);
  const populateChips = () => {
    if (appState.metadata) renderChips();
  };
  populateChips();
  window.addEventListener("edatime:page-change", populateChips);
  modeSelect?.addEventListener("change", () => {
    fftMode = modeSelect.value;
    rerenderOrClear();
  });
  logCheck?.addEventListener("change", () => {
    fftLogScale = logCheck.checked;
    rerenderOrClear();
  });
  zoomResetBtn?.addEventListener("click", () => fftChart?.resetView());
  document.getElementById("fft-export-png-btn")?.addEventListener("click", () => {
    exportContainerCanvasPNG("fft-chart", "edatime_fft.png");
  });
  document.getElementById("fft-export-svg-btn")?.addEventListener("click", () => {
    exportContainerCanvasSVG("fft-chart", "edatime_fft.svg");
  });
  document.getElementById("fft-export-html-btn")?.addEventListener("click", () => {
    exportContainerCanvasHTML("fft-chart", "edatime_fft.html");
  });
  document.getElementById("fft-export-csv-btn")?.addEventListener("click", () => {
    if (fftTraces.length === 0) {
      toast("No FFT data to export.", "warning");
      return;
    }
    const csvTraces = fftTraces.map((trace) => ({
      column: trace.column,
      xs: trace.frequencies,
      ys: fftMode === "psd" ? trace.psd : trace.magnitudes
    }));
    exportTraceCSV(csvTraces, "frequency_hz", `edatime_fft_${fftMode}.csv`);
  });
  document.getElementById("fft-filter-apply-btn")?.addEventListener("click", async () => {
    const filterType = document.getElementById("fft-filter-type")?.value;
    if (!filterType || filterType === "none") {
      if (appState.spectralFilterPreview) {
        appState.spectralFilterPreview = null;
        appState.chart?.requestOverlayRender?.();
        deps.renderTimeseries();
      }
      return;
    }
    const column = fftTraces[0]?.column || appState.selectedCols[0];
    if (!column) {
      toast("Select a column chip below first.", "warning");
      return;
    }
    const statusEl = document.getElementById("fft-filter-status");
    const lowHz = parseFloat(document.getElementById("fft-filter-low-hz")?.value) || void 0;
    const highHz = parseFloat(document.getElementById("fft-filter-high-hz")?.value) || void 0;
    if (statusEl) statusEl.textContent = "Computing…";
    try {
      const start = appState.currentStart;
      const end = appState.currentEnd;
      if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error("No range selected");
      }
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        column,
        filter_type: filterType,
        ...lowHz !== void 0 ? { low_hz: String(lowHz) } : {},
        ...highHz !== void 0 ? { high_hz: String(highHz) } : {}
      });
      const response = await fetch(`/api/analytics/spectral-filter?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      appState.spectralFilterPreview = {
        column: data.column,
        ts: data.ts,
        values: data.values,
        filterType,
        lowHz: data.low_hz,
        highHz: data.high_hz
      };
      if (statusEl) statusEl.textContent = `${filterType} preview active`;
      toast(`Spectral filter preview: ${filterType} applied to "${column}". Switch to Timeseries to view.`, "success");
      deps.renderTimeseries();
    } catch (error) {
      if (statusEl) statusEl.textContent = "Error";
      toast(`Spectral filter failed: ${String(error)}`, "error");
    }
  });
  const filterTypeSelect = document.getElementById("fft-filter-type");
  filterTypeSelect?.addEventListener("change", () => {
    const filterType = filterTypeSelect.value;
    const lowEl = document.getElementById("fft-filter-low-hz");
    const highEl = document.getElementById("fft-filter-high-hz");
    if (lowEl) lowEl.disabled = filterType === "none" || filterType === "lowpass";
    if (highEl) highEl.disabled = filterType === "none" || filterType === "highpass";
  });
  rerenderOrClear();
}

let loaded$1 = false;
let heatmapCellSize = 36;
let heatmapEmptyStateController = null;
function getHeatmapEmptyStateController() {
  if (!heatmapEmptyStateController) {
    heatmapEmptyStateController = createEmptyStateController({ rootId: "heatmap-empty-state" });
  }
  return heatmapEmptyStateController;
}
function syncHeatmapEmptyState(message, visible, reason = "") {
  getHeatmapEmptyStateController().update({
    visible,
    reason: visible ? reason || "no-data" : "",
    title: "",
    message: "",
    fallbackText: message
  });
}
function correlationColor(value) {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped >= 0) {
    const t2 = clamped;
    const r2 = Math.round(247 - t2 * (247 - 178));
    const g2 = Math.round(247 - t2 * (247 - 24));
    const b2 = Math.round(247 - t2 * (247 - 43));
    return `rgb(${r2},${g2},${b2})`;
  }
  const t = -clamped;
  const r = Math.round(247 - t * (247 - 33));
  const g = Math.round(247 - t * (247 - 102));
  const b = Math.round(247 - t * (247 - 172));
  return `rgb(${r},${g},${b})`;
}
async function initHeatmapPage(deps) {
  if (loaded$1) return;
  loaded$1 = true;
  const container = document.getElementById("heatmap-container");
  const statusEl = document.getElementById("heatmap-status");
  const metricSelect = document.getElementById("heatmap-metric");
  const sizeInput = document.getElementById("heatmap-cell-size");
  const sizeValue = document.getElementById("heatmap-cell-size-value");
  if (!container) return;
  const containerEl = container;
  let matrixData = null;
  let metric = "pearson";
  let matrixLoadInFlight = null;
  function renderHeatmap() {
    if (!matrixData) {
      syncHeatmapEmptyState("Correlation heatmap will appear here once the dataset is available.", true);
      return;
    }
    const columns = matrixData.columns;
    const data = metric === "spearman" ? matrixData.spearman : matrixData.pearson;
    const size = columns.length;
    if (size === 0) {
      containerEl.innerHTML = "";
      syncHeatmapEmptyState("No numeric columns are available for the correlation heatmap.", true, "no-columns-available");
      return;
    }
    syncHeatmapEmptyState("", false);
    const labelWidth = Math.max(84, Math.min(180, Math.round(heatmapCellSize * 2.5)));
    let html = `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${labelWidth}px repeat(${size},${heatmapCellSize}px);grid-template-rows:${labelWidth}px repeat(${size},${heatmapCellSize}px);gap:1px;font-size:0.65rem;">`;
    html += "<div></div>";
    for (const column of columns) {
      html += `<div class="heatmap-header" style="writing-mode:vertical-rl;text-orientation:mixed;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;color:var(--text-dim);padding:4px 2px;" title="${column}">${column}</div>`;
    }
    for (let row = 0; row < size; row++) {
      html += `<div class="heatmap-row-label" style="display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${columns[row]}">${columns[row]}</div>`;
      for (let column = 0; column < size; column++) {
        const value = data[row]?.[column] ?? null;
        const displayValue = value !== null ? value.toFixed(2) : "—";
        const background = value !== null ? correlationColor(value) : "transparent";
        const textColor = value !== null && Math.abs(value) > 0.5 ? "#fff" : "var(--text)";
        html += `<div class="heatmap-cell" data-row="${row}" data-col="${column}" style="display:flex;align-items:center;justify-content:center;background:${background};color:${textColor};border-radius:2px;cursor:${row !== column ? "pointer" : "default"};font-variant-numeric:tabular-nums;" title="${columns[row]} × ${columns[column]}: ${displayValue}${row !== column ? " — click to explore in Scatter" : ""}">${displayValue}</div>`;
      }
    }
    html += "</div>";
    html += '<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.7rem;color:var(--text-dim);">';
    html += "<span>-1.0</span>";
    html += '<div style="flex:0 0 200px;height:12px;border-radius:4px;background:linear-gradient(90deg,#2166AC,#67A9CF,#F7F7F7,#EF8A62,#B2182B);"></div>';
    html += "<span>+1.0</span>";
    html += "</div>";
    containerEl.innerHTML = html;
    containerEl.onclick = (event) => {
      const cell = event.target.closest(".heatmap-cell");
      if (!cell) return;
      const rowIndex = Number.parseInt(cell.dataset.row || "", 10);
      const colIndex = Number.parseInt(cell.dataset.col || "", 10);
      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex) || rowIndex === colIndex) return;
      const xSelect = document.getElementById("scatter-x-col");
      const ySelect = document.getElementById("scatter-y-col");
      if (xSelect) xSelect.value = columns[rowIndex];
      if (ySelect) ySelect.value = columns[colIndex];
      deps.showPage("scatter");
    };
  }
  async function loadMatrix() {
    if (matrixLoadInFlight) return matrixLoadInFlight;
    matrixLoadInFlight = (async () => {
      if (statusEl) statusEl.textContent = "Loading correlation matrix…";
      try {
        matrixData = await fetchCorrelationMatrix();
        if (statusEl) statusEl.textContent = `${matrixData.columns.length} columns · ${heatmapCellSize}px cells`;
        renderHeatmap();
      } catch (error) {
        const message = error?.message || "";
        const isInsufficient = message.toLowerCase().includes("two") || message.toLowerCase().includes("numeric") || message.toLowerCase().includes("column");
        syncHeatmapEmptyState(
          isInsufficient ? "Need at least two numeric columns to compute correlations. Upload a dataset with multiple numeric columns." : "Correlation heatmap is unavailable for the current dataset.",
          true,
          isInsufficient ? "no-columns-available" : "render-failure"
        );
        if (statusEl) statusEl.textContent = isInsufficient ? "Not enough numeric columns" : `Error: ${message || "failed"}`;
      }
    })().finally(() => {
      matrixLoadInFlight = null;
    });
    return matrixLoadInFlight;
  }
  metricSelect?.addEventListener("change", () => {
    metric = metricSelect.value;
    renderHeatmap();
  });
  sizeInput?.addEventListener("input", () => {
    heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
    if (sizeValue) sizeValue.textContent = String(heatmapCellSize);
    if (statusEl && matrixData) statusEl.textContent = `${matrixData.columns.length} columns · ${heatmapCellSize}px cells`;
    renderHeatmap();
  });
  document.getElementById("heatmap-export-csv-btn")?.addEventListener("click", () => {
    if (!matrixData) {
      toast("No heatmap data to export.", "warning");
      return;
    }
    const data = metric === "spearman" ? matrixData.spearman : matrixData.pearson;
    exportMatrixCSV(matrixData.columns, data, `edatime_correlation_${metric}.csv`);
  });
  document.getElementById("heatmap-export-png-btn")?.addEventListener("click", () => {
    exportElementPNG("heatmap-container", "edatime_heatmap.png");
  });
  document.getElementById("heatmap-export-svg-btn")?.addEventListener("click", () => {
    exportElementSVG("heatmap-container", "edatime_heatmap.svg");
  });
  document.getElementById("heatmap-export-html-btn")?.addEventListener("click", () => {
    void exportElementHTML("heatmap-container", "edatime_heatmap.html");
  });
  window.addEventListener("edatime:page-change", (event) => {
    const detail = event.detail;
    if (detail?.page === "heatmap") void loadMatrix();
  });
  const heatmapPage = document.getElementById("page-heatmap");
  if (heatmapPage && !heatmapPage.hidden) {
    await loadMatrix();
  }
}

let loaded = false;
let spectrogramChart = null;
let spectrogramResizeObserver = null;
let spectrogramResult = null;
let spectrogramSampleCount = 0;
let spectrogramEmptyStateController = null;
function getSpectrogramEmptyStateController() {
  if (!spectrogramEmptyStateController) {
    spectrogramEmptyStateController = createEmptyStateController({ rootId: "spectrogram-empty-state" });
  }
  return spectrogramEmptyStateController;
}
function syncSpectrogramEmptyState(message) {
  getSpectrogramEmptyStateController().update({
    visible: !spectrogramResult,
    reason: spectrogramResult ? "" : "no-columns-selected",
    title: "",
    message: "",
    fallbackText: message || "Pick a numeric column and click Compute to generate the spectrogram."
  });
}
function formatSpectrogramTime(timestampMs) {
  return new Date(timestampMs).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
function formatSpectrogramFrequency(frequency) {
  if (!Number.isFinite(frequency)) return "—";
  if (frequency >= 1e3) return `${(frequency / 1e3).toFixed(2)} kHz`;
  if (frequency >= 1) return `${frequency.toFixed(2)} Hz`;
  return `${(frequency * 1e3).toFixed(2)} mHz`;
}
async function initSpectrogramPage(deps) {
  if (loaded) return;
  loaded = true;
  const colSelect = document.getElementById("spectrogram-col-select");
  const winSelect = document.getElementById("spectrogram-win-size");
  const logCheck = document.getElementById("spectrogram-log-scale");
  const resetZoomBtn = document.getElementById("spectrogram-zoom-reset-btn");
  const statusEl = document.getElementById("spectrogram-status");
  const chartEl = document.getElementById("spectrogram-chart");
  if (!chartEl || !colSelect) return;
  const ensureSpectrogramChartDimensions = () => {
    if (chartEl.clientHeight > 0) return;
    chartEl.style.minHeight = chartEl.style.minHeight || "420px";
    if (!chartEl.style.height || chartEl.style.height === "100%") {
      chartEl.style.height = "420px";
    }
  };
  const isSpectrogramChartReadyForInit = () => {
    const page = document.getElementById("page-spectrogram");
    ensureSpectrogramChartDimensions();
    return !!chartEl && chartEl.clientWidth > 0 && chartEl.clientHeight > 0 && (!page || !page.hidden);
  };
  const waitForSpectrogramChartReady = async (attempts = 6) => {
    for (let remaining = attempts; remaining >= 0; remaining -= 1) {
      if (isSpectrogramChartReadyForInit()) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    return isSpectrogramChartReadyForInit();
  };
  const ensureSpectrogramChart = async () => {
    if (spectrogramChart) {
      if (isSpectrogramChartReadyForInit()) spectrogramChart.resize?.();
      return spectrogramChart;
    }
    if (!await waitForSpectrogramChartReady()) {
      throw new Error("Spectrogram chart container is not ready yet.");
    }
    const echarts = await __vitePreload(() => import('./echarts-Dsc0OV0i.js'),true              ?[]:void 0);
    spectrogramChart = echarts.init(chartEl, void 0, { renderer: "canvas" });
    spectrogramResizeObserver?.disconnect();
    spectrogramResizeObserver = new ResizeObserver(() => spectrogramChart?.resize());
    spectrogramResizeObserver.observe(chartEl);
    if (chartEl.style.position === "" || chartEl.style.position === "static") {
      chartEl.style.position = "relative";
    }
    const selectionBox = document.createElement("div");
    selectionBox.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);pointer-events:none;display:none;z-index:5";
    chartEl.appendChild(selectionBox);
    let dragStart = null;
    let dragEnd = { x: 0, y: 0 };
    const grid = { left: 72, right: 110, top: 24, bottom: 80 };
    chartEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = chartEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x > rect.width - grid.right || x < grid.left || y < grid.top || y > rect.height - grid.bottom) return;
      dragStart = { x, y, pid: event.pointerId };
      dragEnd = { x, y };
      try {
        chartEl.setPointerCapture(event.pointerId);
      } catch {
      }
    });
    chartEl.addEventListener("pointermove", (event) => {
      if (!dragStart || event.pointerId !== dragStart.pid) return;
      const rect = chartEl.getBoundingClientRect();
      dragEnd = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const left = Math.min(dragStart.x, dragEnd.x);
      const top = Math.min(dragStart.y, dragEnd.y);
      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${Math.abs(dragEnd.x - dragStart.x)}px`;
      selectionBox.style.height = `${Math.abs(dragEnd.y - dragStart.y)}px`;
      selectionBox.style.display = "block";
    });
    const finishDrag = (event) => {
      if (!dragStart || event.pointerId !== dragStart.pid) return;
      const start = dragStart;
      dragStart = null;
      selectionBox.style.display = "none";
      try {
        chartEl.releasePointerCapture(event.pointerId);
      } catch {
      }
      const dx = Math.abs(dragEnd.x - start.x);
      const dy = Math.abs(dragEnd.y - start.y);
      if (dx < 8 || dy < 8) return;
      if (!spectrogramChart || !spectrogramResult) return;
      const p0 = spectrogramChart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [start.x, start.y]);
      const p1 = spectrogramChart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [dragEnd.x, dragEnd.y]);
      if (!p0 || !p1) return;
      const xLen = spectrogramResult.times_ms.length;
      const yLen = spectrogramResult.frequencies.length;
      const xStartPct = Math.max(0, Math.min(100, Math.min(p0[0], p1[0]) / (xLen - 1) * 100));
      const xEndPct = Math.max(0, Math.min(100, Math.max(p0[0], p1[0]) / (xLen - 1) * 100));
      const yStartPct = Math.max(0, Math.min(100, Math.min(p0[1], p1[1]) / (yLen - 1) * 100));
      const yEndPct = Math.max(0, Math.min(100, Math.max(p0[1], p1[1]) / (yLen - 1) * 100));
      if (xEndPct <= xStartPct || yEndPct <= yStartPct) return;
      spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: xStartPct, end: xEndPct });
      spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: yStartPct, end: yEndPct });
    };
    chartEl.addEventListener("pointerup", finishDrag);
    chartEl.addEventListener("pointercancel", (event) => {
      if (dragStart?.pid === event.pointerId) {
        dragStart = null;
        selectionBox.style.display = "none";
      }
    });
    chartEl.addEventListener("dblclick", () => {
      if (!spectrogramChart) return;
      spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: 0, end: 100 });
      spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: 0, end: 100 });
    });
    return spectrogramChart;
  };
  const renderSpectrogramChart = async () => {
    if (!spectrogramResult) return;
    const chart = await ensureSpectrogramChart();
    const logScale = logCheck?.checked ?? true;
    const points = [];
    const timeAxis = spectrogramResult.times_ms;
    const freqAxis = spectrogramResult.frequencies;
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (let timeIndex = 0; timeIndex < timeAxis.length; timeIndex++) {
      const timeMs = timeAxis[timeIndex];
      const row = spectrogramResult.magnitudes[timeIndex] || [];
      for (let freqIndex = 0; freqIndex < freqAxis.length; freqIndex++) {
        const freq = freqAxis[freqIndex];
        const rawMagnitude = Number(row[freqIndex] ?? 0);
        const displayMagnitude = logScale ? Math.log10(Math.max(rawMagnitude, 1e-30)) : rawMagnitude;
        if (!Number.isFinite(displayMagnitude)) continue;
        minValue = Math.min(minValue, displayMagnitude);
        maxValue = Math.max(maxValue, displayMagnitude);
        points.push([timeIndex, freqIndex, displayMagnitude, timeMs, freq, rawMagnitude]);
      }
    }
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      minValue = 0;
      maxValue = 1;
    }
    const xTickInterval = Math.max(0, Math.floor(timeAxis.length / 10) - 1);
    const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);
    chart.setOption({
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 72, right: 110, top: 24, bottom: 80 },
      toolbox: {
        right: 12,
        feature: {
          restore: { title: "Reset zoom" },
          saveAsImage: { title: "Save image" }
        }
      },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(8, 12, 20, 0.94)",
        borderColor: "rgba(126, 158, 212, 0.28)",
        textStyle: { color: "#eef4ff" },
        formatter: (params) => {
          const value = params?.value || [];
          const timeMs = Number(value[3]);
          const freq = Number(value[4]);
          const displayMagnitude = Number(value[2]);
          const rawMagnitude = Number(value[5]);
          return [
            `<strong>${spectrogramResult?.column || "Spectrogram"}</strong>`,
            `Time: ${formatSpectrogramTime(timeMs)}`,
            `Frequency: ${formatSpectrogramFrequency(freq)}`,
            `Intensity: ${displayMagnitude.toFixed(4)}${logScale ? " log10" : ""}`,
            `Raw magnitude: ${rawMagnitude.toExponential(4)}`
          ].join("<br>");
        }
      },
      xAxis: {
        type: "category",
        data: timeAxis,
        name: "Time",
        nameLocation: "middle",
        nameGap: 48,
        axisLabel: {
          color: "#9fb1d1",
          rotate: 30,
          interval: xTickInterval,
          formatter: (value) => {
            const date = new Date(Number(value));
            return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}
${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
          }
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: "category",
        data: freqAxis,
        name: "Frequency (Hz)",
        nameLocation: "middle",
        nameGap: 56,
        axisLabel: {
          color: "#9fb1d1",
          interval: yTickInterval,
          formatter: (value) => formatSpectrogramFrequency(Number(value))
        },
        splitLine: { show: false }
      },
      visualMap: {
        min: minValue,
        max: maxValue,
        calculable: true,
        orient: "vertical",
        right: 18,
        top: "middle",
        text: [logScale ? "High log10" : "High", logScale ? "Low log10" : "Low"],
        textStyle: { color: "#9fb1d1" },
        inRange: {
          color: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"]
        }
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false
        },
        {
          type: "inside",
          yAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false
        }
      ],
      series: [{
        name: spectrogramResult.column,
        type: "heatmap",
        progressive: 0,
        emphasis: { itemStyle: { borderColor: "#ffffff", borderWidth: 1 } },
        data: points
      }]
    });
    if (statusEl) {
      statusEl.textContent = `${spectrogramResult.column} · ${spectrogramResult.times_ms.length} windows × ${spectrogramResult.frequencies.length} bins · ${spectrogramSampleCount} samples`;
    }
    syncSpectrogramEmptyState();
  };
  if (appState.metadata) {
    for (const column of appState.metadata.numeric_columns) {
      const option = document.createElement("option");
      option.value = column;
      option.textContent = column;
      colSelect.appendChild(option);
    }
  }
  syncSpectrogramEmptyState();
  document.getElementById("spectrogram-compute-btn")?.addEventListener("click", async () => {
    const column = colSelect.value;
    if (!column) {
      if (statusEl) statusEl.textContent = "Select a column.";
      syncSpectrogramEmptyState("Pick a numeric column and click Compute to generate the spectrogram.");
      return;
    }
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) {
      if (statusEl) statusEl.textContent = "No time range available.";
      return;
    }
    const winSize = Number.parseInt(winSelect?.value || "256", 10);
    try {
      deps.setLoading("spectrogram-compute-btn", "spectrogram-loading", true);
      if (statusEl) statusEl.textContent = "Fetching spectrogram…";
      const startMs = appState.currentStart;
      const endMs = appState.currentEnd;
      if (startMs == null || endMs == null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        throw new Error("No time range available.");
      }
      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(endMs).toISOString();
      const response = await fetchSpectrogram(startIso, endIso, column, winSize);
      spectrogramResult = response.result;
      spectrogramSampleCount = response.sample_count;
      await renderSpectrogramChart();
    } catch (error) {
      spectrogramResult = null;
      syncSpectrogramEmptyState("Spectrogram generation failed. Choose a column and try again.");
      if (statusEl) statusEl.textContent = `Error: ${error?.message || "failed"}`;
    } finally {
      deps.setLoading("spectrogram-compute-btn", "spectrogram-loading", false);
    }
  });
  logCheck?.addEventListener("change", () => {
    if (spectrogramResult) void renderSpectrogramChart();
  });
  resetZoomBtn?.addEventListener("click", () => {
    if (!spectrogramChart) return;
    spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: 0, end: 100 });
    spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: 0, end: 100 });
  });
  document.getElementById("spectrogram-export-png-btn")?.addEventListener("click", () => {
    exportEChartsPNG(spectrogramChart, "edatime_spectrogram.png");
  });
  document.getElementById("spectrogram-export-svg-btn")?.addEventListener("click", () => {
    exportEChartsSVG(spectrogramChart, "edatime_spectrogram.svg");
  });
  document.getElementById("spectrogram-export-html-btn")?.addEventListener("click", () => {
    exportEChartsHTML(spectrogramChart, "edatime_spectrogram.html");
  });
  window.addEventListener("edatime:page-change", (event) => {
    const detail = event.detail;
    if (detail?.page === "spectrogram" && appState.metadata) {
      const currentOptions = new Set(Array.from(colSelect.options).map((option) => option.value));
      for (const column of appState.metadata.numeric_columns) {
        if (!currentOptions.has(column)) {
          const option = document.createElement("option");
          option.value = column;
          option.textContent = column;
          colSelect.appendChild(option);
        }
      }
      if (isSpectrogramChartReadyForInit()) {
        spectrogramChart?.resize?.();
      } else {
        void waitForSpectrogramChartReady().then((ready) => {
          if (ready) spectrogramChart?.resize?.();
        });
      }
    }
  });
}

export { ensureRelativePosition as $, formatCount as A, formatToDatetimeLocal as B, formatAnalysisTime as C, DEBUG as D, PROFILE_COLUMNS as E, normalizeDtypeLabel as F, formatProfileValue as G, getDefaultProfileColumnWidths as H, PROFILE_OVERSCAN as I, toFiniteNumberOrNull as J, dbgGroup as K, dbg as L, ensureRangeStateFromData as M, setMetaText as N, applyColumnRanges as O, PROFILE_ROW_HEIGHT as P, debounce as Q, installWindowsWebGpuRequestAdapterWorkaround as R, SERIES_COLORS as S, getNumericColumns as T, getDefaultTimeseriesColumns as U, buildAdaptiveLineY as V, initFftPage as W, getAnalyticsChipColor as X, initSpectrogramPage as Y, initHeatmapPage as Z, __vitePreload as _, formatTwoDecimals as a, createCanvasOverlay as a0, initBoxZoom as a1, formatTimeTooltip as a2, dataClient as a3, toast$1 as a4, buildAdaptiveLineFiltersForQuery as b, appState as c, downloadBlob as d, downloadUrl as e, formatTimestamp as f, getEl as g, escapeHtml$1 as h, isTemporalDtype as i, fetchFft as j, fetchScatterPoints as k, isRangeOutsideDataset as l, fetchScatterCorrelations as m, defaultGpuPowerPreference as n, createEmptyStateController as o, exportEChartsPNG as p, fetchCausalGraph as q, requestGpuAdapter as r, formatAnalysisNumber as s, toast as t, sanitizeSelectedColumns as u, getSeriesColor as v, buildMetaBar as w, setSeriesColor as x, computeBounds as y, fetchMetadata as z };
//# sourceMappingURL=frequency-DsOq7zgH.js.map
