import {
  renderScatterMatrixView,
  selectMatrixPair
} from "../chunk-QP2MRNH3.js";
import {
  fetchAndRenderDistributions
} from "../chunk-RCXZ4YYT.js";
import {
  buildOption,
  exportScatterData,
  exportScatterHTML,
  exportScatterPNG,
  exportScatterParquet,
  exportScatterSVG,
  initSelectionZoom,
  renderCurrentOption,
  syncModeUI,
  updateBinnedReadout,
  updateColorbarUI,
  updateCorrelationStats,
  updateMarginalPlots
} from "../chunk-XNPL4ZQK.js";
import {
  applyScatterStateFromCache,
  buildRenderSignature,
  buildScatterQueryContext,
  currentControls,
  disposeScatterChart,
  ensureOptions,
  isLinkedBrushEnabled,
  normalizeAnalyticsView,
  resetScatterContainer,
  state
} from "../chunk-B6MDIWXF.js";
import {
  getEl,
  showError
} from "../chunk-76MF3RJR.js";
import "../chunk-6X7ODBV6.js";
import {
  Ad
} from "../chunk-UUSB2KLH.js";
import {
  appState
} from "../chunk-UZD72PDA.js";
import {
  fetchScatterCorrelations,
  fetchScatterPoints
} from "../chunk-5ZUOH3TN.js";
import "../chunk-44BHGKBD.js";

// frontend/src/scatter/scatterPage.ts
function setSidebarAnalyticsSelection(viewName) {
  const navPage = viewName === "matrix" ? "scattermatrix" : viewName === "distributions" ? "distributions" : "scatter";
  for (const button of document.querySelectorAll(".sidebar .nav-item[data-page]")) {
    const page = button.dataset.page;
    const active = page === navPage;
    if (page === "scatter" || page === "scattermatrix" || page === "distributions") {
      button.classList.toggle("active", active);
    }
  }
}
async function setScatterView(viewName, options = {}) {
  const nextView = viewName || "plot";
  const shouldRender = options.render !== false;
  state.activeView = nextView;
  setSidebarAnalyticsSelection(nextView);
  syncModeUI();
  for (const panel of document.querySelectorAll("[data-scatter-view-panel]")) {
    panel.hidden = panel.dataset.scatterViewPanel !== nextView;
  }
  if (!shouldRender) return;
  if (nextView === "matrix") {
    await renderScatterMatrixView(onMatrixCellClick);
    return;
  }
  if (nextView === "distributions") {
    await fetchAndRenderDistributions();
    return;
  }
  requestAnimationFrame(() => state.chart?.resize?.());
}
function refreshActiveScatterView() {
  return setScatterView(state.activeView, { render: true });
}
function renderSuggestions(suggestions) {
  const box = getEl("scatter-suggestions");
  const ySelect = getEl("scatter-y-col");
  if (!box) return;
  state.lastSuggestions = Array.isArray(suggestions) ? suggestions.slice() : [];
  box.innerHTML = "";
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    const empty = document.createElement("span");
    empty.className = "scatter-suggestion-empty";
    empty.textContent = "No strong correlations above threshold.";
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
        console.error(err);
        showError(String(err?.message ?? err));
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
  const response = await fetchScatterCorrelations(xSelect.value || null, 0.7);
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
async function renderScatter() {
  const xSelect = getEl("scatter-x-col");
  const ySelect = getEl("scatter-y-col");
  let container = getEl("scatter-chart");
  if (!container || !xSelect || !ySelect || !xSelect.value || !ySelect.value) return;
  showError("");
  const ctl = currentControls();
  const renderSignature = buildRenderSignature(ctl);
  const colorColumn = ctl.selectedColorColumn || null;
  const response = await fetchScatterPoints(
    xSelect.value,
    ySelect.value,
    1e6,
    colorColumn,
    buildScatterQueryContext()
  );
  const points = Array.isArray(response.points) ? response.points : [];
  points.sort((a, b) => Number(a[0]) - Number(b[0]));
  state.totalPoints = Number(response.total_points ?? points.length);
  state.allPoints = points;
  state.allColorValues = Array.isArray(response.color_values) ? response.color_values : null;
  state.allColorLabels = Array.isArray(response.color_labels) ? response.color_labels : null;
  state.colorColumn = response.color || "";
  applyScatterStateFromCache(true);
  if (state.chart && state.lastRenderSignature !== renderSignature) {
    disposeScatterChart();
    container = resetScatterContainer() || getEl("scatter-chart");
  }
  const nextOption = buildOption(state.points, container);
  if (!state.chart) {
    state.chart = await Ad(container, nextOption);
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
}
async function rerenderScatterFromCache(resetViewFlag = true) {
  if (Array.isArray(state.allPoints) && state.allPoints.length > 0) {
    applyScatterStateFromCache(resetViewFlag);
    if (state.chart) renderCurrentOption();
    updateCorrelationStats();
    renderSuggestions(state.lastSuggestions);
  }
  await refreshActiveScatterView();
}
async function onMatrixCellClick(x, y) {
  try {
    await selectMatrixPair(x, y, refreshCorrelationsAndSuggestions, renderScatter, setScatterView);
  } catch (error) {
    console.error(error);
    showError(String(error?.message ?? error));
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
  if (!xSelect || !ySelect || !binSizeInput || !binSizeValue || !colormapSelect || !normalizationSelect || !renderModeSelect) return;
  window.__edatime = window.__edatime || {};
  window.__edatime.exportScatterData = exportScatterData;
  binSizeValue.textContent = binSizeInput.value;
  syncModeUI();
  void setScatterView(state.activeView, { render: false });
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
  linkBrushInput?.addEventListener("change", async () => {
    try {
      await renderScatter();
    } catch (err) {
      console.error(err);
      showError(String(err?.message ?? err));
    }
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
      console.error("Scatter parquet export failed:", error);
      showError(String(error?.message ?? error));
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
  window.addEventListener("edatime:chart-range-change", async () => {
    const page = getEl("page-scatter");
    if (page?.hidden) return;
    try {
      if (state.activeView === "distributions") await fetchAndRenderDistributions();
      else if (isLinkedBrushEnabled()) await renderScatter();
    } catch (err) {
      console.error(err);
      showError(String(err?.message ?? err));
    }
  });
  window.addEventListener("edatime:column-filters-change", async () => {
    const page = getEl("page-scatter");
    if (page?.hidden) return;
    try {
      if (state.activeView === "distributions") await fetchAndRenderDistributions();
      else await renderScatter();
    } catch (err) {
      console.error(err);
      showError(String(err?.message ?? err));
    }
  });
  window.addEventListener("edatime:adaptive-filters-change", async () => {
    const page = getEl("page-scatter");
    if (page?.hidden) return;
    try {
      if (state.activeView === "distributions") await fetchAndRenderDistributions();
      else await renderScatter();
    } catch (err) {
      console.error(err);
      showError(String(err?.message ?? err));
    }
  });
  window.addEventListener("edatime:page-change", async (ev) => {
    if (ev?.detail?.page !== "scatter") return;
    state.activeView = normalizeAnalyticsView(ev?.detail?.analyticsView);
    await setScatterView(state.activeView, { render: false });
    if (!state.pageInitialized) {
      refreshCorrelationsAndSuggestions().then(() => renderScatter()).then(() => {
        state.pageInitialized = true;
      }).catch((err) => {
        console.error(err);
        showError(String(err?.message ?? err));
      });
    } else {
      try {
        if (isLinkedBrushEnabled() || Object.keys(appState.columnRanges || {}).length > 0 || (appState.adaptiveLineFilters || []).length > 0) {
          await renderScatter();
        } else {
          await rerenderScatterFromCache(true);
        }
      } catch (err) {
        console.error(err);
        showError(String(err?.message ?? err));
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
  state.selectedDistributionColumn = "";
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
    console.error(err);
    showError(String(err?.message ?? err));
  }
}
export {
  initScatterPage
};
//# sourceMappingURL=scatterPage.js.map
