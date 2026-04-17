import {
  DEBUG,
  dbg,
  dbgGroup
} from "./chunk-P2MGEQ7G.js";
import {
  PROFILE_COLUMNS,
  PROFILE_OVERSCAN,
  PROFILE_ROW_HEIGHT,
  SERIES_COLORS,
  appState,
  applyColumnRanges,
  buildAdaptiveLineFiltersForQuery,
  buildAdaptiveLineY,
  buildMetaBar,
  computeBounds,
  downloadBlob,
  ensureRangeStateFromData,
  escapeHtml,
  formatAnalysisNumber,
  formatAnalysisTime,
  formatCount,
  formatProfileValue,
  formatToDatetimeLocal,
  getDefaultProfileColumnWidths,
  getSeriesColor,
  normalizeDtypeLabel,
  sanitizeSelectedColumns,
  setMetaText,
  setSeriesColor,
  toFiniteNumberOrNull
} from "./chunk-IXP3VB4N.js";

// frontend/src/ui/columns.ts
function buildColumnToggles(fetchAndRender2, buildRangeControlsFn, renderCurrentDataFn = null) {
  sanitizeSelectedColumns();
  if (!appState.selectedCols.includes(appState.adaptiveFilterColumn)) {
    appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
  }
  const container = document.getElementById("column-toggles");
  if (!container) return;
  container.innerHTML = "";
  if (!container.dataset.ctxBound) {
    let lastContextTs = 0;
    let lastContextCol = "";
    container.addEventListener("contextmenu", (e) => {
      const chip = e.target?.closest?.(".series-chip");
      if (!chip) return;
      const input = chip.querySelector('input[type="checkbox"]');
      const col = input?.value;
      if (!col) return;
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      const isDoubleContext = lastContextCol === col && now - lastContextTs <= 450;
      lastContextTs = now;
      lastContextCol = col;
      if (!isDoubleContext) return;
      lastContextTs = 0;
      lastContextCol = "";
      const open = window.__edatime?.openFilterForCol;
      if (typeof open !== "function") return;
      open(col);
    });
    container.dataset.ctxBound = "1";
  }
  const visibleCols = appState.numericCols.filter((col) => {
    if (!appState.filterText) return true;
    return col.toLowerCase().includes(appState.filterText);
  });
  const colorControl = document.createElement("div");
  colorControl.className = "series-color-selector";
  colorControl.innerHTML = `
    <label>
      <span>Color by</span>
      <select id="color-column-select" aria-label="Color-by column"></select>
    </label>
  `;
  container.appendChild(colorControl);
  const colorSelect = colorControl.querySelector("#color-column-select");
  if (colorSelect) {
    colorSelect.innerHTML = '<option value="">None</option>';
    const metadataCols = (appState.metadata?.columns || []).map((c) => ({
      name: c?.name,
      dtype: c?.dtype
    }));
    for (const col of metadataCols) {
      const name = String(col.name || "").trim();
      if (!name) continue;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === appState.selectedColorColumn) opt.selected = true;
      colorSelect.appendChild(opt);
    }
    colorSelect.onchange = () => {
      appState.selectedColorColumn = colorSelect.value || null;
      if (typeof fetchAndRender2 === "function") fetchAndRender2();
    };
  }
  if (visibleCols.length === 0) {
    const empty = document.createElement("span");
    empty.className = "series-empty";
    empty.textContent = "No matching columns";
    container.appendChild(empty);
    return;
  }
  visibleCols.forEach((col, idx) => {
    const color = getSeriesColor(col, idx);
    const isActive = appState.selectedCols.includes(col);
    const isAdaptiveTarget = isActive && appState.adaptiveFilterColumn === col;
    const chip = document.createElement("label");
    chip.className = "series-chip" + (isActive ? " active" : "") + (isAdaptiveTarget ? " adaptive-target" : "");
    chip.style.setProperty("--chip-accent", color);
    chip.title = isAdaptiveTarget ? `Adaptive filter target: ${col}` : `Ctrl+click to target adaptive filters to ${col}`;
    chip.innerHTML = `
      <input type="checkbox" ${isActive ? "checked" : ""} value="${escapeHtml(col)}">
      <span class="chip-dot" style="background:${escapeHtml(color)}"></span>
      <span class="chip-label">${escapeHtml(col)}</span>
      <input type="color" class="chip-color-picker" value="${escapeHtml(color)}" aria-label="Set ${escapeHtml(col)} color" title="Set ${escapeHtml(col)} color">
    `;
    chip.addEventListener(
      "click",
      (e) => {
        if (e.target?.closest?.(".chip-color-picker")) return;
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();
        const hadColumn = appState.selectedCols.includes(col);
        if (!hadColumn) appState.selectedCols.push(col);
        appState.adaptiveFilterColumn = col;
        appState.pendingAdaptivePoint = null;
        buildMetaBar(appState.metadata);
        buildColumnToggles(fetchAndRender2, buildRangeControlsFn, renderCurrentDataFn);
        buildRangeControlsFn();
        appState.chart?.requestOverlayRender?.();
        if (!hadColumn) fetchAndRender2();
      },
      true
    );
    const checkbox = chip.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        if (!appState.selectedCols.includes(col)) appState.selectedCols.push(col);
        chip.classList.add("active");
      } else {
        appState.selectedCols = appState.selectedCols.filter((c) => c !== col);
        chip.classList.remove("active");
      }
      if (appState.selectedCols.length === 0) {
        checkbox.checked = true;
        appState.selectedCols.push(col);
        chip.classList.add("active");
      }
      if (!appState.selectedCols.includes(appState.adaptiveFilterColumn)) {
        appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
      }
      buildMetaBar(appState.metadata);
      buildRangeControlsFn();
      appState.chart?.requestOverlayRender?.();
      fetchAndRender2();
    });
    const colorInput = chip.querySelector(".chip-color-picker");
    for (const eventName of ["pointerdown", "mousedown", "click", "dblclick"]) {
      colorInput.addEventListener(eventName, (event) => event.stopPropagation());
    }
    colorInput.addEventListener("input", (event) => {
      const nextColor = setSeriesColor(col, event.target.value);
      if (!nextColor) return;
      chip.style.setProperty("--chip-accent", nextColor);
      const dot = chip.querySelector(".chip-dot");
      if (dot) dot.style.background = nextColor;
      renderCurrentDataFn?.();
    });
    container.appendChild(chip);
  });
}
function buildRangeControls() {
  const container = document.getElementById("column-range-controls");
  if (!container) return;
  container.innerHTML = "";
  if (appState.adaptiveFilterColumn && appState.selectedCols.includes(appState.adaptiveFilterColumn)) {
    const targetChip = document.createElement("div");
    targetChip.className = "range-chip";
    targetChip.innerHTML = `
      <span class="name">Adaptive target</span>
      <span class="range">${appState.adaptiveFilterColumn}</span>
    `;
    container.appendChild(targetChip);
  }
  for (const col of appState.selectedCols) {
    const range = appState.columnRanges[col];
    if (!range) continue;
    const chip = document.createElement("div");
    chip.className = "range-chip range-chip--clickable";
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    chip.setAttribute("aria-label", `Filter ${col}`);
    chip.innerHTML = `
      <span class="name">${col}</span>
      <span class="range">${formatAnalysisNumber(range.from)} \u2192 ${formatAnalysisNumber(range.to)}</span>
    `;
    const open = () => {
      const fn = window.__edatime?.openFilterForCol;
      if (typeof fn === "function") fn(col);
    };
    chip.addEventListener("click", open);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    container.appendChild(chip);
  }
  for (const filter of appState.adaptiveLineFilters || []) {
    const chip = document.createElement("div");
    chip.className = "range-chip range-chip--clickable";
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    chip.setAttribute("aria-label", `Remove adaptive filter for ${filter.column}`);
    chip.innerHTML = `
      <span class="name">Adaptive ${filter.column}</span>
      <span class="range">${filter.keepAbove ? "keep above" : "keep below"}</span>
    `;
    const remove = () => {
      appState.adaptiveLineFilters = (appState.adaptiveLineFilters || []).filter(
        (item) => item.id !== filter.id
      );
      appState.pendingAdaptivePoint = null;
      buildRangeControls();
      window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change"));
    };
    chip.addEventListener("click", remove);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        remove();
      }
    });
    container.appendChild(chip);
  }
  if ((appState.adaptiveLineFilters || []).length > 0 || appState.pendingAdaptivePoint) {
    const clearChip = document.createElement("div");
    clearChip.className = "range-chip range-chip--clickable";
    clearChip.setAttribute("role", "button");
    clearChip.setAttribute("tabindex", "0");
    clearChip.setAttribute("aria-label", "Clear adaptive filters");
    clearChip.innerHTML = `
      <span class="name">Adaptive filters</span>
      <span class="range">Clear all</span>
    `;
    const clearAll = () => {
      appState.adaptiveLineFilters = [];
      appState.pendingAdaptivePoint = null;
      buildRangeControls();
      appState.chart?.requestOverlayRender?.();
      window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change"));
    };
    clearChip.addEventListener("click", clearAll);
    clearChip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clearAll();
      }
    });
    container.appendChild(clearChip);
  }
}
function initColumnFilterModal(renderCurrentData2, updateAnalysisYRange2) {
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
  let activeBounds = null;
  function emitColumnFiltersChange() {
    window.dispatchEvent(new CustomEvent("edatime:column-filters-change"));
  }
  function setHint(text) {
    hint.textContent = text || "";
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
    rangeMinValue.textContent = formatAnalysisNumber(from);
    rangeMaxValue.textContent = formatAnalysisNumber(to);
    if (!activeBounds) {
      rangeFill.style.left = "0%";
      rangeFill.style.width = "0%";
      return;
    }
    const span = activeBounds.max - activeBounds.min;
    if (!(span > 0)) {
      rangeFill.style.left = "0%";
      rangeFill.style.width = "100%";
      return;
    }
    const leftPct = (from - activeBounds.min) / span * 100;
    const rightPct = (to - activeBounds.min) / span * 100;
    const clampedLeft = Math.max(0, Math.min(100, leftPct));
    const clampedRight = Math.max(clampedLeft, Math.min(100, rightPct));
    rangeFill.style.left = `${clampedLeft}%`;
    rangeFill.style.width = `${Math.max(0, clampedRight - clampedLeft)}%`;
  }
  function updateSliderConfig(bounds) {
    activeBounds = bounds;
    if (!bounds) {
      minRangeInput.disabled = true;
      maxRangeInput.disabled = true;
      updateRangeFill(0, 0);
      return;
    }
    const step = computeSliderStep(bounds);
    const min = String(bounds.min);
    const max = String(bounds.max);
    const disabled = !(bounds.max > bounds.min);
    for (const input of [minRangeInput, maxRangeInput]) {
      input.min = min;
      input.max = max;
      input.step = String(step);
      input.disabled = disabled;
    }
    updateRangeFill(bounds.min, bounds.max);
  }
  function syncSliderValues(from, to) {
    minRangeInput.value = String(from);
    maxRangeInput.value = String(to);
  }
  function syncInputsFromValues(from, to) {
    minInput.value = formatInputValue(from);
    maxInput.value = formatInputValue(to);
    syncSliderValues(from, to);
    updateRangeFill(from, to);
  }
  function readInputs() {
    let from = Number.parseFloat(minInput.value);
    let to = Number.parseFloat(maxInput.value);
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
    let from = Number.parseFloat(minRangeInput.value);
    let to = Number.parseFloat(maxRangeInput.value);
    if (changed === "min" && from > to) to = from;
    if (changed === "max" && to < from) from = to;
    if (activeBounds) {
      from = clampToBounds(from, activeBounds);
      to = clampToBounds(to, activeBounds);
    }
    syncInputsFromValues(from, to);
  }
  function getFullBoundsForCol(col) {
    const rawValues = appState.lastFetchedData?.values?.[col];
    const filteredSeries = appState.lastFetchedData?.series;
    const filteredValues = filteredSeries?.[col]?.y;
    const dataBounds = computeBounds(rawValues || filteredValues || new Float64Array(0));
    if (dataBounds) return dataBounds;
    const profile = (appState.metadata?.column_profiles || []).find((item) => item?.name === col);
    const min = Number(profile?.min);
    const max = Number(profile?.max);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
    return null;
  }
  function populateColumns(selectedCol = null) {
    const cols = appState.selectedCols || [];
    colSelect.innerHTML = "";
    if (cols.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No series selected";
      colSelect.appendChild(opt);
      colSelect.value = "";
      return;
    }
    for (const col of cols) {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      colSelect.appendChild(opt);
    }
    if (selectedCol && cols.includes(selectedCol)) colSelect.value = selectedCol;
    else colSelect.value = cols[0];
  }
  function refreshInputsForCol(col) {
    if (!col) {
      minInput.value = "";
      maxInput.value = "";
      updateSliderConfig(null);
      applyBtn.disabled = true;
      clearBtn.disabled = true;
      setHint("Select a column to filter.");
      return;
    }
    if (!appState.lastFetchedData) {
      updateSliderConfig(null);
      applyBtn.disabled = true;
      clearBtn.disabled = true;
      setHint("Data not loaded yet.");
      return;
    }
    const full = getFullBoundsForCol(col);
    if (!full) {
      applyBtn.disabled = true;
      clearBtn.disabled = true;
      updateSliderConfig(null);
      setHint("No numeric range is available for this column.");
      return;
    }
    const cur = appState.columnRanges[col] ?? { from: full.min, to: full.max };
    updateSliderConfig(full);
    syncInputsFromValues(cur.from, cur.to);
    applyBtn.disabled = false;
    clearBtn.disabled = false;
    setHint(`Available range: ${formatAnalysisNumber(full.min)} \u2192 ${formatAnalysisNumber(full.max)}`);
  }
  function openModalForCol(col) {
    populateColumns(col || colSelect.value || appState.selectedCols?.[0] || null);
    refreshInputsForCol(colSelect.value);
    modal.hidden = false;
    try {
      minInput.focus();
    } catch {
    }
  }
  function closeModal() {
    modal.hidden = true;
    setHint("");
  }
  window.__edatime = window.__edatime || {};
  window.__edatime.openFilterForCol = openModalForCol;
  for (const btn of openBtns) {
    btn.addEventListener("click", () => openModalForCol(null));
  }
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") closeModal();
  });
  colSelect.addEventListener("change", () => refreshInputsForCol(colSelect.value));
  minInput.addEventListener("input", syncFromNumericInputs);
  maxInput.addEventListener("input", syncFromNumericInputs);
  minRangeInput.addEventListener("input", () => syncFromRangeInputs("min"));
  maxRangeInput.addEventListener("input", () => syncFromRangeInputs("max"));
  clearBtn.addEventListener("click", () => {
    const col = colSelect.value;
    const full = getFullBoundsForCol(col);
    if (!col || !full) return;
    appState.columnRanges[col] = { from: full.min, to: full.max };
    buildRangeControls();
    renderCurrentData2();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange2(yr.min, yr.max, "filter");
    emitColumnFiltersChange();
    refreshInputsForCol(col);
  });
  applyBtn.addEventListener("click", () => {
    const col = colSelect.value;
    if (!col) return;
    let { from, to } = readInputs();
    const full = getFullBoundsForCol(col);
    if (full) {
      if (!Number.isFinite(from)) from = full.min;
      if (!Number.isFinite(to)) to = full.max;
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      setHint("Enter a valid min and max.");
      return;
    }
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    appState.columnRanges[col] = { from, to };
    buildRangeControls();
    renderCurrentData2();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange2(yr.min, yr.max, "filter");
    emitColumnFiltersChange();
    closeModal();
  });
  modal.dataset.bound = "1";
}

// frontend/src/ui/upload.ts
function setUploadPreviewStatus(text, kind = "") {
  const el = document.getElementById("upload-preview-status");
  if (!el) return;
  el.textContent = text;
  el.className = `upload-preview-status ${kind}`.trim();
}
function applyPartialTimeRangeFromMetadata(metadata, overwriteInputs = true) {
  const startInput = document.getElementById("time-start-input");
  const endInput = document.getElementById("time-end-input");
  const hint = document.getElementById("time-range-hint");
  if (!startInput || !endInput) return;
  const minMs = Number(metadata?.time_range?.min);
  const maxMs = Number(metadata?.time_range?.max);
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    if (hint) hint.textContent = "Time range not detected in this file.";
    startInput.min = "";
    startInput.max = "";
    endInput.min = "";
    endInput.max = "";
    return;
  }
  const minLocal = formatToDatetimeLocal(minMs);
  const maxLocal = formatToDatetimeLocal(maxMs);
  startInput.min = minLocal;
  startInput.max = maxLocal;
  endInput.min = minLocal;
  endInput.max = maxLocal;
  if (overwriteInputs || !startInput.value) startInput.value = minLocal;
  if (overwriteInputs || !endInput.value) endInput.value = maxLocal;
  if (hint) {
    hint.textContent = `Detected: ${formatAnalysisTime(minMs)} \u2192 ${formatAnalysisTime(maxMs)}`;
  }
}
function initUploadPanel(hydrateColumnProfiles2, renderColumnProfilesGrid2) {
  const toggleBtn = document.getElementById("upload-toggle-btn");
  const panel = document.getElementById("upload-panel");
  const browseBtn = document.getElementById("browse-btn");
  const fileInput = document.getElementById("file-upload");
  const dropZone = document.getElementById("drop-zone");
  const fileDisplay = document.getElementById("file-name-display");
  const partialChk = document.getElementById("partial-enabled");
  const partialFlds = document.getElementById("partial-fields");
  const nRowsInput = document.getElementById("n-rows-input");
  const nRowsRange = document.getElementById("n-rows-range");
  const nRowsDisp = document.getElementById("n-rows-display");
  const skipInput = document.getElementById("skip-rows-input");
  const timeStartInput = document.getElementById("time-start-input");
  const timeEndInput = document.getElementById("time-end-input");
  const uploadBtn = document.getElementById("upload-btn");
  const statusEl = document.getElementById("upload-status");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const selectAllBtn = document.getElementById("profile-select-all-btn");
  const selectNoneBtn = document.getElementById("profile-select-none-btn");
  const selectAllCheckbox = document.getElementById("profile-select-all-checkbox");
  if (!panel || !browseBtn || !fileInput || !dropZone || !fileDisplay || !partialChk || !partialFlds || !nRowsInput || !nRowsRange || !nRowsDisp || !skipInput || !uploadBtn || !statusEl || !progressWrap || !progressBar) {
    console.error("Upload panel is missing required elements.");
    return;
  }
  let selectedFile = null;
  let previewController = null;
  function applyPreviewColumnSelection(metadata) {
    const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
    const metadataTimeCol = String(metadata?.time_column || "").trim() || null;
    const detectedTimeCol = columns.find((col) => /date|time|ts|timestamp/i.test(String(col?.name || "")))?.name || null;
    appState.previewSelectedColumns = columns.map((col) => String(col?.name || "").trim()).filter(Boolean);
    const timeColumnExists = appState.previewTimeColumn && columns.some((col) => String(col?.name || "").trim() === appState.previewTimeColumn);
    const calledTimeColumn = metadataTimeCol || detectedTimeCol || (timeColumnExists ? appState.previewTimeColumn : null);
    appState.previewTimeColumn = calledTimeColumn;
    const timeColumnSelect = document.getElementById("time-column-select");
    if (timeColumnSelect) {
      timeColumnSelect.innerHTML = '<option value="">Auto-detect</option>';
      for (const col of columns) {
        const name = String(col?.name || "").trim();
        if (!name) continue;
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = `${name} (${col?.dtype || "unknown"})`;
        timeColumnSelect.appendChild(opt);
      }
      if (calledTimeColumn) {
        timeColumnSelect.value = calledTimeColumn;
      } else {
        timeColumnSelect.value = "";
      }
      timeColumnSelect.onchange = () => {
        appState.previewTimeColumn = timeColumnSelect.value || null;
        if (selectedFile) runFilePreview(selectedFile);
      };
    }
  }
  function setSelectionMode(mode) {
    const columns = Array.isArray(appState.columnProfiles) ? appState.columnProfiles.map((profile) => profile.name) : [];
    const next = /* @__PURE__ */ new Set();
    if (appState.previewTimeColumn) next.add(appState.previewTimeColumn);
    if (mode === "all") {
      for (const name of columns) next.add(name);
    }
    appState.previewSelectedColumns = Array.from(next);
    renderColumnProfilesGrid2(false);
  }
  async function runFilePreview(file) {
    if (!file) {
      setUploadPreviewStatus("Select a file to preview columns");
      return;
    }
    if (previewController) previewController.abort();
    previewController = new AbortController();
    setUploadPreviewStatus("Profiling file\u2026", "loading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const timeColumn = String(appState.previewTimeColumn || "").trim();
      if (timeColumn) formData.append("time_column", timeColumn);
      const res = await fetch("/api/upload/preview", {
        method: "POST",
        body: formData,
        signal: previewController.signal
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "Preview failed");
        throw new Error(txt || "Preview failed");
      }
      const result = await res.json();
      const previewMetadata = result?.metadata;
      if (!previewMetadata || !Array.isArray(previewMetadata.columns)) {
        throw new Error("Preview response missing metadata");
      }
      appState.metadata = previewMetadata;
      hydrateColumnProfiles2(previewMetadata);
      applyPreviewColumnSelection(previewMetadata);
      renderColumnProfilesGrid2(true);
      applyPartialTimeRangeFromMetadata(previewMetadata, true);
      const previewRows = Number(previewMetadata.total_rows || result?.preview_rows || 0);
      if (!appState.previewTimeColumn && !previewMetadata.time_range) {
        setUploadPreviewStatus("No time column detected in preview. Please select one from the dropdown before upload.", "warning");
      } else {
        setUploadPreviewStatus(`Preview ready (${formatCount(previewRows)} rows)`, "success");
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      if (String(e?.message || "").includes("Specified time column not found")) {
        appState.previewTimeColumn = null;
      }
      setUploadPreviewStatus(`Preview failed: ${e.message}`, "error");
      applyPartialTimeRangeFromMetadata(null, false);
    }
  }
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      panel.classList.toggle("open");
      toggleBtn.classList.toggle("btn-primary");
      toggleBtn.classList.toggle("btn-ghost");
    });
  } else {
    panel.classList.add("open");
  }
  dropZone.addEventListener("click", (e) => {
    if (e.target.closest("#browse-btn")) return;
    fileInput.click();
  });
  browseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files?.[0] || null;
    fileDisplay.textContent = selectedFile ? selectedFile.name : "";
    appState.previewTimeColumn = null;
    if (selectedFile) runFilePreview(selectedFile);
  });
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    selectedFile = e.dataTransfer?.files[0] || null;
    fileDisplay.textContent = selectedFile ? selectedFile.name : "";
    appState.previewTimeColumn = null;
    if (selectedFile) runFilePreview(selectedFile);
  });
  partialChk.addEventListener("change", () => {
    partialFlds.classList.toggle("visible", partialChk.checked);
  });
  partialFlds.classList.toggle("visible", partialChk.checked);
  function fmtRows(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(n);
  }
  nRowsRange.addEventListener("input", () => {
    const v = parseInt(nRowsRange.value, 10);
    nRowsInput.value = String(v);
    nRowsDisp.textContent = fmtRows(v);
  });
  nRowsInput.addEventListener("input", () => {
    const v = parseInt(nRowsInput.value, 10);
    if (!isNaN(v)) {
      nRowsRange.value = String(Math.min(v, parseInt(nRowsRange.max, 10)));
      nRowsDisp.textContent = fmtRows(v);
    }
  });
  const defaultRows = parseInt(nRowsRange.value, 10);
  if (!isNaN(defaultRows) && defaultRows > 0) {
    nRowsInput.value = String(defaultRows);
    nRowsDisp.textContent = fmtRows(defaultRows);
  }
  applyPartialTimeRangeFromMetadata(appState.metadata, false);
  selectAllBtn?.addEventListener("click", () => setSelectionMode("all"));
  selectNoneBtn?.addEventListener("click", () => setSelectionMode("none"));
  selectAllCheckbox?.addEventListener("change", () => {
    setSelectionMode(selectAllCheckbox.checked ? "all" : "none");
  });
  uploadBtn.addEventListener("click", async () => {
    if (!selectedFile) {
      setStatus("Please select a file first.", "error");
      return;
    }
    if (!appState.previewTimeColumn && !(appState.metadata && appState.metadata.time_range)) {
      setStatus("No time column selected. Please choose a time column in the upload panel before ingest.", "error");
      return;
    }
    const formData = new FormData();
    formData.append("file", selectedFile);
    if (partialChk.checked) {
      const nRows = parseInt(nRowsInput.value, 10);
      const skipRows = parseInt(skipInput.value, 10) || 0;
      if (!isNaN(nRows) && nRows > 0) {
        formData.append("n_rows", String(nRows));
      } else {
        setStatus("Enter a valid Max rows value for partial load.", "error");
        uploadBtn.disabled = false;
        progressWrap.style.display = "none";
        progressBar.style.width = "0";
        return;
      }
      if (skipRows > 0) formData.append("skip_rows", String(skipRows));
      const toIsoOrNull = (v) => {
        const s = (v || "").trim();
        if (!s) return null;
        const ms = Date.parse(s);
        if (!Number.isFinite(ms)) return null;
        return new Date(ms).toISOString();
      };
      const tStartIso = toIsoOrNull(timeStartInput?.value || "");
      const tEndIso = toIsoOrNull(timeEndInput?.value || "");
      if (tStartIso) formData.append("time_start", tStartIso);
      if (tEndIso) formData.append("time_end", tEndIso);
    }
    const selectedColumns = Array.isArray(appState.previewSelectedColumns) ? appState.previewSelectedColumns.filter(Boolean) : [];
    if (selectedColumns.length > 0) {
      formData.append("columns", JSON.stringify(selectedColumns));
    }
    const timeColumn = String(appState.previewTimeColumn || "").trim();
    if (timeColumn) formData.append("time_column", timeColumn);
    uploadBtn.disabled = true;
    setStatus("Uploading\u2026", "loading");
    progressWrap.style.display = "block";
    const stopProgress = animateProgress(progressBar);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      progressBar.style.width = "100%";
      if (!res.ok) {
        const txt = await res.text();
        let message = txt;
        try {
          const parsed = JSON.parse(txt);
          if (parsed && typeof parsed.error === "string" && parsed.error.trim().length > 0) {
            message = parsed.error;
          }
        } catch {
        }
        setStatus("Error: " + message, "error");
      } else {
        const result = await res.json();
        setStatus(`Loaded ${result.rows.toLocaleString()} rows. Refreshing\u2026`, "success");
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      setStatus("Error: " + e.message, "error");
    } finally {
      stopProgress();
      uploadBtn.disabled = false;
      setTimeout(() => {
        progressWrap.style.display = "none";
        progressBar.style.width = "0";
      }, 1500);
    }
  });
  function setStatus(msg, cls = "") {
    statusEl.textContent = msg;
    statusEl.className = "upload-status " + (cls || "");
  }
  function animateProgress(bar) {
    let w = 0;
    const t = setInterval(() => {
      w = Math.min(w + Math.random() * 8, 85);
      bar.style.width = w + "%";
      if (w >= 85) clearInterval(t);
    }, 120);
    return () => clearInterval(t);
  }
}

// frontend/src/ui/profile.ts
function hydrateColumnProfiles(metadata) {
  const incoming = Array.isArray(metadata?.column_profiles) ? metadata.column_profiles : [];
  const cols = Array.isArray(metadata?.columns) ? metadata.columns : [];
  const profileByName = /* @__PURE__ */ new Map();
  for (const raw of incoming) {
    const name = String(raw?.name || "").trim();
    if (!name) continue;
    const counts = Array.isArray(raw?.histogram?.counts) ? raw.histogram.counts.map((c) => Math.max(0, Number(c) || 0)) : [];
    profileByName.set(name, {
      name,
      dtype: String(raw?.dtype || ""),
      nonNullCount: Math.max(0, Number(raw?.non_null_count) || 0),
      nullCount: Math.max(0, Number(raw?.null_count) || 0),
      min: toFiniteNumberOrNull(raw?.min),
      max: toFiniteNumberOrNull(raw?.max),
      histCounts: counts
    });
  }
  for (const col of cols) {
    const name = String(col?.name || "").trim();
    if (!name || profileByName.has(name)) continue;
    profileByName.set(name, {
      name,
      dtype: String(col?.dtype || ""),
      nonNullCount: 0,
      nullCount: 0,
      min: null,
      max: null,
      histCounts: []
    });
  }
  appState.columnProfiles = Array.from(profileByName.values());
}
function getFilteredColumnProfiles() {
  const profiles = appState.columnProfiles || [];
  const q = (appState.profileFilterText || "").trim().toLowerCase();
  const filtered = !q ? [...profiles] : profiles.filter((p) => p.name.toLowerCase().includes(q) || p.dtype.toLowerCase().includes(q));
  const { key, dir } = appState.profileGridSort || {};
  const sortDir = dir === "desc" ? -1 : 1;
  const sortable = new Set(PROFILE_COLUMNS.filter((c) => c.sortable).map((c) => c.key));
  if (!key || !sortable.has(key)) return filtered;
  filtered.sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (key === "name" || key === "dtype") {
      const as = String(av || "").toLowerCase();
      const bs = String(bv || "").toLowerCase();
      if (as < bs) return -1 * sortDir;
      if (as > bs) return 1 * sortDir;
      return 0;
    }
    const an = Number(av);
    const bn = Number(bv);
    const aFinite = Number.isFinite(an);
    const bFinite = Number.isFinite(bn);
    if (!aFinite && !bFinite) return 0;
    if (!aFinite) return 1;
    if (!bFinite) return -1;
    return (an - bn) * sortDir;
  });
  return filtered;
}
function applyProfileGridColumnsTemplate() {
  const grid = document.getElementById("profile-grid");
  if (!grid) return;
  const widths = appState.profileGridColWidths || getDefaultProfileColumnWidths();
  const template = widths.map((w, idx) => `${Math.max(PROFILE_COLUMNS[idx]?.minWidth ?? 40, Math.round((Number(w) || PROFILE_COLUMNS[idx]?.defaultWidth) ?? 100))}px`).join(" ");
  grid.style.setProperty("--profile-grid-cols", template);
}
function getSelectablePreviewColumns(profiles = appState.columnProfiles || []) {
  return profiles.map((profile) => profile.name).filter((name) => name && name !== appState.previewTimeColumn);
}
function syncUploadSelectionUI(profiles = appState.columnProfiles || []) {
  const statusEl = document.getElementById("profile-selection-status");
  const allCheckbox = document.getElementById("profile-select-all-checkbox");
  const selectable = getSelectablePreviewColumns(profiles);
  const selected = new Set(appState.previewSelectedColumns || []);
  const selectedCount = selectable.filter((name) => selected.has(name)).length;
  if (statusEl) {
    const totalCount = selectable.length + (appState.previewTimeColumn ? 1 : 0);
    const effectiveSelected = selectedCount + (appState.previewTimeColumn ? 1 : 0);
    statusEl.textContent = `${effectiveSelected}/${totalCount} columns selected`;
  }
  if (allCheckbox) {
    allCheckbox.checked = selectable.length > 0 && selectedCount === selectable.length;
    allCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
  }
}
function updateProfileGridHeaderState() {
  const header = document.querySelector(".profile-grid-header");
  if (!header) return;
  const sortKey = appState.profileGridSort?.key;
  const sortDir = appState.profileGridSort?.dir;
  const cells = Array.from(header.children);
  for (const cell of cells) {
    const key = cell.dataset.sortKey;
    const sortable = cell.dataset.sortable === "1";
    cell.classList.toggle("sortable", sortable);
    cell.classList.remove("sorted-asc", "sorted-desc");
    cell.removeAttribute("aria-sort");
    if (!sortable || !key) continue;
    if (key === sortKey) {
      const cls = sortDir === "desc" ? "sorted-desc" : "sorted-asc";
      const aria = sortDir === "desc" ? "descending" : "ascending";
      cell.classList.add(cls);
      cell.setAttribute("aria-sort", aria);
    } else {
      cell.setAttribute("aria-sort", "none");
    }
  }
}
function initProfileGridHeaderControls() {
  if (appState.profileGridHeaderBound) return;
  const header = document.querySelector(".profile-grid-header");
  if (!header) return;
  const cells = Array.from(header.children);
  cells.forEach((cell, idx) => {
    const def = PROFILE_COLUMNS[idx];
    if (!def) return;
    cell.dataset.sortKey = def.key;
    cell.dataset.sortable = def.sortable ? "1" : "0";
    if (def.sortable) {
      cell.tabIndex = 0;
      cell.addEventListener("click", () => {
        const current = appState.profileGridSort || { key: def.key, dir: "asc" };
        if (current.key === def.key) {
          appState.profileGridSort = { key: def.key, dir: current.dir === "asc" ? "desc" : "asc" };
        } else {
          appState.profileGridSort = { key: def.key, dir: "asc" };
        }
        updateProfileGridHeaderState();
        renderColumnProfilesGrid(true);
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        cell.click();
      });
    }
    if (idx < cells.length - 1) {
      const resizer = document.createElement("span");
      resizer.className = "profile-col-resizer";
      resizer.setAttribute("role", "separator");
      resizer.setAttribute("aria-orientation", "vertical");
      resizer.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startW = Number(appState.profileGridColWidths[idx]) || def.defaultWidth;
        const onMove = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const next = Math.max(def.minWidth, startW + dx);
          appState.profileGridColWidths[idx] = next;
          applyProfileGridColumnsTemplate();
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
      cell.appendChild(resizer);
    }
  });
  updateProfileGridHeaderState();
  appState.profileGridHeaderBound = true;
}
function createProfileCell(text, extraClass = "") {
  const cell = document.createElement("div");
  cell.className = `profile-cell ${extraClass}`.trim();
  cell.textContent = text;
  return cell;
}
function createSelectionCell(profile) {
  const cell = document.createElement("div");
  cell.className = "profile-cell profile-cell-check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = (appState.previewSelectedColumns || []).includes(profile.name);
  checkbox.setAttribute("aria-label", `Select ${profile.name} for upload`);
  if (profile.name === appState.previewTimeColumn) {
    checkbox.disabled = true;
    checkbox.checked = true;
    checkbox.title = "Time column is required";
  }
  checkbox.addEventListener("change", () => {
    const selected = new Set(appState.previewSelectedColumns || []);
    if (checkbox.checked) selected.add(profile.name);
    else selected.delete(profile.name);
    if (appState.previewTimeColumn) selected.add(appState.previewTimeColumn);
    appState.previewSelectedColumns = Array.from(selected);
    syncUploadSelectionUI();
  });
  cell.appendChild(checkbox);
  return cell;
}
function createHistogramCell(profile) {
  const cell = document.createElement("div");
  cell.className = "profile-cell";
  const counts = Array.isArray(profile.histCounts) ? profile.histCounts : [];
  if (counts.length === 0) {
    const empty = document.createElement("span");
    empty.className = "profile-hist-empty";
    empty.textContent = "\u2014";
    cell.appendChild(empty);
    return cell;
  }
  const maxCount = Math.max(...counts);
  if (!Number.isFinite(maxCount) || maxCount <= 0) {
    const empty = document.createElement("span");
    empty.className = "profile-hist-empty";
    empty.textContent = "\u2014";
    cell.appendChild(empty);
    return cell;
  }
  const hist = document.createElement("div");
  hist.className = "profile-hist";
  for (const count of counts) {
    const bar = document.createElement("span");
    bar.className = "profile-hist-bar";
    const height = Math.max(1, Math.round(count / maxCount * 22));
    bar.style.height = `${height}px`;
    bar.title = formatCount(count);
    hist.appendChild(bar);
  }
  cell.appendChild(hist);
  return cell;
}
function renderColumnProfilesGrid(resetScroll = false) {
  const viewport = document.getElementById("profile-grid-viewport");
  const spacer = document.getElementById("profile-grid-spacer");
  const rows = document.getElementById("profile-grid-rows");
  if (!viewport || !spacer || !rows) return;
  if (resetScroll) viewport.scrollTop = 0;
  const profiles = getFilteredColumnProfiles();
  const total = profiles.length;
  const viewportHeight = Math.max(1, viewport.clientHeight || 1);
  spacer.style.height = `${Math.max(total * PROFILE_ROW_HEIGHT, viewportHeight)}px`;
  if (total === 0) {
    rows.style.transform = "translateY(0px)";
    rows.innerHTML = "";
    const row = document.createElement("div");
    row.className = "profile-grid-row";
    for (let i = 0; i < PROFILE_COLUMNS.length; i++) {
      row.appendChild(createProfileCell(i === 1 ? "No columns match this filter" : "", "muted"));
    }
    rows.appendChild(row);
    syncUploadSelectionUI(profiles);
    return;
  }
  const scrollTop = Math.max(0, viewport.scrollTop);
  const visibleRows = Math.ceil(viewportHeight / PROFILE_ROW_HEIGHT);
  const start = Math.max(0, Math.floor(scrollTop / PROFILE_ROW_HEIGHT) - PROFILE_OVERSCAN);
  const end = Math.min(total, start + visibleRows + PROFILE_OVERSCAN * 2);
  rows.style.transform = `translateY(${start * PROFILE_ROW_HEIGHT}px)`;
  rows.innerHTML = "";
  for (let idx = start; idx < end; idx++) {
    const profile = profiles[idx];
    const totalCount = profile.nonNullCount + profile.nullCount;
    const nonNullPct = totalCount > 0 ? profile.nonNullCount / totalCount * 100 : 0;
    const row = document.createElement("div");
    row.className = "profile-grid-row";
    row.setAttribute("role", "row");
    row.appendChild(createSelectionCell(profile));
    row.appendChild(createProfileCell(profile.name));
    row.appendChild(createProfileCell(normalizeDtypeLabel(profile.dtype), "muted"));
    row.appendChild(createProfileCell(`${formatCount(profile.nonNullCount)} (${nonNullPct.toFixed(1)}%)`, "num"));
    row.appendChild(createProfileCell(formatCount(profile.nullCount), "num"));
    row.appendChild(createProfileCell(formatProfileValue(profile.min, profile.dtype), "num"));
    row.appendChild(createProfileCell(formatProfileValue(profile.max, profile.dtype), "num"));
    row.appendChild(createHistogramCell(profile));
    rows.appendChild(row);
  }
  syncUploadSelectionUI(profiles);
}
function initColumnProfilesGrid() {
  if (appState.profileGridBound) return;
  const viewport = document.getElementById("profile-grid-viewport");
  const header = document.querySelector(".profile-grid-header");
  if (!viewport) return;
  viewport.addEventListener("scroll", () => {
    renderColumnProfilesGrid(false);
    if (header) {
      header.style.transform = `translateX(${-viewport.scrollLeft}px)`;
    }
  });
  const resizeObserver = new ResizeObserver(() => renderColumnProfilesGrid(false));
  resizeObserver.observe(viewport);
  initProfileGridHeaderControls();
  applyProfileGridColumnsTemplate();
  appState.profileGridBound = true;
}

// frontend/src/ui/toolbar.ts
function buildFilteredSeriesRows() {
  if (!appState.lastFetchedData || !Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
    return [];
  }
  const filtered = applyColumnRanges(appState.lastFetchedData);
  const rows = [];
  for (const column of appState.selectedCols) {
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
function exportChartFilteredData(format = "csv") {
  const rows = buildFilteredSeriesRows();
  if (rows.length === 0) return false;
  if (format === "json") {
    downloadBlob(
      new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" }),
      "edatime_filtered_series.json"
    );
    return true;
  }
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
async function exportChartFilteredParquet() {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) {
    return false;
  }
  if (!Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
    return false;
  }
  const params = new URLSearchParams({
    start: new Date(appState.currentStart).toISOString(),
    end: new Date(appState.currentEnd).toISOString(),
    columns: appState.selectedCols.join(",")
  });
  const filters = Object.entries(appState.columnRanges || {}).map(([column, range]) => {
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
  const res = await fetch(`/api/export/parquet?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "Parquet export failed");
    throw new Error(text || "Parquet export failed");
  }
  const blob = await res.blob();
  downloadBlob(blob, "edatime_filtered_series.parquet");
  return true;
}
function setAnalysisStatus(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function updateAnalysisZoom(startMs, endMs, sourceKind = "user") {
  setAnalysisStatus(
    "analysis-zoom",
    `Range: ${formatAnalysisTime(startMs)} \u2192 ${formatAnalysisTime(endMs)} (${sourceKind})`
  );
}
function updateAnalysisYRange(min, max, sourceKind = "user") {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    setAnalysisStatus("analysis-y", "Y: \u2014");
    return;
  }
  setAnalysisStatus("analysis-y", `Y: ${formatAnalysisNumber(min)} \u2192 ${formatAnalysisNumber(max)} (${sourceKind})`);
}
function updateAnalysisCursor(tsMs) {
  if (!Number.isFinite(tsMs)) {
    setAnalysisStatus("analysis-cursor", "Cursor: \u2014");
    return;
  }
  setAnalysisStatus("analysis-cursor", `Cursor: ${formatAnalysisTime(tsMs)}`);
}
function updateAnalysisClick(payload) {
  if (!payload?.value || payload.value.length < 2) {
    setAnalysisStatus("analysis-click", "Click: \u2014");
    return;
  }
  const x = Number(payload.value[0]);
  const y = Number(payload.value[1]);
  const seriesName = payload.seriesName || "series";
  setAnalysisStatus("analysis-click", `Click: ${seriesName}=${formatAnalysisNumber(y)} @ ${formatAnalysisTime(x)}`);
}
function refreshZoomControlsState() {
  const supportsZoom = !!appState.chart?.supportsZoomControls?.();
  const resetBtn = document.getElementById("zoom-reset-btn");
  if (resetBtn) resetBtn.disabled = !supportsZoom;
}
function getCurrentView() {
  const yr = appState.chart?.getYRange?.();
  return {
    xMin: appState.currentStart,
    xMax: appState.currentEnd,
    yMin: yr?.min ?? null,
    yMax: yr?.max ?? null
  };
}
function applyViewport(view, fetchAndRender2, sourceKind = "api") {
  dbgGroup(`applyViewport (${sourceKind})`, () => {
    dbg("incoming view", view);
  });
  appState.currentStart = view.xMin;
  appState.currentEnd = view.xMax;
  appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
  updateAnalysisZoom(appState.currentStart, appState.currentEnd, sourceKind);
  if (Number.isFinite(view.yMin) && Number.isFinite(view.yMax) && view.yMax > view.yMin) {
    updateAnalysisYRange(view.yMin, view.yMax, sourceKind);
    appState.pendingYMode = "restore";
    appState.pendingRestoreY = { min: view.yMin, max: view.yMax };
  } else {
    appState.pendingYMode = "fit";
    appState.pendingRestoreY = null;
  }
  if (appState.fetchDebounceId) clearTimeout(appState.fetchDebounceId);
  appState.fetchDebounceId = setTimeout(fetchAndRender2, 0);
}
function zoomOut(fetchAndRender2) {
  dbgGroup("zoomOut (dblclick)", () => {
    dbg("history depth", appState.zoomHistory.length);
    dbg("initialView", appState.initialView);
  });
  if (appState.zoomHistory.length > 0) {
    applyViewport(appState.zoomHistory.pop(), fetchAndRender2, "zoom-out");
  } else if (appState.initialView) {
    applyViewport(appState.initialView, fetchAndRender2, "zoom-out");
  }
}
function resetZoom(fetchAndRender2) {
  dbgGroup("resetZoom", () => {
    dbg("initialView", appState.initialView);
  });
  if (!appState.initialView) return;
  appState.zoomHistory = [];
  applyViewport(appState.initialView, fetchAndRender2, "reset");
}
function initAnalysisControls(fetchAndRender2) {
  window.__edatime = window.__edatime || {};
  window.__edatime.exportChartFilteredData = exportChartFilteredData;
  const zoomResetBtn = document.getElementById("zoom-reset-btn");
  if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
    zoomResetBtn.addEventListener("click", () => resetZoom(fetchAndRender2));
    zoomResetBtn.dataset.bound = "1";
  }
  const drawTool = document.getElementById("draw-tool");
  const drawColor = document.getElementById("draw-color");
  const drawWidth = document.getElementById("draw-width");
  const drawClearBtn = document.getElementById("draw-clear-btn");
  const adaptiveClearBtn = document.getElementById("adaptive-clear-btn");
  const updateDrawMode = () => {
    if (appState.chart && appState.chart.setDrawMode) {
      appState.chart.setDrawMode(drawTool.value, drawColor.value, parseInt(drawWidth.value, 10));
    }
  };
  if (drawTool) drawTool.addEventListener("change", updateDrawMode);
  if (drawColor) drawColor.addEventListener("input", updateDrawMode);
  if (drawWidth) drawWidth.addEventListener("input", updateDrawMode);
  if (drawClearBtn) {
    drawClearBtn.addEventListener("click", () => {
      if (appState.chart && appState.chart.clearDrawings) appState.chart.clearDrawings();
    });
  }
  if (adaptiveClearBtn && !adaptiveClearBtn.dataset.bound) {
    adaptiveClearBtn.addEventListener("click", () => {
      appState.adaptiveLineFilters = [];
      appState.pendingAdaptivePoint = null;
      appState.chart?.requestOverlayRender?.();
      window.dispatchEvent(new CustomEvent("edatime:adaptive-filters-change"));
    });
    adaptiveClearBtn.dataset.bound = "1";
  }
  const exportPngBtn = document.getElementById("export-png-btn");
  const exportSvgBtn = document.getElementById("export-svg-btn");
  const exportHtmlBtn = document.getElementById("export-html-btn");
  const exportDataCsvBtn = document.getElementById("export-data-csv-btn");
  const exportDataJsonBtn = document.getElementById("export-data-json-btn");
  const exportDataParquetBtn = document.getElementById("export-data-parquet-btn");
  if (exportPngBtn) exportPngBtn.addEventListener("click", () => appState.chart?.exportPNG?.());
  if (exportSvgBtn) exportSvgBtn.addEventListener("click", () => appState.chart?.exportSVG?.());
  if (exportHtmlBtn) exportHtmlBtn.addEventListener("click", () => appState.chart?.exportHTML?.());
  if (exportDataCsvBtn && !exportDataCsvBtn.dataset.bound) {
    exportDataCsvBtn.addEventListener("click", () => exportChartFilteredData("csv"));
    exportDataCsvBtn.dataset.bound = "1";
  }
  if (exportDataJsonBtn && !exportDataJsonBtn.dataset.bound) {
    exportDataJsonBtn.addEventListener("click", () => exportChartFilteredData("json"));
    exportDataJsonBtn.dataset.bound = "1";
  }
  if (exportDataParquetBtn && !exportDataParquetBtn.dataset.bound) {
    exportDataParquetBtn.addEventListener("click", async () => {
      try {
        await exportChartFilteredParquet();
      } catch (error) {
        console.error("Parquet export failed:", error);
      }
    });
    exportDataParquetBtn.dataset.bound = "1";
  }
  const titleInput = document.getElementById("chart-title-input");
  const xLabelInput = document.getElementById("x-axis-label-input");
  const yLabelInput = document.getElementById("y-axis-label-input");
  const applyChartText = () => {
    appState.chartText = {
      title: titleInput?.value ?? appState.chartText.title,
      xLabel: xLabelInput?.value ?? appState.chartText.xLabel,
      yLabel: yLabelInput?.value ?? appState.chartText.yLabel
    };
    appState.chart?.setChartText?.(appState.chartText.title, appState.chartText.xLabel, appState.chartText.yLabel);
  };
  if (titleInput && !titleInput.dataset.bound) {
    titleInput.value = appState.chartText.title || "";
    titleInput.addEventListener("input", applyChartText);
    titleInput.dataset.bound = "1";
  }
  if (xLabelInput && !xLabelInput.dataset.bound) {
    xLabelInput.value = appState.chartText.xLabel || "";
    xLabelInput.addEventListener("input", applyChartText);
    xLabelInput.dataset.bound = "1";
  }
  if (yLabelInput && !yLabelInput.dataset.bound) {
    yLabelInput.value = appState.chartText.yLabel || "";
    yLabelInput.addEventListener("input", applyChartText);
    yLabelInput.dataset.bound = "1";
  }
  applyChartText();
  const rollingCheck = document.getElementById("rolling-enabled");
  const rollingWindowInput = document.getElementById("rolling-window");
  const anomalyCheck = document.getElementById("anomaly-enabled");
  const anomalyMethodSelect = document.getElementById("anomaly-method");
  const anomalyThresholdInput = document.getElementById("anomaly-threshold");
  const transformOpenBtn = document.getElementById("transform-open-btn");
  if (rollingCheck && !rollingCheck.dataset.bound) {
    rollingCheck.addEventListener("change", () => {
      appState.rollingEnabled = rollingCheck.checked;
      window.dispatchEvent(new CustomEvent("edatime:analytics-change"));
    });
    rollingCheck.dataset.bound = "1";
  }
  if (rollingWindowInput && !rollingWindowInput.dataset.bound) {
    let rollingDebounce = null;
    rollingWindowInput.addEventListener("input", () => {
      const v = parseInt(rollingWindowInput.value, 10);
      if (Number.isFinite(v) && v >= 3) {
        appState.rollingWindow = v;
        if (appState.rollingEnabled) {
          clearTimeout(rollingDebounce);
          rollingDebounce = setTimeout(() => window.dispatchEvent(new CustomEvent("edatime:analytics-change")), 300);
        }
      }
    });
    rollingWindowInput.dataset.bound = "1";
  }
  if (anomalyCheck && !anomalyCheck.dataset.bound) {
    anomalyCheck.addEventListener("change", () => {
      appState.anomalyEnabled = anomalyCheck.checked;
      window.dispatchEvent(new CustomEvent("edatime:analytics-change"));
    });
    anomalyCheck.dataset.bound = "1";
  }
  if (anomalyMethodSelect && !anomalyMethodSelect.dataset.bound) {
    anomalyMethodSelect.addEventListener("change", () => {
      appState.anomalyMethod = anomalyMethodSelect.value;
      if (appState.anomalyEnabled) window.dispatchEvent(new CustomEvent("edatime:analytics-change"));
    });
    anomalyMethodSelect.dataset.bound = "1";
  }
  if (anomalyThresholdInput && !anomalyThresholdInput.dataset.bound) {
    let threshDebounce = null;
    anomalyThresholdInput.addEventListener("input", () => {
      const v = parseFloat(anomalyThresholdInput.value);
      if (Number.isFinite(v) && v > 0) {
        appState.anomalyThreshold = v;
        if (appState.anomalyEnabled) {
          clearTimeout(threshDebounce);
          threshDebounce = setTimeout(() => window.dispatchEvent(new CustomEvent("edatime:analytics-change")), 300);
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
  refreshZoomControlsState();
}
function bindAnalysisChartEvents() {
  if (!appState.chart || appState.analysisBound) return;
  appState.chart.onCrosshairMove?.((payload) => {
    let x = Number(payload?.x);
    if (Number.isFinite(x) && x < 1e11) {
      const dom = appState.chart?.getXDomain?.();
      if (dom?.min && Number.isFinite(dom.min)) x = dom.min + x;
    }
    updateAnalysisCursor(x);
    if (DEBUG) {
      const now = Date.now();
      const last = appState._debugLastCrosshairLogTs ?? 0;
      if (now - last >= 500) {
        appState._debugLastCrosshairLogTs = now;
        dbg("crosshair-debug", { payload, xAbs: x, chartYRange: appState.chart?.getYRange?.() });
      }
    }
  });
  appState.chart.onClick?.((payload) => {
    if (payload?.value && payload.value.length >= 2) {
      const x0 = Number(payload.value[0]);
      if (Number.isFinite(x0) && x0 < 1e11) {
        const dom = appState.chart?.getXDomain?.();
        if (dom?.min && Number.isFinite(dom.min)) {
          payload = { ...payload, value: [dom.min + x0, payload.value[1]] };
        }
      }
    }
    updateAnalysisClick(payload);
  });
  appState.analysisBound = true;
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
function initPages() {
  const navButtons = Array.from(document.querySelectorAll(".sidebar .nav-item[data-page]"));
  const pages = Array.from(document.querySelectorAll(".page[data-page-name]"));
  if (navButtons.length === 0 || pages.length === 0) return;
  const analyticsViews = {
    scatter: "plot",
    scattermatrix: "matrix",
    distributions: "distributions"
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
  function showPage2(pageName) {
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
    btn.addEventListener("click", () => showPage2(btn.dataset.page));
  }
  showPage2("timeseries");
}

// frontend/src/charts/registry.ts
var _registry = /* @__PURE__ */ new Map();
function registerChartType(name, adapter) {
  if (!name || typeof adapter?.create !== "function") {
    throw new Error(`Invalid chart adapter for "${name}"`);
  }
  _registry.set(name, adapter);
}
function getChartType(name) {
  return _registry.get(name);
}

// frontend/src/charts/fallback.ts
var FallbackChart = class {
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
};

// frontend/src/app.ts
var _appCleanups = [];
function teardownApp() {
  for (const fn of _appCleanups) fn();
  _appCleanups.length = 0;
  appState.chart?.destroy?.();
}
var fetchMetadata = null;
var fetchData = null;
var fetchRollingBands = null;
var fetchAnomalies = null;
var fetchFft = null;
var postTransform = null;
var DataChartCtor = null;
var FftChartCtor = null;
async function ensureChartModules() {
  if (fetchMetadata && fetchData && DataChartCtor) return;
  const [dataClient, chartModule, fftModule] = await Promise.all([
    import("./dataClient.js"),
    import("./chart/DataChart.js"),
    import("./chart/FftChart.js")
  ]);
  fetchMetadata = dataClient.fetchMetadata;
  fetchData = dataClient.fetchData;
  fetchRollingBands = dataClient.fetchRollingBands;
  fetchAnomalies = dataClient.fetchAnomalies;
  fetchFft = dataClient.fetchFft;
  postTransform = dataClient.postTransform;
  DataChartCtor = chartModule.DataChart;
  FftChartCtor = fftModule.FftChart;
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
function computeFrontendRollingBands(data, cols, windowSize) {
  const ts = data?.ts;
  if (!ts || ts.length < 2) return [];
  const n = ts.length;
  const half = Math.floor((windowSize - 1) / 2);
  const bands = [];
  for (const col of cols) {
    const ys = data?.series?.[col]?.y;
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
function renderCurrentData() {
  if (!appState.chart || !appState.lastFetchedData) return;
  const filtered = applyColumnRanges(appState.lastFetchedData);
  appState.chart.updateDataMulti(filtered, appState.selectedCols);
  if (appState.rollingEnabled) {
    appState.rollingBands = computeFrontendRollingBands(filtered, appState.selectedCols, appState.rollingWindow || 50);
    appState.chart?.requestOverlayRender?.();
  }
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
  const tempFilter = { column, x1, y1, x2, y2, keepAbove: true };
  let above = 0;
  let below = 0;
  for (let idx = 0; idx < xs.length; idx++) {
    const x = Number(xs[idx]);
    const y = Number(ys[idx]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX) continue;
    const lineY = buildAdaptiveLineY(tempFilter, x);
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
  const onEscape = (e) => {
    if (e.key === "Escape") {
      appState.pendingAdaptivePoint = null;
      appState.chart?.requestOverlayRender?.();
    }
  };
  const onCtrlUp = (e) => {
    if (e.key === "Control" && appState.pendingAdaptivePoint) {
      appState.pendingAdaptivePoint = null;
      appState.chart?.requestOverlayRender?.();
    }
  };
  const onAdaptiveChange = () => {
    if (!appState.lastFetchedData) return;
    buildRangeControls();
    renderCurrentData();
    appState.chart?.requestOverlayRender?.();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, "adaptive");
  };
  window.addEventListener("keydown", onEscape);
  window.addEventListener("keyup", onCtrlUp);
  window.addEventListener("edatime:adaptive-filters-change", onAdaptiveChange);
  _appCleanups.push(
    () => window.removeEventListener("keydown", onEscape),
    () => window.removeEventListener("keyup", onCtrlUp),
    () => window.removeEventListener("edatime:adaptive-filters-change", onAdaptiveChange)
  );
  container.dataset.adaptiveBound = "1";
}
function emitChartRangeChange(sourceKind = "data") {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  window.dispatchEvent(new CustomEvent("edatime:chart-range-change", {
    detail: { start: appState.currentStart, end: appState.currentEnd, source: sourceKind }
  }));
}
var dataFetchController = null;
async function fetchAndRender() {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  if (appState.currentStart >= appState.currentEnd) return;
  if (dataFetchController) dataFetchController.abort();
  dataFetchController = new AbortController();
  const signal = dataFetchController.signal;
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
    const data = await fetchData(startIso, endIso, width, cols, colorCol, signal);
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
    if (appState.anomalyEnabled) {
      fetchAndRenderAnalytics().catch(() => {
      });
    }
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
    if (err?.name === "AbortError") return;
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
  const onKeydown = (event) => {
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
      if (key === "6") {
        event.preventDefault();
        showPage("fft");
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
  };
  window.addEventListener("keydown", onKeydown);
  _appCleanups.push(() => window.removeEventListener("keydown", onKeydown));
  window.__edatime.keyboardShortcutsBound = true;
}
async function initScatterPageModule() {
  const scatterPage = document.getElementById("page-scatter");
  if (!scatterPage) return;
  const { initScatterPage } = await import("./scatter/scatterPage.js");
  await initScatterPage(appState.metadata);
}
var analyticsController = null;
async function fetchAndRenderAnalytics() {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  if (analyticsController) analyticsController.abort();
  analyticsController = new AbortController();
  const signal = analyticsController.signal;
  const startIso = new Date(appState.currentStart).toISOString();
  const endIso = new Date(appState.currentEnd).toISOString();
  const cols = appState.selectedCols.join(",");
  if (!appState.rollingEnabled) appState.rollingBands = null;
  try {
    if (appState.anomalyEnabled && fetchAnomalies) {
      const resp = await fetchAnomalies(startIso, endIso, cols, appState.anomalyMethod, appState.anomalyThreshold, signal);
      appState.anomalyRegions = resp?.regions || null;
    } else {
      appState.anomalyRegions = null;
    }
  } catch (e) {
    if (e?.name !== "AbortError") console.warn("Anomaly fetch failed:", e);
    appState.anomalyRegions = null;
  }
  appState.chart?.requestOverlayRender?.();
}
function initAnalyticsListeners() {
  window.addEventListener("edatime:analytics-change", () => {
    if (appState.lastFetchedData) {
      if (appState.rollingEnabled) {
        const filtered = applyColumnRanges(appState.lastFetchedData);
        appState.rollingBands = computeFrontendRollingBands(
          filtered,
          appState.selectedCols,
          appState.rollingWindow || 50
        );
      } else {
        appState.rollingBands = null;
      }
      appState.chart?.requestOverlayRender?.();
    }
    fetchAndRenderAnalytics().catch(() => {
    });
  });
}
function initTransformModal() {
  const modal = document.getElementById("transform-modal");
  const closeBtn = document.getElementById("transform-close-btn");
  const cancelBtn = document.getElementById("transform-cancel-btn");
  const applyBtn = document.getElementById("transform-apply-btn");
  const exprInput = document.getElementById("transform-expression");
  const nameInput = document.getElementById("transform-output-name");
  const errorEl = document.getElementById("transform-error");
  if (!modal) return;
  const close = () => {
    modal.hidden = true;
    if (errorEl) errorEl.textContent = "";
  };
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  applyBtn?.addEventListener("click", async () => {
    const expr = exprInput?.value?.trim();
    const name = nameInput?.value?.trim();
    if (!expr) {
      if (errorEl) errorEl.textContent = "Expression is required.";
      return;
    }
    if (!name) {
      if (errorEl) errorEl.textContent = "Output column name is required.";
      return;
    }
    if (errorEl) errorEl.textContent = "";
    try {
      applyBtn.textContent = "Applying\u2026";
      applyBtn.disabled = true;
      await postTransform(expr, name);
      close();
      if (fetchMetadata) {
        appState.metadata = await fetchMetadata();
        appState.numericCols = (appState.metadata.numeric_columns || []).filter((col) => col && col.toLowerCase() !== "ts");
        if (!appState.selectedCols.includes(name)) appState.selectedCols.push(name);
        sanitizeSelectedColumns();
        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
        buildMetaBar(appState.metadata);
        await fetchAndRender();
      }
    } catch (e) {
      if (errorEl) errorEl.textContent = e?.message || "Transform failed.";
    } finally {
      applyBtn.textContent = "Apply";
      applyBtn.disabled = false;
    }
  });
}
var _fftTraces = [];
var _fftMode = "magnitude";
var _fftLogScale = true;
var _fftChart = null;
var _FFT_CHIP_COLORS = ["#7ad151", "#4ac3e8", "#f97316", "#e879f9", "#facc15", "#60a5fa", "#f43f5e"];
function _fftUpdateZoomBtn(isZoomed) {
  const btn = document.getElementById("fft-zoom-reset-btn");
  if (btn) btn.hidden = !(isZoomed ?? _fftChart?.getIsZoomed() ?? false);
}
function _fftRerenderOrClear() {
  if (!_fftChart) return;
  if (_fftTraces.length === 0) {
    _fftChart.clear();
  } else {
    _fftChart.updateData(_fftTraces, _fftMode, _fftLogScale);
  }
}
function _fftRenderChips() {
  const bar = document.getElementById("fft-traces-bar");
  const statusEl = document.getElementById("fft-status");
  if (!bar || !appState.metadata) return;
  const allCols = (appState.metadata.numeric_columns || []).filter((c) => c.toLowerCase() !== "ts");
  const existing = /* @__PURE__ */ new Map();
  for (const el of bar.querySelectorAll(".fft-trace-chip")) {
    const col = el.dataset.col;
    if (allCols.includes(col)) existing.set(col, el);
    else el.remove();
  }
  const zoomBtn = bar.querySelector("#fft-zoom-reset-btn");
  for (const col of allCols) {
    const activeIdx = _fftTraces.findIndex((t) => t.column === col);
    const isActive = activeIdx >= 0;
    const color = isActive ? _FFT_CHIP_COLORS[activeIdx % _FFT_CHIP_COLORS.length] : "";
    let chip = existing.get(col);
    if (!chip) {
      chip = document.createElement("button");
      chip.className = "fft-trace-chip";
      chip.type = "button";
      chip.dataset.col = col;
      chip.addEventListener("click", async (e) => {
        const c = chip.dataset.col;
        if (e.target.classList.contains("fft-chip-remove")) {
          _fftTraces = _fftTraces.filter((t) => t.column !== c);
          _fftRenderChips();
          _fftRerenderOrClear();
          if (statusEl) statusEl.textContent = _fftTraces.length ? _fftTraces.map((t) => t.column).join(", ") : "Select a column chip to compute its FFT.";
          return;
        }
        if (_fftTraces.some((t) => t.column === c)) return;
        chip.classList.add("loading");
        chip.disabled = true;
        if (statusEl) statusEl.textContent = `Computing FFT for ${c}\u2026`;
        try {
          await _fftFetchAndAdd(c);
          _fftRenderChips();
          _fftRerenderOrClear();
          const bins = _fftTraces.find((t) => t.column === c)?.frequencies.length ?? 0;
          if (statusEl) statusEl.textContent = `${_fftTraces.map((t) => t.column).join(", ")} \xB7 ${bins} bins`;
        } catch (e2) {
          if (statusEl) statusEl.textContent = `FFT failed for ${c}: ${e2?.message || "error"}`;
        } finally {
          chip.classList.remove("loading");
          chip.disabled = false;
        }
      });
      bar.insertBefore(chip, zoomBtn || null);
    }
    chip.className = `fft-trace-chip${isActive ? " active" : ""}`;
    chip.innerHTML = `<span class="fft-chip-dot" style="${isActive ? `background:${color}` : "border:1px solid rgba(255,255,255,0.25)"}"></span><span class="fft-chip-label">${col}</span>` + (isActive ? '<span class="fft-chip-remove" aria-hidden="true">\xD7</span>' : "");
  }
  bar.hidden = allCols.length === 0;
}
async function _fftFetchAndAdd(col) {
  if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
  const startIso = new Date(appState.currentStart).toISOString();
  const endIso = new Date(appState.currentEnd).toISOString();
  const resp = await fetchFft(startIso, endIso, col);
  if (!resp?.results?.length) throw new Error("No results");
  const result = resp.results[0];
  _fftTraces = _fftTraces.filter((t) => t.column !== col);
  _fftTraces.push({ column: result.column, frequencies: result.frequencies, magnitudes: result.magnitudes, psd: result.psd });
}
async function initFftPage() {
  const modeSelect = document.getElementById("fft-mode-select");
  const logCheck = document.getElementById("fft-log-scale");
  const zoomResetBtn = document.getElementById("fft-zoom-reset-btn");
  _fftChart = new FftChartCtor("fft-chart");
  await _fftChart.init();
  _fftChart.onZoomChange = (isZoomed) => _fftUpdateZoomBtn(isZoomed);
  const populateChips = () => {
    if (appState.metadata) _fftRenderChips();
  };
  populateChips();
  window.addEventListener("edatime:page-change", populateChips);
  modeSelect?.addEventListener("change", () => {
    _fftMode = modeSelect.value;
    _fftRerenderOrClear();
  });
  logCheck?.addEventListener("change", () => {
    _fftLogScale = logCheck.checked;
    _fftRerenderOrClear();
  });
  zoomResetBtn?.addEventListener("click", () => _fftChart?.resetView());
  _fftRerenderOrClear();
}
async function init() {
  initPages();
  initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid);
  initColumnProfilesGrid();
  initAnalysisControls(fetchAndRender);
  initColumnFilterModal(renderCurrentData, updateAnalysisYRange);
  initChartPageFilterGesture();
  initKeyboardShortcuts();
  initTransformModal();
  initAnalyticsListeners();
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
    await initFftPage();
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
export {
  teardownApp
};
//# sourceMappingURL=app.js.map
