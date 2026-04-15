import {
  computeColorExtent,
  computeDomains,
  fmt,
  getEl,
  isDistributionCompatibleColumn
} from "./chunk-76MF3RJR.js";
import {
  appState,
  buildAdaptiveLineFiltersForQuery
} from "./chunk-UZD72PDA.js";

// frontend/src/scatter/state.ts
var state = {
  chart: null,
  initialized: false,
  pageInitialized: false,
  activeView: "plot",
  selectedDistributionColumn: "",
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
  overviewRequestId: 0,
  distributionData: null,
  distributionsFetchId: 0
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
    colorScale: colorScaleSelect?.value || "viridis"
  };
}
function isLinkedBrushEnabled() {
  return !!getEl("scatter-link-brush")?.checked;
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
  return {
    start: isLinkedBrushEnabled() && Number.isFinite(start) ? start : void 0,
    end: isLinkedBrushEnabled() && Number.isFinite(end) ? end : void 0,
    filters,
    lineFilters: buildAdaptiveLineFiltersForQuery()
  };
}
function buildDistributionsContext() {
  const start = Number(appState.currentStart);
  const end = Number(appState.currentEnd);
  const filters = Object.entries(appState.columnRanges || {}).map(([column, range]) => {
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!column || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    return { column, from, to };
  }).filter((f) => f !== null);
  return {
    start: Number.isFinite(start) ? start : void 0,
    end: Number.isFinite(end) ? end : void 0,
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
  state.points = Array.isArray(state.allPoints) ? state.allPoints.slice() : [];
  state.colorValues = Array.isArray(state.allColorValues) ? state.allColorValues.slice() : null;
  state.colorLabels = Array.isArray(state.allColorLabels) ? state.allColorLabels.slice() : null;
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
function getDistributionColumns(controls = currentControls()) {
  const columns = [];
  const push = (c) => {
    if (!c || columns.includes(c) || !isDistributionCompatibleColumn(c, state.columnTypes)) return;
    columns.push(c);
  };
  push(controls.x);
  push(controls.y);
  push(controls.selectedColorColumn);
  for (const entry of state.metadata?.columns || []) push(entry?.name);
  return columns;
}
function resolveSelectedDistributionColumn(entries = getDistributionColumns()) {
  if (entries.includes(state.selectedDistributionColumn)) return state.selectedDistributionColumn;
  state.selectedDistributionColumn = entries[0] || "";
  return state.selectedDistributionColumn;
}
function describeDistributionColumnKind(column, controls = currentControls()) {
  const kinds = [];
  if (column === controls.x) kinds.push("x-axis");
  if (column === controls.y) kinds.push("y-axis");
  if (column === controls.selectedColorColumn) kinds.push("color");
  return kinds.join(" / ") || "dataset";
}
function normalizeAnalyticsView(viewName) {
  if (viewName === "matrix" || viewName === "distributions") return viewName;
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
  state,
  currentControls,
  isLinkedBrushEnabled,
  buildScatterQueryContext,
  buildDistributionsContext,
  buildRenderSignature,
  buildOverviewContextKey,
  clampView,
  applyScatterStateFromCache,
  setStats,
  getPlotMetrics,
  getProfileForColumn,
  getProfileHistogram,
  getCurrentScatterValues,
  getDistributionColumns,
  resolveSelectedDistributionColumn,
  describeDistributionColumnKind,
  normalizeAnalyticsView,
  disposeScatterChart,
  resetScatterContainer,
  ensureOptions
};
//# sourceMappingURL=chunk-B6MDIWXF.js.map
