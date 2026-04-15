import {
  buildColumnToggles,
  buildRangeControls,
  initColumnFilterModal
} from "./chunk-2MNTF6DE.js";
import {
  hydrateColumnProfiles,
  initColumnProfilesGrid,
  renderColumnProfilesGrid
} from "./chunk-4XXNSLY7.js";
import {
  bindAnalysisChartEvents,
  getCurrentView,
  initAnalysisControls,
  initChartPageFilterGesture,
  initPages,
  refreshZoomControlsState,
  resetZoom,
  updateAnalysisYRange,
  updateAnalysisZoom,
  zoomOut
} from "./chunk-USUPCIYD.js";
import {
  applyPartialTimeRangeFromMetadata,
  initUploadPanel,
  setUploadPreviewStatus
} from "./chunk-NWXUSCBX.js";
import {
  FallbackChart
} from "./chunk-WNQN3AWD.js";
import {
  appState,
  applyColumnRanges,
  buildMetaBar,
  ensureRangeStateFromData,
  sanitizeSelectedColumns,
  setMetaText
} from "./chunk-UZD72PDA.js";
import {
  getChartType,
  registerChartType
} from "./chunk-DFGZUWW3.js";
import {
  DEBUG,
  dbg,
  dbgGroup
} from "./chunk-44BHGKBD.js";

// frontend/src/app.ts
var fetchMetadata = null;
var fetchData = null;
var DataChartCtor = null;
async function ensureChartModules() {
  if (fetchMetadata && fetchData && DataChartCtor) return;
  const [dataClient, chartModule] = await Promise.all([
    import("./dataClient.js"),
    import("./chart/DataChart.js")
  ]);
  fetchMetadata = dataClient.fetchMetadata;
  fetchData = dataClient.fetchData;
  DataChartCtor = chartModule.DataChart;
  registerChartType("line", {
    label: "Line",
    create: (containerId, callbacks) => new DataChartCtor(
      containerId,
      callbacks.onZoom,
      callbacks.onYRange,
      callbacks.onZoomOut
    )
  });
  registerChartType("fallback", {
    label: "Fallback (Canvas 2D)",
    create: (containerId) => new FallbackChart(containerId)
  });
}
async function checkWebGPU() {
  if (!navigator.gpu)
    return "WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.";
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("requestAdapter timed out")), 5e3));
    const adapter = await Promise.race([navigator.gpu.requestAdapter(), timeout]);
    if (!adapter)
      return "No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.";
  } catch (e) {
    return `WebGPU adapter request failed: ${e.message}`;
  }
  return null;
}
function showFatalError(message) {
  const container = document.getElementById("main-chart");
  if (container)
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff4a6e;font-size:1rem;padding:2rem;text-align:center;">${message}</div>`;
  setMetaText("Error \u2014 rendering unavailable");
}
function computeRenderedYDebugSnapshot() {
  if (!appState.lastFetchedData) return null;
  const filtered = applyColumnRanges(appState.lastFetchedData);
  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;
  const perSeries = [];
  for (const col of appState.selectedCols || []) {
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
    selectedCols: [...appState.selectedCols || []],
    globalYMin: Number.isFinite(globalMin) ? globalMin : null,
    globalYMax: Number.isFinite(globalMax) ? globalMax : null,
    perSeries
  };
}
function renderCurrentData() {
  if (!appState.chart || !appState.lastFetchedData) return;
  const filtered = applyColumnRanges(appState.lastFetchedData);
  appState.chart.updateDataMulti(filtered, appState.selectedCols);
}
function emitAdaptiveFiltersChange() {
  window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change", {
    detail: { count: (appState.adaptiveLineFilters || []).length }
  }));
}
function buildAdaptiveFilterFromPoints(column, firstPoint, secondPoint) {
  if (!column || !firstPoint || !secondPoint) return null;
  if (!appState.lastFetchedData) return null;
  const filtered = applyColumnRanges(appState.lastFetchedData);
  const series = filtered.series?.[column];
  const xs = series?.x;
  const ys = series?.y;
  if (!xs || !ys || xs.length === 0 || xs.length !== ys.length) return null;
  const x1 = Number(firstPoint.x);
  const y1 = Number(firstPoint.y);
  const x2 = Number(secondPoint.x);
  const y2 = Number(secondPoint.y);
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2) || x1 === x2) return null;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const slope = (y2 - y1) / (x2 - x1);
  let above = 0;
  let below = 0;
  for (let idx = 0; idx < xs.length; idx++) {
    const x = Number(xs[idx]);
    const y = Number(ys[idx]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
    const lineY = y1 + (x - x1) * slope;
    if (!Number.isFinite(lineY)) continue;
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
function applyAdaptiveFiltersLocally(sourceKind = "adaptive") {
  buildRangeControls();
  renderCurrentData();
  appState.chart?.requestOverlayRender?.();
  appState.chart?.fitYToData?.();
  const yr = appState.chart?.getYRange?.();
  if (yr) updateAnalysisYRange(yr.min, yr.max, sourceKind);
  emitAdaptiveFiltersChange();
}
function initAdaptiveFilterGesture() {
  const container = document.getElementById("main-chart");
  if (!container || container.dataset.adaptiveBound) return;
  container.addEventListener("click", (event) => {
    if (!event.ctrlKey || event.button !== 0) return;
    if (!appState.chart?.cssPointToData) return;
    const activeColumn = appState.selectedCols?.includes(appState.adaptiveFilterColumn) ? appState.adaptiveFilterColumn : appState.selectedCols?.[0];
    if (!activeColumn) return;
    const point = appState.chart.cssPointToData(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const pending = appState.pendingAdaptivePoint;
    if (!pending || pending.column !== activeColumn) {
      appState.pendingAdaptivePoint = { column: activeColumn, x: point.x, y: point.y };
      appState.chart?.requestOverlayRender?.();
      return;
    }
    const filter = buildAdaptiveFilterFromPoints(activeColumn, pending, point);
    appState.pendingAdaptivePoint = { column: activeColumn, x: point.x, y: point.y };
    if (!filter) return;
    appState.adaptiveLineFilters = [...appState.adaptiveLineFilters || [], filter];
    applyAdaptiveFiltersLocally();
  }, true);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      appState.pendingAdaptivePoint = null;
      appState.chart?.requestOverlayRender?.();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Control" && appState.pendingAdaptivePoint) {
      appState.pendingAdaptivePoint = null;
      appState.chart?.requestOverlayRender?.();
    }
  });
  window.addEventListener("edatime:adaptive-filters-change", () => {
    if (!appState.lastFetchedData) return;
    buildRangeControls();
    renderCurrentData();
    appState.chart?.requestOverlayRender?.();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, "adaptive");
  });
  container.dataset.adaptiveBound = "1";
}
function emitChartRangeChange(sourceKind = "data") {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  window.dispatchEvent(new CustomEvent("edatime:chart-range-change", {
    detail: { start: appState.currentStart, end: appState.currentEnd, source: sourceKind }
  }));
}
async function fetchAndRender() {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  if (appState.currentStart >= appState.currentEnd) return;
  try {
    sanitizeSelectedColumns();
    const startIso = new Date(appState.currentStart).toISOString();
    const endIso = new Date(appState.currentEnd).toISOString();
    const width = document.getElementById("main-chart")?.clientWidth || 1200;
    const cols = appState.selectedCols.join(",");
    const colorCol = appState.selectedColorColumn || null;
    dbgGroup("fetchAndRender", () => {
      dbg("request", { startIso, endIso, width, cols, colorCol });
      dbg("selectedCols", appState.selectedCols);
      dbg("selectedColorColumn", appState.selectedColorColumn);
    });
    const data = await fetchData(startIso, endIso, width, cols, colorCol);
    appState.lastFetchedData = data;
    if (DEBUG) {
      const n = data?.ts?.length ?? 0;
      let tsMin = null;
      let tsMax = null;
      if (n > 0) {
        tsMin = data.ts[0];
        tsMax = data.ts[n - 1];
      }
      dbg("response points", n, "tsMin/tsMax", tsMin, tsMax);
      if (!data?.ts || data.ts.length === 0) console.warn("[edatime] fetchAndRender: empty result for range", { startIso, endIso, width, cols });
    }
    ensureRangeStateFromData(data);
    buildRangeControls();
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
    renderCurrentData();
    emitChartRangeChange("data");
    if (DEBUG) {
      const snapshot = computeRenderedYDebugSnapshot();
      window.__edatime.debugYSnapshot = snapshot;
      dbg("post-render renderedSnapshot", snapshot);
    }
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, "data");
    if (DEBUG) dbg("post-render yRange", yr);
    appState.pendingYMode = null;
    appState.pendingRestoreY = null;
  } catch (err) {
    console.error("Failed to fetch data:", err);
    setMetaText("Error: " + err.message);
  }
}
function onZoomRangeChange(newStart, newEnd, sourceKind = "user") {
  if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
  dbgGroup(`onZoomRangeChange (${sourceKind})`, () => {
    dbg("prev", { start: appState.currentStart, end: appState.currentEnd });
    dbg("next", { start: newStart, end: newEnd });
  });
  if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) return;
  if (Number.isFinite(appState.currentStart) && Number.isFinite(appState.currentEnd)) {
    const snap = getCurrentView();
    appState.zoomHistory = [...appState.zoomHistory, snap].slice(-5);
    dbg("pushed history snapshot", snap);
    dbg("history depth (after push)", appState.zoomHistory.length);
  }
  appState.currentStart = newStart;
  appState.currentEnd = newEnd;
  appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
  appState.pendingYMode = "fit";
  appState.pendingRestoreY = null;
  updateAnalysisZoom(newStart, newEnd, sourceKind);
  emitChartRangeChange(sourceKind);
  if (!appState.refetchOnZoom) return;
  appState.fetchDebounceId = setTimeout(fetchAndRender, 150);
}
function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
function currentPageName() {
  return document.querySelector(".page[data-page-name]:not([hidden])")?.dataset?.pageName || "timeseries";
}
function showPage(pageName) {
  document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`)?.click?.();
}
function initKeyboardShortcuts() {
  if (window.__edatime?.keyboardShortcutsBound) return;
  window.__edatime = window.__edatime || {};
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const key = String(event.key || "").toLowerCase();
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (key === "1") {
        event.preventDefault();
        showPage("upload");
        return;
      }
      if (key === "2") {
        event.preventDefault();
        showPage("timeseries");
        return;
      }
      if (key === "3") {
        event.preventDefault();
        showPage("scatter");
        return;
      }
      if (key === "4") {
        event.preventDefault();
        showPage("scattermatrix");
        return;
      }
      if (key === "5") {
        event.preventDefault();
        showPage("distributions");
        return;
      }
    }
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "r" && currentPageName() === "timeseries") {
      event.preventDefault();
      resetZoom(fetchAndRender);
      return;
    }
    if (key === "z" && currentPageName() === "timeseries") {
      event.preventDefault();
      zoomOut(fetchAndRender);
      return;
    }
    if (key === "c" && currentPageName() === "timeseries") {
      event.preventDefault();
      document.getElementById("adaptive-clear-btn")?.click?.();
      return;
    }
    if (key === "e") {
      event.preventDefault();
      if (currentPageName() === "scatter") document.getElementById("scatter-export-csv-btn")?.click?.();
      else window.__edatime?.exportChartFilteredData?.("csv");
    }
  });
  window.__edatime.keyboardShortcutsBound = true;
}
async function initScatterPageModule() {
  const scatterPage = document.getElementById("page-scatter");
  if (!scatterPage) return;
  const { initScatterPage } = await import("./scatter/scatterPage.js");
  await initScatterPage(appState.metadata);
}
async function init() {
  initPages();
  initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid);
  initColumnProfilesGrid();
  initAnalysisControls(fetchAndRender);
  initColumnFilterModal(renderCurrentData, updateAnalysisYRange);
  initChartPageFilterGesture();
  initKeyboardShortcuts();
  try {
    await ensureChartModules();
  } catch (e) {
    console.error("Chart/data modules failed to load:", e);
    setMetaText("Chart modules failed to load, but upload is available.");
    return;
  }
  const gpuError = await checkWebGPU();
  if (gpuError) {
    showFatalError(gpuError);
    return;
  }
  try {
    appState.metadata = await fetchMetadata();
    dbgGroup("metadata", () => dbg(appState.metadata));
    setMetaText("Loading chart\u2026");
    await initScatterPageModule();
    if (!appState.metadata.time_range) {
      setMetaText("No valid time range found.");
      return;
    }
    appState.numericCols = (appState.metadata.numeric_columns || []).filter((col) => col && col.toLowerCase() !== "ts");
    appState.selectedCols = appState.numericCols.length > 0 ? [appState.numericCols[0]] : ["value"];
    appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
    sanitizeSelectedColumns();
    const columnFilterInput = document.getElementById("column-filter-input");
    if (columnFilterInput) {
      columnFilterInput.addEventListener("input", () => {
        appState.filterText = (columnFilterInput.value || "").trim().toLowerCase();
        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
      });
    }
    const profileFilterInput = document.getElementById("profile-filter-input");
    if (profileFilterInput) {
      profileFilterInput.addEventListener("input", () => {
        appState.profileFilterText = (profileFilterInput.value || "").trim().toLowerCase();
        renderColumnProfilesGrid(true);
      });
    }
    hydrateColumnProfiles(appState.metadata);
    renderColumnProfilesGrid(true);
    applyPartialTimeRangeFromMetadata(appState.metadata, false);
    setUploadPreviewStatus("Showing current dataset profile. Drop/select a file to preview before loading.");
    buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
    buildMetaBar(appState.metadata);
    buildRangeControls();
    appState.currentStart = Number(appState.metadata.time_range.min);
    appState.currentEnd = Number(appState.metadata.time_range.max);
    updateAnalysisZoom(appState.currentStart, appState.currentEnd, "initial");
    emitChartRangeChange("initial");
    dbg("initial X range (ms)", { start: appState.currentStart, end: appState.currentEnd });
    const lineType = getChartType("line");
    if (lineType) {
      appState.chart = lineType.create("main-chart", {
        onZoom: onZoomRangeChange,
        onYRange: updateAnalysisYRange,
        onZoomOut: () => zoomOut(fetchAndRender)
      });
    } else {
      appState.chart = new DataChartCtor("main-chart", onZoomRangeChange, updateAnalysisYRange, () => zoomOut(fetchAndRender));
    }
    await Promise.race([
      appState.chart.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ChartGPU init timed out")), 6e3))
    ]);
    appState.analysisBound = false;
    bindAnalysisChartEvents();
    initAdaptiveFilterGesture();
    refreshZoomControlsState();
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
    appState.chart?.setChartText?.(
      appState.chartText?.title || "",
      appState.chartText?.xLabel || "",
      appState.chartText?.yLabel || ""
    );
    await fetchAndRender();
    appState.initialView = getCurrentView();
    dbgGroup("initialView snapshot", () => dbg(appState.initialView));
  } catch (e) {
    console.error("Primary chart failed, switching to fallback:", e);
    try {
      const fallbackType = getChartType("fallback");
      appState.chart = fallbackType ? fallbackType.create("main-chart", {}) : new FallbackChart("main-chart");
      await appState.chart.init();
      appState.analysisBound = false;
      bindAnalysisChartEvents();
      refreshZoomControlsState();
      await fetchAndRender();
      setMetaText("Fallback renderer active");
    } catch (fallbackErr) {
      console.error("Fallback chart also failed:", fallbackErr);
      setMetaText("Error: " + fallbackErr.message);
    }
  }
}
init();
//# sourceMappingURL=app.js.map
