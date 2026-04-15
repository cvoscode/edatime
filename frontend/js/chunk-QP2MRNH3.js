import {
  buildGroupedDistributionSeries
} from "./chunk-RCXZ4YYT.js";
import {
  buildOverviewContextKey,
  buildScatterQueryContext,
  currentControls,
  state
} from "./chunk-B6MDIWXF.js";
import {
  MATRIX_MAX_COLUMNS,
  MATRIX_POINT_LIMIT,
  buildCategoricalColorGroups,
  createMiniCanvas,
  drawDistributionCanvas,
  drawMiniScatterCanvas,
  escapeHtml,
  fmt,
  getEl,
  setPanelStatus
} from "./chunk-76MF3RJR.js";
import {
  fetchScatterPoints
} from "./chunk-5ZUOH3TN.js";

// frontend/src/scatter/matrix.ts
function buildOverviewColumns() {
  const controls = currentControls();
  const columns = [];
  const push = (c) => {
    if (!c || columns.includes(c)) return;
    columns.push(c);
  };
  push(controls.x);
  push(controls.y);
  for (const item of state.lastSuggestions || []) {
    push(item?.column);
    if (columns.length >= MATRIX_MAX_COLUMNS) break;
  }
  for (const column of state.metadata?.numeric_columns || []) {
    push(column);
    if (columns.length >= MATRIX_MAX_COLUMNS) break;
  }
  return columns.slice(0, MATRIX_MAX_COLUMNS);
}
async function fetchMatrixCellData(x, y, context, colorColumn) {
  const cacheKey = `${x}|${y}|${colorColumn || ""}|${buildOverviewContextKey(context)}`;
  const cached = state.matrixCache.get(cacheKey);
  if (cached) return cached;
  const request = fetchScatterPoints(x, y, MATRIX_POINT_LIMIT, colorColumn || null, context).then((response) => ({
    totalPoints: Number(response?.total_points ?? 0),
    points: Array.isArray(response?.points) ? response.points : [],
    colorValues: Array.isArray(response?.color_values) ? response.color_values : null,
    colorLabels: Array.isArray(response?.color_labels) ? response.color_labels : null
  })).catch((error) => {
    state.matrixCache.delete(cacheKey);
    throw error;
  });
  state.matrixCache.set(cacheKey, request);
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
function renderMatrixGrid(columns, datasets, onCellClick) {
  const container = getEl("scatter-matrix");
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(columns) || columns.length < 2) {
    container.innerHTML = '<div class="scatter-placeholder">At least two numeric columns are required for the scatter matrix.</div>';
    return;
  }
  const controls = currentControls();
  const diagonalMode = controls.diagonalMode;
  const grid = document.createElement("div");
  grid.className = "scatter-matrix-grid";
  grid.style.gridTemplateColumns = `60px repeat(${columns.length}, minmax(132px, 1fr))`;
  const corner = document.createElement("div");
  corner.className = "scatter-matrix-corner";
  corner.innerHTML = '<span class="scatter-matrix-corner-axis">Y</span><span class="scatter-matrix-corner-sep">/</span><span class="scatter-matrix-corner-axis">X</span>';
  grid.appendChild(corner);
  for (const column of columns) {
    const header = document.createElement("div");
    header.className = "scatter-matrix-header";
    header.textContent = column;
    grid.appendChild(header);
  }
  const drawJobs = [];
  for (const rowColumn of columns) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "scatter-matrix-row-header";
    rowHeader.textContent = rowColumn;
    grid.appendChild(rowHeader);
    for (const column of columns) {
      const data = datasets.get(`${column}|${rowColumn}`) || { totalPoints: 0, points: [], colorValues: null, colorLabels: null };
      if (rowColumn === column) {
        const diagonal = document.createElement("div");
        diagonal.className = "scatter-matrix-diagonal";
        const canvas2 = createMiniCanvas("scatter-matrix-diagonal-canvas", 92);
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
      if (controls.x === column && controls.y === rowColumn) cell.classList.add("active");
      const canvas = createMiniCanvas("scatter-matrix-cell-canvas", 92);
      const categoryGroups = buildCategoricalColorGroups(data.colorLabels);
      drawJobs.push(() => {
        drawMiniScatterCanvas(canvas, data.points, {
          color: "#4a9eff",
          colorValues: data.colorValues,
          colorLabels: categoryGroups ? data.colorLabels : null,
          colorScale: controls.colorScale,
          categoryColors: categoryGroups?.colorByLabel
        });
      });
      const meta = document.createElement("div");
      meta.className = "scatter-matrix-meta";
      meta.innerHTML = `<span>${escapeHtml(column)} \u2192 ${escapeHtml(rowColumn)}</span><span>${escapeHtml(fmt.format(Number(data.totalPoints || data.points.length || 0)))} pts</span>`;
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
    renderMatrixGrid(columns, /* @__PURE__ */ new Map(), onCellClick);
    return;
  }
  const controls = currentControls();
  setPanelStatus("scatter-matrix-status", "Refreshing matrix for the current filters and linked time window...");
  const context = buildScatterQueryContext();
  const requestId = ++state.overviewRequestId;
  const pairs = [];
  for (const row of columns) for (const col of columns) pairs.push([col, row]);
  try {
    const resolved = await Promise.all(pairs.map(async ([col, row]) => {
      const data = await fetchMatrixCellData(col, row, context, controls.selectedColorColumn);
      return { key: `${col}|${row}`, data };
    }));
    if (requestId !== state.overviewRequestId) return;
    const datasets = new Map(resolved.map((e) => [e.key, e.data]));
    renderMatrixGrid(columns, datasets, onCellClick);
    const groups = buildCategoricalColorGroups(state.colorLabels);
    const groupText = groups && controls.selectedColorColumn ? ` Grouped distributions use ${controls.selectedColorColumn}.` : "";
    setPanelStatus("scatter-matrix-status", `Matrix shows ${columns.length} linked columns with ${describeDistributionMode(controls.diagonalMode)} diagonals.${groupText}`);
  } catch (error) {
    if (requestId !== state.overviewRequestId) return;
    console.error(error);
    renderMatrixGrid(columns, /* @__PURE__ */ new Map(), onCellClick);
    setPanelStatus("scatter-matrix-status", "Matrix preview is temporarily unavailable for this query.");
  }
}
async function renderScatterMatrixView(onCellClick) {
  await renderScatterOverview(onCellClick);
}

export {
  buildOverviewColumns,
  fetchMatrixCellData,
  selectMatrixPair,
  renderMatrixGrid,
  renderScatterOverview,
  renderScatterMatrixView
};
//# sourceMappingURL=chunk-QP2MRNH3.js.map
