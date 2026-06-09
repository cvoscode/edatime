const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/profile-DCQ6F-wu.js","assets/settings-bZFrh4Yc.js","assets/upload-DVzysbOx.js","assets/preview-DVb4QK3F.js","assets/upload-DubIOrfx.js","assets/http-Cr2DDpIr.js","assets/partialLoadControls-B0pCom6w.js","assets/analyticsDrawer-D8FXIXKQ.js","assets/guidedWorkflow-DrvIK14h.js","assets/dataMutationModals-CQewcIsT.js","assets/createModalController-Bq7uHRqj.js","assets/analytics-BTVc_2do.js","assets/provenance-DqeiL9fi.js","assets/settingsPanel-C6DDXf9Z.js","assets/sampleDatasets-BSStG2nr.js","assets/entrypoint-BYRIrjmw.js","assets/entrypoint-dTMnAKT3.js","assets/entrypoint-BwJvGCgY.js","assets/entrypoint-DTDRo2pI.js","assets/entrypoint-B56bGrdp.js","assets/entrypoint-DGW9Cq96.js","assets/index-BEKhL0N1.js","assets/scatter-BNRJS9zg.js","assets/scatter-matrix-B8i1sUy6.js","assets/DataChart-CkLj_s8t.js","assets/chartgpu-CqrjGxnD.js","assets/chartInteractions-rEfgrEza.js","assets/driftPage-BXbtIdR5.js","assets/analysisPageRuntime-DhMMQ7M5.js","assets/chartExport-DVMhwsTL.js"])))=>i.map(i=>d[i]);
import { l as loadSettings, s as saveSettings, a as applyTheme, i as initSettings, g as getSetting } from './assets/settings-bZFrh4Yc.js';

const scriptRel = 'modulepreload';const assetsURL = function(dep) { return "/js/"+dep };const seen = {};const __vitePreload = function preload(baseModule, deps, importerUrl) {
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

const subscribers = /* @__PURE__ */ new Map();
function emitStoreEvent(eventName, payload) {
  const handlers = subscribers.get(eventName);
  if (!handlers) return;
  for (const handler of Array.from(handlers)) {
    handler(payload);
  }
}

const datasetState = {
  metadata: null,
  numericCols: [],
  columnProfiles: [],
  datasetRevision: 0
};
function setMetadata(metadata) {
  const previousMetadata = datasetState.metadata;
  const previousNumericCols = datasetState.numericCols;
  datasetState.metadata = metadata;
  if (metadata) {
    const timeCol = String(metadata.time_column || "").toLowerCase();
    datasetState.numericCols = (metadata.numeric_columns || []).filter(
      (col) => col.toLowerCase() !== timeCol
    );
  } else {
    datasetState.numericCols = [];
  }
  emitStoreEvent("dataset:metadata", { previous: previousMetadata, next: metadata });
  emitStoreEvent("dataset:numericCols", { previous: previousNumericCols, next: datasetState.numericCols });
}
function setNumericCols(cols) {
  const previous = datasetState.numericCols;
  datasetState.numericCols = [...cols];
  emitStoreEvent("dataset:numericCols", { previous, next: datasetState.numericCols });
}
function setColumnProfiles(profiles) {
  const previous = datasetState.columnProfiles;
  datasetState.columnProfiles = profiles.map((profile) => ({ ...profile }));
  emitStoreEvent("dataset:columnProfiles", { previous, next: datasetState.columnProfiles });
}
function setDatasetRevision(rev) {
  const previous = datasetState.datasetRevision;
  datasetState.datasetRevision = rev;
  emitStoreEvent("dataset:datasetRevision", { previous, next: rev });
}

const SERIES_COLORS = [
  "#00d4ff",
  "#6c63ff",
  "#00c896",
  "#f5a623",
  "#ff4a6e",
  "#c77dff"
];
function normalizeSeriesColor$1(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}
function getSeriesColor$1(column, fallbackIndex = 0) {
  const name = String(column || "").trim();
  const custom = normalizeSeriesColor$1(appStateComposite.seriesColors?.[name]);
  if (custom) return custom;
  return SERIES_COLORS[Math.abs(fallbackIndex) % SERIES_COLORS.length];
}

const uiState = {
  filterText: "",
  selectedCols: [],
  adaptiveFilterColumn: null,
  columnRanges: {},
  adaptiveLineFilters: [],
  pendingAdaptivePoint: null,
  seriesColors: {},
  selectedColorColumn: null,
  profileFilterText: "",
  previewSelectedColumns: [],
  previewTimeColumn: null,
  profileGridBound: false,
  profileGridHeaderBound: false,
  profileGridSort: { key: "name", dir: "asc" },
  profileGridColWidths: [56, 220, 120, 140, 100, 130, 130, 260]
};
function normalizeSeriesColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}
function getSeriesColor(column, fallbackIndex = 0) {
  const name = String(column || "").trim();
  const custom = normalizeSeriesColor(uiState.seriesColors?.[name]);
  if (custom) return custom;
  return SERIES_COLORS[Math.abs(fallbackIndex) % SERIES_COLORS.length];
}
function setSeriesColor(column, value) {
  const name = String(column || "").trim();
  const normalized = normalizeSeriesColor(value);
  if (!name || !normalized) return null;
  setSeriesColors({ ...uiState.seriesColors, [name]: normalized });
  return normalized;
}
function setSelectedCols(cols) {
  const previous = uiState.selectedCols;
  uiState.selectedCols = [...cols];
  emitStoreEvent("ui:selectedCols", { previous, next: uiState.selectedCols });
}
function setAdaptiveFilterColumn(col) {
  const previous = uiState.adaptiveFilterColumn;
  uiState.adaptiveFilterColumn = col;
  emitStoreEvent("ui:adaptiveFilterColumn", { previous, next: col });
}
function setColumnRanges(ranges) {
  const previous = uiState.columnRanges;
  uiState.columnRanges = { ...ranges };
  emitStoreEvent("ui:columnRanges", { previous, next: uiState.columnRanges });
}
function setAdaptiveLineFilters(filters) {
  const previous = uiState.adaptiveLineFilters;
  uiState.adaptiveLineFilters = filters.map((filter) => ({ ...filter }));
  emitStoreEvent("ui:adaptiveLineFilters", { previous, next: uiState.adaptiveLineFilters });
}
function appendAdaptiveLineFilter(filter) {
  setAdaptiveLineFilters([...uiState.adaptiveLineFilters, filter]);
}
function setPendingAdaptivePoint(point) {
  const previous = uiState.pendingAdaptivePoint;
  uiState.pendingAdaptivePoint = point ? { ...point } : null;
  emitStoreEvent("ui:pendingAdaptivePoint", { previous, next: uiState.pendingAdaptivePoint });
}
function setSelectedColorColumn(col) {
  const previous = uiState.selectedColorColumn;
  uiState.selectedColorColumn = col;
  emitStoreEvent("ui:selectedColorColumn", { previous, next: col });
}
function setSeriesColors(colors) {
  const previous = uiState.seriesColors;
  uiState.seriesColors = { ...colors };
  emitStoreEvent("ui:seriesColors", { previous, next: uiState.seriesColors });
}
function setFilterText(text) {
  const previous = uiState.filterText;
  uiState.filterText = text;
  emitStoreEvent("ui:filterText", { previous, next: text });
}
function setProfileFilterText(text) {
  const previous = uiState.profileFilterText;
  uiState.profileFilterText = text;
  emitStoreEvent("ui:profileFilterText", { previous, next: text });
}
function setPreviewSelectedColumns(cols) {
  const previous = uiState.previewSelectedColumns;
  uiState.previewSelectedColumns = [...cols];
  emitStoreEvent("ui:previewSelectedColumns", { previous, next: uiState.previewSelectedColumns });
}
function setPreviewTimeColumn(col) {
  const previous = uiState.previewTimeColumn;
  uiState.previewTimeColumn = col;
  emitStoreEvent("ui:previewTimeColumn", { previous, next: col });
}
function setProfileGridSort(sort) {
  const previous = uiState.profileGridSort;
  uiState.profileGridSort = { ...sort };
  emitStoreEvent("ui:profileGridSort", { previous, next: uiState.profileGridSort });
}
function setProfileGridColWidths(widths) {
  const previous = uiState.profileGridColWidths;
  uiState.profileGridColWidths = [...widths];
  emitStoreEvent("ui:profileGridColWidths", { previous, next: uiState.profileGridColWidths });
}
function setProfileGridBound(bound) {
  const previous = uiState.profileGridBound;
  uiState.profileGridBound = bound;
  emitStoreEvent("ui:profileGridBound", { previous, next: bound });
}
function setProfileGridHeaderBound(bound) {
  const previous = uiState.profileGridHeaderBound;
  uiState.profileGridHeaderBound = bound;
  emitStoreEvent("ui:profileGridHeaderBound", { previous, next: bound });
}

const analyticsState = {
  rollingEnabled: false,
  rollingWindow: 50,
  rollingBands: null,
  anomalyEnabled: false,
  anomalyMethod: "zscore",
  anomalyThreshold: 3,
  anomalyRegions: null,
  spectralFilterPreview: null
};
function setRollingEnabled(v) {
  const previous = analyticsState.rollingEnabled;
  analyticsState.rollingEnabled = v;
  emitStoreEvent("analytics:rollingEnabled", { previous, next: v });
}
function setRollingWindow(n) {
  const previous = analyticsState.rollingWindow;
  analyticsState.rollingWindow = n;
  emitStoreEvent("analytics:rollingWindow", { previous, next: n });
}
function setRollingBands(bands) {
  const previous = analyticsState.rollingBands;
  analyticsState.rollingBands = bands ? bands.map((band) => ({ ...band })) : null;
  emitStoreEvent("analytics:rollingBands", { previous, next: analyticsState.rollingBands });
}
function setAnomalyEnabled(v) {
  const previous = analyticsState.anomalyEnabled;
  analyticsState.anomalyEnabled = v;
  emitStoreEvent("analytics:anomalyEnabled", { previous, next: v });
}
function setAnomalyMethod(m) {
  const previous = analyticsState.anomalyMethod;
  analyticsState.anomalyMethod = m;
  emitStoreEvent("analytics:anomalyMethod", { previous, next: m });
}
function setAnomalyThreshold(t) {
  const previous = analyticsState.anomalyThreshold;
  analyticsState.anomalyThreshold = t;
  emitStoreEvent("analytics:anomalyThreshold", { previous, next: t });
}
function setAnomalyRegions(regions) {
  const previous = analyticsState.anomalyRegions;
  analyticsState.anomalyRegions = regions ? regions.map((region) => ({ ...region })) : null;
  emitStoreEvent("analytics:anomalyRegions", { previous, next: analyticsState.anomalyRegions });
}
function setSpectralFilterPreview(preview) {
  const previous = analyticsState.spectralFilterPreview;
  analyticsState.spectralFilterPreview = preview ? { ...preview } : null;
  emitStoreEvent("analytics:spectralFilterPreview", { previous, next: analyticsState.spectralFilterPreview });
}

const chartState = {
  chart: null,
  currentStart: null,
  currentEnd: null,
  initialView: null,
  zoomHistory: [],
  chartText: { title: "", xLabel: "", yLabel: "" }
};
function disposeChartInstance(chart) {
  const disposable = chart;
  try {
    if (typeof disposable.deepDispose === "function") {
      disposable.deepDispose();
    } else if (typeof disposable.destroy === "function") {
      disposable.destroy();
    } else if (typeof disposable.dispose === "function") {
      disposable.dispose();
    }
  } catch (err) {
    console.warn("[edatime:chart] failed to dispose previous chart instance:", err);
  }
}
function setChartInstance(chart) {
  const previous = chartState.chart;
  if (previous && previous !== chart) {
    disposeChartInstance(previous);
  }
  chartState.chart = chart;
  emitStoreEvent("chart:chart", { previous, next: chart });
}
function setViewport(start, end) {
  const previousViewport = { start: chartState.currentStart, end: chartState.currentEnd };
  const previousStart = chartState.currentStart;
  const previousEnd = chartState.currentEnd;
  chartState.currentStart = start;
  chartState.currentEnd = end;
  emitStoreEvent("chart:currentStart", { previous: previousStart, next: start });
  emitStoreEvent("chart:currentEnd", { previous: previousEnd, next: end });
  emitStoreEvent("chart:viewport", {
    previous: previousViewport,
    next: { start, end }
  });
}
function setInitialView(view) {
  const previous = chartState.initialView;
  chartState.initialView = view ? { ...view } : null;
  emitStoreEvent("chart:initialView", { previous, next: chartState.initialView });
}
function setZoomHistory(history) {
  const previous = chartState.zoomHistory;
  chartState.zoomHistory = history.map((entry) => ({ ...entry }));
  emitStoreEvent("chart:zoomHistory", { previous, next: chartState.zoomHistory });
}
function setChartText(text) {
  const previous = chartState.chartText;
  chartState.chartText = { ...text };
  emitStoreEvent("chart:chartText", { previous, next: chartState.chartText });
}

const scatterState = {
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
};
function replaceScatterState(next) {
  const previous = { ...scatterState };
  Object.assign(scatterState, next);
  emitStoreEvent("scatter:state", { previous, next: scatterState });
}

const runtimeState = {
  lastFetchedData: null,
  fetchDebounceId: null,
  pendingYMode: "fit",
  pendingRestoreY: null,
  analysisBound: false,
  refetchOnZoom: true
};
function setLastFetchedData(data) {
  const previous = runtimeState.lastFetchedData;
  runtimeState.lastFetchedData = data;
  emitStoreEvent("runtime:lastFetchedData", { previous, next: data });
}
function setFetchDebounceId(id) {
  const previous = runtimeState.fetchDebounceId;
  runtimeState.fetchDebounceId = id;
  emitStoreEvent("runtime:fetchDebounceId", { previous, next: id });
}
function setPendingYMode(mode) {
  const previous = runtimeState.pendingYMode;
  runtimeState.pendingYMode = mode;
  emitStoreEvent("runtime:pendingYMode", { previous, next: mode });
}
function setPendingRestoreY(range) {
  const previous = runtimeState.pendingRestoreY;
  runtimeState.pendingRestoreY = range ? { ...range } : null;
  emitStoreEvent("runtime:pendingRestoreY", { previous, next: runtimeState.pendingRestoreY });
}
function setAnalysisBound(bound) {
  const previous = runtimeState.analysisBound;
  runtimeState.analysisBound = bound;
  emitStoreEvent("runtime:analysisBound", { previous, next: bound });
}
function setRefetchOnZoom(refetch) {
  const previous = runtimeState.refetchOnZoom;
  runtimeState.refetchOnZoom = refetch;
  emitStoreEvent("runtime:refetchOnZoom", { previous, next: refetch });
}

function warnLegacyAppStateWrite(property) {
  const meta = import.meta;
  const env = meta.env;
  if (!env?.DEV || env.MODE === "test") return;
  console.warn(`[EdaTime] Direct appState.${String(property)} writes are deprecated. Import the matching store setter from ./store/index.js instead.`);
}
const appStateCompositeTarget = {
  // ── Delegated properties ─────────────────────────────────────────────────
  // These delegate to sub-states so that imports from '../state.js'
  // stay in sync with the authoritative sub-state values.
  get metadata() {
    return datasetState.metadata;
  },
  set metadata(v) {
    setMetadata(v);
  },
  get numericCols() {
    return datasetState.numericCols;
  },
  set numericCols(v) {
    setNumericCols(v);
  },
  get columnProfiles() {
    return datasetState.columnProfiles;
  },
  set columnProfiles(v) {
    setColumnProfiles(v);
  },
  get datasetRevision() {
    return datasetState.datasetRevision;
  },
  set datasetRevision(v) {
    setDatasetRevision(v);
  },
  get selectedCols() {
    return uiState.selectedCols;
  },
  set selectedCols(v) {
    setSelectedCols(v);
  },
  get adaptiveFilterColumn() {
    return uiState.adaptiveFilterColumn;
  },
  set adaptiveFilterColumn(v) {
    setAdaptiveFilterColumn(v);
  },
  get columnRanges() {
    return uiState.columnRanges;
  },
  set columnRanges(v) {
    setColumnRanges(v);
  },
  get adaptiveLineFilters() {
    return uiState.adaptiveLineFilters;
  },
  set adaptiveLineFilters(v) {
    setAdaptiveLineFilters(v);
  },
  get pendingAdaptivePoint() {
    return uiState.pendingAdaptivePoint;
  },
  set pendingAdaptivePoint(v) {
    setPendingAdaptivePoint(v);
  },
  get seriesColors() {
    return uiState.seriesColors;
  },
  set seriesColors(v) {
    setSeriesColors(v);
  },
  get selectedColorColumn() {
    return uiState.selectedColorColumn;
  },
  set selectedColorColumn(v) {
    setSelectedColorColumn(v);
  },
  get filterText() {
    return uiState.filterText;
  },
  set filterText(v) {
    setFilterText(v);
  },
  get profileFilterText() {
    return uiState.profileFilterText;
  },
  set profileFilterText(v) {
    setProfileFilterText(v);
  },
  get previewSelectedColumns() {
    return uiState.previewSelectedColumns;
  },
  set previewSelectedColumns(v) {
    setPreviewSelectedColumns(v);
  },
  get previewTimeColumn() {
    return uiState.previewTimeColumn;
  },
  set previewTimeColumn(v) {
    setPreviewTimeColumn(v);
  },
  get profileGridBound() {
    return uiState.profileGridBound;
  },
  set profileGridBound(v) {
    setProfileGridBound(v);
  },
  get profileGridHeaderBound() {
    return uiState.profileGridHeaderBound;
  },
  set profileGridHeaderBound(v) {
    setProfileGridHeaderBound(v);
  },
  get profileGridSort() {
    return uiState.profileGridSort;
  },
  set profileGridSort(v) {
    setProfileGridSort(v);
  },
  get profileGridColWidths() {
    return uiState.profileGridColWidths;
  },
  set profileGridColWidths(v) {
    setProfileGridColWidths(v);
  },
  get rollingEnabled() {
    return analyticsState.rollingEnabled;
  },
  set rollingEnabled(v) {
    setRollingEnabled(v);
  },
  get rollingWindow() {
    return analyticsState.rollingWindow;
  },
  set rollingWindow(v) {
    setRollingWindow(v);
  },
  get rollingBands() {
    return analyticsState.rollingBands;
  },
  set rollingBands(v) {
    setRollingBands(v);
  },
  get anomalyEnabled() {
    return analyticsState.anomalyEnabled;
  },
  set anomalyEnabled(v) {
    setAnomalyEnabled(v);
  },
  get anomalyMethod() {
    return analyticsState.anomalyMethod;
  },
  set anomalyMethod(v) {
    setAnomalyMethod(v);
  },
  get anomalyThreshold() {
    return analyticsState.anomalyThreshold;
  },
  set anomalyThreshold(v) {
    setAnomalyThreshold(v);
  },
  get anomalyRegions() {
    return analyticsState.anomalyRegions;
  },
  set anomalyRegions(v) {
    setAnomalyRegions(v);
  },
  get spectralFilterPreview() {
    return analyticsState.spectralFilterPreview;
  },
  set spectralFilterPreview(v) {
    setSpectralFilterPreview(v);
  },
  // ── Delegated viewport properties ─────────────────────────────────────────
  // These delegate to chartState so the store index stays in sync.
  get currentStart() {
    return chartState.currentStart;
  },
  set currentStart(v) {
    setViewport(v, chartState.currentEnd);
  },
  get currentEnd() {
    return chartState.currentEnd;
  },
  set currentEnd(v) {
    setViewport(chartState.currentStart, v);
  },
  get initialView() {
    return chartState.initialView;
  },
  set initialView(v) {
    setInitialView(v);
  },
  get zoomHistory() {
    return chartState.zoomHistory;
  },
  set zoomHistory(v) {
    setZoomHistory(v);
  },
  get chartText() {
    return chartState.chartText;
  },
  set chartText(v) {
    setChartText(v);
  },
  get chart() {
    return chartState.chart;
  },
  set chart(v) {
    setChartInstance(v);
  },
  get scatter() {
    return scatterState;
  },
  set scatter(v) {
    replaceScatterState(v);
  },
  get fetchDebounceId() {
    return runtimeState.fetchDebounceId;
  },
  set fetchDebounceId(v) {
    setFetchDebounceId(v);
  },
  get lastFetchedData() {
    return runtimeState.lastFetchedData;
  },
  set lastFetchedData(v) {
    setLastFetchedData(v);
  },
  get analysisBound() {
    return runtimeState.analysisBound;
  },
  set analysisBound(v) {
    setAnalysisBound(v);
  },
  get refetchOnZoom() {
    return runtimeState.refetchOnZoom;
  },
  set refetchOnZoom(v) {
    setRefetchOnZoom(v);
  },
  get pendingYMode() {
    return runtimeState.pendingYMode;
  },
  set pendingYMode(v) {
    setPendingYMode(v);
  },
  get pendingRestoreY() {
    return runtimeState.pendingRestoreY;
  },
  set pendingRestoreY(v) {
    setPendingRestoreY(v);
  }
};
const appStateComposite = new Proxy(appStateCompositeTarget, {
  set(target, property, value, receiver) {
    warnLegacyAppStateWrite(property);
    return Reflect.set(target, property, value, receiver);
  }
});

function ensureRangeStateFromData(dataObj) {
  const next = ensureRangeStateFromDataState(
    dataObj,
    appStateComposite.selectedCols || [],
    appStateComposite.columnRanges || {}
  );
  if (next !== appStateComposite.columnRanges) setColumnRanges(next);
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
function ensureRangeStateFromDataState(dataObj, selectedCols, columnRanges) {
  let next = columnRanges;
  for (const col of selectedCols) {
    const values = dataObj.values?.[col];
    if (!values || values.length === 0 || next[col]) continue;
    const bounds = computeBounds(values);
    if (!bounds) continue;
    next = { ...next, [col]: { from: bounds.min, to: bounds.max } };
  }
  return next;
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
function passesAdaptiveLineFilters(tsMs, valuesByColumn, filters) {
  for (const filter of filters) {
    const column = String(filter?.column || "");
    if (!column) continue;
    const y = Number(valuesByColumn?.[column]);
    if (!Number.isFinite(y)) return false;
    const lineY = buildAdaptiveLineY(filter, tsMs);
    if (!Number.isFinite(lineY)) continue;
    if (filter.keepAbove) {
      if (y < lineY) return false;
    } else if (y > lineY) {
      return false;
    }
  }
  return true;
}
function buildAdaptiveLineFiltersForQueryState(filters) {
  return (filters || []).map((filter) => ({
    id: filter.id,
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
function applyColumnRangesToData(dataObj, selectedCols, columnRanges, adaptiveLineFilters) {
  const filtered = { ...dataObj, series: {}, colorByColumn: {} };
  const lineFilters = Array.isArray(adaptiveLineFilters) ? adaptiveLineFilters : [];
  const neededColumns = lineFilters.length > 0 ? [.../* @__PURE__ */ new Set([...selectedCols || [], ...lineFilters.map((filter) => filter.column)])] : [];
  for (const col of selectedCols) {
    const yValues = dataObj.values?.[col];
    if (!yValues) continue;
    const range = columnRanges[col];
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
        if (!passesAdaptiveLineFilters(ts, valuesByColumn, lineFilters)) continue;
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
function buildAdaptiveLineFiltersForQuery() {
  return buildAdaptiveLineFiltersForQueryState(appStateComposite.adaptiveLineFilters || []);
}
function applyColumnRanges(dataObj) {
  return applyColumnRangesToData(
    dataObj,
    appStateComposite.selectedCols || [],
    appStateComposite.columnRanges || {},
    appStateComposite.adaptiveLineFilters || []
  );
}
function sanitizeSelectedColumns$1() {
  const blockedNames = /* @__PURE__ */ new Set(["ts", "timestamp", "time"]);
  const datetimeCols = new Set(
    (appStateComposite.metadata?.columns || []).filter((col) => /date|time/i.test(String(col?.dtype || ""))).map((col) => String(col?.name || "").toLowerCase())
  );
  const validColNames = new Set(
    (appStateComposite.metadata?.columns || []).map((c) => String(c?.name || "").trim())
  );
  const filtered = (appStateComposite.selectedCols || []).filter((col) => {
    const name = String(col || "").trim();
    if (!name) return false;
    const lower = name.toLowerCase();
    if (blockedNames.has(lower)) return false;
    if (datetimeCols.has(lower)) return false;
    if (!validColNames.has(name)) return false;
    return true;
  });
  setSelectedCols(filtered);
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

window.__edatime = window.__edatime || {};
try {
  Object.defineProperty(window.__edatime, "state", { get: () => appStateComposite });
} catch (_) {
}
window.__edatime.DEBUG = true;

function showBootstrapError({ message }) {
  console.error("Bootstrap error:", message);
}

function isWindowsPlatform() {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
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

function computeFrontendRollingBands(data, cols, windowSize) {
  const ts = data?.ts;
  if (!ts || ts.length < 2) return [];
  const n = ts.length;
  const half = Math.floor((windowSize - 1) / 2);
  const bands = [];
  for (const col of cols) {
    const series = data?.series?.[col];
    const ys = series?.y;
    if (!ys || ys.length !== n) continue;
    const tsOut = new Array(n);
    const mean = new Array(n).fill(null);
    const upper1 = new Array(n).fill(null);
    const lower1 = new Array(n).fill(null);
    const upper2 = new Array(n).fill(null);
    const lower2 = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      tsOut[i] = Number(ts[i]);
      const start = Math.max(0, i - half);
      const end = Math.min(n, i + half + 1);
      let sum = 0, sumSq = 0, cnt = 0;
      for (let j = start; j < end; j++) {
        const v = Number(ys[j]);
        if (Number.isFinite(v)) {
          sum += v;
          sumSq += v * v;
          cnt++;
        }
      }
      if (cnt >= 2) {
        const m = sum / cnt;
        const std = Math.sqrt(Math.max(0, sumSq / cnt - m * m));
        mean[i] = m;
        upper1[i] = m + std;
        lower1[i] = m - std;
        upper2[i] = m + 2 * std;
        lower2[i] = m - 2 * std;
      }
    }
    bands.push({ column: col, ts: tsOut, mean, upper1, lower1, upper2, lower2 });
  }
  return bands;
}
let _anomalyController = null;
let _overlayCallback = null;
function setAnomalyOverlayCallback(cb) {
  _overlayCallback = cb;
}
function requestOverlayRender() {
  _overlayCallback?.();
}
async function fetchAnomalyRegions(fetchAnomalies, signal) {
  if (!Number.isFinite(appStateComposite.currentStart) || !Number.isFinite(appStateComposite.currentEnd)) return;
  if (_anomalyController) _anomalyController.abort();
  _anomalyController = new AbortController();
  const controllerSignal = _anomalyController.signal;
  const startIso = new Date(appStateComposite.currentStart).toISOString();
  const endIso = new Date(appStateComposite.currentEnd).toISOString();
  const cols = appStateComposite.selectedCols.join(",");
  try {
    if (appStateComposite.anomalyEnabled && fetchAnomalies) {
      const resp = await fetchAnomalies(startIso, endIso, cols, appStateComposite.anomalyMethod, appStateComposite.anomalyThreshold, controllerSignal);
      setAnomalyRegions(resp?.regions ?? null);
    } else {
      setAnomalyRegions(null);
    }
  } catch (e) {
    if (!(e instanceof Error) || e.name !== "AbortError") {
      console.warn("Anomaly fetch failed:", e);
    }
    setAnomalyRegions(null);
  }
  requestOverlayRender();
}
function initAnalyticsListeners(fetchAndRenderAnalytics2) {
  const handler = () => {
    if (appStateComposite.lastFetchedData) {
      if (appStateComposite.rollingEnabled) {
        const filtered = applyColumnRanges(appStateComposite.lastFetchedData);
        setRollingBands(computeFrontendRollingBands(
          filtered,
          appStateComposite.selectedCols,
          appStateComposite.rollingWindow || 50
        ));
      } else {
        setRollingBands(null);
      }
      appStateComposite.chart?.requestOverlayRender?.();
    }
    fetchAndRenderAnalytics2().catch((err) => {
      console.warn("Analytics fetch failed:", err);
    });
  };
  window.addEventListener("edatime:analytics-change", handler);
  return () => window.removeEventListener("edatime:analytics-change", handler);
}
async function fetchAndRenderAnalytics$1(fetchAnomalies) {
  await fetchAnomalyRegions(fetchAnomalies ?? null);
}

const analyticsOverlay = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  computeFrontendRollingBands,
  fetchAndRenderAnalytics: fetchAndRenderAnalytics$1,
  fetchAnomalyRegions,
  initAnalyticsListeners,
  setAnomalyOverlayCallback
}, Symbol.toStringTag, { value: 'Module' }));

function humanizeControlId(id) {
  return String(id || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (match) => match.toUpperCase());
}
function normalizeFormControlAccessibility() {
  const controls = document.querySelectorAll("input, select, textarea, .dropdown__trigger");
  controls.forEach((control) => {
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
      if (!control.name && control.id) {
        control.name = control.id;
      }
    }
    if (control.getAttribute("aria-label")) return;
    const labelledByText = control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement ? Array.from(control.labels || []).map((label) => label.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean).join(" ") : "";
    const placeholder = control.getAttribute("placeholder") || "";
    const title = control.getAttribute("title") || "";
    const fallback = humanizeControlId(control.id) || (control instanceof HTMLInputElement && control.type === "file" ? "Upload file" : "Form field");
    const derived = labelledByText || placeholder || title || fallback;
    {
      control.setAttribute("aria-label", derived);
    }
  });
}

function nextTheme(current) {
  return current === "light" ? "dark" : "light";
}
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  if (btn.dataset.edatimeThemeToggle === "1") return;
  btn.dataset.edatimeThemeToggle = "1";
  btn.addEventListener("click", () => {
    const settings = loadSettings();
    const current = settings.theme === "light" ? "light" : "dark";
    const target = nextTheme(current);
    settings.theme = target;
    saveSettings(settings);
    applyTheme(target);
  });
}

const LIVE_REGION_ID = "aria-live-region";
function getLiveRegion() {
  return document.getElementById(LIVE_REGION_ID);
}
function announce(message, priority = "polite") {
  const region = getLiveRegion();
  if (!region) return;
  region.setAttribute("aria-live", priority);
  region.textContent = message;
  setTimeout(() => {
    if (region.textContent === message) {
      region.textContent = "";
    }
  }, 1e3);
}
function announceChartLoading(columns) {
  const count = columns.length;
  const msg = count === 1 ? `Loading chart for ${columns[0]}.` : `Loading chart for ${count} columns: ${columns.join(", ")}.`;
  announce(msg, "polite");
}
function announceDataUpdate(pageName) {
  announce(`Data updated on ${pageName} page.`, "polite");
}
const SHORTCUTS = [
  // Navigation
  { keys: "Alt+1", description: "Upload page", category: "Navigation" },
  { keys: "Alt+2", description: "Timeseries page", category: "Navigation" },
  { keys: "Alt+3", description: "Scatter page", category: "Navigation" },
  { keys: "Alt+4", description: "Scatter matrix view", category: "Navigation" },
  { keys: "Alt+6", description: "FFT page", category: "Navigation" },
  { keys: "Alt+7", description: "Heatmap page", category: "Navigation" },
  { keys: "Alt+8", description: "Spectrogram page", category: "Navigation" },
  { keys: "Alt+9", description: "Causal page", category: "Navigation" },
  { keys: "Alt+0", description: "Drift page", category: "Navigation" },
  { keys: "Ctrl+K", description: "Command palette", category: "Navigation" },
  { keys: "Ctrl+I", description: "Analysis context panel", category: "Navigation" },
  // Chart
  { keys: "Double-click", description: "Reset zoom", category: "Chart" },
  { keys: "Ctrl+click", description: "Set adaptive filter", category: "Chart" },
  { keys: "Drag", description: "Pan / draw", category: "Chart" },
  { keys: "Shift+C", description: "Clear adaptive filters", category: "Chart" },
  // Session
  { keys: "Ctrl+S", description: "Save session", category: "Session" },
  { keys: "Ctrl+Shift+S", description: "Export session file", category: "Session" },
  { keys: "Ctrl+O", description: "Import session file", category: "Session" },
  // Export
  { keys: "Ctrl+E", description: "Export data", category: "Export" }
];
let _shortcutsModal = null;
function showKeyboardShortcutsHelp() {
  const existing = document.getElementById("keyboard-help-modal");
  if (existing) existing.remove();
  const categories = [...new Set(SHORTCUTS.map((s) => s.category))];
  const modal = document.createElement("div");
  modal.id = "keyboard-help-modal";
  modal.className = "modal-backdrop keyboard-help-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "keyboard-help-title");
  const content = categories.map((cat) => {
    const shortcuts = SHORTCUTS.filter((s) => s.category === cat);
    return `
            <div class="keyboard-help-section">
                <h4>${cat}</h4>
                ${shortcuts.map((s) => `
                    <div class="keyboard-shortcut-row">
                        <kbd>${s.keys}</kbd>
                        <span>${s.description}</span>
                    </div>
                `).join("")}
            </div>
        `;
  }).join("");
  modal.innerHTML = `
        <div class="modal">
            <div class="keyboard-help-header">
                <h3 class="keyboard-help-title" id="keyboard-help-title">Keyboard Shortcuts</h3>
                <button class="keyboard-help-close" id="keyboard-help-close" aria-label="Close">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="4" y1="4" x2="12" y2="12"/>
                        <line x1="12" y1="4" x2="4" y2="12"/>
                    </svg>
                </button>
            </div>
            <div class="keyboard-help-content">
                ${content}
            </div>
            <div class="keyboard-help-hint">
                Press <kbd>?</kbd> to toggle this help, or <kbd>Esc</kbd> to close.
            </div>
        </div>
    `;
  document.body.appendChild(modal);
  const closeBtn = document.getElementById("keyboard-help-close");
  closeBtn?.addEventListener("click", hideKeyboardShortcutsHelp);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideKeyboardShortcutsHelp();
  });
  const escHandler = (e) => {
    if (e.key === "Escape") {
      hideKeyboardShortcutsHelp();
      window.removeEventListener("keydown", escHandler);
    }
  };
  window.addEventListener("keydown", escHandler);
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length > 0) {
    focusable[0].focus();
  }
  _shortcutsModal = modal;
}
function hideKeyboardShortcutsHelp() {
  const modal = document.getElementById("keyboard-help-modal");
  if (modal) {
    modal.remove();
    _shortcutsModal = null;
  }
}
function initAccessibilityShortcuts() {
  const handleKey = (e) => {
    const target = e.target;
    const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
    if (isInput) return;
    if (e.key === "?" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (_shortcutsModal) {
        hideKeyboardShortcutsHelp();
      } else {
        showKeyboardShortcutsHelp();
      }
      return;
    }
    if ((e.key === "/" || e.key === "?") && e.ctrlKey) {
      e.preventDefault();
      if (_shortcutsModal) {
        hideKeyboardShortcutsHelp();
      } else {
        showKeyboardShortcutsHelp();
      }
    }
  };
  window.addEventListener("keydown", handleKey);
}

const VALID_PAGES = /* @__PURE__ */ new Set([
  "home",
  "upload",
  "timeseries",
  "correlations",
  "scatter",
  "fft",
  "heatmap",
  "spectrogram",
  "causal",
  "drift",
  "settings"
]);
const PAGE_ALIASES = {
  scattermatrix: "scatter"
  // "Scatter Matrix" is now the matrix sub-view
};
let _bound = false;
function getHashPage() {
  const hash = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const page = params.get("page");
  if (!page) return null;
  const resolved = PAGE_ALIASES[page] ?? page;
  return VALID_PAGES.has(resolved) ? resolved : null;
}
function setHashPage(page) {
  const hash = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  params.set("page", page);
  const newHash = "#" + params.toString();
  if (location.hash !== newHash) {
    history.pushState(null, "", newHash);
  }
}
function replaceHashPage(page) {
  const hash = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  params.set("page", page);
  history.replaceState(null, "", "#" + params.toString());
}
function initHashRouting() {
  if (_bound) return;
  _bound = true;
  window.addEventListener("edatime:page-change", ((e) => {
    const page = e.detail?.navPage || e.detail?.page;
    if (page && VALID_PAGES.has(page)) {
      setHashPage(page);
    }
  }));
  window.addEventListener("popstate", () => {
    const page = getHashPage();
    if (page) {
      const btn = document.querySelector(`.sidebar .nav-item[data-page="${page}"]`);
      btn?.click();
    }
  });
  const initialPage = getHashPage();
  if (initialPage) {
    requestAnimationFrame(() => {
      const btn = document.querySelector(`.sidebar .nav-item[data-page="${initialPage}"]`);
      btn?.click();
    });
  } else {
    replaceHashPage("home");
  }
}

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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function updateAnalysisZoom(startMs, endMs, sourceKind = "user") {
  setText("analysis-zoom", `Range: ${formatAnalysisTime(startMs)} → ${formatAnalysisTime(endMs)} (${sourceKind})`);
}
function updateAnalysisYRange(min, max, sourceKind = "user") {
  if (appStateComposite.pendingYMode === "restore" && appStateComposite.pendingRestoreY) {
    const savedY = appStateComposite.pendingRestoreY;
    setPendingYMode(null);
    setPendingRestoreY(null);
    appStateComposite.chart?.setYRange(savedY.min, savedY.max);
    setText("analysis-y", `Y: ${formatAnalysisNumber(savedY.min)} → ${formatAnalysisNumber(savedY.max)} (restore)`);
    return;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    setText("analysis-y", "Y: —");
    return;
  }
  setText("analysis-y", `Y: ${formatAnalysisNumber(min)} → ${formatAnalysisNumber(max)} (${sourceKind})`);
}
function updateAnalysisCursor(tsMs) {
  if (!Number.isFinite(tsMs)) {
    setText("analysis-cursor", "Cursor: —");
    return;
  }
  setText("analysis-cursor", `Cursor: ${formatAnalysisTime(tsMs)}`);
}
function updateAnalysisClick(payload) {
  if (!payload?.value || payload.value.length < 2) {
    setText("analysis-click", "Click: —");
    return;
  }
  const x = Number(payload.value[0]);
  const y = Number(payload.value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    setText("analysis-click", "Click: —");
    return;
  }
  const xStr = formatAnalysisTime(x);
  const yStr = formatAnalysisNumber(y);
  const seriesStr = payload.seriesName ? ` [${payload.seriesName}]` : "";
  setText("analysis-click", `Click: ${xStr}, ${yStr}${seriesStr}`);
}

function refreshZoomControlsState() {
  const supportsZoom = !!appStateComposite.chart?.supportsZoomControls?.();
  const resetBtn = document.getElementById("zoom-reset-btn");
  if (resetBtn) resetBtn.disabled = !supportsZoom;
  updateZoomRangeBadge();
}
function updateZoomRangeBadge() {
  const badge = document.getElementById("zoom-range-badge");
  if (!badge) return;
  const init = appStateComposite.initialView;
  const curr = appStateComposite.currentStart !== null && appStateComposite.currentEnd !== null ? appStateComposite.currentEnd - appStateComposite.currentStart : null;
  if (!init || curr === null) {
    badge.textContent = "—";
    return;
  }
  const initRange = (init.xMax ?? 0) - (init.xMin ?? 0);
  if (!initRange || initRange <= 0) {
    badge.textContent = "—";
    return;
  }
  const ratio = curr / initRange;
  const pct = (ratio * 100).toFixed(0);
  badge.textContent = `Viewing ${pct}%`;
}
function getCurrentView() {
  const yr = appStateComposite.chart?.getYRange?.();
  return {
    xMin: appStateComposite.currentStart,
    xMax: appStateComposite.currentEnd,
    yMin: yr?.min ?? null,
    yMax: yr?.max ?? null
  };
}
function applyViewport(view, fetchAndRender, sourceKind = "api") {
  dbgGroup(`applyViewport (${sourceKind})`, () => {
    dbg("incoming view", view);
  });
  setViewport(view.xMin, view.xMax);
  appStateComposite.chart?.setXRange?.(appStateComposite.currentStart, appStateComposite.currentEnd);
  updateAnalysisZoom(appStateComposite.currentStart, appStateComposite.currentEnd, sourceKind);
  if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax > view.yMin) {
    updateAnalysisYRange(view.yMin, view.yMax, sourceKind);
    setPendingYMode("restore");
    setPendingRestoreY({ min: view.yMin, max: view.yMax });
  } else {
    setPendingYMode("fit");
    setPendingRestoreY(null);
  }
  if (appStateComposite.fetchDebounceId) clearTimeout(appStateComposite.fetchDebounceId);
  setFetchDebounceId(setTimeout(fetchAndRender, 0));
  updateZoomRangeBadge();
}
function zoomOut(fetchAndRender) {
  dbgGroup("zoomOut (dblclick)", () => {
    dbg("history depth", appStateComposite.zoomHistory.length);
    dbg("initialView", appStateComposite.initialView);
  });
  if (appStateComposite.zoomHistory.length > 0) {
    const nextHistory = appStateComposite.zoomHistory.slice(0, -1);
    const nextView = appStateComposite.zoomHistory[appStateComposite.zoomHistory.length - 1];
    setZoomHistory(nextHistory);
    applyViewport(nextView, fetchAndRender, "zoom-out");
  } else if (appStateComposite.initialView) {
    applyViewport(appStateComposite.initialView, fetchAndRender, "zoom-out");
  }
}
function resetZoom(fetchAndRender) {
  dbgGroup("resetZoom", () => {
    dbg("initialView", appStateComposite.initialView);
  });
  if (!appStateComposite.initialView) return;
  setZoomHistory([]);
  applyViewport(appStateComposite.initialView, fetchAndRender, "reset");
}
function initChartPageFilterGesture() {
  const pageChart = document.getElementById("page-timeseries");
  if (!pageChart) return;
  if (pageChart.dataset.filterCtxBound) return;
  let lastContextTs = 0;
  pageChart.addEventListener("contextmenu", (e) => {
    const inPlot = e.target?.closest?.("#main-chart");
    if (inPlot) return;
    const open = window.__edatime?.openFilterForCol;
    if (typeof open !== "function") return;
    e.preventDefault();
    const now = performance.now();
    const isDoubleContext = now - lastContextTs <= 450;
    lastContextTs = now;
    if (!isDoubleContext) return;
    lastContextTs = 0;
    open(null);
  });
  pageChart.dataset.filterCtxBound = "1";
}
function initResetZoomListener(fetchAndRender) {
  window.addEventListener("edatime:reset-zoom", () => {
    zoomOut(fetchAndRender);
  });
}

let datasetRequestScope = 0;
const inflight = /* @__PURE__ */ new Map();
function createStaleDatasetError() {
  const error = new Error("Stale response ignored after dataset change");
  error.name = "AbortError";
  return error;
}
function captureDatasetRequestScope() {
  return datasetRequestScope;
}
function assertDatasetRequestScopeActive(scope) {
  if (scope !== datasetRequestScope) {
    throw createStaleDatasetError();
  }
}
function invalidateDatasetRequestScope() {
  datasetRequestScope += 1;
  inflight.clear();
  return datasetRequestScope;
}
function dedupeInflight(key, factory) {
  const existing = inflight.get(key);
  if (existing !== void 0) return existing;
  const promise = factory().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function exportParquet(params) {
  const res = await globalThis.fetch(`/api/export/parquet?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Parquet export failed (${res.status}) ${text}`);
  }
  return res.blob();
}
async function exportScatterParquet(payload) {
  const res = await globalThis.fetch("/api/scatter/export/parquet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scatter parquet export failed (${res.status}) ${text}`);
  }
  return res.blob();
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

function buildFilteredSeriesRows() {
  if (!appStateComposite.lastFetchedData || !Array.isArray(appStateComposite.selectedCols) || appStateComposite.selectedCols.length === 0) {
    return [];
  }
  const filtered = applyColumnRanges(appStateComposite.lastFetchedData);
  const rows = [];
  for (const column of appStateComposite.selectedCols) {
    const series = filtered.series?.[column];
    const xs = series?.x || new Float64Array(0);
    const ys = series?.y || new Float64Array(0);
    const len = Math.min(xs.length, ys.length);
    for (let index = 0; index < len; index++) {
      const tsMs = Number(xs[index]);
      const value = Number(ys[index]);
      if (!Number.isFinite(tsMs) || !Number.isFinite(value)) continue;
      rows.push({
        ts_ms: tsMs,
        ts_iso: new Date(tsMs).toISOString(),
        series: column,
        value
      });
    }
  }
  rows.sort((a, b) => a.ts_ms - b.ts_ms || a.series.localeCompare(b.series));
  return rows;
}
function exportFilteredCsv() {
  const rows = buildFilteredSeriesRows();
  if (rows.length === 0) return false;
  const lines = [
    "ts_ms,ts_iso,series,value",
    ...rows.map(
      (row) => `${row.ts_ms},"${row.ts_iso}","${String(row.series).replaceAll('"', '""')}",${row.value}`
    )
  ];
  downloadBlob(
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    "edatime_filtered_series.csv"
  );
  return true;
}
function exportFilteredJson() {
  const rows = buildFilteredSeriesRows();
  if (rows.length === 0) return false;
  downloadBlob(
    new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" }),
    "edatime_filtered_series.json"
  );
  return true;
}
async function exportFilteredParquet() {
  if (!Number.isFinite(appStateComposite.currentStart) || !Number.isFinite(appStateComposite.currentEnd)) {
    return false;
  }
  if (!Array.isArray(appStateComposite.selectedCols) || appStateComposite.selectedCols.length === 0) {
    return false;
  }
  const params = new URLSearchParams({
    start: new Date(appStateComposite.currentStart).toISOString(),
    end: new Date(appStateComposite.currentEnd).toISOString(),
    columns: appStateComposite.selectedCols.join(",")
  });
  const filters = Object.entries(appStateComposite.columnRanges || {}).map(([column, range]) => {
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    return { column, from, to };
  }).filter(Boolean);
  if (filters.length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
  const lineFilters = buildAdaptiveLineFiltersForQuery();
  if (lineFilters.length > 0) {
    params.set("line_filters", JSON.stringify(lineFilters));
  }
  const blob = await exportParquet(params);
  downloadBlob(blob, "edatime_filtered_series.parquet");
  return true;
}
function createExportFeature() {
  return {
    exportFilteredCsv,
    exportFilteredJson,
    exportFilteredParquet
  };
}

const exportFeature = createExportFeature();
function exportChartFilteredData$1(format = "csv") {
  if (format === "json") return exportFeature.exportFilteredJson();
  return exportFeature.exportFilteredCsv();
}
function openToolbarModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = false;
}
function closeToolbarModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = true;
}
function initToolbarModals() {
  const panels = [
    { openBtn: "open-labels-panel-btn", modalId: "chart-labels-modal", closeBtn: "chart-labels-close-btn", doneBtn: "chart-labels-done-btn" },
    { openBtn: "open-export-options-btn", modalId: "export-options-modal", closeBtn: "export-options-close-btn", doneBtn: "chart-labels-done-btn" },
    { openBtn: "open-analytics-panel-btn", modalId: "analytics-drawer", closeBtn: "analytics-close-btn", doneBtn: null, isDrawer: true }
  ];
  for (const panel of panels) {
    const openButton = document.getElementById(panel.openBtn);
    if (openButton && !openButton.dataset.bound) {
      openButton.addEventListener("click", () => {
        if (panel.isDrawer) return;
        openToolbarModal(panel.modalId);
      });
      openButton.dataset.bound = "1";
    }
    if (panel.isDrawer) continue;
    const closeButton = document.getElementById(panel.closeBtn);
    if (closeButton && !closeButton.dataset.bound) {
      closeButton.addEventListener("click", () => closeToolbarModal(panel.modalId));
      closeButton.dataset.bound = "1";
    }
    if (panel.doneBtn) {
      const doneButton = document.getElementById(panel.doneBtn);
      if (doneButton && !doneButton.dataset.bound) {
        doneButton.addEventListener("click", () => closeToolbarModal(panel.modalId));
        doneButton.dataset.bound = "1";
      }
    }
    const modal = document.getElementById(panel.modalId);
    if (modal && !modal.dataset.bound) {
      modal.addEventListener("click", (e) => {
        if (e.target.id === panel.modalId) closeToolbarModal(panel.modalId);
      });
      modal.dataset.bound = "1";
    }
  }
  document.getElementById("zoom-out-btn")?.addEventListener("click", () => zoomOut(() => {
  }));
  document.getElementById("zoom-reset-btn")?.addEventListener("click", () => resetZoom(() => {
  }));
}

const dropdownRegistry = /* @__PURE__ */ new Map();
let instanceCounter = 0;
function normalizeOptions$1(options) {
  return options.map((option) => ({
    value: String(option.value ?? ""),
    label: String(option.label ?? option.value ?? ""),
    disabled: !!option.disabled
  }));
}
function findFirstEnabledOption(options) {
  return options.find((option) => !option.disabled) ?? null;
}
function findSelectedOption(options, value) {
  return options.find((option) => option.value === value) ?? null;
}
function isHtmlSelectElement(element) {
  return !!element && element instanceof HTMLSelectElement;
}
function dropdownRootForElement(element) {
  if (!element) return null;
  if (element instanceof HTMLElement && element.classList.contains("dropdown")) return element;
  return element instanceof HTMLElement ? element.closest(".dropdown") : null;
}
function dispatchDropdownChange(root, value) {
  root.dispatchEvent(new CustomEvent("dropdown:change", {
    bubbles: true,
    detail: { value }
  }));
  root.dispatchEvent(new Event("change", { bubbles: true }));
  root.dispatchEvent(new Event("input", { bubbles: true }));
}
function createDropdown(props) {
  const instanceId = props.id || `dropdown-${++instanceCounter}`;
  const listboxId = `${instanceId}__listbox`;
  const root = document.createElement("div");
  root.className = `dropdown dropdown--${props.variant ?? "default"}${props.className ? ` ${props.className}` : ""}`;
  root.id = instanceId;
  root.tabIndex = -1;
  root.dataset.dropdownId = instanceId;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dropdown__trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", listboxId);
  trigger.setAttribute("aria-label", props.label);
  const label = document.createElement("span");
  label.className = "dropdown__label";
  const chevron = document.createElement("span");
  chevron.className = "dropdown__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>';
  trigger.append(label, chevron);
  const menu = document.createElement("div");
  menu.className = "dropdown__menu";
  menu.id = listboxId;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  root.append(trigger, menu);
  let options = normalizeOptions$1(props.options);
  let value = props.value ?? "";
  let open = false;
  let destroyed = false;
  let activeIndex = -1;
  let typeaheadBuffer = "";
  let typeaheadTimer = null;
  const syncTriggerLabel = () => {
    const selected = findSelectedOption(options, value) ?? findFirstEnabledOption(options);
    label.textContent = selected?.label ?? "";
  };
  const syncActiveState = () => {
    const optionEls = menu.querySelectorAll(".dropdown__option");
    optionEls.forEach((optionEl, index) => {
      const option = options[index];
      const isSelected = option?.value === value;
      const isActive = index === activeIndex;
      optionEl.setAttribute("aria-selected", String(isSelected));
      optionEl.classList.toggle("is-selected", isSelected);
      optionEl.classList.toggle("is-active", isActive);
    });
  };
  const renderOptions = () => {
    menu.innerHTML = "";
    options.forEach((option, index) => {
      const optionEl = document.createElement("button");
      optionEl.type = "button";
      optionEl.className = "dropdown__option";
      optionEl.dataset.value = option.value;
      optionEl.setAttribute("role", "option");
      optionEl.disabled = option.disabled;
      optionEl.textContent = option.label;
      optionEl.addEventListener("click", () => {
        controller.setValue(option.value, { emitChange: true });
        controller.close();
        trigger.focus();
      });
      menu.appendChild(optionEl);
      if (option.value === value && activeIndex < 0) activeIndex = index;
    });
    syncActiveState();
  };
  const focusIndex = (nextIndex) => {
    if (options.length === 0) {
      activeIndex = -1;
      syncActiveState();
      return;
    }
    let candidate = nextIndex;
    for (let attempts = 0; attempts < options.length; attempts += 1) {
      const wrapped = (candidate + options.length) % options.length;
      if (!options[wrapped]?.disabled) {
        activeIndex = wrapped;
        syncActiveState();
        return;
      }
      candidate += 1;
    }
  };
  const openMenu = () => {
    if (open || trigger.disabled) return;
    open = true;
    root.classList.add("dropdown--open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    focusIndex(selectedIndex >= 0 ? selectedIndex : 0);
  };
  const closeMenu = () => {
    if (!open) return;
    open = false;
    root.classList.remove("dropdown--open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    activeIndex = -1;
    syncActiveState();
  };
  const chooseActiveOption = () => {
    const option = options[activeIndex];
    if (!option || option.disabled) return;
    controller.setValue(option.value, { emitChange: true });
    closeMenu();
    trigger.focus();
  };
  const handleTypeahead = (key) => {
    if (key.length !== 1 || key.trim().length === 0) return false;
    typeaheadBuffer += key.toLowerCase();
    if (typeaheadTimer !== null) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => {
      typeaheadBuffer = "";
      typeaheadTimer = null;
    }, 250);
    const matchIndex = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typeaheadBuffer));
    if (matchIndex >= 0) {
      if (!open) openMenu();
      focusIndex(matchIndex);
      return true;
    }
    return false;
  };
  const handleKeydown = (event) => {
    if (trigger.disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openMenu();
        else focusIndex(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openMenu();
        else focusIndex(activeIndex - 1);
        break;
      case "Home":
        if (!open) return;
        event.preventDefault();
        focusIndex(0);
        break;
      case "End":
        if (!open) return;
        event.preventDefault();
        focusIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) openMenu();
        else chooseActiveOption();
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        closeMenu();
        trigger.focus();
        break;
      default:
        handleTypeahead(event.key);
        break;
    }
  };
  const handleDocumentPointerDown = (event) => {
    if (!open) return;
    const target = event.target;
    if (target && root.contains(target)) return;
    closeMenu();
  };
  trigger.addEventListener("click", () => {
    if (open) closeMenu();
    else openMenu();
  });
  trigger.addEventListener("keydown", (event) => {
    handleKeydown(event);
    event.stopPropagation();
  });
  root.addEventListener("keydown", handleKeydown);
  document.addEventListener("mousedown", handleDocumentPointerDown);
  const controller = {
    root,
    trigger,
    menu,
    getValue: () => value,
    setValue: (nextValue, optionsConfig = {}) => {
      const selected = findSelectedOption(options, String(nextValue));
      const next = selected?.disabled ? null : selected;
      if (!next) return;
      const changed = value !== next.value;
      value = next.value;
      syncTriggerLabel();
      syncActiveState();
      if (changed && optionsConfig.emitChange) {
        props.onChange?.(value);
        dispatchDropdownChange(root, value);
      }
    },
    getOptions: () => [...options],
    setOptions: (nextOptions, config = {}) => {
      options = normalizeOptions$1(nextOptions);
      const preferred = config.preferredValue ?? value;
      const selected = findSelectedOption(options, preferred || "") ?? findFirstEnabledOption(options);
      const previous = value;
      value = selected?.value ?? "";
      activeIndex = options.findIndex((option) => option.value === value);
      renderOptions();
      syncTriggerLabel();
      if (config.emitChange && previous !== value) {
        props.onChange?.(value);
        dispatchDropdownChange(root, value);
      }
      return value;
    },
    setDisabled: (disabled) => {
      trigger.disabled = !!disabled;
      root.classList.toggle("dropdown--disabled", !!disabled);
      if (disabled) closeMenu();
    },
    focus: () => trigger.focus(),
    open: openMenu,
    close: closeMenu,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener("mousedown", handleDocumentPointerDown);
      if (dropdownRegistry.get(instanceId) === controller) {
        dropdownRegistry.delete(instanceId);
      }
    }
  };
  controller.setOptions(options);
  controller.setDisabled(!!props.disabled);
  if (props.id) dropdownRegistry.set(props.id, controller);
  return controller;
}
function getDropdownController(id) {
  return dropdownRegistry.get(id) ?? null;
}
function upgradeSelectElement(selectEl) {
  const style = selectEl.getAttribute("style");
  const options = Array.from(selectEl.options).map((option) => ({
    value: option.value,
    label: option.textContent || option.label || option.value,
    disabled: option.disabled
  }));
  const controller = createDropdown({
    id: selectEl.id || void 0,
    name: selectEl.name || void 0,
    label: selectEl.getAttribute("aria-label") || selectEl.name || selectEl.id || "Dropdown",
    value: selectEl.value,
    options,
    className: selectEl.className || void 0,
    disabled: selectEl.disabled,
    variant: selectEl.classList.contains("ctrl-sm") || selectEl.closest(".toolbar, .scatter-toolbar") ? "compact" : selectEl.id === "color-column-select" ? "chip" : "default"
  });
  for (const attribute of Array.from(selectEl.attributes)) {
    if (["id", "class", "style", "aria-label", "disabled"].includes(attribute.name)) continue;
    controller.root.setAttribute(attribute.name, attribute.value);
  }
  if (style) controller.root.setAttribute("style", style);
  selectEl.replaceWith(controller.root);
  return controller;
}
function upgradeSelects(root = document) {
  const selectEls = Array.from(root.querySelectorAll("select")).filter((selectEl) => !selectEl.multiple && !selectEl.hasAttribute("data-dropdown-skip"));
  return selectEls.map((selectEl) => upgradeSelectElement(selectEl));
}
function getDropdownValue(id) {
  const controller = getDropdownController(id);
  if (controller) return controller.getValue();
  const element = document.getElementById(id);
  return isHtmlSelectElement(element) ? element.value : "";
}
function getDropdownValueFromElement(element) {
  if (isHtmlSelectElement(element)) return element.value;
  const root = dropdownRootForElement(element);
  if (!root?.id) return "";
  return getDropdownValue(root.id);
}
function getDropdownOptions(id) {
  const controller = getDropdownController(id);
  if (controller) return controller.getOptions();
  const element = document.getElementById(id);
  if (!isHtmlSelectElement(element)) return [];
  return Array.from(element.options).map((option) => ({
    value: option.value,
    label: option.textContent || option.label || option.value,
    disabled: option.disabled
  }));
}
function setDropdownValue(id, value, options) {
  const controller = getDropdownController(id);
  if (controller) {
    controller.setValue(value, options);
    return;
  }
  const element = document.getElementById(id);
  if (!isHtmlSelectElement(element)) return;
  element.value !== value;
  element.value = value;
}
function setDropdownOptions(id, options, config) {
  const controller = getDropdownController(id);
  if (controller) return controller.setOptions(options, config);
  const element = document.getElementById(id);
  if (!isHtmlSelectElement(element)) return "";
  element.innerHTML = "";
  normalizeOptions$1(options).forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    optionEl.disabled = option.disabled;
    element.appendChild(optionEl);
  });
  const preferred = config?.preferredValue ?? element.value;
  if (preferred) element.value = preferred;
  if (!element.value && element.options.length > 0) element.value = element.options[0].value;
  if (config?.emitChange) element.dispatchEvent(new Event("change", { bubbles: true }));
  return element.value;
}
function setDropdownDisabled(id, disabled) {
  const controller = getDropdownController(id);
  if (controller) {
    controller.setDisabled(disabled);
    return;
  }
  const element = document.getElementById(id);
  if (isHtmlSelectElement(element)) element.disabled = disabled;
}
function setDropdownDisabledForElement(element, disabled) {
  if (isHtmlSelectElement(element)) {
    element.disabled = disabled;
    return;
  }
  const root = dropdownRootForElement(element);
  if (root?.id) setDropdownDisabled(root.id, disabled);
}

function initDrawControls(fetchAndRender) {
  const zoomResetBtn = document.getElementById("zoom-reset-btn");
  if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
    zoomResetBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("edatime:reset-zoom", { detail: { source: "toolbar" } }));
    });
    zoomResetBtn.dataset.bound = "1";
  }
  const drawTool = document.getElementById("draw-tool");
  const drawColor = document.getElementById("draw-color");
  const drawWidth = document.getElementById("draw-width");
  const drawClearBtn = document.getElementById("draw-clear-btn");
  const adaptiveClearBtn = document.getElementById("adaptive-clear-btn");
  const updateDrawMode = () => {
    if (appStateComposite.chart && appStateComposite.chart.setDrawMode) {
      appStateComposite.chart.setDrawMode(getDropdownValue("draw-tool"), drawColor.value, parseInt(drawWidth.value, 10));
    }
  };
  if (drawTool) drawTool.addEventListener("change", updateDrawMode);
  if (drawColor) drawColor.addEventListener("input", updateDrawMode);
  if (drawWidth) drawWidth.addEventListener("input", updateDrawMode);
  if (drawClearBtn) {
    drawClearBtn.addEventListener("click", () => {
      if (appStateComposite.chart && appStateComposite.chart.clearDrawings) appStateComposite.chart.clearDrawings();
    });
  }
  if (adaptiveClearBtn && !adaptiveClearBtn.dataset.bound) {
    adaptiveClearBtn.addEventListener("click", () => {
      setAdaptiveLineFilters([]);
      setPendingAdaptivePoint(null);
      appStateComposite.chart?.requestOverlayRender?.();
      window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change"));
    });
    adaptiveClearBtn.dataset.bound = "1";
  }
}

function initChartTextControls() {
  const titleInput = document.getElementById("chart-title-input");
  const xLabelInput = document.getElementById("x-axis-label-input");
  const yLabelInput = document.getElementById("y-axis-label-input");
  const applyChartText = () => {
    setChartText({
      title: titleInput?.value ?? appStateComposite.chartText.title,
      xLabel: xLabelInput?.value ?? appStateComposite.chartText.xLabel,
      yLabel: yLabelInput?.value ?? appStateComposite.chartText.yLabel
    });
    appStateComposite.chart?.setChartText?.(appStateComposite.chartText.title, appStateComposite.chartText.xLabel, appStateComposite.chartText.yLabel);
  };
  if (titleInput && !titleInput.dataset.bound) {
    titleInput.value = appStateComposite.chartText.title || "";
    titleInput.addEventListener("input", applyChartText);
    titleInput.dataset.bound = "1";
  }
  if (xLabelInput && !xLabelInput.dataset.bound) {
    xLabelInput.value = appStateComposite.chartText.xLabel || "";
    xLabelInput.addEventListener("input", applyChartText);
    xLabelInput.dataset.bound = "1";
  }
  if (yLabelInput && !yLabelInput.dataset.bound) {
    yLabelInput.value = appStateComposite.chartText.yLabel || "";
    yLabelInput.addEventListener("input", applyChartText);
    yLabelInput.dataset.bound = "1";
  }
  applyChartText();
}

function initAnalyticsControls() {
  const rollingCheck = document.getElementById("rolling-enabled");
  const rollingWindowInput = document.getElementById("rolling-window");
  const anomalyCheck = document.getElementById("anomaly-enabled");
  const anomalyMethodSelect = document.getElementById("anomaly-method");
  const anomalyThresholdInput = document.getElementById("anomaly-threshold");
  const transformOpenBtn = document.getElementById("transform-open-btn");
  const dispatchAnalyticsChange = () => window.dispatchEvent(new CustomEvent("edatime:analytics-change"));
  if (rollingCheck && !rollingCheck.dataset.bound) {
    rollingCheck.addEventListener("change", () => {
      setRollingEnabled(rollingCheck.checked);
      dispatchAnalyticsChange();
    });
    rollingCheck.dataset.bound = "1";
  }
  if (rollingWindowInput && !rollingWindowInput.dataset.bound) {
    let rollingDebounce = null;
    rollingWindowInput.addEventListener("input", () => {
      const v = parseInt(rollingWindowInput.value, 10);
      if (Number.isFinite(v) && v >= 3) {
        setRollingWindow(v);
        if (appStateComposite.rollingEnabled) {
          if (rollingDebounce) clearTimeout(rollingDebounce);
          rollingDebounce = setTimeout(dispatchAnalyticsChange, 300);
        }
      }
    });
    rollingWindowInput.dataset.bound = "1";
  }
  if (anomalyCheck && !anomalyCheck.dataset.bound) {
    anomalyCheck.addEventListener("change", () => {
      setAnomalyEnabled(anomalyCheck.checked);
      dispatchAnalyticsChange();
    });
    anomalyCheck.dataset.bound = "1";
  }
  if (anomalyMethodSelect && !anomalyMethodSelect.dataset.bound) {
    anomalyMethodSelect.addEventListener("change", () => {
      setAnomalyMethod(getDropdownValue("anomaly-method"));
      if (appStateComposite.anomalyEnabled) dispatchAnalyticsChange();
    });
    anomalyMethodSelect.dataset.bound = "1";
  }
  if (anomalyThresholdInput && !anomalyThresholdInput.dataset.bound) {
    let threshDebounce = null;
    anomalyThresholdInput.addEventListener("input", () => {
      const v = parseFloat(anomalyThresholdInput.value);
      if (Number.isFinite(v) && v > 0) {
        setAnomalyThreshold(v);
        if (appStateComposite.anomalyEnabled) {
          if (threshDebounce) clearTimeout(threshDebounce);
          threshDebounce = setTimeout(dispatchAnalyticsChange, 300);
        }
      }
    });
    anomalyThresholdInput.dataset.bound = "1";
  }
  if (transformOpenBtn && !transformOpenBtn.dataset.bound) {
    transformOpenBtn.addEventListener("click", () => {
      const modal = document.getElementById("transform-modal");
      if (modal) modal.hidden = false;
    });
    transformOpenBtn.dataset.bound = "1";
  }
}

const STYLE_MODULES = {
  drift: "css/modules/drift.css?v=4",
  home: "css/modules/home.css?v=1",
  scatter: "css/modules/scatter.css?v=1"
};
function pageStyleModulesFor(pageName) {
  if (pageName === "drift") return ["drift"];
  if (pageName === "home") return ["home"];
  if (pageName === "scatter") return ["scatter"];
  return [];
}
function ensureStyleModule(name) {
  if (typeof document === "undefined") return null;
  const existing = document.head.querySelector(`link[data-edatime-style="${name}"]`);
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_MODULES[name];
  link.dataset.edatimeStyle = name;
  document.head.appendChild(link);
  return link;
}
function preloadPageStyles(pageName) {
  for (const moduleName of pageStyleModulesFor(pageName)) {
    ensureStyleModule(moduleName);
  }
}

const pageStyles = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  ensureStyleModule,
  pageStyleModulesFor,
  preloadPageStyles
}, Symbol.toStringTag, { value: 'Module' }));

const DATASET_BOOTSTRAP_PAGES = /* @__PURE__ */ new Set([
  "timeseries",
  "scatter",
  "fft",
  "heatmap",
  "spectrogram",
  "causal",
  "drift"
]);
function pageNeedsDatasetBootstrap(pageName) {
  return Boolean(pageName && DATASET_BOOTSTRAP_PAGES.has(pageName));
}

function initPageNavigation() {
  const navButtons = Array.from(document.querySelectorAll(".sidebar .nav-item[data-page]"));
  const pages = Array.from(document.querySelectorAll(".page[data-page-name]"));
  if (navButtons.length === 0 || pages.length === 0) return;
  const analyticsViews = {
    scatter: "plot",
    scattermatrix: "matrix"
  };
  const layout = document.querySelector(".app-layout");
  const collapseBtn = document.getElementById("sidebar-collapse-btn");
  if (layout && collapseBtn && !collapseBtn.dataset.bound) {
    collapseBtn.addEventListener("click", () => {
      layout.classList.toggle("sidebar-collapsed");
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    collapseBtn.dataset.bound = "1";
  }
  async function showPage(pageName) {
    const win = window;
    preloadPageStyles(pageName);
    if (pageName === "settings") {
      await win.__edatime?.ensureSubsystem?.("settings");
      win.__edatime?.openSettingsModal?.();
      return;
    }
    if (pageName === "home") {
      await win.__edatime?.ensureSubsystem?.("home");
    } else if (pageName === "upload") {
      await win.__edatime?.ensureSubsystem?.("upload");
    } else if (pageName === "timeseries") {
      await win.__edatime?.ensureSubsystem?.("timeseries-shell");
    }
    if (pageNeedsDatasetBootstrap(pageName)) {
      await win.__edatime?.ensureDatasetReady?.(pageName);
    }
    if (win.__edatime?.ensurePageModuleLoaded) {
      await win.__edatime.ensurePageModuleLoaded(pageName);
    }
    const analyticsView = analyticsViews[pageName] || null;
    const resolvedPageName = analyticsView ? "scatter" : pageName;
    for (const p of pages) {
      const hide = p.dataset.pageName !== resolvedPageName;
      p.hidden = hide;
      p.style.display = hide ? "none" : "flex";
    }
    for (const btn of navButtons) {
      btn.classList.toggle("active", btn.dataset.page === pageName);
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(
        new CustomEvent("edatime:page-change", {
          detail: {
            page: resolvedPageName,
            navPage: pageName,
            analyticsView
          }
        })
      );
    });
  }
  for (const btn of navButtons) {
    btn.addEventListener("click", async () => {
      await showPage(btn.dataset.page);
    });
  }
  showPage(getHashPage() ?? "home");
}

function bindAnalysisChartEvents() {
  if (!appStateComposite.chart || appStateComposite.analysisBound) return;
  appStateComposite.chart.onCrosshairMove?.((payload) => {
    let x = Number(payload?.x);
    if (Number.isFinite(x) && x < 1e11) {
      const dom = appStateComposite.chart?.getXDomain?.();
      if (dom?.min && Number.isFinite(dom.min)) x = dom.min + x;
    }
    updateAnalysisCursor(x);
    if (DEBUG) {
      const now = Date.now();
      const last = appStateComposite._debugLastCrosshairLogTs ?? 0;
      if (now - last >= 500) {
        appStateComposite._debugLastCrosshairLogTs = now;
        dbg("crosshair-debug", { payload, xAbs: x, chartYRange: appStateComposite.chart?.getYRange?.() });
      }
    }
  });
  appStateComposite.chart.onClick?.((payload) => {
    if (payload?.value && payload.value.length >= 2) {
      const x0 = Number(payload.value[0]);
      if (Number.isFinite(x0) && x0 < 1e11) {
        const dom = appStateComposite.chart?.getXDomain?.();
        if (dom?.min && Number.isFinite(dom.min)) {
          payload = { ...payload, value: [dom.min + x0, payload.value[1]] };
        }
      }
    }
    updateAnalysisClick(payload);
  });
  setAnalysisBound(true);
}
function setComputeLoading(btnId, overlayId, loading, label = "Compute") {
  const btn = document.getElementById(btnId);
  const overlay = document.getElementById(overlayId);
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? "Computing…" : label;
  }
  if (overlay) overlay.hidden = !loading;
}
function initAnalysisControls(fetchAndRender) {
  window.__edatime = window.__edatime || {};
  window.__edatime.exportChartFilteredData = exportChartFilteredData$1;
  initToolbarModals();
  initDrawControls();
  initChartTextControls();
  initAnalyticsControls();
  initResetZoomListener(fetchAndRender);
  refreshZoomControlsState();
}
function initPages() {
  initPageNavigation();
}

const toolbar = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  applyViewport,
  bindAnalysisChartEvents,
  getCurrentView,
  initAnalysisControls,
  initChartPageFilterGesture,
  initPages,
  refreshZoomControlsState,
  resetZoom,
  setComputeLoading,
  updateAnalysisClick,
  updateAnalysisCursor,
  updateAnalysisYRange,
  updateAnalysisZoom,
  zoomOut
}, Symbol.toStringTag, { value: 'Module' }));

function wireHomeNavigationCards(showPage) {
  document.querySelectorAll("[data-home-nav]").forEach((element) => {
    element.addEventListener("click", () => {
      const target = element.dataset.homeNav;
      if (target) showPage(target);
    });
  });
}

function initShellCore(deps) {
  normalizeFormControlAccessibility();
  initPages();
  initHashRouting();
  initSettings();
  initThemeToggle();
  initAccessibilityShortcuts();
  initKeyboardHelpButton();
  const layout = document.querySelector(".app-layout");
  if (layout && getSetting("sidebarCollapsed")) {
    layout.classList.add("sidebar-collapsed");
  }
  wireHomeNavigationCards(deps.showPage);
}
function initKeyboardHelpButton() {
  document.getElementById("keyboard-help-btn")?.addEventListener("click", showKeyboardShortcutsHelp);
}

const SUBSYSTEMS = {};
function registerSubsystem(name, init) {
  if (!SUBSYSTEMS[name]) {
    SUBSYSTEMS[name] = { init, loaded: false, pending: null };
  }
}
async function ensureSubsystem$1(name, deps) {
  const entry = SUBSYSTEMS[name];
  if (!entry) {
    throw new Error(`Unknown deferred subsystem: ${name}`);
  }
  if (entry.loaded) return;
  if (entry.pending) return entry.pending;
  entry.pending = Promise.resolve(entry.init(deps)).then(() => {
    entry.loaded = true;
  }).finally(() => {
    entry.pending = null;
  });
  return entry.pending;
}
registerSubsystem("upload-panel", async (deps) => {
  const profileModule = await __vitePreload(() => import('./assets/profile-DCQ6F-wu.js'),true              ?__vite__mapDeps([0,1]):void 0);
  const { initUploadPanel } = await __vitePreload(async () => { const { initUploadPanel } = await import('./assets/upload-DVzysbOx.js');return { initUploadPanel }},true              ?__vite__mapDeps([2,3,4,5,6,1]):void 0);
  initUploadPanel(profileModule.hydrateColumnProfiles, profileModule.renderColumnProfilesGrid, {
    buildColumnToggles: deps.buildTimeseriesColumns,
    buildRangeControls: deps.buildTimeseriesRanges,
    refreshDatasetAfterMutation: () => deps.refreshDatasetAfterMutation()
  });
});
registerSubsystem("column-profiles", async () => {
  const { initColumnProfilesGrid } = await __vitePreload(async () => { const { initColumnProfilesGrid } = await import('./assets/profile-DCQ6F-wu.js');return { initColumnProfilesGrid }},true              ?__vite__mapDeps([0,1]):void 0);
  initColumnProfilesGrid();
});
registerSubsystem("analytics-overlay", async () => {
  const { initAnalyticsDrawer } = await __vitePreload(async () => { const { initAnalyticsDrawer } = await import('./assets/analyticsDrawer-D8FXIXKQ.js');return { initAnalyticsDrawer }},true              ?__vite__mapDeps([7,1]):void 0);
  initAnalyticsDrawer();
});
registerSubsystem("analytics-listeners", async () => {
  const { initAnalyticsListeners } = await __vitePreload(async () => { const { initAnalyticsListeners } = await Promise.resolve().then(() => analyticsOverlay);return { initAnalyticsListeners }},true              ?void 0:void 0);
  initAnalyticsListeners(() => Promise.resolve(
    window.__edatime?.runAnalytics?.()
  ));
});
registerSubsystem("annotation-subsystems", async () => {
  const { initAnnotations } = await __vitePreload(async () => { const { initAnnotations } = await Promise.resolve().then(() => annotations$1);return { initAnnotations }},true              ?void 0:void 0);
  const { initAnnotationPanel } = await __vitePreload(async () => { const { initAnnotationPanel } = await Promise.resolve().then(() => annotationPanel);return { initAnnotationPanel }},true              ?void 0:void 0);
  initAnnotations();
  initAnnotationPanel();
});
registerSubsystem("guided-workflow", async () => {
  const { initGuidedWorkflow } = await __vitePreload(async () => { const { initGuidedWorkflow } = await import('./assets/guidedWorkflow-DrvIK14h.js');return { initGuidedWorkflow }},true              ?__vite__mapDeps([8,1]):void 0);
  initGuidedWorkflow();
});
registerSubsystem("workflow-modals", async (deps) => {
  const { initOutlierModal, initTransformModal } = await __vitePreload(async () => { const { initOutlierModal, initTransformModal } = await import('./assets/dataMutationModals-CQewcIsT.js');return { initOutlierModal, initTransformModal }},true              ?__vite__mapDeps([9,10,11,5,1]):void 0);
  initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
  initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation });
});
registerSubsystem("provenance", async () => {
  const { initProvenance } = await __vitePreload(async () => { const { initProvenance } = await import('./assets/provenance-DqeiL9fi.js');return { initProvenance }},true              ?__vite__mapDeps([12,1]):void 0);
  initProvenance();
});
registerSubsystem("settings-panel", async () => {
  const { initSettingsPanel, openSettingsModal } = await __vitePreload(async () => { const { initSettingsPanel, openSettingsModal } = await import('./assets/settingsPanel-C6DDXf9Z.js');return { initSettingsPanel, openSettingsModal }},true              ?__vite__mapDeps([13,1,10]):void 0);
  initSettingsPanel();
  window.__edatime = window.__edatime || {};
  window.__edatime.openSettingsModal = openSettingsModal;
});
registerSubsystem("analysis-controls", async (deps) => {
  const { initAnalysisControls, initChartPageFilterGesture } = await __vitePreload(async () => { const { initAnalysisControls, initChartPageFilterGesture } = await Promise.resolve().then(() => toolbar);return { initAnalysisControls, initChartPageFilterGesture }},true              ?void 0:void 0);
  initAnalysisControls(deps.fetchAndRender);
  initChartPageFilterGesture();
});
registerSubsystem("command-palette", async () => {
  const { initCommandPalette, openPalette } = await __vitePreload(async () => { const { initCommandPalette, openPalette } = await import('./assets/palette-DWW2h0SW.js');return { initCommandPalette, openPalette }},true              ?[]:void 0);
  initCommandPalette();
  window.__edatime = window.__edatime || {};
  window.__edatime.openPalette = openPalette;
});
registerSubsystem("sample-datasets", async (deps) => {
  const { wireSampleDatasetCards } = await __vitePreload(async () => { const { wireSampleDatasetCards } = await import('./assets/sampleDatasets-BSStG2nr.js');return { wireSampleDatasetCards }},true              ?__vite__mapDeps([14,1]):void 0);
  wireSampleDatasetCards(deps.showPage, () => deps.refreshDatasetAfterMutation());
});
registerSubsystem("app-commands", async (deps) => {
  const { registerAppCommands } = await __vitePreload(async () => { const { registerAppCommands } = await Promise.resolve().then(() => commands);return { registerAppCommands }},true              ?void 0:void 0);
  const commandDeps = {
    showPage: deps.showPage,
    zoomOut: deps.zoomOut,
    resetZoom: deps.resetZoom
  };
  await registerAppCommands(commandDeps);
});
async function ensureUploadSubsystems(deps) {
  await ensureSubsystem$1("upload-panel", deps);
  await ensureSubsystem$1("column-profiles", deps);
}
async function ensureTimeseriesShell(deps) {
  await ensureSubsystem$1("analysis-controls", deps);
  await ensureSubsystem$1("analytics-overlay", deps);
  await ensureSubsystem$1("analytics-listeners", deps);
  await ensureSubsystem$1("annotation-subsystems", deps);
  await ensureSubsystem$1("guided-workflow", deps);
  await ensureSubsystem$1("workflow-modals", deps);
  await ensureSubsystem$1("provenance", deps);
}
async function ensureSettingsPanel(deps) {
  await ensureSubsystem$1("settings-panel", deps);
}
async function ensureCommands(deps) {
  await ensureSubsystem$1("command-palette", deps);
  await ensureSubsystem$1("app-commands", deps);
}
async function ensureHomeSubsystems(deps) {
  await ensureSubsystem$1("sample-datasets", deps);
}

function initAppShell(deps) {
  initShellCore({ showPage: deps.showPage });
  window.__edatime = window.__edatime || {};
  window.__edatime.ensurePageModuleLoaded = deps.ensurePageModuleLoaded;
  const deferred = {
    showPage: deps.showPage,
    ensurePageModuleLoaded: deps.ensurePageModuleLoaded,
    fetchAndRender: deps.fetchAndRender,
    refreshDatasetAfterMutation: deps.refreshDatasetAfterMutation,
    buildTimeseriesColumns: deps.buildTimeseriesColumns,
    buildTimeseriesRanges: deps.buildTimeseriesRanges,
    zoomOut: deps.zoomOut,
    resetZoom: deps.resetZoom,
    updateAnalysisYRange: deps.updateAnalysisYRange,
    registerCleanup: deps.registerCleanup
  };
  window.__edatime.ensureSubsystem = async (name) => {
    switch (name) {
      case "upload":
        return ensureUploadSubsystems(deferred);
      case "home":
        return ensureHomeSubsystems(deferred);
      case "timeseries-shell":
        return ensureTimeseriesShell(deferred);
      case "settings":
        return ensureSettingsPanel(deferred);
      case "commands":
        return ensureCommands(deferred);
      default:
        throw new Error(`Unknown deferred subsystem: ${name}`);
    }
  };
}

function showPage(pageName) {
  document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`)?.click?.();
}

function isTypingTarget$1(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
function currentPageName$1() {
  return document.querySelector(".page[data-page-name]:not([hidden])")?.dataset?.pageName || "upload";
}
async function waitForEdatimeKey(key, options = {}) {
  const win = window;
  const timeoutMs = options.timeoutMs ?? 250;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (win.__edatime && key in win.__edatime) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function matchesShortcut(key, options, def, pageName) {
  return def.key.toLowerCase() === key.toLowerCase() && Boolean(def.alt) === Boolean(options.alt) && Boolean(def.shift) === Boolean(options.shift) && (!def.page || def.page === pageName);
}
function initGlobalShortcuts(deps, commandDefs) {
  const win = window;
  if (win.__edatime?.globalShortcutsBound) return;
  if (!win.__edatime) win.__edatime = {};
  const handler = (event) => {
    if (event.defaultPrevented || isTypingTarget$1(event.target)) return;
    const key = String(event.key || "").toLowerCase();
    const pageName = currentPageName$1();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      if (key === "k") {
        event.preventDefault();
        void (async () => {
          await waitForEdatimeKey("ensureSubsystem");
          await win.__edatime?.ensureSubsystem?.("commands");
          win.__edatime?.openPalette?.();
        })();
        return;
      }
      if (key === ",") {
        event.preventDefault();
        void (async () => {
          await waitForEdatimeKey("ensureSubsystem");
          await win.__edatime?.ensureSubsystem?.("settings");
          win.__edatime?.openSettingsModal?.();
        })();
        return;
      }
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const match = commandDefs.find(
        (def) => def.keyboard && matchesShortcut(key, { alt: true, shift: false }, def.keyboard, pageName)
      );
      if (match) {
        event.preventDefault();
        match.action(deps);
        return;
      }
    }
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = commandDefs.find(
        (def) => def.keyboard && matchesShortcut(key, { alt: false, shift: true }, def.keyboard, pageName)
      );
      if (match) {
        event.preventDefault();
        match.action(deps);
        return;
      }
    }
  };
  window.addEventListener("keydown", handler);
  deps.registerCleanup(() => window.removeEventListener("keydown", handler));
  win.__edatime.globalShortcutsBound = true;
}

function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
function currentPageName() {
  return document.querySelector(".page[data-page-name]:not([hidden])")?.dataset?.pageName || "upload";
}
function initTimeseriesShortcuts(deps) {
  const win = window;
  if (win.__edatime?.timeseriesShortcutsBound) return;
  if (!win.__edatime) win.__edatime = {};
  const onKeydown = (event) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const key = String(event.key || "").toLowerCase();
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "r" && currentPageName() === "timeseries") {
      event.preventDefault();
      deps.resetZoom();
      void deps.fetchAndRender();
      return;
    }
    if (key === "z" && currentPageName() === "timeseries") {
      event.preventDefault();
      deps.zoomOut();
      void deps.fetchAndRender();
      return;
    }
    if (key === "c" && currentPageName() === "timeseries") {
      event.preventDefault();
      document.getElementById("adaptive-clear-btn")?.click?.();
      return;
    }
    if (key === "p") {
      event.preventDefault();
      deps.chartExportPng();
      return;
    }
    if (key === "e") {
      event.preventDefault();
      if (currentPageName() === "scatter") {
        document.getElementById("scatter-export-csv-btn")?.click?.();
      } else {
        deps.exportFilteredCsv();
      }
      return;
    }
  };
  win.addEventListener("keydown", onKeydown);
  deps.registerCleanup(() => win.removeEventListener("keydown", onKeydown));
  win.__edatime.timeseriesShortcutsBound = true;
}

function createAppRuntime() {
  const cleanups = /* @__PURE__ */ new Set();
  let disposed = false;
  return {
    registerCleanup(fn) {
      if (disposed) return () => {
      };
      cleanups.add(fn);
      return () => cleanups.delete(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fn of cleanups) fn();
      cleanups.clear();
    }
  };
}

function exportChartFilteredData(format) {
  window.__edatime?.exportChartFilteredData?.(format);
}
function triggerAdaptiveFilterClear() {
  document.getElementById("adaptive-clear-btn")?.click?.();
}
async function ensureSubsystem(name) {
  await window.__edatime?.ensureSubsystem?.(name);
}
const APP_COMMAND_DEFINITIONS = [
  { id: "nav-upload", label: "Go to Upload", shortcut: "Alt+1", category: "Navigation", action: (deps) => deps.showPage("upload"), keyboard: { key: "1", alt: true } },
  { id: "nav-timeseries", label: "Go to Timeseries", shortcut: "Alt+2", category: "Navigation", action: (deps) => deps.showPage("timeseries"), keyboard: { key: "2", alt: true } },
  { id: "nav-scatter", label: "Go to Scatter", shortcut: "Alt+3", category: "Navigation", action: (deps) => deps.showPage("scatter"), keyboard: { key: "3", alt: true } },
  { id: "nav-matrix", label: "Go to Scatter Matrix", shortcut: "Alt+4", category: "Navigation", action: (deps) => deps.showPage("scattermatrix"), keyboard: { key: "4", alt: true } },
  { id: "nav-fft", label: "Go to FFT / PSD", shortcut: "Alt+6", category: "Navigation", action: (deps) => deps.showPage("fft"), keyboard: { key: "6", alt: true } },
  { id: "nav-heatmap", label: "Go to Heatmap", shortcut: "Alt+7", category: "Navigation", action: (deps) => deps.showPage("heatmap"), keyboard: { key: "7", alt: true } },
  { id: "nav-spectrogram", label: "Go to Spectrogram", shortcut: "Alt+8", category: "Navigation", action: (deps) => deps.showPage("spectrogram"), keyboard: { key: "8", alt: true } },
  { id: "nav-causal", label: "Go to Causal", shortcut: "Alt+9", category: "Navigation", action: (deps) => deps.showPage("causal"), keyboard: { key: "9", alt: true } },
  { id: "nav-drift", label: "Go to Drift Analysis", shortcut: "Alt+0", category: "Navigation", action: (deps) => deps.showPage("drift"), keyboard: { key: "0", alt: true } },
  { id: "chart-reset", label: "Reset zoom", shortcut: "Shift+R", category: "Chart", action: (deps) => deps.resetZoom(), keyboard: { key: "r", shift: true, page: "timeseries" } },
  { id: "chart-zoomout", label: "Zoom out one level", shortcut: "Shift+Z", category: "Chart", action: (deps) => deps.zoomOut(), keyboard: { key: "z", shift: true, page: "timeseries" } },
  { id: "chart-clear-af", label: "Clear adaptive filters", shortcut: "Shift+C", category: "Chart", action: () => triggerAdaptiveFilterClear(), keyboard: { key: "c", shift: true, page: "timeseries" } },
  { id: "export-csv", label: "Export chart data as CSV", shortcut: "Shift+E", category: "Export", action: () => exportChartFilteredData("csv") },
  { id: "export-json", label: "Export chart data as JSON", category: "Export", action: () => exportChartFilteredData("json") },
  { id: "export-png", label: "Export chart as PNG", category: "Export", action: () => window.__edatime?.chart?.exportPNG?.() },
  { id: "export-parquet", label: "Export filtered data as Parquet", category: "Export", action: () => document.getElementById("export-parquet-btn")?.click?.() },
  {
    id: "session-save",
    label: "Export session to file",
    category: "Session",
    action: async () => {
      const { exportSessionToFile } = await __vitePreload(async () => { const { exportSessionToFile } = await Promise.resolve().then(() => session);return { exportSessionToFile }},true              ?void 0:void 0);
      exportSessionToFile();
    }
  },
  {
    id: "session-load",
    label: "Import session from file",
    category: "Session",
    action: async () => {
      const { importSessionFromFile } = await __vitePreload(async () => { const { importSessionFromFile } = await Promise.resolve().then(() => session);return { importSessionFromFile }},true              ?void 0:void 0);
      importSessionFromFile();
    }
  },
  {
    id: "provenance",
    label: "Show analysis context panel",
    shortcut: "Ctrl+I",
    category: "Analysis",
    action: async () => {
      await ensureSubsystem("timeseries-shell");
      const { toggleProvenance } = await __vitePreload(async () => { const { toggleProvenance } = await import('./assets/provenance-DqeiL9fi.js');return { toggleProvenance }},true              ?__vite__mapDeps([12,1]):void 0);
      toggleProvenance();
    }
  },
  {
    id: "cmd-palette",
    label: "Open command palette",
    shortcut: "Ctrl+K",
    category: "Analysis",
    action: async () => {
      await ensureSubsystem("commands");
      window.__edatime?.openPalette?.();
    }
  },
  {
    id: "settings",
    label: "Open settings",
    shortcut: "Ctrl+,",
    category: "Analysis",
    action: async () => {
      await ensureSubsystem("settings");
      window.__edatime?.openSettingsModal?.();
    }
  },
  {
    id: "workflow-enable",
    label: "Enable guided workflow",
    category: "Analysis",
    action: async () => {
      await ensureSubsystem("timeseries-shell");
      const { enableGuidedWorkflow } = await __vitePreload(async () => { const { enableGuidedWorkflow } = await import('./assets/guidedWorkflow-DrvIK14h.js');return { enableGuidedWorkflow }},true              ?__vite__mapDeps([8,1]):void 0);
      enableGuidedWorkflow();
    }
  },
  {
    id: "workflow-disable",
    label: "Hide guided workflow",
    category: "Analysis",
    action: async () => {
      await ensureSubsystem("timeseries-shell");
      const { disableGuidedWorkflow } = await __vitePreload(async () => { const { disableGuidedWorkflow } = await import('./assets/guidedWorkflow-DrvIK14h.js');return { disableGuidedWorkflow }},true              ?__vite__mapDeps([8,1]):void 0);
      disableGuidedWorkflow();
    }
  },
  {
    id: "workflow-next",
    label: "Go to next guided step",
    category: "Analysis",
    action: async () => {
      await ensureSubsystem("timeseries-shell");
      const { goToNextGuidedStep } = await __vitePreload(async () => { const { goToNextGuidedStep } = await import('./assets/guidedWorkflow-DrvIK14h.js');return { goToNextGuidedStep }},true              ?__vite__mapDeps([8,1]):void 0);
      goToNextGuidedStep();
    }
  }
];
function buildPaletteCommands(deps) {
  return APP_COMMAND_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    shortcut: definition.shortcut,
    category: definition.category,
    action: () => definition.action(deps)
  }));
}
async function registerAppCommands(deps) {
  const { registerCommands } = await __vitePreload(async () => { const { registerCommands } = await import('./assets/palette-DWW2h0SW.js');return { registerCommands }},true              ?[]:void 0);
  registerCommands(buildPaletteCommands(deps));
}

const commands = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  APP_COMMAND_DEFINITIONS,
  buildPaletteCommands,
  registerAppCommands
}, Symbol.toStringTag, { value: 'Module' }));

const loaded = /* @__PURE__ */ new Set();
const pages = /* @__PURE__ */ new Map();
let metadataReady = false;
let releaseMetadata = null;
const metadataPromise = new Promise((resolve) => {
  releaseMetadata = resolve;
});
function register(name, page) {
  pages.set(name, page);
}
async function ensurePageModuleLoaded(name) {
  if (loaded.has(name)) return;
  const page = pages.get(name);
  if (!page) return;
  if (page.requiresMetadata && !metadataReady) await metadataPromise;
  try {
    await page.init();
  } catch (error) {
    console.error(`[EdaTime] Failed to initialize page "${name}":`, error);
    throw error;
  }
  loaded.add(name);
}
function markMetadataReady() {
  metadataReady = true;
  releaseMetadata?.();
}
function isMetadataReady() {
  return metadataReady;
}
function clearLoadedPageModules() {
  loaded.clear();
}

const PAGE_DESCRIPTORS = [
  {
    name: "fft",
    requiresMetadata: true,
    async load(deps) {
      const { createFftEntrypoint } = await __vitePreload(async () => { const { createFftEntrypoint } = await import('./assets/entrypoint-BYRIrjmw.js');return { createFftEntrypoint }},true              ?__vite__mapDeps([15,1]):void 0);
      return createFftEntrypoint({ getRenderTimeseries: deps.getRenderTimeseries });
    }
  },
  {
    name: "heatmap",
    requiresMetadata: true,
    async load(deps) {
      const { createHeatmapEntrypoint } = await __vitePreload(async () => { const { createHeatmapEntrypoint } = await import('./assets/entrypoint-dTMnAKT3.js');return { createHeatmapEntrypoint }},true              ?__vite__mapDeps([16,1]):void 0);
      return createHeatmapEntrypoint({ showPage: deps.showPage });
    }
  },
  {
    name: "scatter",
    requiresMetadata: true,
    // Page-owned stylesheet is preloaded alongside the descriptor to avoid
    // an unsightly flash of unstyled content on first navigation.
    cssModules: ["scatter"],
    async load(deps) {
      const { createScatterEntrypoint } = await __vitePreload(async () => { const { createScatterEntrypoint } = await import('./assets/entrypoint-BwJvGCgY.js');return { createScatterEntrypoint }},true              ?__vite__mapDeps([17,1]):void 0);
      return createScatterEntrypoint({
        getMetadata: () => deps.getMetadata()
      });
    }
  },
  {
    name: "spectrogram",
    requiresMetadata: true,
    async load(deps) {
      const { createSpectrogramEntrypoint } = await __vitePreload(async () => { const { createSpectrogramEntrypoint } = await import('./assets/entrypoint-DTDRo2pI.js');return { createSpectrogramEntrypoint }},true              ?__vite__mapDeps([18,1]):void 0);
      return createSpectrogramEntrypoint({ setLoading: deps.setLoading });
    }
  },
  {
    name: "causal",
    requiresMetadata: true,
    async load(deps) {
      const { createCausalEntrypoint } = await __vitePreload(async () => { const { createCausalEntrypoint } = await import('./assets/entrypoint-B56bGrdp.js');return { createCausalEntrypoint }},true              ?__vite__mapDeps([19,1]):void 0);
      return createCausalEntrypoint({
        getMetadata: deps.getMetadata,
        chipColor: deps.chipColor,
        numericColumns: deps.numericColumns,
        setLoading: deps.setLoading
      });
    }
  },
  {
    name: "drift",
    requiresMetadata: true,
    cssModules: ["drift"],
    async load(deps) {
      const { createDriftEntrypoint } = await __vitePreload(async () => { const { createDriftEntrypoint } = await import('./assets/entrypoint-DGW9Cq96.js');return { createDriftEntrypoint }},true              ?__vite__mapDeps([20,1]):void 0);
      return createDriftEntrypoint({
        initDriftPage: deps.initDriftPage,
        getMetadata: () => deps.getMetadata()
      });
    }
  }
];
async function loadPageDescriptors(deps) {
  for (const descriptor of PAGE_DESCRIPTORS) {
    register(descriptor.name, {
      requiresMetadata: descriptor.requiresMetadata,
      init: async () => {
        if (descriptor.cssModules?.length) {
          const { ensureStyleModule } = await __vitePreload(async () => { const { ensureStyleModule } = await Promise.resolve().then(() => pageStyles);return { ensureStyleModule }},true              ?void 0:void 0);
          for (const moduleName of descriptor.cssModules) {
            ensureStyleModule(moduleName);
          }
        }
        const entry = await descriptor.load(deps);
        await entry.init();
      }
    });
  }
}

const _registry = /* @__PURE__ */ new Map();
function registerChartType(name, adapter) {
  if (!name || typeof adapter?.create !== "function") {
    throw new Error(`Invalid chart adapter for "${name}"`);
  }
  _registry.set(name, adapter);
}
function getChartType(name) {
  return _registry.get(name);
}

class FallbackChart {
  containerId;
  canvas = null;
  ctx = null;
  resizeObserver = null;
  constructor(containerId) {
    this.containerId = containerId;
  }
  async init() {
    const container = document.getElementById(this.containerId);
    if (!container) throw new Error("Fallback chart container not found");
    container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      this.canvas.width = w;
      this.canvas.height = h;
    };
    resize();
    this.resizeObserver = new ResizeObserver(() => resize());
    this.resizeObserver.observe(container);
  }
  setXRange() {
  }
  setYRange() {
  }
  supportsZoomControls() {
    return false;
  }
  onCrosshairMove() {
  }
  onClick() {
  }
  setChartText() {
  }
  setDrawMode() {
  }
  clearDrawings() {
  }
  fitYToData() {
  }
  getXDomain() {
    return null;
  }
  getYRange() {
    return null;
  }
  exportPNG() {
  }
  exportSVG() {
  }
  exportHTML() {
  }
  updateDataMulti(dataObj, columns) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const pad = 28;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#080a10";
    ctx.fillRect(0, 0, width, height);
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    const seriesToDraw = [];
    for (const col of columns) {
      const seriesData = dataObj.series?.[col];
      const xs = seriesData?.x || dataObj.ts;
      const ys = seriesData?.y || dataObj.values?.[col];
      if (!xs || !ys || ys.length === 0) continue;
      seriesToDraw.push({ col, xs, ys });
      for (let i = 0; i < xs.length; i++) {
        const x = Number(xs[i]);
        const y = Number(ys[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
    if (seriesToDraw.length === 0 || !Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      ctx.fillStyle = "#7a86a4";
      ctx.font = "12px sans-serif";
      ctx.fillText("No data to display", pad, pad + 2);
      return;
    }
    if (xMax === xMin) xMax = xMin + 1;
    if (yMax === yMin) yMax = yMin + 1;
    ctx.strokeStyle = "#272d45";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(width - pad, height - pad);
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, height - pad);
    ctx.stroke();
    for (let s = 0; s < seriesToDraw.length; s++) {
      const { xs, ys } = seriesToDraw[s];
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = SERIES_COLORS[s % SERIES_COLORS.length];
      let started = false;
      for (let i = 0; i < xs.length; i++) {
        const x = Number(xs[i]);
        const y = Number(ys[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = pad + (x - xMin) / (xMax - xMin) * (width - 2 * pad);
        const py = height - pad - (y - yMin) / (yMax - yMin) * (height - 2 * pad);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }
  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.ctx = null;
    this.canvas = null;
  }
}

let modules = null;
let pending = null;
async function ensureChartModules$1() {
  if (modules) return modules;
  if (pending) return pending;
  pending = (async () => {
    const [dataClient, chartModule] = await Promise.all([
      __vitePreload(() => import('./assets/index-BEKhL0N1.js'),true              ?__vite__mapDeps([21,5,22,23,11,4,1]):void 0),
      __vitePreload(() => import('./assets/DataChart-CkLj_s8t.js'),true              ?__vite__mapDeps([24,25,1,26]):void 0)
    ]);
    const result = {
      fetchMetadata: dataClient.fetchMetadata,
      fetchData: dataClient.fetchData,
      fetchAnomalies: dataClient.fetchAnomalies,
      postTransform: dataClient.postTransform,
      DataChartCtor: chartModule.DataChart
    };
    const { DataChartCtor } = result;
    registerChartType("line", {
      label: "Line",
      create: (containerId, callbacks) => {
        if (!DataChartCtor) throw new Error("DataChart module not loaded");
        const cb = callbacks;
        return new DataChartCtor(
          containerId,
          cb.onZoom ?? null,
          cb.onYRange ?? null,
          cb.onZoomOut ?? null
        );
      }
    });
    registerChartType("fallback", {
      label: "Fallback (Canvas 2D)",
      create: (containerId) => new FallbackChart(containerId)
    });
    modules = result;
    return result;
  })();
  return pending;
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

function createRequestTask(options) {
  let controller = null;
  return {
    /**
     * Returns the AbortSignal for the current (or latest) request.
     * Returns a never-aborted signal if no request has been started yet.
     */
    getSignal() {
      if (!controller) {
        const alwaysPass = new AbortController();
        return alwaysPass.signal;
      }
      return controller.signal;
    },
    /**
     * Starts a new request, aborting any previous one first.
     *
     * @param fn - async function that receives the AbortSignal and performs the work.
     *   The function should throw AbortError (or any error whose `name === 'AbortError'`)
     *   when the signal is aborted, so that the helper can distinguish deliberate
     *   cancellation from genuine failures.
     */
    async run(fn) {
      if (controller) controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      options.setLoading(true);
      try {
        await fn(signal);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        options.onError(message);
      } finally {
        options.setLoading(false);
      }
    },
    /**
     * Aborts the current in-flight request, if any.
     */
    cancel() {
      if (controller) controller.abort();
    }
  };
}

const EMPTY_TIMESERIES_DATA = { ts: [], values: {}, series: {}, colorByColumn: {} };
let timeseriesEmptyStateController = null;
function getTimeseriesEmptyStateController() {
  if (!timeseriesEmptyStateController) {
    timeseriesEmptyStateController = createEmptyStateController({
      rootId: "timeseries-empty-state",
      titleId: "timeseries-empty-title",
      messageId: "timeseries-empty-message",
      resetButtonId: "timeseries-reset-range-btn",
      resetEventName: "edatime:request-chart-range-reset",
      eventSource: "timeseries-empty-state"
    });
  }
  return timeseriesEmptyStateController;
}
function computeRenderedYDebugSnapshot() {
  if (!appStateComposite.lastFetchedData) return null;
  const filtered = applyColumnRanges(appStateComposite.lastFetchedData);
  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;
  const perSeries = [];
  for (const col of appStateComposite.selectedCols || []) {
    const seriesData = filtered.series?.[col];
    const yValues = seriesData ? seriesData.y : filtered.values?.[col];
    if (!yValues) continue;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (let i = 0; i < yValues.length; i++) {
      const y = Number(yValues[i]);
      if (!Number.isFinite(y)) continue;
      count += 1;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    if (count > 0) {
      if (min < globalMin) globalMin = min;
      if (max > globalMax) globalMax = max;
    }
    perSeries.push({ name: col, points: count, yMin: count > 0 ? min : null, yMax: count > 0 ? max : null });
  }
  return {
    selectedCols: [...appStateComposite.selectedCols || []],
    globalYMin: Number.isFinite(globalMin) ? globalMin : null,
    globalYMax: Number.isFinite(globalMax) ? globalMax : null,
    perSeries
  };
}
function createTimeseriesPageController(deps) {
  const uploadButton = document.getElementById("timeseries-empty-upload-btn");
  if (uploadButton) {
    uploadButton.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("edatime:page-change", { detail: { page: "upload" } }));
    });
  }
  const task = createRequestTask({
    setLoading: (loading) => {
      const loadingEl = document.getElementById("main-chart-loading");
      if (loadingEl) loadingEl.hidden = !loading;
    },
    onError: (message) => {
      console.error("Failed to fetch data:", message);
    }
  });
  function emitChartRangeChange(sourceKind = "data") {
    if (!Number.isFinite(appStateComposite.currentStart) || !Number.isFinite(appStateComposite.currentEnd)) return;
    window.dispatchEvent(new CustomEvent("edatime:chart-range-change", {
      detail: { start: appStateComposite.currentStart, end: appStateComposite.currentEnd, source: sourceKind }
    }));
  }
  function renderCurrentData() {
    const emptyState = getTimeseriesEmptyStateController();
    const hasSelection = Array.isArray(appStateComposite.selectedCols) && appStateComposite.selectedCols.length > 0;
    if (!hasSelection) {
      emptyState.update({
        visible: true,
        reason: "no-columns-selected",
        title: "Select one or more series",
        message: "Click a column chip above to add it to the chart. Start with 2-3 related columns for a clearer first view.",
        showResetAction: false
      });
    }
    if (!appStateComposite.chart) return;
    if (!hasSelection) {
      setRollingBands(null);
      appStateComposite.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
      return;
    }
    if (!appStateComposite.lastFetchedData) {
      emptyState.update({ visible: false, reason: "", title: "", message: "", showResetAction: false });
      return;
    }
    const filtered = applyColumnRanges(appStateComposite.lastFetchedData);
    const hasPoints = !!filtered?.ts && filtered.ts.length > 0;
    if (!hasPoints) {
      const start = Number(appStateComposite.currentStart);
      const end = Number(appStateComposite.currentEnd);
      const rangeOutside = isRangeOutsideDataset(appStateComposite.metadata?.time_range, start, end);
      emptyState.update({
        visible: true,
        reason: rangeOutside ? "linked-range-outside-dataset" : "no-data-after-filters",
        title: rangeOutside ? "Current range is outside this dataset" : "No points match current filters",
        message: rangeOutside ? "Reset to dataset range to recover visible data." : "Try widening the time range or clearing filters.",
        showResetAction: true
      });
      setRollingBands(null);
      appStateComposite.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        appStateComposite.chart.setXRange(start, end);
      }
      return;
    }
    emptyState.update({ visible: false, reason: "", title: "", message: "", showResetAction: false });
    const preview = appStateComposite.spectralFilterPreview;
    let displayCols = [...appStateComposite.selectedCols];
    if (preview && preview.ts && preview.values && preview.ts.length > 0) {
      const previewKey = `${preview.column} [filtered]`;
      filtered.series = filtered.series || {};
      filtered.series[previewKey] = { x: preview.ts, y: preview.values };
      if (!displayCols.includes(previewKey)) displayCols = [...displayCols, previewKey];
    }
    appStateComposite.chart.updateDataMulti(filtered, displayCols);
    if (appStateComposite.pendingRestoreY && appStateComposite.pendingYMode === "restore") {
      const savedY = appStateComposite.pendingRestoreY;
      appStateComposite.chart.setYRange(savedY.min, savedY.max);
    }
    if (appStateComposite.rollingEnabled) {
      setRollingBands(computeFrontendRollingBands(filtered, appStateComposite.selectedCols, appStateComposite.rollingWindow || 50));
      appStateComposite.chart?.requestOverlayRender?.();
    }
    window.dispatchEvent(new CustomEvent("edatime:workflow-refresh"));
    announceDataUpdate("timeseries");
  }
  async function fetchAndRender() {
    sanitizeSelectedColumns$1();
    if (!Number.isFinite(appStateComposite.currentStart) || !Number.isFinite(appStateComposite.currentEnd)) return;
    const currentStart = Number(appStateComposite.currentStart);
    const currentEnd = Number(appStateComposite.currentEnd);
    if (currentStart >= currentEnd) return;
    if (!Array.isArray(appStateComposite.selectedCols) || appStateComposite.selectedCols.length === 0) {
      deps.buildRangeControls();
      renderCurrentData();
      return;
    }
    await task.run(async (signal) => {
      const startIso = new Date(currentStart).toISOString();
      const endIso = new Date(currentEnd).toISOString();
      const width = document.getElementById("main-chart")?.clientWidth || 1200;
      const cols = appStateComposite.selectedCols.join(",");
      const colorCol = appStateComposite.selectedColorColumn || null;
      announceChartLoading(appStateComposite.selectedCols || []);
      dbgGroup("fetchAndRender", () => {
        dbg("request", { startIso, endIso, width, cols, colorCol });
        dbg("selectedCols", appStateComposite.selectedCols);
        dbg("selectedColorColumn", appStateComposite.selectedColorColumn);
      });
      const data = await deps.fetchData(startIso, endIso, width, cols, colorCol, signal);
      setLastFetchedData(data);
      if (DEBUG) {
        const n = data?.ts?.length ?? 0;
        let tsMin = null;
        let tsMax = null;
        if (n > 0) {
          tsMin = data.ts[0];
          tsMax = data.ts[n - 1];
        }
        dbg("response points", n, "tsMin/tsMax", tsMin, tsMax);
        if (!data?.ts || data.ts.length === 0) {
          console.warn("[edatime] fetchAndRender: empty result for range", { startIso, endIso, width, cols });
        }
      }
      ensureRangeStateFromData(data);
      deps.buildRangeControls();
      appStateComposite.chart?.setXRange?.(currentStart, currentEnd);
      renderCurrentData();
      emitChartRangeChange("data");
      if (appStateComposite.anomalyEnabled) {
        deps.fetchAndRenderAnalytics().catch(() => {
        });
      }
      if (DEBUG) {
        const snapshot = computeRenderedYDebugSnapshot();
        window.__edatime.debugYSnapshot = snapshot;
        dbg("post-render renderedSnapshot", snapshot);
      }
      const yr = appStateComposite.chart?.getYRange?.();
      if (yr) deps.updateAnalysisYRange(yr.min, yr.max, "data");
      if (DEBUG) dbg("post-render yRange", yr);
      setPendingYMode(null);
      setPendingRestoreY(null);
    });
  }
  function onZoomRangeChange(view, sourceKind = "user") {
    if (appStateComposite.fetchDebounceId) clearTimeout(appStateComposite.fetchDebounceId);
    dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
      dbg("prev", { start: appStateComposite.currentStart, end: appStateComposite.currentEnd });
      dbg("next", view);
    });
    const newStart = Number(view.xMin);
    const newEnd = Number(view.xMax);
    if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;
    const snap = deps.getCurrentView();
    setZoomHistory([...appStateComposite.zoomHistory, snap].slice(-5));
    setViewport(newStart, newEnd);
    appStateComposite.chart?.setXRange?.(newStart, newEnd);
    if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax > view.yMin) {
      appStateComposite.chart?.setYRange?.(view.yMin, view.yMax);
      setPendingYMode("restore");
      setPendingRestoreY({ min: view.yMin, max: view.yMax });
    } else {
      setPendingYMode("fit");
      setPendingRestoreY(null);
    }
    deps.updateAnalysisZoom(newStart, newEnd, sourceKind);
    emitChartRangeChange(sourceKind);
    if (!appStateComposite.refetchOnZoom) return;
    setFetchDebounceId(setTimeout(fetchAndRender, 150));
  }
  return {
    emitChartRangeChange,
    fetchAndRender,
    onZoomRangeChange,
    renderCurrentData
  };
}

function Button(props) {
  const button = document.createElement("button");
  button.type = props.type ?? "button";
  button.textContent = props.label;
  if (props.className) button.className = props.className;
  if (props.disabled != null) button.disabled = props.disabled;
  if (props.onClick) button.addEventListener("click", props.onClick);
  return button;
}

function ColorInput(props) {
  const input = document.createElement("input");
  input.type = "color";
  if (props.id) input.id = props.id;
  input.setAttribute("aria-label", props.label);
  input.title = props.label;
  input.value = props.value;
  if (props.className) input.className = props.className;
  if (props.onInput) input.addEventListener("input", (event) => props.onInput?.(input.value, event));
  return input;
}

function TextInput(props) {
  const input = document.createElement("input");
  input.type = "text";
  if (props.id) input.id = props.id;
  input.setAttribute("aria-label", props.label);
  input.value = props.value ?? "";
  if (props.placeholder) input.placeholder = props.placeholder;
  if (props.className) input.className = props.className;
  if (props.onInput) input.addEventListener("input", (event) => props.onInput?.(input.value, event));
  return input;
}

function ModalFrame(props) {
  const modal = document.createElement("div");
  if (props.id) modal.id = props.id;
  modal.className = "modal-frame";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = props.title;
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => props.onClose?.());
  header.append(title, close);
  const body = document.createElement("div");
  body.className = "modal-frame__body";
  modal.append(header, body);
  return modal;
}

function ColumnFilterModal(props) {
  if (props.bind) {
    return bindColumnFilterModal(props.bind, props);
  }
  return createColumnFilterModal(props);
}
function createColumnFilterModal(props) {
  const modal = ModalFrame({ title: `Filter ${props.column}`, onClose: props.onCancel });
  const body = modal.querySelector(".modal-frame__body");
  const from = TextInput({ label: `${props.column} minimum`, value: props.from });
  const to = TextInput({ label: `${props.column} maximum`, value: props.to });
  const apply = Button({
    label: "Apply",
    className: "primary",
    onClick: () => props.onApply(from.value, to.value)
  });
  const cancel = Button({ label: "Cancel", onClick: () => props.onCancel?.() });
  body.append(from, to, apply, cancel);
  return modal;
}
function bindColumnFilterModal(b, props) {
  const { root, applyBtn, cancelBtn, closeBtn, minInput, maxInput } = b;
  applyBtn.addEventListener("click", () => {
    props.onApply(minInput.value, maxInput.value);
  });
  cancelBtn.addEventListener("click", () => props.onCancel?.());
  closeBtn.addEventListener("click", () => props.onCancel?.());
  root.addEventListener("click", (event) => {
    if (event.target === root) props.onCancel?.();
  });
  const escapeHandler = (e) => {
    if (!root.hidden && e.key === "Escape") props.onCancel?.();
  };
  document.addEventListener("keydown", escapeHandler);
  return root;
}

function createDotsSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const circles = [
    { cx: "8", cy: "3", r: "1.5" },
    { cx: "8", cy: "8", r: "1.5" },
    { cx: "8", cy: "13", r: "1.5" }
  ];
  for (const c of circles) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", c.cx);
    circle.setAttribute("cy", c.cy);
    circle.setAttribute("r", c.r);
    svg.appendChild(circle);
  }
  return svg;
}
function SeriesChip(props) {
  const chip = document.createElement("label");
  chip.className = `series-chip${props.checked ? " active" : ""}${props.adaptiveTarget ? " adaptive-target" : ""}${props.disabled ? " disabled" : ""}`;
  chip.style.setProperty("--chip-accent", props.color);
  chip.dataset.col = props.column;
  if (props.title) chip.title = props.title;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = props.checked;
  checkbox.value = props.column;
  checkbox.disabled = props.disabled ?? false;
  checkbox.setAttribute("aria-label", `Toggle ${props.column} series`);
  checkbox.addEventListener("change", () => {
    props.onToggle?.(checkbox.checked);
    chip.classList.toggle("active", checkbox.checked);
  });
  const displayLabel = props.label ?? props.column;
  const colorInput = ColorInput({
    label: `Set ${displayLabel} color`,
    value: props.color,
    className: "chip-color-picker",
    onInput: props.onColorInput
  });
  const labelSpan = document.createElement("span");
  labelSpan.className = "chip-label";
  labelSpan.textContent = displayLabel;
  chip.append(checkbox, colorInput, labelSpan);
  if (props.onMenuClick) {
    const menu = document.createElement("button");
    menu.type = "button";
    menu.className = "chip-menu-btn";
    menu.setAttribute("aria-label", props.menuLabel ?? `Menu for ${displayLabel}`);
    menu.title = props.menuLabel ?? `Menu for ${displayLabel}`;
    menu.appendChild(createDotsSvg());
    menu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      props.onMenuClick?.();
    });
    chip.append(menu);
  }
  return chip;
}

function ensureChipKeyboardBinding(container) {
  const existingCleanup = container.__chipKeyboardCleanup;
  if (typeof existingCleanup === "function") return;
  container.__chipKeyboardCleanup = bindSeriesChipKeyboard(container);
}
function applyChipExtras(chip, item, extras) {
  if (extras.postChipAttributes) {
    for (const [attr, val] of Object.entries(extras.postChipAttributes)) {
      chip.setAttribute(attr, val);
    }
  }
  if (extras.postChipClass) {
    const cls = extras.postChipClass(item);
    if (cls) chip.classList.add(cls);
  }
}
function renderSeriesChipList(options) {
  const { container, items, chipClass, onColorUpdate, postChipAttributes, postChipClass, preserveExisting } = options;
  if (preserveExisting) {
    ensureChipKeyboardBinding(container);
    updateSeriesChipList({ container, items, chipClass, onColorUpdate, postChipAttributes, postChipClass });
    return;
  }
  container.innerHTML = "";
  const prevCleanup = container.__chipKeyboardCleanup;
  if (typeof prevCleanup === "function") prevCleanup();
  delete container.__chipKeyboardCleanup;
  ensureChipKeyboardBinding(container);
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const chip = SeriesChip({
      column: item.column,
      label: item.label,
      checked: item.checked,
      color: item.color,
      disabled: item.disabled,
      adaptiveTarget: item.adaptiveTarget,
      title: item.title,
      onToggle: (checked) => item.onToggle(checked, item.column),
      onColorInput: (color) => {
        item.onColorInput?.(color, item.column);
        onColorUpdate?.(item.column, color);
      },
      onMenuClick: item.onMenuClick ? () => item.onMenuClick(item.column) : void 0,
      menuLabel: item.menuLabel
    });
    chip.classList.add(chipClass ?? "");
    applyChipExtras(chip, item, { postChipAttributes, postChipClass });
    fragment.appendChild(chip);
  }
  container.appendChild(fragment);
}
function updateSeriesChipList(options) {
  const { container, items, chipClass, onColorUpdate, postChipAttributes, postChipClass } = options;
  const existing = /* @__PURE__ */ new Map();
  for (const el of container.querySelectorAll("[data-col]")) {
    const col = el.dataset.col;
    if (col !== void 0) existing.set(col, el);
  }
  const newCols = new Set(items.map((i) => i.column));
  for (const [col, el] of existing.entries()) {
    if (!newCols.has(col)) el.remove();
  }
  for (const item of items) {
    let chip = existing.get(item.column);
    if (!chip) {
      chip = SeriesChip({
        column: item.column,
        label: item.label,
        checked: item.checked,
        color: item.color,
        disabled: item.disabled,
        adaptiveTarget: item.adaptiveTarget,
        title: item.title,
        onToggle: (checked) => item.onToggle(checked, item.column),
        onColorInput: (color) => {
          item.onColorInput?.(color, item.column);
          onColorUpdate?.(item.column, color);
        },
        onMenuClick: item.onMenuClick ? () => item.onMenuClick(item.column) : void 0,
        menuLabel: item.menuLabel
      });
      chip.classList.add(chipClass ?? "");
      applyChipExtras(chip, item, { postChipAttributes, postChipClass });
      container.appendChild(chip);
    } else {
      const checkbox = chip.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = item.checked;
      chip.classList.toggle("active", item.checked);
      chip.style.setProperty("--chip-accent", item.color);
    }
  }
}
function bindSeriesChipKeyboard(container) {
  const handler = (event) => {
    const chip = event.target?.closest?.(".series-chip");
    if (!chip) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const checkbox = chip.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  };
  container.addEventListener("keydown", handler);
  return () => container.removeEventListener("keydown", handler);
}

function RangeChip(props) {
  const chip = document.createElement("div");
  chip.className = props.className ?? "range-chip";
  if (props.onActivate) {
    chip.classList.add("range-chip--clickable");
    chip.setAttribute("role", "button");
    chip.tabIndex = 0;
    chip.addEventListener("click", () => props.onActivate?.(props.key));
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        props.onActivate?.(props.key);
      }
    });
  }
  if (props.ariaLabel) chip.setAttribute("aria-label", props.ariaLabel);
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = props.name;
  const range = document.createElement("span");
  range.className = "range";
  range.textContent = props.range;
  chip.append(name, range);
  return chip;
}

function RangeControls(props) {
  const root = document.createElement("div");
  root.className = "range-controls";
  for (const item of props.items) {
    const hasPerItemCallback = item.onActivate !== void 0;
    const isStatic = item.kind === "static";
    const activate = hasPerItemCallback ? (key) => item.onActivate(key) : !isStatic && props.onActivate ? () => props.onActivate(item) : void 0;
    root.appendChild(RangeChip({
      key: item.key,
      name: item.name,
      range: item.range,
      className: item.className,
      ariaLabel: item.ariaLabel,
      onActivate: activate
    }));
  }
  return root;
}

function sanitizeSelectedColumns() {
  const blockedNames = /* @__PURE__ */ new Set(["ts", "timestamp", "time"]);
  const datetimeCols = new Set(
    (appStateComposite.metadata?.columns ?? []).filter((col) => /date|time/i.test(String(col?.dtype ?? ""))).map((col) => String(col?.name ?? "").toLowerCase())
  );
  const validColNames = new Set(
    (appStateComposite.metadata?.columns ?? []).map((col) => String(col?.name ?? "").trim())
  );
  setSelectedCols(
    (appStateComposite.selectedCols ?? []).filter((col) => {
      const name = String(col ?? "").trim();
      if (!name) return false;
      const lower = name.toLowerCase();
      if (blockedNames.has(lower) || datetimeCols.has(lower)) return false;
      return validColNames.has(name);
    })
  );
}
function ensureAdaptiveTargetStillValid() {
  if (!appStateComposite.adaptiveFilterColumn) return;
  if (appStateComposite.selectedCols.includes(appStateComposite.adaptiveFilterColumn)) return;
  setAdaptiveFilterColumn(appStateComposite.selectedCols[0] ?? null);
}

let _seriesCollapsed = false;
function initSeriesCollapse() {
  const btn = document.getElementById("collapse-series-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    _seriesCollapsed = !_seriesCollapsed;
    updateCollapseButton(btn);
    applyCollapse();
  });
}
function updateCollapseButton(btn) {
  btn.title = _seriesCollapsed ? "Expand series list" : "Collapse series list";
  btn.setAttribute("aria-label", _seriesCollapsed ? "Expand series list" : "Collapse series list");
  const svg = btn.querySelector("svg");
  if (svg) {
    svg.style.transform = _seriesCollapsed ? "rotate(180deg)" : "";
  }
}
function applyCollapse() {
  const chips = document.querySelectorAll("#column-toggles .series-chip");
  const collapseThreshold = 3;
  chips.forEach((chip, i) => {
    if (!_seriesCollapsed || i < collapseThreshold) {
      chip.style.display = "";
    } else {
      chip.style.display = "none";
    }
  });
  const container = document.getElementById("column-toggles");
  if (_seriesCollapsed && container) {
    let existingBadge = container.querySelector(".collapse-badge");
    if (!existingBadge) {
      const badge2 = document.createElement("span");
      badge2.className = "collapse-badge";
      badge2.id = "series-collapse-badge";
      container.appendChild(badge2);
    }
    const badge = container.querySelector("#series-collapse-badge");
    if (badge) {
      badge.textContent = `+${chips.length - collapseThreshold} more`;
      badge.style.display = "";
    }
  } else {
    const badge = document.getElementById("series-collapse-badge");
    if (badge) badge.style.display = "none";
  }
}

let _lastContextTs = 0;
let _lastContextCol = "";
function bindChipContextMenu(container) {
  if (container.dataset.ctxBound) return;
  container.dataset.ctxBound = "1";
  container.addEventListener("contextmenu", (e) => {
    const chip = e.target?.closest?.(".series-chip");
    if (!chip) return;
    const input = chip.querySelector('input[type="checkbox"]');
    const col = input?.value;
    if (!col) return;
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    const isDoubleContext = _lastContextCol === col && now - _lastContextTs <= 450;
    _lastContextTs = now;
    _lastContextCol = col;
    if (!isDoubleContext) return;
    _lastContextTs = 0;
    _lastContextCol = "";
    const open = window.__edatime?.openFilterForCol;
    if (typeof open !== "function") return;
    open(col);
  });
}

function composeChipListItems(options) {
  const { filterText, buildRangeControlsFn, fetchAndRender, renderCurrentDataFn } = options;
  const visibleCols = appStateComposite.numericCols.filter((col) => {
    if (!filterText) return true;
    return col.toLowerCase().includes(filterText.toLowerCase());
  });
  if (visibleCols.length === 0) return [];
  return visibleCols.map((col) => {
    const colIdx = appStateComposite.numericCols.indexOf(col);
    const color = getSeriesColor(col, colIdx >= 0 ? colIdx : 0);
    const isActive = appStateComposite.selectedCols.includes(col);
    const isAdaptiveTarget = isActive && appStateComposite.adaptiveFilterColumn === col;
    const chipTitle = isAdaptiveTarget ? `Adaptive filter target: ${col}` : `Ctrl+click to target adaptive filters to ${col}`;
    return {
      column: col,
      checked: isActive,
      color,
      adaptiveTarget: isAdaptiveTarget,
      title: chipTitle,
      onToggle: (checked) => {
        if (checked) {
          if (!appStateComposite.selectedCols.includes(col)) setSelectedCols([...appStateComposite.selectedCols, col]);
        } else {
          setSelectedCols(appStateComposite.selectedCols.filter((c) => c !== col));
        }
        ensureAdaptiveTargetStillValid();
        buildRangeControlsFn();
        appStateComposite.chart?.requestOverlayRender?.();
        fetchAndRender();
      },
      onColorInput: (nextColor) => {
        const updated = setSeriesColor(col, nextColor);
        if (!updated) return;
        renderCurrentDataFn?.();
      },
      onMenuClick: () => {
        const open = window.__edatime?.openFilterForCol;
        if (typeof open === "function") open(col);
      },
      menuLabel: `Filter range for ${col}`
    };
  });
}
function bindChipCtrlClick(container, rebuildAndRender, buildRangeControlsFn, renderCurrentDataFn, fetchAndRender) {
  for (const chip of container.querySelectorAll(".series-chip")) {
    chip.addEventListener(
      "click",
      (e) => {
        if (e.target?.closest?.(".chip-color-picker")) return;
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();
        const input = chip.querySelector('input[type="checkbox"]');
        const col = input?.value;
        if (!col) return;
        const hadColumn = appStateComposite.selectedCols.includes(col);
        if (!hadColumn) setSelectedCols([...appStateComposite.selectedCols, col]);
        setAdaptiveFilterColumn(col);
        setPendingAdaptivePoint(null);
        rebuildAndRender();
        appStateComposite.chart?.requestOverlayRender?.();
        if (!hadColumn) fetchAndRender();
      },
      true
      // capture phase
    );
  }
}

function buildRangeControls() {
  const container = document.getElementById("column-range-controls");
  if (!container) return;
  container.innerHTML = "";
  const items = [];
  if (appStateComposite.adaptiveFilterColumn && appStateComposite.selectedCols.includes(appStateComposite.adaptiveFilterColumn)) {
    items.push({
      key: "adaptive-target",
      name: "Adaptive target",
      range: appStateComposite.adaptiveFilterColumn,
      kind: "static"
    });
  }
  for (const col of appStateComposite.selectedCols) {
    const range = appStateComposite.columnRanges[col];
    if (!range) continue;
    const colCopy = col;
    items.push({
      key: `col-${col}`,
      name: col,
      range: `${formatAnalysisNumber(range.from)} → ${formatAnalysisNumber(range.to)}`,
      className: "range-chip range-chip--clickable",
      kind: "column-range",
      ariaLabel: `Filter ${col}`,
      onActivate: () => {
        const fn = window.__edatime?.openFilterForCol;
        if (typeof fn === "function") fn(colCopy);
      }
    });
  }
  for (const filter of appStateComposite.adaptiveLineFilters ?? []) {
    const filterId = filter.id ?? "";
    const filterIdCopy = filterId;
    items.push({
      key: `filter-${filterId}`,
      name: `Adaptive ${filter.column}`,
      range: filter.keepAbove ? "keep above" : "keep below",
      className: "range-chip range-chip--clickable",
      kind: "filter-removal",
      ariaLabel: `Remove adaptive filter for ${filter.column}`,
      onActivate: () => {
        setAdaptiveLineFilters(
          (appStateComposite.adaptiveLineFilters ?? []).filter(
            (item) => item.id !== filterIdCopy
          )
        );
        setPendingAdaptivePoint(null);
        buildRangeControls();
        window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change"));
      }
    });
  }
  if ((appStateComposite.adaptiveLineFilters?.length ?? 0) > 0 || appStateComposite.pendingAdaptivePoint) {
    items.push({
      key: "clear-all",
      name: "Adaptive filters",
      range: "Clear all",
      className: "range-chip range-chip--clickable",
      kind: "clear-all",
      ariaLabel: "Clear adaptive filters",
      onActivate: () => {
        setAdaptiveLineFilters([]);
        setPendingAdaptivePoint(null);
        buildRangeControls();
        appStateComposite.chart?.requestOverlayRender?.();
        window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change"));
      }
    });
  }
  container.appendChild(RangeControls({ items }));
}

function initFilterModalController(deps) {
  const modal = document.getElementById("column-filter-modal");
  const closeBtn = document.getElementById("column-filter-close-btn");
  const cancelBtn = document.getElementById("column-filter-cancel-btn");
  const applyBtn = document.getElementById("column-filter-apply-btn");
  const clearBtn = document.getElementById("column-filter-clear-btn");
  const colSelect = document.getElementById("column-filter-col");
  const minInput = document.getElementById("column-filter-min");
  const maxInput = document.getElementById("column-filter-max");
  const minRangeInput = document.getElementById("column-filter-min-range");
  const maxRangeInput = document.getElementById("column-filter-max-range");
  const rangeFill = document.getElementById("column-filter-range-fill");
  const rangeMinValue = document.getElementById("column-filter-range-min-value");
  const rangeMaxValue = document.getElementById("column-filter-range-max-value");
  const hint = document.getElementById("column-filter-hint");
  const openBtn = document.getElementById("column-filter-open-btn");
  const openBtns = [openBtn].filter(Boolean);
  if (!modal || !closeBtn || !cancelBtn || !applyBtn || !clearBtn || !colSelect || !minInput || !maxInput || !minRangeInput || !maxRangeInput || !rangeFill || !rangeMinValue || !rangeMaxValue || !hint) return;
  if (modal.dataset.bound) return;
  const modalEl = modal;
  const closeButton = closeBtn;
  const cancelButton = cancelBtn;
  const applyButton = applyBtn;
  const clearButton = clearBtn;
  const columnSelect = colSelect;
  const minTextInput = minInput;
  const maxTextInput = maxInput;
  const minSliderInput = minRangeInput;
  const maxSliderInput = maxRangeInput;
  const rangeFillEl = rangeFill;
  const rangeMinValueEl = rangeMinValue;
  const rangeMaxValueEl = rangeMaxValue;
  const hintEl = hint;
  let activeBounds = null;
  function emitColumnFiltersChange() {
    window.dispatchEvent(new CustomEvent("edatime:column-filters-change"));
  }
  function setHint(text) {
    hintEl.textContent = text || "";
  }
  function formatInputValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "";
  }
  function clampToBounds(value, bounds) {
    if (!bounds || !Number.isFinite(value)) return value;
    return Math.min(bounds.max, Math.max(bounds.min, value));
  }
  function computeSliderStep(bounds) {
    if (!bounds) return 0.01;
    const span = Math.abs(bounds.max - bounds.min);
    if (!(span > 0)) return 0.01;
    return Math.max(span / 500, 0.01);
  }
  function updateRangeFill(from, to) {
    rangeMinValueEl.textContent = formatAnalysisNumber(from);
    rangeMaxValueEl.textContent = formatAnalysisNumber(to);
    if (!activeBounds) {
      rangeFillEl.style.left = "0%";
      rangeFillEl.style.width = "0%";
      return;
    }
    const span = activeBounds.max - activeBounds.min;
    if (!(span > 0)) {
      rangeFillEl.style.left = "0%";
      rangeFillEl.style.width = "100%";
      return;
    }
    const leftPct = (from - activeBounds.min) / span * 100;
    const rightPct = (to - activeBounds.min) / span * 100;
    const clampedLeft = Math.max(0, Math.min(100, leftPct));
    const clampedRight = Math.max(clampedLeft, Math.min(100, rightPct));
    rangeFillEl.style.left = `${clampedLeft}%`;
    rangeFillEl.style.width = `${Math.max(0, clampedRight - clampedLeft)}%`;
  }
  function updateSliderConfig(bounds) {
    activeBounds = bounds;
    if (!bounds) {
      minSliderInput.disabled = true;
      maxSliderInput.disabled = true;
      updateRangeFill(0, 0);
      return;
    }
    const step = computeSliderStep(bounds);
    const min = String(bounds.min);
    const max = String(bounds.max);
    const disabled = !(bounds.max > bounds.min);
    for (const input of [minSliderInput, maxSliderInput]) {
      input.min = min;
      input.max = max;
      input.step = String(step);
      input.disabled = disabled;
    }
    updateRangeFill(bounds.min, bounds.max);
  }
  function syncSliderValues(from, to) {
    minSliderInput.value = String(from);
    maxSliderInput.value = String(to);
  }
  function syncInputsFromValues(from, to) {
    minTextInput.value = formatInputValue(from);
    maxTextInput.value = formatInputValue(to);
    syncSliderValues(from, to);
    updateRangeFill(from, to);
  }
  function readInputs() {
    let from = Number.parseFloat(minTextInput.value);
    let to = Number.parseFloat(maxTextInput.value);
    if (activeBounds) {
      if (!Number.isFinite(from)) from = activeBounds.min;
      if (!Number.isFinite(to)) to = activeBounds.max;
      from = clampToBounds(from, activeBounds);
      to = clampToBounds(to, activeBounds);
    }
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    return { from, to };
  }
  function syncFromNumericInputs() {
    const { from, to } = readInputs();
    syncInputsFromValues(from, to);
  }
  function syncFromRangeInputs(changed) {
    let from = Number.parseFloat(minSliderInput.value);
    let to = Number.parseFloat(maxSliderInput.value);
    if (changed === "min" && from > to) to = from;
    if (changed === "max" && to < from) from = to;
    if (activeBounds) {
      from = clampToBounds(from, activeBounds);
      to = clampToBounds(to, activeBounds);
    }
    syncInputsFromValues(from, to);
  }
  function getFullBoundsForCol(col) {
    const rawValues = appStateComposite.lastFetchedData?.values?.[col];
    const filteredSeries = appStateComposite.lastFetchedData?.series;
    const filteredValues = filteredSeries?.[col]?.y;
    const dataBounds = computeBounds(rawValues || filteredValues || new Float64Array(0));
    if (dataBounds) return dataBounds;
    const profile = (appStateComposite.metadata?.column_profiles || []).find((item) => item?.name === col);
    const min = Number(profile?.min);
    const max = Number(profile?.max);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
    return null;
  }
  function populateColumns(selectedCol = null) {
    const cols = appStateComposite.selectedCols || [];
    if (cols.length === 0) {
      setDropdownOptions("column-filter-col", [
        { value: "", label: "No series selected" }
      ], { preferredValue: "" });
      return;
    }
    setDropdownOptions("column-filter-col", cols.map((col) => ({ value: col, label: col })), {
      preferredValue: selectedCol && cols.includes(selectedCol) ? selectedCol : cols[0] || ""
    });
  }
  function refreshInputsForCol(col) {
    if (!col) {
      minTextInput.value = "";
      maxTextInput.value = "";
      updateSliderConfig(null);
      applyButton.disabled = true;
      clearButton.disabled = true;
      setHint("Select a column to filter.");
      return;
    }
    if (!appStateComposite.lastFetchedData) {
      updateSliderConfig(null);
      applyButton.disabled = true;
      clearButton.disabled = true;
      setHint("Data not loaded yet.");
      return;
    }
    const full = getFullBoundsForCol(col);
    if (!full) {
      applyButton.disabled = true;
      clearButton.disabled = true;
      updateSliderConfig(null);
      setHint("No numeric range is available for this column.");
      return;
    }
    const cur = appStateComposite.columnRanges[col] ?? { from: full.min, to: full.max };
    updateSliderConfig(full);
    syncInputsFromValues(cur.from, cur.to);
    applyButton.disabled = false;
    clearButton.disabled = false;
    setHint(`Available range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
  }
  function openModalForCol(col) {
    populateColumns(col || getDropdownValue("column-filter-col") || appStateComposite.selectedCols?.[0] || null);
    refreshInputsForCol(getDropdownValue("column-filter-col"));
    modalEl.hidden = false;
    try {
      minTextInput.focus();
    } catch {
    }
  }
  function closeModal() {
    modalEl.hidden = true;
    setHint("");
  }
  window.__edatime = window.__edatime || {};
  window.__edatime.openFilterForCol = openModalForCol;
  for (const btn of openBtns) {
    btn.addEventListener("click", () => openModalForCol(null));
  }
  ColumnFilterModal({
    bind: {
      root: modalEl,
      applyBtn: applyButton,
      cancelBtn: cancelButton,
      closeBtn: closeButton,
      minInput: minTextInput,
      maxInput: maxTextInput,
      minRangeInput: minSliderInput,
      maxRangeInput: maxSliderInput
    },
    onApply: (from, to) => {
      const col = getDropdownValue("column-filter-col");
      if (!col) return;
      let fromNum = Number.parseFloat(from);
      let toNum = Number.parseFloat(to);
      const full = getFullBoundsForCol(col);
      if (full) {
        if (!Number.isFinite(fromNum)) fromNum = full.min;
        if (!Number.isFinite(toNum)) toNum = full.max;
      }
      if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
        setHint("Enter a valid min and max.");
        return;
      }
      if (fromNum > toNum) {
        [fromNum, toNum] = [toNum, fromNum];
      }
      appStateComposite.columnRanges[col] = { from: fromNum, to: toNum };
      buildRangeControls();
      deps.renderCurrentData();
      appStateComposite.chart?.fitYToData?.();
      const yr = appStateComposite.chart?.getYRange?.();
      if (yr) deps.updateAnalysisYRange(yr.min, yr.max, "filter");
      emitColumnFiltersChange();
      closeModal();
    },
    onCancel: closeModal
  });
  columnSelect.addEventListener("change", () => refreshInputsForCol(getDropdownValue("column-filter-col")));
  minTextInput.addEventListener("input", syncFromNumericInputs);
  maxTextInput.addEventListener("input", syncFromNumericInputs);
  minSliderInput.addEventListener("input", () => syncFromRangeInputs("min"));
  maxSliderInput.addEventListener("input", () => syncFromRangeInputs("max"));
  clearButton.addEventListener("click", () => {
    const col = getDropdownValue("column-filter-col");
    const full = getFullBoundsForCol(col);
    if (!col || !full) return;
    appStateComposite.columnRanges[col] = { from: full.min, to: full.max };
    buildRangeControls();
    deps.renderCurrentData();
    appStateComposite.chart?.fitYToData?.();
    const yr = appStateComposite.chart?.getYRange?.();
    if (yr) deps.updateAnalysisYRange(yr.min, yr.max, "filter");
    emitColumnFiltersChange();
    refreshInputsForCol(col);
  });
  modalEl.dataset.bound = "1";
}

function buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn = null) {
  const container = document.getElementById("column-toggles");
  if (!container || container?.dataset?.rebuilding) return;
  container.dataset.rebuilding = "1";
  sanitizeSelectedColumns();
  ensureAdaptiveTargetStillValid();
  container.innerHTML = "";
  const finish = () => {
    container.dataset.rebuilding = "";
  };
  bindChipContextMenu(container);
  const items = composeChipListItems({
    filterText: appStateComposite.filterText ?? "",
    buildRangeControlsFn,
    fetchAndRender,
    renderCurrentDataFn
  });
  if (items.length === 0) {
    const empty = document.createElement("span");
    empty.className = "series-empty";
    empty.textContent = "No matching columns";
    container.appendChild(empty);
    return;
  }
  renderSeriesChipList({
    container,
    items: items.map((item) => ({ ...item, onToggle: item.onToggle })),
    chipClass: "timeseries-chip",
    onColorUpdate: (col, color) => {
      const chip = container.querySelector(`[data-col="${col}"]`);
      if (chip) chip.style.setProperty("--chip-accent", color);
    }
  });
  bindChipCtrlClick(
    container,
    () => {
      buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
      buildRangeControlsFn();
    },
    buildRangeControlsFn,
    renderCurrentDataFn,
    fetchAndRender
  );
  finish();
  applyCollapse();
}
function initColumnFilterModal(renderCurrentData, updateAnalysisYRange) {
  initFilterModalController({
    renderCurrentData,
    updateAnalysisYRange
  });
}

function initDatasetSearchInputs(deps) {
  const columnFilterInput = document.getElementById("column-filter-input");
  if (columnFilterInput) {
    const onFilterInput = debounce(() => {
      setFilterText((columnFilterInput.value || "").trim().toLowerCase());
      deps.rebuildColumnToggles();
    }, 120);
    columnFilterInput.addEventListener("input", onFilterInput);
  }
  const profileFilterInput = document.getElementById("profile-filter-input");
  if (profileFilterInput) {
    const onProfileFilterInput = debounce(() => {
      setProfileFilterText((profileFilterInput.value || "").trim().toLowerCase());
      deps.renderColumnProfilesGrid(true);
    }, 120);
    profileFilterInput.addEventListener("input", onProfileFilterInput);
  }
}
function initTimeseriesActions(deps) {
  const resetChartRangeToDataset = async (source = "reset") => {
    const minMs = Number(appStateComposite.metadata?.time_range?.min);
    const maxMs = Number(appStateComposite.metadata?.time_range?.max);
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs >= maxMs) return;
    setViewport(minMs, maxMs);
    appStateComposite.chart?.setXRange?.(minMs, maxMs);
    deps.updateAnalysisZoom(minMs, maxMs, source);
    deps.emitChartRangeChange(source);
    await deps.fetchAndRender();
  };
  const onRequestResetRange = () => {
    void resetChartRangeToDataset("reset");
  };
  window.addEventListener("edatime:request-chart-range-reset", onRequestResetRange);
  deps.registerCleanup(() => window.removeEventListener("edatime:request-chart-range-reset", onRequestResetRange));
  window.__edatime.resetChartRangeToDataset = () => void resetChartRangeToDataset("reset");
  const clearAllFilters = async (source = "clear") => {
    setColumnRanges({});
    setAdaptiveLineFilters([]);
    deps.buildRangeControls();
    deps.renderCurrentData();
    window.dispatchEvent(new CustomEvent("edatime:column-filters-change", { detail: { source } }));
    window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change", { detail: { source } }));
    await deps.fetchAndRender();
  };
  const onClearAllFilters = () => {
    void clearAllFilters("clear");
  };
  window.addEventListener("edatime:clear-all-filters", onClearAllFilters);
  deps.registerCleanup(() => window.removeEventListener("edatime:clear-all-filters", onClearAllFilters));
  window.__edatime.clearAllFilters = () => void clearAllFilters("clear");
}

function createTimeseriesEntrypoint(deps) {
  const rebuildColumns = () => {
    buildColumnToggles(deps.fetchAndRender, buildRangeControls, deps.renderCurrentData);
  };
  return {
    init() {
      initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange);
      initSeriesCollapse();
      initDatasetSearchInputs({
        rebuildColumnToggles: rebuildColumns,
        renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => {
        })
      });
      initTimeseriesActions({
        ...deps,
        rebuildColumnToggles: rebuildColumns,
        buildRangeControls,
        renderColumnProfilesGrid: deps.renderColumnProfilesGrid ?? (() => {
        })
      });
    },
    rebuildColumns,
    buildRangeControls
  };
}

function createPageLifecycle(options) {
  let initialized = false;
  let cleanup;
  const handler = (event) => {
    const detail = event.detail;
    const isTargetPage = detail?.page === options.page;
    if (!initialized) {
      if (isTargetPage) {
        initialized = true;
        cleanup = options.init();
        options.onVisible?.();
      }
      options.onEveryPageChange?.();
      return;
    }
    if (isTargetPage) {
      options.onVisible?.();
    }
    options.onEveryPageChange?.();
  };
  window.addEventListener("edatime:page-change", handler);
  return () => {
    window.removeEventListener("edatime:page-change", handler);
    if (typeof cleanup === "function") cleanup();
  };
}

function createPageRuntime(options) {
  let emptyStateController = null;
  let cleanup;
  let mounted = false;
  const getEmptyState = () => {
    if (!emptyStateController && options.emptyStateRootId) {
      emptyStateController = createEmptyStateController({ rootId: options.emptyStateRootId });
    }
    return emptyStateController;
  };
  return {
    mount() {
      if (mounted) return () => {
      };
      mounted = true;
      const unregister = createPageLifecycle({
        page: options.page,
        init: () => {
          cleanup = options.init?.();
        },
        onVisible: options.onVisible,
        onEveryPageChange: options.onEveryPageChange
      });
      return () => {
        unregister();
        if (typeof cleanup === "function") cleanup();
      };
    },
    updateEmptyState(model) {
      if (!options.emptyStateRootId) return;
      getEmptyState().update(model);
    },
    updateStatus(text) {
      if (!options.statusElId) return;
      const el = document.getElementById(options.statusElId);
      if (el) el.textContent = text;
    },
    setLoading(loading) {
      if (!options.loadingElId) return;
      const el = document.getElementById(options.loadingElId);
      if (el) el.hidden = loading;
    }
  };
}

function createTimeseriesRuntime(deps) {
  return createPageRuntime({
    page: "timeseries",
    emptyStateRootId: "timeseries-empty-state",
    init: () => deps.initFeature(),
    onVisible: () => {
      void deps.ensureReady();
    }
  });
}

let _datasetReadyPromise = null;
function createDatasetBootstrap(deps) {
  function syncDatasetSelection(metadata, selectedColumn) {
    deps.setNumericCols(deps.getNumericColumns(metadata));
    if (!deps.getSelectedCols().length) {
      deps.setSelectedCols(deps.getDefaultTimeseriesColumns(metadata));
    }
    if (selectedColumn) {
      const next = new Set(deps.getSelectedCols());
      next.add(selectedColumn);
      deps.setSelectedCols(Array.from(next));
    }
    deps.sanitizeSelectedColumns();
    if (!deps.getSelectedCols().length) {
      deps.setSelectedCols(deps.getDefaultTimeseriesColumns(metadata));
      deps.sanitizeSelectedColumns();
    }
    deps.setAdaptiveFilterColumn(deps.getSelectedCols()[0] || null);
  }
  async function ensureDatasetReady() {
    if (isMetadataReady()) return;
    if (_datasetReadyPromise) return _datasetReadyPromise;
    let pending;
    pending = (async () => {
      const requestScope = captureDatasetRequestScope();
      await deps.ensureChartModules();
      const metadata = await deps.fetchMetadata();
      assertDatasetRequestScopeActive(requestScope);
      deps.storeFetchedMetadata(metadata);
      deps.markMetadataReady();
      window.dispatchEvent(new Event("edatime:metadata-ready"));
      if (DEBUG) dbgGroup("metadata", () => dbg(metadata));
      if (!metadata.time_range) {
        return;
      }
      syncDatasetSelection(metadata);
      await deps.initializeDatasetUi(metadata);
    })().catch((error) => {
      if (_datasetReadyPromise === pending) {
        _datasetReadyPromise = null;
      }
      throw error;
    });
    _datasetReadyPromise = pending;
    return _datasetReadyPromise;
  }
  async function refreshAfterMutation(options) {
    invalidateDatasetRequestScope();
    _datasetReadyPromise = null;
    if (!isMetadataReady()) {
      await ensureDatasetReady();
      return;
    }
    deps.clearLoadedPageModules();
    const metadata = await deps.fetchMetadata();
    deps.storeFetchedMetadata(metadata);
    deps.markMetadataReady();
    window.dispatchEvent(new Event("edatime:metadata-ready"));
    syncDatasetSelection(metadata, options?.selectedColumn);
    await deps.initializeDatasetUi(metadata);
    deps.rebuildTimeseriesColumns();
    await deps.refreshVisibleData();
  }
  return { ensureDatasetReady, refreshAfterMutation };
}

async function checkWebGPU() {
  if (!navigator.gpu) {
    return "WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.";
  }
  try {
    const timeout = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("requestAdapter timed out")), 5e3)
    );
    const adapter = await Promise.race([requestGpuAdapter(), timeout]);
    if (!adapter) {
      return "No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.";
    }
    installWindowsWebGpuRequestAdapterWorkaround();
    return null;
  } catch (e) {
    const message = e.message ?? "Unknown error";
    return `WebGPU adapter request failed: ${message}`;
  }
}

const STORAGE_KEY$1 = "edatime-annotations";
let annotations = [];
function generateId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function loadAnnotations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY$1);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    annotations = parsed.filter((a) => a && typeof a.id === "string");
    return annotations;
  } catch {
    return [];
  }
}
function saveAnnotations() {
  try {
    localStorage.setItem(STORAGE_KEY$1, JSON.stringify(annotations));
  } catch {
  }
}
function getAnnotations() {
  return [...annotations];
}
function getAnnotationsForPage(page) {
  return annotations.filter((a) => a.page === page);
}
function getAnnotationsInRange(start, end) {
  return annotations.filter((a) => {
    if (!a.timeRange) return false;
    return a.timeRange.start <= end && a.timeRange.end >= start;
  });
}
function createAnnotation(type, title, options = {}) {
  const now = Date.now();
  const annotation = {
    id: generateId(),
    type,
    title,
    color: options.color || "#ffc041",
    createdAt: now,
    updatedAt: now,
    page: options.page || "timeseries",
    ...options
  };
  annotations.push(annotation);
  saveAnnotations();
  return annotation;
}
function deleteAnnotation(id) {
  const idx = annotations.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  annotations.splice(idx, 1);
  saveAnnotations();
  return true;
}
function clearAllAnnotations() {
  annotations = [];
  saveAnnotations();
}
function exportAnnotations() {
  return JSON.stringify(annotations, null, 2);
}
function createTimeRangeNote(title, start, end, content, columns, color, datasetRevision) {
  return createAnnotation("note", title, {
    content,
    timeRange: { start, end },
    columns,
    color,
    datasetRevision,
    page: "timeseries"
  });
}
function createBookmark(title, time, datasetRevision) {
  return createAnnotation("bookmark", title, {
    timeRange: { start: time, end: time },
    datasetRevision,
    page: "timeseries"
  });
}
function initAnnotations() {
  loadAnnotations();
  window.__edatimeAnnotations = {
    getAnnotationsForPage,
    getAnnotationsInRange,
    getAnnotations
  };
}

const annotations$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  clearAllAnnotations,
  createAnnotation,
  createBookmark,
  createTimeRangeNote,
  deleteAnnotation,
  exportAnnotations,
  getAnnotations,
  getAnnotationsForPage,
  getAnnotationsInRange,
  initAnnotations,
  loadAnnotations,
  saveAnnotations
}, Symbol.toStringTag, { value: 'Module' }));

const DEFAULT_DURATIONS = {
  success: 3200,
  info: 3800,
  warning: 5200,
  error: 0
};
const TOAST_ICONS = {
  success: "✔",
  error: "✕",
  warning: "⚠",
  info: "ℹ"
};
let container = null;
const activeToasts = /* @__PURE__ */ new Map();
function ensureContainer() {
  if (container && container.isConnected) return container;
  container = document.createElement("div");
  container.className = "toast-container";
  container.setAttribute("role", "region");
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-label", "Notifications");
  container.setAttribute("data-position", "top-right");
  document.body.appendChild(container);
  return container;
}
function normalizeOptions(durationOrOpts) {
  if (typeof durationOrOpts === "number") return { duration: durationOrOpts };
  return durationOrOpts ?? {};
}
function resolveDuration(kind, opts) {
  if (typeof opts.duration === "number") return opts.duration;
  return DEFAULT_DURATIONS[kind];
}
function clearToastTimer(toastState) {
  if (toastState.timer) {
    clearTimeout(toastState.timer);
    toastState.timer = null;
  }
}
function applyActionButton(toastState, opts) {
  if (toastState.actionBtn) {
    toastState.actionBtn.remove();
    toastState.actionBtn = null;
  }
  if (!opts.action) return;
  const btn = document.createElement("button");
  btn.className = "toast-action";
  btn.textContent = opts.action.label;
  btn.addEventListener("click", () => {
    opts.action?.onClick();
    toastState.dismiss();
  });
  toastState.el.insertBefore(btn, toastState.closeBtn);
  toastState.actionBtn = btn;
}
function scheduleDismiss(toastState, kind, opts) {
  clearToastTimer(toastState);
  const duration = resolveDuration(kind, opts);
  if (duration <= 0) return;
  toastState.timer = setTimeout(() => toastState.dismiss(), duration);
}
function updateToastVisuals(toastState, message, kind, opts) {
  toastState.el.className = `toast toast--${kind}`;
  toastState.el.classList.remove("toast--exit");
  toastState.messageEl.textContent = message;
  toastState.iconEl.textContent = TOAST_ICONS[kind];
  toastState.el.dataset.kind = kind;
  applyActionButton(toastState, opts);
  scheduleDismiss(toastState, kind, opts);
}
function createToast(key, message, kind, opts) {
  const root = document.createElement("div");
  root.className = `toast toast--${kind}`;
  root.dataset.kind = kind;
  root.setAttribute("role", "alert");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = TOAST_ICONS[kind];
  root.appendChild(icon);
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  root.appendChild(text);
  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  root.appendChild(closeBtn);
  const toastState = {
    key,
    el: root,
    messageEl: text,
    iconEl: icon,
    actionBtn: null,
    closeBtn,
    timer: null,
    dismiss: () => {
      clearToastTimer(toastState);
      const active = activeToasts.get(key);
      if (active === toastState) activeToasts.delete(key);
      toastState.el.classList.remove("toast--visible");
      toastState.el.classList.add("toast--exit");
      toastState.el.addEventListener("transitionend", () => toastState.el.remove(), { once: true });
      setTimeout(() => {
        if (toastState.el.parentNode) toastState.el.remove();
      }, 260);
    },
    refresh: (nextMessage, nextKind, nextOpts) => {
      updateToastVisuals(toastState, nextMessage, nextKind, nextOpts);
      requestAnimationFrame(() => toastState.el.classList.add("toast--visible"));
    }
  };
  closeBtn.addEventListener("click", toastState.dismiss);
  root.addEventListener("mouseenter", () => clearToastTimer(toastState));
  root.addEventListener("mouseleave", () => scheduleDismiss(toastState, kind, opts));
  updateToastVisuals(toastState, message, kind, opts);
  return toastState;
}
function toast(message, kind = "info", durationOrOpts) {
  const opts = normalizeOptions(durationOrOpts);
  const key = opts.dedupeKey ?? `${kind}:${message}`;
  const existing = activeToasts.get(key);
  if (existing && existing.el.isConnected) {
    existing.refresh(message, kind, opts);
    return existing.dismiss;
  }
  const next = createToast(key, message, kind, opts);
  activeToasts.set(key, next);
  const host = ensureContainer();
  host.prepend(next.el);
  requestAnimationFrame(() => next.el.classList.add("toast--visible"));
  return next.dismiss;
}

const toast$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  toast
}, Symbol.toStringTag, { value: 'Module' }));

let _requestOverlayRender = null;
function setAnnotationOverlayCallback(cb) {
  _requestOverlayRender = cb;
}
function refreshOverlay() {
  _requestOverlayRender?.();
}
function openAnnotationsModal() {
  const modal = document.getElementById("annotations-modal");
  if (!modal) return;
  renderAnnotationsList();
  modal.hidden = false;
}
function closeAnnotationsModal() {
  const modal = document.getElementById("annotations-modal");
  if (modal) modal.hidden = true;
}
function renderAnnotationsList() {
  const container = document.getElementById("annotations-list");
  if (!container) return;
  const anns = getAnnotations();
  if (anns.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted, #888);padding:8px 0;">No annotations yet. Use "+ Note" or "+ Bookmark" to add.</p>';
    return;
  }
  container.innerHTML = anns.map((ann) => {
    const date = new Date(ann.createdAt).toLocaleString();
    const timeInfo = ann.timeRange ? `<span style="font-size:11px;color:var(--text-muted,#888)">${new Date(ann.timeRange.start).toISOString().slice(0, 16).replace("T", " ")}${ann.timeRange.end !== ann.timeRange.start ? " – " + new Date(ann.timeRange.end).toISOString().slice(0, 16).replace("T", " ") : ""}</span>` : "";
    return `
            <div class="annotation-item" data-ann-id="${escapeAttr(ann.id)}" style="border-left:3px solid ${escapeAttr(ann.color)};padding:8px 12px;margin-bottom:8px;background:var(--surface2,#1e1e2e);border-radius:4px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                    <strong>${escapeHtml(ann.title)}</strong>
                    <div style="display:flex;gap:6px;">
                        <span style="font-size:11px;color:var(--text-muted,#888)">${ann.type} · ${ann.page}</span>
                        <button class="btn btn-ghost btn-xs ann-delete-btn" data-ann-id="${escapeAttr(ann.id)}" type="button" title="Delete">✕</button>
                    </div>
                </div>
                ${timeInfo}
                ${ann.content ? `<p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary,#ccc)">${escapeHtml(ann.content)}</p>` : ""}
                <div style="font-size:11px;color:var(--text-muted,#888);margin-top:2px">${date}</div>
            </div>
        `;
  }).join("");
  container.querySelectorAll(".ann-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.annId;
      if (id && confirm("Delete this annotation?")) {
        deleteAnnotation(id);
        renderAnnotationsList();
        refreshOverlay();
      }
    });
  });
}
function openAddNoteModal() {
  const modal = document.getElementById("add-note-modal");
  if (!modal) return;
  document.getElementById("note-title-input").value = "";
  document.getElementById("note-content-input").value = "";
  document.getElementById("note-color-input").value = "#ffc041";
  modal.hidden = false;
  document.getElementById("note-title-input").focus();
}
function closeAddNoteModal() {
  const modal = document.getElementById("add-note-modal");
  if (modal) modal.hidden = true;
}
function saveNote() {
  const title = document.getElementById("note-title-input").value.trim();
  if (!title) {
    toast("Please enter a title for the note.", "error");
    return;
  }
  const content = document.getElementById("note-content-input").value.trim();
  const color = document.getElementById("note-color-input").value;
  const start = appStateComposite.currentStart ?? Date.now() - 36e5;
  const end = appStateComposite.currentEnd ?? Date.now();
  createTimeRangeNote(
    title,
    start,
    end,
    content || void 0,
    void 0,
    color,
    appStateComposite.datasetRevision
  );
  toast(`Note "${title}" saved.`, "success");
  closeAddNoteModal();
  refreshOverlay();
}
function addBookmarkAtCurrentView() {
  const time = appStateComposite.currentStart ?? Date.now();
  const title = `Bookmark ${new Date(time).toLocaleTimeString()}`;
  createBookmark(title, time, appStateComposite.datasetRevision);
  toast(`Bookmark added at ${new Date(time).toLocaleString()}`, "success");
  refreshOverlay();
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function initAnnotationPanel() {
  document.getElementById("open-notes-panel-btn")?.addEventListener("click", openAnnotationsModal);
  document.getElementById("annotations-modal-close")?.addEventListener("click", closeAnnotationsModal);
  document.getElementById("annotations-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "annotations-modal") closeAnnotationsModal();
  });
  document.getElementById("annotations-modal-add-note-btn")?.addEventListener("click", openAddNoteModal);
  document.getElementById("annotations-modal-bookmark-btn")?.addEventListener("click", addBookmarkAtCurrentView);
  document.getElementById("annotations-export-btn")?.addEventListener("click", () => {
    const json = exportAnnotations();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edatime-annotations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("annotations-clear-btn")?.addEventListener("click", () => {
    if (confirm("Clear all annotations? This cannot be undone.")) {
      clearAllAnnotations();
      renderAnnotationsList();
      refreshOverlay();
      toast("All annotations cleared.", "success");
    }
  });
  document.getElementById("add-note-modal-close")?.addEventListener("click", closeAddNoteModal);
  document.getElementById("add-note-cancel-btn")?.addEventListener("click", closeAddNoteModal);
  document.getElementById("add-note-save-btn")?.addEventListener("click", saveNote);
  document.getElementById("add-note-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "add-note-modal") closeAddNoteModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "N") {
      e.preventDefault();
      openAddNoteModal();
    }
  });
}

const annotationPanel = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  initAnnotationPanel,
  setAnnotationOverlayCallback
}, Symbol.toStringTag, { value: 'Module' }));

function buildAdaptiveFilterFromPoints(column, firstPoint, secondPoint) {
  if (!column || !firstPoint || !secondPoint) return null;
  if (!appStateComposite.lastFetchedData) return null;
  const filtered = applyColumnRanges(appStateComposite.lastFetchedData);
  const columnData = filtered.series?.[column] || filtered.values?.[column];
  const xs = columnData?.x;
  const ys = columnData?.y;
  if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;
  const x1 = Number(firstPoint.x);
  const y1 = Number(firstPoint.y);
  const x2 = Number(secondPoint.x);
  const y2 = Number(secondPoint.y);
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2) || x1 === x2) return null;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const tempFilter = { x1, y1, x2, y2};
  let above = 0;
  let below = 0;
  for (let idx = 0; idx < xs.length; idx++) {
    const x = Number(xs[idx]);
    const y = Number(ys[idx]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
    const lineY = buildAdaptiveLineY(tempFilter, x);
    if (lineY == null || !Number.isFinite(lineY)) continue;
    if (y >= lineY) above += 1;
    else below += 1;
  }
  return {
    id: `adaptive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    column,
    x1,
    y1,
    x2,
    y2,
    keepAbove: above > below
  };
}
function initAdaptiveFilterGesture(deps) {
  const container = document.getElementById("main-chart");
  if (!container || container.dataset.adaptiveBound) return () => {
  };
  let _activePicker = null;
  let _firstPoint = null;
  let _secondPoint = null;
  let _lastClickX = 0;
  let _lastClickY = 0;
  const dismissPicker = () => {
    _activePicker?.remove();
    _activePicker = null;
  };
  const cancelPending = () => {
    _firstPoint = null;
    _secondPoint = null;
    setPendingAdaptivePoint(null);
    appStateComposite.chart?.requestOverlayRender?.();
  };
  const updateOverlay = () => {
    if (!_firstPoint) {
      setPendingAdaptivePoint(null);
      return;
    }
    const col = appStateComposite.adaptiveFilterColumn ?? (appStateComposite.selectedCols?.[0] ?? "");
    if (_secondPoint) {
      setPendingAdaptivePoint({ column: col, x: _firstPoint.x, y: _firstPoint.y, x2: _secondPoint.x, y2: _secondPoint.y });
    } else {
      setPendingAdaptivePoint({ column: col, x: _firstPoint.x, y: _firstPoint.y });
    }
    appStateComposite.chart?.requestOverlayRender?.();
  };
  const applyFilterForColumn = (column, p1, p2) => {
    setAdaptiveFilterColumn(column);
    const filter = buildAdaptiveFilterFromPoints(column, p1, p2);
    if (!filter) return;
    appendAdaptiveLineFilter(filter);
    deps.buildRangeControls();
    deps.renderCurrentData();
    appStateComposite.chart?.requestOverlayRender?.();
    appStateComposite.chart?.fitYToData?.();
    const yr = appStateComposite.chart?.getYRange?.();
    if (yr) deps.updateAnalysisYRange(yr.min, yr.max, "adaptive");
    deps.buildColumnToggles();
  };
  const showTracePicker = (p1, p2) => {
    const cols = appStateComposite.selectedCols;
    if (!cols?.length) return;
    if (cols.length === 1) {
      applyFilterForColumn(cols[0], p1, p2);
      return;
    }
    dismissPicker();
    const picker = document.createElement("div");
    picker.className = "adaptive-trace-picker";
    picker.style.left = `${_lastClickX}px`;
    picker.style.top = `${_lastClickY}px`;
    const label = document.createElement("div");
    label.className = "adaptive-trace-picker__label";
    label.textContent = "Filter which trace?";
    picker.appendChild(label);
    cols.forEach((col, idx) => {
      const color = appStateComposite.seriesColors?.[col] ?? SERIES_COLORS[idx % SERIES_COLORS.length];
      const isCurrentTarget = col === appStateComposite.adaptiveFilterColumn;
      const btn = document.createElement("button");
      btn.className = "adaptive-trace-picker__option" + (isCurrentTarget ? " current" : "");
      btn.type = "button";
      btn.style.setProperty("--pick-accent", color);
      btn.textContent = col;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dismissPicker();
        applyFilterForColumn(col, p1, p2);
      });
      picker.appendChild(btn);
    });
    document.body.appendChild(picker);
    _activePicker = picker;
    const onOutside = (e) => {
      if (!picker.contains(e.target)) {
        dismissPicker();
        document.removeEventListener("click", onOutside, true);
      }
    };
    document.addEventListener("click", onOutside, true);
  };
  const clickHandler = (event) => {
    if (!event.ctrlKey || event.button !== 0) return;
    const cols = appStateComposite.selectedCols;
    if (!cols?.length) return;
    const point = appStateComposite.chart?.cssPointToData?.(event.clientX, event.clientY) ?? null;
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    _lastClickX = event.clientX;
    _lastClickY = event.clientY;
    if (!_firstPoint) {
      _firstPoint = point;
      _secondPoint = null;
    } else {
      _secondPoint = point;
    }
    updateOverlay();
  };
  const onEscape = (e) => {
    if (e.key === "Escape") {
      dismissPicker();
      cancelPending();
    }
  };
  const onCtrlUp = (e) => {
    if (e.key !== "Control") return;
    if (_firstPoint && _secondPoint) {
      const p1 = _firstPoint, p2 = _secondPoint;
      cancelPending();
      showTracePicker(p1, p2);
    } else {
      cancelPending();
    }
  };
  const onAdaptiveChange = () => {
    if (!appStateComposite.lastFetchedData) return;
    deps.buildRangeControls();
    deps.renderCurrentData();
    appStateComposite.chart?.requestOverlayRender?.();
    appStateComposite.chart?.fitYToData?.();
    const yr = appStateComposite.chart?.getYRange?.();
    if (yr) deps.updateAnalysisYRange(yr.min, yr.max, "adaptive");
  };
  container.addEventListener("click", clickHandler, true);
  window.addEventListener("keydown", onEscape);
  window.addEventListener("keyup", onCtrlUp);
  window.addEventListener("edatime:adaptive-filters-change", onAdaptiveChange);
  container.dataset.adaptiveBound = "1";
  return () => {
    container.removeEventListener("click", clickHandler, true);
    window.removeEventListener("keydown", onEscape);
    window.removeEventListener("keyup", onCtrlUp);
    window.removeEventListener("edatime:adaptive-filters-change", onAdaptiveChange);
  };
}

const STORAGE_KEY = "edatime-session";
function currentPage() {
  return document.querySelector(".page[data-page-name]:not([hidden])")?.dataset?.pageName || "upload";
}
function readSelect(id) {
  return getDropdownValue(id);
}
function captureSession() {
  return {
    version: 1,
    timestamp: Date.now(),
    page: currentPage(),
    selectedCols: [...appStateComposite.selectedCols],
    seriesColors: { ...appStateComposite.seriesColors },
    columnRanges: { ...appStateComposite.columnRanges },
    adaptiveLineFilters: appStateComposite.adaptiveLineFilters.map((f) => ({ ...f })),
    currentStart: appStateComposite.currentStart,
    currentEnd: appStateComposite.currentEnd,
    selectedColorColumn: appStateComposite.selectedColorColumn,
    chartText: { ...appStateComposite.chartText },
    rollingEnabled: appStateComposite.rollingEnabled,
    rollingWindow: appStateComposite.rollingWindow,
    anomalyEnabled: appStateComposite.anomalyEnabled,
    anomalyMethod: appStateComposite.anomalyMethod,
    anomalyThreshold: appStateComposite.anomalyThreshold,
    scatterX: readSelect("scatter-x-col"),
    scatterY: readSelect("scatter-y-col"),
    scatterColorColumn: readSelect("scatter-color-column"),
    scatterRenderMode: readSelect("scatter-render-mode"),
    // Theme is owned by AppSettings; we keep a snapshot of the resolved
    // value for diagnostic / back-compat purposes only. It is no longer
    // applied to the document by `applySession()`.
    theme: document.documentElement.getAttribute("data-theme") || "dark",
    datasetRevision: Number.isFinite(Number(appStateComposite.datasetRevision)) ? Number(appStateComposite.datasetRevision) : 0
  };
}
function applySession(snap, options = {}) {
  const result = {
    revisionMismatch: false,
    rangeAdjusted: false,
    usedMetadataRange: false,
    droppedFilterCount: 0,
    navigatedToPage: false
  };
  if (!snap || snap.version !== 1) return result;
  const announceAdjustments = options.announceAdjustments !== false;
  const metadataTimeRange = options.metadataTimeRange || (appStateComposite.metadata?.time_range ?? null);
  const currentRevision = Number(
    options.currentDatasetRevision ?? appStateComposite.datasetRevision ?? appStateComposite.metadata?.revision ?? 0
  );
  const snapshotRevision = Number(snap.datasetRevision ?? 0);
  const hasRevisions = Number.isFinite(currentRevision) && currentRevision > 0 && Number.isFinite(snapshotRevision) && snapshotRevision > 0;
  const revisionMismatch = hasRevisions && currentRevision !== snapshotRevision;
  result.revisionMismatch = revisionMismatch;
  setSelectedCols(Array.isArray(snap.selectedCols) ? snap.selectedCols : []);
  if (snap.seriesColors) setSeriesColors({ ...snap.seriesColors });
  if (revisionMismatch) {
    const staleRanges = Object.keys(snap.columnRanges || {}).length;
    const staleLines = Array.isArray(snap.adaptiveLineFilters) ? snap.adaptiveLineFilters.length : 0;
    result.droppedFilterCount = staleRanges + staleLines;
    setColumnRanges({});
    setAdaptiveLineFilters([]);
  } else {
    if (snap.columnRanges) setColumnRanges({ ...snap.columnRanges });
    if (Array.isArray(snap.adaptiveLineFilters)) {
      setAdaptiveLineFilters(snap.adaptiveLineFilters.map((f) => ({ ...f, id: f.id ?? `restored-${Date.now()}` })));
    }
  }
  if (!revisionMismatch) {
    const hasStart = Number.isFinite(snap.currentStart);
    const hasEnd = Number.isFinite(snap.currentEnd);
    if (hasStart && hasEnd) {
      let nextStart = Number(snap.currentStart);
      let nextEnd = Number(snap.currentEnd);
      const minMs = Number(metadataTimeRange?.min);
      const maxMs = Number(metadataTimeRange?.max);
      const hasMetadataBounds = Number.isFinite(minMs) && Number.isFinite(maxMs) && minMs < maxMs;
      if (hasMetadataBounds) {
        const noOverlap = nextEnd <= minMs || nextStart >= maxMs;
        if (noOverlap) {
          nextStart = minMs;
          nextEnd = maxMs;
          result.rangeAdjusted = true;
          result.usedMetadataRange = true;
        } else {
          const clampedStart = Math.max(nextStart, minMs);
          const clampedEnd = Math.min(nextEnd, maxMs);
          if (clampedStart !== nextStart || clampedEnd !== nextEnd) {
            result.rangeAdjusted = true;
          }
          nextStart = clampedStart;
          nextEnd = clampedEnd;
          if (nextStart >= nextEnd) {
            nextStart = minMs;
            nextEnd = maxMs;
            result.usedMetadataRange = true;
          }
        }
      }
      setViewport(nextStart, nextEnd);
    }
  }
  if (snap.selectedColorColumn !== void 0) setSelectedColorColumn(snap.selectedColorColumn);
  if (snap.chartText) setChartText({ ...snap.chartText });
  if (snap.rollingEnabled !== void 0) setRollingEnabled(snap.rollingEnabled);
  if (Number.isFinite(snap.rollingWindow)) setRollingWindow(snap.rollingWindow);
  if (snap.anomalyEnabled !== void 0) setAnomalyEnabled(snap.anomalyEnabled);
  if (snap.anomalyMethod) setAnomalyMethod(snap.anomalyMethod);
  if (Number.isFinite(snap.anomalyThreshold)) setAnomalyThreshold(snap.anomalyThreshold);
  const setSelect = (id, val) => {
    if (val) setDropdownValue(id, val);
  };
  setSelect("scatter-x-col", snap.scatterX);
  setSelect("scatter-y-col", snap.scatterY);
  setSelect("scatter-color-column", snap.scatterColorColumn);
  setSelect("scatter-render-mode", snap.scatterRenderMode);
  if (revisionMismatch && announceAdjustments) {
    toast("Session belongs to another dataset revision; stale filters were cleared.", "warning");
  } else if (result.usedMetadataRange && announceAdjustments) {
    toast("Saved chart range did not match this dataset and was reset to dataset bounds.", "warning");
  } else if (result.rangeAdjusted && announceAdjustments) {
    toast("Saved chart range was clamped to the current dataset time range.", "warning");
  }
  const hashPage = getHashPage();
  const shouldPreferHash = !!options.preferHashPage && !!hashPage;
  const shouldNavigate = options.navigate !== false && !shouldPreferHash;
  if (shouldNavigate && snap.page) {
    const btn = document.querySelector(`.sidebar .nav-item[data-page="${snap.page}"]`);
    if (btn) {
      btn.click();
      result.navigatedToPage = true;
    }
  }
  return result;
}
function autoSaveSession() {
  try {
    const snap = captureSession();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
  }
}
function autoRestoreSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (snap?.version !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}
function exportSessionToFile() {
  const snap = captureSession();
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `edatime-session-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Session exported", "success");
}
function importSessionFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const snap = JSON.parse(reader.result);
        if (snap?.version !== 1) throw new Error("Invalid session file");
        applySession(snap);
        toast("Session restored from file", "success");
        window.dispatchEvent(new CustomEvent("edatime:session-restored"));
      } catch (e) {
        toast(`Failed to import session: ${e.message}`, "error");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
let _autoSaveTimer = null;
function initAutoSave() {
  const debouncedSave = () => {
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(autoSaveSession, 2e3);
  };
  window.addEventListener("edatime:page-change", debouncedSave);
  window.addEventListener("edatime:column-filters-change", debouncedSave);
  window.addEventListener("edatime:adaptive-filters-change", debouncedSave);
  window.addEventListener("beforeunload", autoSaveSession);
}

const session = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  applySession,
  autoRestoreSession,
  autoSaveSession,
  captureSession,
  exportSessionToFile,
  importSessionFromFile,
  initAutoSave
}, Symbol.toStringTag, { value: 'Module' }));

async function restoreSessionAfterChartReady(deps) {
  const savedSession = autoRestoreSession();
  if (!savedSession) return;
  applySession(savedSession, {
    metadataTimeRange: deps.metadataTimeRange,
    currentDatasetRevision: deps.currentDatasetRevision,
    preferHashPage: !!getHashPage()
  });
  deps.buildColumnToggles();
  deps.buildRangeControls();
  deps.renderCurrentData();
  await deps.fetchAndRender();
}
function startSessionPersistence() {
  initAutoSave();
  window.__edatime = window.__edatime || {};
  window.__edatime.exportSession = exportSessionToFile;
  window.__edatime.importSession = importSessionFromFile;
}

function createTimeseriesBootstrap(deps) {
  let ready = false;
  let pending = null;
  return {
    ensureReady: async () => {
      if (ready) return;
      if (pending) return pending;
      pending = (async () => {
        if (appStateComposite.chart) {
          ready = true;
          return;
        }
        const gpuError = await checkWebGPU();
        try {
          dbg("initial X range (ms)", { start: appStateComposite.currentStart, end: appStateComposite.currentEnd });
          const lineType = getChartType("line");
          if (lineType) {
            setChartInstance(lineType.create("main-chart", {
              onZoom: (start, end, sourceKind) => deps.onZoom({ xMin: start, xMax: end, yMin: null, yMax: null }, sourceKind),
              onYRange: deps.onYRange,
              onZoomOut: deps.onZoomOut
            }));
          } else {
            if (!deps.DataChartCtor) throw new Error("DataChart module not loaded");
            setChartInstance(new deps.DataChartCtor("main-chart", deps.onZoom, deps.onYRange, deps.onZoomOut));
          }
          if (gpuError) throw new Error(gpuError);
          await Promise.race([
            appStateComposite.chart.init(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("ChartGPU init timed out")), 6e3))
          ]);
          setAnalysisBound(false);
          bindAnalysisChartEvents();
          initAdaptiveFilterGesture({
            buildColumnToggles: deps.buildColumnToggles,
            buildRangeControls: deps.buildRangeControls,
            renderCurrentData: deps.renderCurrentData,
            updateAnalysisYRange: deps.onYRange
          });
          deps.refreshZoomControlsState();
          setAnnotationOverlayCallback(() => appStateComposite.chart?.requestOverlayRender?.());
          setAnomalyOverlayCallback(() => appStateComposite.chart?.requestOverlayRender?.());
          const chart = appStateComposite.chart;
          chart?.setXRange?.(appStateComposite.currentStart, appStateComposite.currentEnd);
          chart?.setChartText?.(
            appStateComposite.chartText?.title || "",
            appStateComposite.chartText?.xLabel || "",
            appStateComposite.chartText?.yLabel || ""
          );
          deps.renderCurrentData();
          await deps.fetchAndRender();
          setInitialView(getCurrentView());
          dbgGroup("initialView snapshot", () => dbg(appStateComposite.initialView));
          await restoreSessionAfterChartReady({
            metadataTimeRange: appStateComposite.metadata?.time_range ?? null,
            currentDatasetRevision: Number(appStateComposite.datasetRevision ?? 0),
            buildColumnToggles: deps.buildColumnToggles,
            buildRangeControls: deps.buildRangeControls,
            renderCurrentData: deps.renderCurrentData,
            fetchAndRender: deps.fetchAndRender
          });
          ready = true;
        } catch (e) {
          console.warn("Primary chart failed, switching to fallback:", e);
          try {
            const fallbackType = getChartType("fallback");
            setChartInstance(fallbackType ? fallbackType.create("main-chart", {}) : new FallbackChart("main-chart"));
            await appStateComposite.chart.init();
            setAnalysisBound(false);
            bindAnalysisChartEvents();
            deps.refreshZoomControlsState();
            await deps.fetchAndRender();
            ready = true;
          } catch (fallbackErr) {
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            console.error("Fallback chart also failed:", fallbackErr);
          }
        }
      })();
      try {
        await pending;
      } finally {
        pending = null;
      }
    },
    isReady: () => ready
  };
}

function createTimeseriesModule(deps) {
  let datasetUiReady = false;
  let feature;
  let datasetUiModulesPromise = null;
  function ensureDatasetUiModules() {
    if (!datasetUiModulesPromise) {
      datasetUiModulesPromise = Promise.all([
        __vitePreload(() => import('./assets/profile-DCQ6F-wu.js'),true              ?__vite__mapDeps([0,1]):void 0),
        __vitePreload(() => import('./assets/preview-DVb4QK3F.js'),true              ?__vite__mapDeps([3,4,5,6,1]):void 0),
        __vitePreload(() => import('./assets/partialLoadControls-B0pCom6w.js'),true              ?__vite__mapDeps([6,1]):void 0)
      ]).then(([profileModule, previewModule, partialLoadModule]) => ({
        hydrateColumnProfiles: profileModule.hydrateColumnProfiles,
        renderColumnProfilesGrid: profileModule.renderColumnProfilesGrid,
        applyPartialTimeRangeFromMetadata: partialLoadModule.applyPartialTimeRangeFromMetadata,
        setProfileMode: previewModule.setProfileMode,
        setUploadPreviewStatus: previewModule.setUploadPreviewStatus
      }));
    }
    return datasetUiModulesPromise;
  }
  const pageController = createTimeseriesPageController({
    fetchData: deps.fetchData,
    buildRangeControls: () => feature.buildRangeControls(),
    updateAnalysisYRange: deps.updateAnalysisYRange,
    updateAnalysisZoom: deps.updateAnalysisZoom,
    getCurrentView: deps.getCurrentView,
    fetchAndRenderAnalytics: deps.fetchAndRenderAnalytics
  });
  feature = createTimeseriesEntrypoint({
    fetchAndRender: () => pageController.fetchAndRender(),
    renderCurrentData: () => pageController.renderCurrentData(),
    updateAnalysisYRange: deps.updateAnalysisYRange,
    updateAnalysisZoom: deps.updateAnalysisZoom,
    emitChartRangeChange: (sourceKind) => pageController.emitChartRangeChange(sourceKind),
    registerCleanup: () => {
    }
    // owned by runtime via createPageLifecycle
  });
  const storeFetchedMetadata = (metadata) => {
    setMetadata(metadata);
    const revision = metadata?.revision;
    setDatasetRevision(typeof revision === "number" ? revision : 0);
  };
  const initializeDatasetUi = async (metadata) => {
    const datasetUi = await ensureDatasetUiModules();
    if (!datasetUiReady) {
      feature.init();
      deps.ensureSessionPersistenceStarted();
      datasetUiReady = true;
    }
    datasetUi.hydrateColumnProfiles(metadata);
    datasetUi.renderColumnProfilesGrid(true);
    datasetUi.applyPartialTimeRangeFromMetadata(metadata, false);
    datasetUi.setUploadPreviewStatus("Showing current dataset profile. Drop/select a file to preview before loading.");
    datasetUi.setProfileMode("dataset");
    feature.rebuildColumns();
    feature.buildRangeControls();
    window.dispatchEvent(new CustomEvent("edatime:workflow-refresh"));
    const timeRange = metadata.time_range;
    if (!timeRange) return;
    const start = Number(timeRange.min);
    const end = Number(timeRange.max);
    deps.setViewport(start, end);
    deps.updateAnalysisZoom(start, end, "initial");
    pageController.emitChartRangeChange("initial");
  };
  const bootstrap = createDatasetBootstrap({
    ensureChartModules: async () => {
    },
    fetchMetadata: deps.fetchMetadata,
    storeFetchedMetadata,
    markMetadataReady: deps.markMetadataReady,
    initializeDatasetUi,
    setNumericCols: deps.setNumericCols,
    setDefaultSelectedColumns: (cols) => deps.setSelectedCols(cols),
    sanitizeSelectedColumns: deps.sanitizeSelectedColumns,
    refreshVisibleData: async () => {
      await pageController.fetchAndRender();
    },
    clearLoadedPageModules: deps.clearLoadedPageModules,
    getNumericColumns: (metadata) => getNumericColumns(metadata),
    getDefaultTimeseriesColumns: (metadata) => getDefaultTimeseriesColumns(metadata),
    rebuildTimeseriesColumns: () => feature.rebuildColumns(),
    timeseriesFeatureInit: () => feature.init(),
    ensureSessionPersistenceStarted: deps.ensureSessionPersistenceStarted,
    setViewport: deps.setViewport,
    updateAnalysisZoom: deps.updateAnalysisZoom,
    emitWorkflowRefresh: () => {
      window.dispatchEvent(new CustomEvent("edatime:workflow-refresh"));
    },
    emitChartRangeChange: (sourceKind) => pageController.emitChartRangeChange(sourceKind),
    setAdaptiveFilterColumn: deps.setAdaptiveFilterColumn,
    getSelectedCols: deps.getSelectedCols,
    setSelectedCols: deps.setSelectedCols
  });
  const chartBootstrap = createTimeseriesBootstrap({
    DataChartCtor: deps.DataChartCtor,
    onZoom: (view, sourceKind) => pageController.onZoomRangeChange(view, sourceKind),
    onYRange: deps.updateAnalysisYRange,
    onZoomOut: deps.zoomOut,
    buildColumnToggles: () => feature.rebuildColumns(),
    buildRangeControls: () => feature.buildRangeControls(),
    renderCurrentData: () => pageController.renderCurrentData(),
    fetchAndRender: () => pageController.fetchAndRender(),
    refreshZoomControlsState: deps.refreshZoomControlsState
  });
  const runtime = createTimeseriesRuntime({
    initFeature: () => feature.init(),
    ensureReady: async () => {
      await bootstrap.ensureDatasetReady();
      await chartBootstrap.ensureReady();
    }
  });
  return {
    mount: () => runtime.mount(),
    ensureDatasetReady: () => bootstrap.ensureDatasetReady(),
    ensureReady: () => bootstrap.ensureDatasetReady(),
    // same as ensureDatasetReady for now
    fetchAndRender: () => pageController.fetchAndRender(),
    renderCurrentData: () => pageController.renderCurrentData(),
    buildColumnToggles: () => feature.rebuildColumns(),
    buildRangeControls: () => feature.buildRangeControls(),
    emitChartRangeChange: (sourceKind) => pageController.emitChartRangeChange(sourceKind),
    onZoomRangeChange: (view, sourceKind) => pageController.onZoomRangeChange(view, sourceKind),
    refreshAfterMutation: (options) => bootstrap.refreshAfterMutation(options)
  };
}

const __edatime_state = appStateComposite;
window.__edatime = window.__edatime || {};
try {
  Object.defineProperty(window.__edatime, "state", {
    get: () => __edatime_state,
    set: (v) => {
      Object.assign(__edatime_state, v);
    },
    configurable: true,
    enumerable: true
  });
} catch (_) {
}
window.__edatime.DEBUG = true;
const runtime = createAppRuntime();
let timeseriesModule;
let fetchMetadata = null;
let fetchData = null;
let fetchAnomalies = null;
let DataChartCtor = null;
let _sessionPersistenceStarted = false;
async function ensureChartModules() {
  if (fetchMetadata && fetchData && DataChartCtor) return;
  const modules = await ensureChartModules$1();
  fetchMetadata = modules.fetchMetadata;
  fetchData = modules.fetchData;
  fetchAnomalies = modules.fetchAnomalies;
  modules.postTransform;
  DataChartCtor = modules.DataChartCtor;
}
async function fetchAndRenderAnalytics() {
  await fetchAndRenderAnalytics$1(fetchAnomalies);
}
function ensureSessionPersistenceStarted() {
  if (_sessionPersistenceStarted) return;
  startSessionPersistence();
  _sessionPersistenceStarted = true;
}
async function init() {
  upgradeSelects(document);
  installWindowsWebGpuRequestAdapterWorkaround();
  await ensureChartModules();
  timeseriesModule = createTimeseriesModule({
    fetchData: (start, end, width, columns, colorColumn, signal) => fetchData(start, end, width, columns, colorColumn, signal),
    fetchMetadata: () => fetchMetadata(),
    DataChartCtor,
    markMetadataReady,
    sanitizeSelectedColumns: sanitizeSelectedColumns$1,
    clearLoadedPageModules,
    ensureSessionPersistenceStarted,
    getSelectedCols: () => appStateComposite.selectedCols,
    setSelectedCols,
    setNumericCols,
    setAdaptiveFilterColumn,
    setViewport,
    updateAnalysisYRange,
    updateAnalysisZoom,
    getCurrentView,
    fetchAndRenderAnalytics,
    refreshZoomControlsState,
    zoomOut: () => zoomOut(() => timeseriesModule.fetchAndRender())
  });
  timeseriesModule.mount();
  initAppShell({
    ensurePageModuleLoaded,
    showPage,
    fetchAndRender: () => timeseriesModule.fetchAndRender(),
    updateAnalysisYRange,
    buildTimeseriesColumns: () => timeseriesModule.buildColumnToggles(),
    buildTimeseriesRanges: () => timeseriesModule.buildRangeControls(),
    zoomOut: () => zoomOut(() => timeseriesModule.fetchAndRender()),
    resetZoom: () => resetZoom(() => timeseriesModule.fetchAndRender()),
    refreshDatasetAfterMutation: (opts) => timeseriesModule.refreshAfterMutation(opts),
    registerCleanup: runtime.registerCleanup
  });
  await loadPageDescriptors({
    getRenderTimeseries: () => timeseriesModule.renderCurrentData(),
    showPage,
    getMetadata: () => appStateComposite.metadata ?? null,
    chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
    numericColumns: () => getNumericColumns(appStateComposite.metadata),
    setLoading: setComputeLoading,
    initDriftPage: (metadata) => {
      void __vitePreload(() => import('./assets/driftPage-BXbtIdR5.js'),true              ?__vite__mapDeps([27,4,5,28,29,1]):void 0).then((m) => m.initDriftPage(metadata));
    }
  });
  window.__edatime = window.__edatime || {};
  window.__edatime.ensureDatasetReady = () => timeseriesModule.ensureDatasetReady();
  window.__edatime.runAnalytics = () => fetchAndRenderAnalytics();
  initGlobalShortcuts({
    showPage,
    zoomOut: () => zoomOut(() => timeseriesModule.fetchAndRender()),
    resetZoom: () => resetZoom(() => timeseriesModule.fetchAndRender()),
    registerCleanup: runtime.registerCleanup,
    chartExportPng: () => appStateComposite.chart?.exportPNG?.(),
    exportFilteredCsv: () => window.__edatime?.exportChartFilteredData?.("csv"),
    exportFilteredJson: () => window.__edatime?.exportChartFilteredData?.("json")
  }, APP_COMMAND_DEFINITIONS);
  initTimeseriesShortcuts({
    fetchAndRender: () => timeseriesModule.fetchAndRender(),
    zoomOut: () => zoomOut(() => timeseriesModule.fetchAndRender()),
    resetZoom: () => resetZoom(() => timeseriesModule.fetchAndRender()),
    chartExportPng: () => appStateComposite.chart?.exportPNG?.(),
    exportFilteredCsv: () => window.__edatime?.exportChartFilteredData?.("csv"),
    exportFilteredJson: () => window.__edatime?.exportChartFilteredData?.("json"),
    registerCleanup: runtime.registerCleanup
  });
  try {
    const initialPage = getHashPage();
    if (pageNeedsDatasetBootstrap(initialPage)) {
      await timeseriesModule.ensureDatasetReady();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Initial bootstrap failed:", e);
    showBootstrapError({ message });
  }
}
init();

export { upgradeSelects as $, formatProfileValue as A, toFiniteNumberOrNull as B, setProfileGridSort as C, DEBUG as D, setProfileGridHeaderBound as E, setPreviewSelectedColumns as F, setMetadata as G, setDatasetRevision as H, setPreviewTimeColumn as I, formatToDatetimeLocal as J, setSpectralFilterPreview as K, renderSeriesChipList as L, getNumericColumns as M, getAnalyticsChipColor as N, createPageRuntime as O, dedupeInflight as P, getEl as Q, isTemporalDtype as R, SERIES_COLORS as S, buildAdaptiveLineFiltersForQuery as T, scatterState as U, isRangeOutsideDataset as V, createEmptyStateController as W, requestGpuAdapter as X, getDropdownOptions as Y, getDropdownValueFromElement as Z, __vitePreload as _, setDropdownOptions as a, setDropdownDisabledForElement as a0, toast$1 as a1, setDropdownDisabled as b, createRequestTask as c, appStateComposite as d, formatAnalysisNumber as e, formatAnalysisTime as f, getDropdownValue as g, dbg as h, assertDatasetRequestScopeActive as i, captureDatasetRequestScope as j, exportParquet as k, exportScatterParquet as l, getSeriesColor$1 as m, buildAdaptiveLineY as n, formatTwoDecimals as o, downloadUrl as p, downloadBlob as q, formatTimestamp as r, setDropdownValue as s, toast as t, formatTimeTooltip as u, escapeHtml$1 as v, setColumnProfiles as w, setProfileGridBound as x, normalizeDtypeLabel as y, formatCount as z };
//# sourceMappingURL=app.js.map
