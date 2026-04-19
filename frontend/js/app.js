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
  debounce,
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
} from "./chunk-BMP4455Z.js";
import "./chunk-PZ5AY32C.js";

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
  const dbChk = document.getElementById("db-enabled");
  const dbFlds = document.getElementById("db-fields");
  const dbConnectBtn = document.getElementById("db-connect-btn");
  const dbLoadBtn = document.getElementById("db-load-btn");
  const dbDisconnectBtn = document.getElementById("db-disconnect-btn");
  const dbStatus = document.getElementById("db-status");
  const dbTableSelect = document.getElementById("db-table-select");
  if (dbChk && dbFlds) {
    dbChk.addEventListener("change", () => {
      dbFlds.classList.toggle("visible", dbChk.checked);
    });
  }
  async function refreshDbTables() {
    if (!dbTableSelect) return;
    try {
      const r = await fetch("/api/database/tables");
      if (!r.ok) return;
      const data = await r.json();
      const tables = data.tables ?? [];
      dbTableSelect.innerHTML = '<option value="">\u2014 select table \u2014</option>';
      for (const t of tables) {
        const opt = document.createElement("option");
        opt.value = t.name;
        opt.textContent = t.kind === "hypertable" ? `\u23F1 ${t.schema}.${t.name}` : `${t.schema}.${t.name}`;
        dbTableSelect.appendChild(opt);
      }
    } catch {
    }
  }
  dbTableSelect?.addEventListener("change", () => {
    const tableInput = document.getElementById("db-table-input");
    if (tableInput && dbTableSelect.value) tableInput.value = dbTableSelect.value;
  });
  if (dbConnectBtn) {
    dbConnectBtn.addEventListener("click", async () => {
      const connectionString = document.getElementById("db-connection-input")?.value ?? "";
      const schema = document.getElementById("db-schema-input")?.value.trim() || "public";
      if (!connectionString.trim()) {
        if (dbStatus) {
          dbStatus.textContent = "Connection string is required.";
          dbStatus.className = "upload-status error";
        }
        return;
      }
      dbConnectBtn.disabled = true;
      if (dbStatus) {
        dbStatus.textContent = "Connecting\u2026";
        dbStatus.className = "upload-status loading";
      }
      try {
        const res = await fetch("/api/database/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection_string: connectionString.trim(),
            schema,
            load_snapshot: false
          })
        });
        const result = await res.json();
        if (res.ok) {
          if (dbStatus) {
            dbStatus.textContent = "Connected. Choose a table and click Load data.";
            dbStatus.className = "upload-status success";
          }
          if (dbLoadBtn) dbLoadBtn.disabled = false;
          if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
          await refreshDbTables();
        } else {
          if (dbStatus) {
            dbStatus.textContent = result.message ?? result.error ?? "Connection failed.";
            dbStatus.className = "upload-status error";
          }
        }
      } catch (e) {
        if (dbStatus) {
          dbStatus.textContent = "Error: " + e.message;
          dbStatus.className = "upload-status error";
        }
      } finally {
        dbConnectBtn.disabled = false;
      }
    });
  }
  if (dbLoadBtn) {
    dbLoadBtn.addEventListener("click", async () => {
      const schema = document.getElementById("db-schema-input")?.value.trim() || "public";
      const table = document.getElementById("db-table-input")?.value.trim() ?? dbTableSelect?.value ?? "";
      const timeColumn = document.getElementById("db-time-col-input")?.value.trim();
      if (!table) {
        if (dbStatus) {
          dbStatus.textContent = "Select or enter a table name.";
          dbStatus.className = "upload-status error";
        }
        return;
      }
      dbLoadBtn.disabled = true;
      if (dbStatus) {
        dbStatus.textContent = "Loading data\u2026";
        dbStatus.className = "upload-status loading";
      }
      try {
        const res = await fetch("/api/database/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema,
            table,
            time_column: timeColumn || null,
            limit: 1e6
          })
        });
        const result = await res.json();
        if (res.ok) {
          if (dbStatus) {
            dbStatus.textContent = `Loaded ${result.rows_loaded.toLocaleString()} rows from ${table}.`;
            dbStatus.className = "upload-status success";
          }
          window.dispatchEvent(new CustomEvent("edatime:dataset-changed", { detail: { source: "database", table } }));
        } else {
          if (dbStatus) {
            dbStatus.textContent = result.message ?? result.error ?? "Load failed.";
            dbStatus.className = "upload-status error";
          }
        }
      } catch (e) {
        if (dbStatus) {
          dbStatus.textContent = "Error: " + e.message;
          dbStatus.className = "upload-status error";
        }
      } finally {
        dbLoadBtn.disabled = false;
      }
    });
  }
  if (dbDisconnectBtn) {
    dbDisconnectBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/database/connect", { method: "DELETE" });
      } catch {
      }
      if (dbStatus) {
        dbStatus.textContent = "Disconnected.";
        dbStatus.className = "upload-status";
      }
      if (dbLoadBtn) dbLoadBtn.disabled = true;
      if (dbDisconnectBtn) dbDisconnectBtn.hidden = true;
      if (dbTableSelect) {
        dbTableSelect.innerHTML = '<option value="">\u2014 connect first \u2014</option>';
      }
    });
  }
  fetch("/api/database/status").then((r) => r.json()).then((s) => {
    if (s.connected) {
      if (dbChk) {
        dbChk.checked = true;
        dbFlds?.classList.add("visible");
      }
      if (dbLoadBtn) dbLoadBtn.disabled = false;
      if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
      if (dbStatus) {
        dbStatus.textContent = `Connected to ${s.table || "(no table loaded)"}`;
        dbStatus.className = "upload-status success";
      }
      void refreshDbTables();
    }
  }).catch(() => {
  });
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
function initModalClose(modalId, closeBtnId, cancelBtnId, onClose) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;
  const close = () => {
    modal.hidden = true;
    onClose?.();
  };
  document.getElementById(closeBtnId)?.addEventListener("click", close);
  document.getElementById(cancelBtnId)?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  return close;
}
function setComputeLoading(btnId, overlayId, loading, label = "Compute") {
  const btn = document.getElementById(btnId);
  const overlay = document.getElementById(overlayId);
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? "Computing\u2026" : label;
  }
  if (overlay) overlay.hidden = !loading;
}
var fetchMetadata = null;
var fetchData = null;
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
    appState.pendingAdaptivePoint = null;
    appState.chart?.requestOverlayRender?.();
  };
  const updateOverlay = () => {
    if (!_firstPoint) {
      appState.pendingAdaptivePoint = null;
      return;
    }
    const col = appState.adaptiveFilterColumn ?? (appState.selectedCols?.[0] ?? "");
    if (_secondPoint) {
      appState.pendingAdaptivePoint = {
        column: col,
        x: _firstPoint.x,
        y: _firstPoint.y,
        x2: _secondPoint.x,
        y2: _secondPoint.y
      };
    } else {
      appState.pendingAdaptivePoint = { column: col, x: _firstPoint.x, y: _firstPoint.y };
    }
    appState.chart?.requestOverlayRender?.();
  };
  const applyFilterForColumn = (column, p1, p2) => {
    appState.adaptiveFilterColumn = column;
    const filter = buildAdaptiveFilterFromPoints(column, p1, p2);
    if (!filter) return;
    appState.adaptiveLineFilters = [...appState.adaptiveLineFilters || [], filter];
    applyAdaptiveFiltersLocally();
    buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
  };
  const showTracePicker = (p1, p2) => {
    const cols = appState.selectedCols;
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
      const color = appState.seriesColors?.[col] ?? SERIES_COLORS[idx % SERIES_COLORS.length];
      const isCurrentTarget = col === appState.adaptiveFilterColumn;
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
  container.addEventListener("click", (event) => {
    if (!event.ctrlKey || event.button !== 0) return;
    const cols = appState.selectedCols;
    if (!cols?.length) return;
    const point = appState.chart?.cssPointToData?.(event.clientX, event.clientY) ?? null;
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
  }, true);
  const onEscape = (e) => {
    if (e.key === "Escape") {
      dismissPicker();
      cancelPending();
    }
  };
  const onCtrlUp = (e) => {
    if (e.key !== "Control") return;
    if (_firstPoint && _secondPoint) {
      const p1 = _firstPoint;
      const p2 = _secondPoint;
      cancelPending();
      showTracePicker(p1, p2);
    } else {
      cancelPending();
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
  const loadingEl = document.getElementById("main-chart-loading");
  if (loadingEl) loadingEl.hidden = false;
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
  } finally {
    const loadingEl2 = document.getElementById("main-chart-loading");
    if (loadingEl2) loadingEl2.hidden = true;
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
      if (key === "7") {
        event.preventDefault();
        showPage("heatmap");
        return;
      }
      if (key === "8") {
        event.preventDefault();
        showPage("spectrogram");
        return;
      }
      if (key === "9") {
        event.preventDefault();
        showPage("causal");
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
  const applyBtn = document.getElementById("transform-apply-btn");
  const exprInput = document.getElementById("transform-expression");
  const nameInput = document.getElementById("transform-output-name");
  const errorEl = document.getElementById("transform-error");
  const close = initModalClose(
    "transform-modal",
    "transform-close-btn",
    "transform-cancel-btn",
    () => {
      if (errorEl) errorEl.textContent = "";
    }
  );
  if (!close) return;
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
var _fftTraceColors = {};
function _fftColumns() {
  return (appState.metadata?.numeric_columns || []).filter((c) => c.toLowerCase() !== "ts");
}
function _fftColorFor(col, fallbackIdx) {
  return _fftTraceColors[col] || _FFT_CHIP_COLORS[Math.max(0, fallbackIdx) % _FFT_CHIP_COLORS.length];
}
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
  const allCols = _fftColumns();
  const existing = /* @__PURE__ */ new Map();
  for (const el of bar.querySelectorAll(".fft-trace-chip")) {
    const col = el.dataset.col;
    if (allCols.includes(col)) existing.set(col, el);
    else el.remove();
  }
  const zoomBtn = bar.querySelector("#fft-zoom-reset-btn");
  for (const [idx, col] of allCols.entries()) {
    const activeIdx = _fftTraces.findIndex((t) => t.column === col);
    const isActive = activeIdx >= 0;
    const color = _fftColorFor(col, idx);
    let chip = existing.get(col);
    if (!chip) {
      chip = document.createElement("button");
      chip.className = "series-chip fft-trace-chip";
      chip.type = "button";
      chip.dataset.col = col;
      chip.addEventListener("click", async (e) => {
        const c = chip.dataset.col;
        if (e.target?.closest?.(".chip-color-picker")) return;
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
        const fftLoadingEl = document.getElementById("fft-chart-loading");
        if (fftLoadingEl) fftLoadingEl.hidden = false;
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
          if (fftLoadingEl) fftLoadingEl.hidden = true;
        }
      });
      bar.insertBefore(chip, zoomBtn || null);
    }
    chip.className = `series-chip fft-trace-chip${isActive ? " active" : ""}`;
    chip.style.setProperty("--chip-accent", color);
    chip.innerHTML = `<span class="chip-label">${col}</span><input type="color" class="chip-color-picker fft-chip-color-picker" value="${color}" aria-label="Set ${col} FFT color" title="Set ${col} FFT color">` + (isActive ? '<span class="fft-chip-remove" aria-hidden="true">\xD7</span>' : "");
    const colorInput = chip.querySelector(".chip-color-picker");
    if (colorInput) {
      for (const eventName of ["pointerdown", "mousedown", "click", "dblclick"]) {
        colorInput.addEventListener(eventName, (event) => event.stopPropagation());
      }
      colorInput.addEventListener("input", (event) => {
        const nextColor = event.target.value;
        _fftTraceColors[col] = nextColor;
        chip.style.setProperty("--chip-accent", nextColor);
        const trace = _fftTraces.find((item) => item.column === col);
        if (trace) {
          trace.color = nextColor;
          _fftRerenderOrClear();
        }
      });
    }
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
  const color = _fftColorFor(col, _fftColumns().indexOf(col));
  _fftTraces.push({ column: result.column, frequencies: result.frequencies, magnitudes: result.magnitudes, psd: result.psd, color });
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
var _heatmapLoaded = false;
var _heatmapCellSize = 36;
async function initHeatmapPage() {
  if (_heatmapLoaded) return;
  _heatmapLoaded = true;
  const container = document.getElementById("heatmap-container");
  const statusEl = document.getElementById("heatmap-status");
  const metricSelect = document.getElementById("heatmap-metric");
  const sizeInput = document.getElementById("heatmap-cell-size");
  const sizeValue = document.getElementById("heatmap-cell-size-value");
  if (!container) return;
  let matrixData = null;
  let metric = "pearson";
  function renderHeatmap() {
    if (!matrixData || !container) return;
    const cols = matrixData.columns;
    const data = metric === "spearman" ? matrixData.spearman : matrixData.pearson;
    const n = cols.length;
    const cellSize = _heatmapCellSize;
    const labelWidth = Math.max(84, Math.min(180, Math.round(cellSize * 2.5)));
    let html = `<div class="heatmap-grid" style="display:inline-grid;grid-template-columns:${labelWidth}px repeat(${n},${cellSize}px);grid-template-rows:${labelWidth}px repeat(${n},${cellSize}px);gap:1px;font-size:0.65rem;">`;
    html += `<div></div>`;
    for (const col of cols) {
      html += `<div class="heatmap-header" style="writing-mode:vertical-rl;text-orientation:mixed;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;color:var(--text-dim);padding:4px 2px;" title="${col}">${col}</div>`;
    }
    for (let i = 0; i < n; i++) {
      html += `<div class="heatmap-row-label" style="display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${cols[i]}">${cols[i]}</div>`;
      for (let j = 0; j < n; j++) {
        const val = data[i][j];
        const displayVal = val !== null ? val.toFixed(2) : "\u2014";
        const bg = val !== null ? correlationColor(val) : "transparent";
        const textColor = val !== null && Math.abs(val) > 0.5 ? "#fff" : "var(--text)";
        html += `<div class="heatmap-cell" style="display:flex;align-items:center;justify-content:center;background:${bg};color:${textColor};border-radius:2px;cursor:default;font-variant-numeric:tabular-nums;" title="${cols[i]} \xD7 ${cols[j]}: ${displayVal}">${displayVal}</div>`;
      }
    }
    html += `</div>`;
    html += `<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.7rem;color:var(--text-dim);">`;
    html += `<span>-1.0</span>`;
    html += `<div style="flex:0 0 200px;height:12px;border-radius:4px;background:linear-gradient(90deg,#2166AC,#67A9CF,#F7F7F7,#EF8A62,#B2182B);"></div>`;
    html += `<span>+1.0</span>`;
    html += `</div>`;
    container.innerHTML = html;
  }
  function correlationColor(v) {
    const clamped = Math.max(-1, Math.min(1, v));
    if (clamped >= 0) {
      const t = clamped;
      const r = Math.round(247 - t * (247 - 178));
      const g = Math.round(247 - t * (247 - 24));
      const b = Math.round(247 - t * (247 - 43));
      return `rgb(${r},${g},${b})`;
    } else {
      const t = -clamped;
      const r = Math.round(247 - t * (247 - 33));
      const g = Math.round(247 - t * (247 - 102));
      const b = Math.round(247 - t * (247 - 172));
      return `rgb(${r},${g},${b})`;
    }
  }
  async function loadMatrix() {
    if (statusEl) statusEl.textContent = "Loading correlation matrix\u2026";
    try {
      const { fetchCorrelationMatrix } = await import("./dataClient.js");
      matrixData = await fetchCorrelationMatrix();
      if (statusEl) statusEl.textContent = `${matrixData.columns.length} columns \xB7 ${_heatmapCellSize}px cells`;
      renderHeatmap();
    } catch (e) {
      if (statusEl) statusEl.textContent = `Error: ${e?.message || "failed"}`;
    }
  }
  metricSelect?.addEventListener("change", () => {
    metric = metricSelect.value;
    renderHeatmap();
  });
  sizeInput?.addEventListener("input", () => {
    _heatmapCellSize = Math.max(24, Math.min(72, Number(sizeInput.value || 36)));
    if (sizeValue) sizeValue.textContent = String(_heatmapCellSize);
    if (statusEl && matrixData) statusEl.textContent = `${matrixData.columns.length} columns \xB7 ${_heatmapCellSize}px cells`;
    renderHeatmap();
  });
  window.addEventListener("edatime:page-change", (e) => {
    if (e?.detail?.page === "heatmap") loadMatrix();
  });
  loadMatrix();
}
var _spectrogramLoaded = false;
var _spectrogramChart = null;
var _spectrogramResizeObserver = null;
var _spectrogramResult = null;
var _spectrogramSampleCount = 0;
async function initSpectrogramPage() {
  if (_spectrogramLoaded) return;
  _spectrogramLoaded = true;
  const colSelect = document.getElementById("spectrogram-col-select");
  const winSelect = document.getElementById("spectrogram-win-size");
  const logCheck = document.getElementById("spectrogram-log-scale");
  const computeBtn = document.getElementById("spectrogram-compute-btn");
  const resetZoomBtn = document.getElementById("spectrogram-zoom-reset-btn");
  const statusEl = document.getElementById("spectrogram-status");
  const chartEl = document.getElementById("spectrogram-chart");
  if (!chartEl || !colSelect) return;
  const ensureSpectrogramChart = async () => {
    if (_spectrogramChart) return _spectrogramChart;
    const echarts = await import("./echarts-SD7KWPBA.js");
    _spectrogramChart = echarts.init(chartEl, void 0, { renderer: "canvas" });
    _spectrogramResizeObserver?.disconnect();
    _spectrogramResizeObserver = new ResizeObserver(() => _spectrogramChart?.resize());
    _spectrogramResizeObserver.observe(chartEl);
    if (chartEl.style.position === "" || chartEl.style.position === "static") {
      chartEl.style.position = "relative";
    }
    const selBox = document.createElement("div");
    selBox.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);pointer-events:none;display:none;z-index:5";
    chartEl.appendChild(selBox);
    let _dragStart = null;
    let _dragEnd = { x: 0, y: 0 };
    const SPEC_GRID = { left: 72, right: 110, top: 24, bottom: 80 };
    chartEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rect = chartEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x > rect.width - SPEC_GRID.right || x < SPEC_GRID.left || y < SPEC_GRID.top || y > rect.height - SPEC_GRID.bottom) return;
      _dragStart = { x, y, pid: e.pointerId };
      _dragEnd = { x, y };
      try {
        chartEl.setPointerCapture(e.pointerId);
      } catch {
      }
    });
    chartEl.addEventListener("pointermove", (e) => {
      if (!_dragStart || e.pointerId !== _dragStart.pid) return;
      const rect = chartEl.getBoundingClientRect();
      _dragEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const left = Math.min(_dragStart.x, _dragEnd.x);
      const top = Math.min(_dragStart.y, _dragEnd.y);
      selBox.style.left = `${left}px`;
      selBox.style.top = `${top}px`;
      selBox.style.width = `${Math.abs(_dragEnd.x - _dragStart.x)}px`;
      selBox.style.height = `${Math.abs(_dragEnd.y - _dragStart.y)}px`;
      selBox.style.display = "block";
    });
    const finishDrag = (e) => {
      if (!_dragStart || e.pointerId !== _dragStart.pid) return;
      const start = _dragStart;
      _dragStart = null;
      selBox.style.display = "none";
      try {
        chartEl.releasePointerCapture(e.pointerId);
      } catch {
      }
      const dx = Math.abs(_dragEnd.x - start.x);
      const dy = Math.abs(_dragEnd.y - start.y);
      if (dx < 8 || dy < 8) return;
      const chart = _spectrogramChart;
      if (!chart || !_spectrogramResult) return;
      const p0 = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [start.x, start.y]);
      const p1 = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [_dragEnd.x, _dragEnd.y]);
      if (!p0 || !p1) return;
      const xLen = _spectrogramResult.times_ms.length;
      const yLen = _spectrogramResult.frequencies.length;
      const xStartPct = Math.max(0, Math.min(100, Math.min(p0[0], p1[0]) / (xLen - 1) * 100));
      const xEndPct = Math.max(0, Math.min(100, Math.max(p0[0], p1[0]) / (xLen - 1) * 100));
      const yStartPct = Math.max(0, Math.min(100, Math.min(p0[1], p1[1]) / (yLen - 1) * 100));
      const yEndPct = Math.max(0, Math.min(100, Math.max(p0[1], p1[1]) / (yLen - 1) * 100));
      if (xEndPct <= xStartPct || yEndPct <= yStartPct) return;
      chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: xStartPct, end: xEndPct });
      chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: yStartPct, end: yEndPct });
    };
    chartEl.addEventListener("pointerup", finishDrag);
    chartEl.addEventListener("pointercancel", (e) => {
      if (_dragStart?.pid === e.pointerId) {
        _dragStart = null;
        selBox.style.display = "none";
      }
    });
    chartEl.addEventListener("dblclick", () => {
      if (!_spectrogramChart) return;
      _spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: 0, end: 100 });
      _spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: 0, end: 100 });
    });
    return _spectrogramChart;
  };
  const formatSpectrogramTime = (tsMs) => {
    return new Date(tsMs).toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };
  const formatSpectrogramFrequency = (freq) => {
    if (!Number.isFinite(freq)) return "\u2014";
    if (freq >= 1e3) return `${(freq / 1e3).toFixed(2)} kHz`;
    if (freq >= 1) return `${freq.toFixed(2)} Hz`;
    return `${(freq * 1e3).toFixed(2)} mHz`;
  };
  const renderSpectrogramChart = async () => {
    if (!_spectrogramResult) return;
    const chart = await ensureSpectrogramChart();
    const logScale = logCheck?.checked ?? true;
    const points = [];
    const timeAxis = _spectrogramResult.times_ms;
    const freqAxis = _spectrogramResult.frequencies;
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (let timeIndex = 0; timeIndex < timeAxis.length; timeIndex++) {
      const timeMs = timeAxis[timeIndex];
      const row = _spectrogramResult.magnitudes[timeIndex] || [];
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
            `<strong>${_spectrogramResult?.column || "Spectrogram"}</strong>`,
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
      // dataZoom components are registered so dispatchAction works,
      // but all built-in mouse interactions are disabled — the native
      // pointer-drag overlay above handles zoom, dblclick resets.
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
        name: _spectrogramResult.column,
        type: "heatmap",
        progressive: 0,
        emphasis: { itemStyle: { borderColor: "#ffffff", borderWidth: 1 } },
        data: points
      }]
    });
    statusEl.textContent = `${_spectrogramResult.column} \xB7 ${_spectrogramResult.times_ms.length} windows \xD7 ${_spectrogramResult.frequencies.length} bins \xB7 ${_spectrogramSampleCount} samples`;
  };
  if (appState.metadata) {
    for (const col of appState.metadata.numeric_columns) {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      colSelect.appendChild(opt);
    }
  }
  computeBtn?.addEventListener("click", async () => {
    const column = colSelect.value;
    if (!column) {
      if (statusEl) statusEl.textContent = "Select a column.";
      return;
    }
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) {
      if (statusEl) statusEl.textContent = "No time range available.";
      return;
    }
    const winSize = parseInt(winSelect?.value || "256", 10);
    try {
      setComputeLoading("spectrogram-compute-btn", "spectrogram-loading", true);
      if (statusEl) statusEl.textContent = "Fetching spectrogram\u2026";
      const { fetchSpectrogram } = await import("./dataClient.js");
      const startIso = new Date(appState.currentStart).toISOString();
      const endIso = new Date(appState.currentEnd).toISOString();
      const resp = await fetchSpectrogram(startIso, endIso, column, winSize);
      _spectrogramResult = resp.result;
      _spectrogramSampleCount = resp.sample_count;
      await renderSpectrogramChart();
    } catch (e) {
      if (statusEl) statusEl.textContent = `Error: ${e?.message || "failed"}`;
    } finally {
      setComputeLoading("spectrogram-compute-btn", "spectrogram-loading", false);
    }
  });
  logCheck?.addEventListener("change", () => {
    if (_spectrogramResult) void renderSpectrogramChart();
  });
  resetZoomBtn?.addEventListener("click", () => {
    if (!_spectrogramChart) return;
    _spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: 0, end: 100 });
    _spectrogramChart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: 0, end: 100 });
  });
  window.addEventListener("edatime:page-change", (e) => {
    if (e?.detail?.page === "spectrogram" && appState.metadata) {
      const currentOpts = new Set(Array.from(colSelect.options).map((o) => o.value));
      for (const col of appState.metadata.numeric_columns) {
        if (!currentOpts.has(col)) {
          const opt = document.createElement("option");
          opt.value = col;
          opt.textContent = col;
          colSelect.appendChild(opt);
        }
      }
      _spectrogramChart?.resize?.();
    }
  });
}
async function initCausalPage() {
  const { initCausalPage: init2 } = await import("./causalPage-YXZLMPHG.js");
  init2({
    getMetadata: () => appState.metadata,
    chipColor: _fftColorFor,
    numericColumns: _fftColumns,
    setLoading: setComputeLoading
  });
}
function initOutlierModal() {
  const openBtn = document.getElementById("outlier-open-btn");
  const applyBtn = document.getElementById("outlier-apply-btn");
  const methodSelect = document.getElementById("outlier-method");
  const thresholdInput = document.getElementById("outlier-threshold");
  const windowInput = document.getElementById("outlier-window");
  const errorEl = document.getElementById("outlier-error");
  const resultEl = document.getElementById("outlier-result");
  const close = initModalClose(
    "outlier-modal",
    "outlier-close-btn",
    "outlier-cancel-btn",
    () => {
      if (errorEl) errorEl.textContent = "";
      if (resultEl) resultEl.textContent = "";
    }
  );
  if (!close) return;
  const modal = document.getElementById("outlier-modal");
  openBtn?.addEventListener("click", () => {
    modal.hidden = false;
  });
  methodSelect?.addEventListener("change", () => {
    if (thresholdInput) {
      thresholdInput.value = methodSelect.value === "iqr" ? "1.5" : "3";
    }
  });
  applyBtn?.addEventListener("click", async () => {
    if (errorEl) errorEl.textContent = "";
    if (resultEl) resultEl.textContent = "";
    const method = methodSelect?.value || "zscore";
    const threshold = parseFloat(thresholdInput?.value || "3");
    const windowSize = parseInt(windowInput?.value || "0", 10);
    const cols = appState.selectedCols.length > 0 ? appState.selectedCols : null;
    try {
      applyBtn.disabled = true;
      applyBtn.textContent = "Removing\u2026";
      const { postRemoveOutliers } = await import("./dataClient.js");
      const result = await postRemoveOutliers(
        cols,
        method,
        threshold,
        windowSize > 0 ? windowSize : void 0
      );
      if (resultEl) resultEl.textContent = `Removed ${result.rows_removed} rows (${result.rows_before} \u2192 ${result.rows_after})`;
      if (fetchMetadata) {
        appState.metadata = await fetchMetadata();
        appState.numericCols = (appState.metadata.numeric_columns || []).filter((col) => col && col.toLowerCase() !== "ts");
        sanitizeSelectedColumns();
        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
        buildMetaBar(appState.metadata);
        await fetchAndRender();
      }
    } catch (e) {
      if (errorEl) errorEl.textContent = e?.message || "Outlier removal failed.";
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = "Remove Outliers";
    }
  });
}
function initTimeDistributionModal() {
  const computeBtn = document.getElementById("timedist-compute-btn");
  const windowsInput = document.getElementById("timedist-windows");
  const binsInput = document.getElementById("timedist-bins");
  const canvas = document.getElementById("timedist-canvas");
  const statusEl = document.getElementById("timedist-status");
  const close = initModalClose("timedist-modal", "timedist-close-btn", "timedist-cancel-btn");
  if (!close || !canvas) return;
  const modal = document.getElementById("timedist-modal");
  const openBtn = document.getElementById("timedist-open-btn");
  openBtn?.addEventListener("click", () => {
    modal.hidden = false;
  });
  computeBtn?.addEventListener("click", async () => {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    const cols = appState.selectedCols.length > 0 ? appState.selectedCols[0] : null;
    if (!cols) {
      if (statusEl) statusEl.textContent = "Select a column first.";
      return;
    }
    const windows = parseInt(windowsInput?.value || "20", 10);
    const bins = parseInt(binsInput?.value || "24", 10);
    try {
      computeBtn.disabled = true;
      computeBtn.textContent = "Computing\u2026";
      if (statusEl) statusEl.textContent = "Fetching data\u2026";
      const { fetchTimeDistributions } = await import("./dataClient.js");
      const startIso = new Date(appState.currentStart).toISOString();
      const endIso = new Date(appState.currentEnd).toISOString();
      const result = await fetchTimeDistributions(startIso, endIso, cols, windows, bins);
      if (result.columns.length === 0) {
        if (statusEl) statusEl.textContent = "No data returned.";
        return;
      }
      renderTimeDistBoxPlots(canvas, result.columns[0], windows, bins);
      if (statusEl) statusEl.textContent = `${cols}: ${result.columns[0].windows.length} windows \xD7 ${bins} bins (box plot)`;
    } catch (e) {
      if (statusEl) statusEl.textContent = `Error: ${e?.message || "failed"}`;
    } finally {
      computeBtn.disabled = false;
      computeBtn.textContent = "Compute";
    }
  });
}
function renderTimeDistBoxPlots(canvas, data, _nWindows, _nBins) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const wins = data.windows;
  if (wins.length === 0) return;
  const nW = wins.length;
  const W = canvas.width;
  const H = canvas.height;
  const marginL = 60;
  const marginB = 30;
  const marginT = 10;
  const marginR = 16;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;
  const stats = [];
  for (const w of wins) {
    const edges = w.bin_edges;
    const counts = w.counts;
    let total = 0;
    for (const c of counts) total += c;
    if (total === 0) {
      stats.push({ q1: 0, median: 0, q3: 0, min: 0, max: 0, total: 0 });
      continue;
    }
    const percentile = (p) => {
      const target = p * total;
      let cumul = 0;
      for (let i = 0; i < counts.length; i++) {
        cumul += counts[i];
        if (cumul >= target) {
          const lo = edges[i], hi = edges[i + 1] ?? edges[i];
          const frac = counts[i] > 0 ? (target - (cumul - counts[i])) / counts[i] : 0.5;
          return lo + frac * (hi - lo);
        }
      }
      return edges[edges.length - 1] ?? 0;
    };
    let minVal = edges[0] ?? 0;
    let maxVal = edges[edges.length - 1] ?? 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) {
        minVal = edges[i];
        break;
      }
    }
    for (let i = counts.length - 1; i >= 0; i--) {
      if (counts[i] > 0) {
        maxVal = edges[i + 1] ?? edges[i];
        break;
      }
    }
    const q1 = percentile(0.25);
    const median = percentile(0.5);
    const q3 = percentile(0.75);
    const iqr = q3 - q1;
    const whiskerLo = Math.max(minVal, q1 - 1.5 * iqr);
    const whiskerHi = Math.min(maxVal, q3 + 1.5 * iqr);
    stats.push({ q1, median, q3, min: whiskerLo, max: whiskerHi, total });
  }
  const gMin = data.global_min;
  const gMax = data.global_max;
  const gRange = gMax - gMin || 1;
  const toY = (v) => marginT + plotH - (v - gMin) / gRange * plotH;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--bg").trim() || "#0b0f18";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(120, 139, 174, 0.12)";
  ctx.lineWidth = 0.5;
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i++) {
    const y = marginT + plotH / ySteps * i;
    ctx.beginPath();
    ctx.moveTo(marginL, y);
    ctx.lineTo(W - marginR, y);
    ctx.stroke();
  }
  const boxGap = 2;
  const slotW = plotW / nW;
  const boxW = Math.max(4, slotW - boxGap * 2);
  const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#00a8ff";
  for (let i = 0; i < nW; i++) {
    const s = stats[i];
    if (s.total === 0) continue;
    const cx = marginL + slotW * i + slotW / 2;
    const halfBox = boxW / 2;
    ctx.strokeStyle = "rgba(120, 139, 174, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, toY(s.min));
    ctx.lineTo(cx, toY(s.max));
    ctx.stroke();
    const capW = boxW * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx - capW, toY(s.min));
    ctx.lineTo(cx + capW, toY(s.min));
    ctx.moveTo(cx - capW, toY(s.max));
    ctx.lineTo(cx + capW, toY(s.max));
    ctx.stroke();
    const boxTop = toY(s.q3);
    const boxBot = toY(s.q1);
    ctx.fillStyle = accent + "33";
    ctx.fillRect(cx - halfBox, boxTop, boxW, boxBot - boxTop);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - halfBox, boxTop, boxW, boxBot - boxTop);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const medY = toY(s.median);
    ctx.moveTo(cx - halfBox, medY);
    ctx.lineTo(cx + halfBox, medY);
    ctx.stroke();
  }
  ctx.fillStyle = "#788BAE";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= ySteps; i++) {
    const frac = i / ySteps;
    const val = gMin + frac * gRange;
    const y = marginT + plotH - frac * plotH;
    ctx.fillText(val.toFixed(1), marginL - 4, y + 3);
  }
  ctx.textAlign = "center";
  const xSteps = Math.min(5, nW);
  for (let i = 0; i <= xSteps; i++) {
    const idx = Math.round(i / xSteps * (nW - 1));
    const t = wins[idx].window_start_ms;
    const date = new Date(t);
    const label = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    ctx.fillText(label, marginL + idx * slotW + slotW / 2, H - 6);
  }
}
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  const iconDark = document.getElementById("theme-icon-dark");
  const iconLight = document.getElementById("theme-icon-light");
  if (!btn) return;
  const saved = localStorage.getItem("edatime-theme");
  if (saved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    if (iconDark) iconDark.hidden = true;
    if (iconLight) iconLight.hidden = false;
  }
  btn.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("edatime-theme", "dark");
      if (iconDark) iconDark.hidden = false;
      if (iconLight) iconLight.hidden = true;
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("edatime-theme", "light");
      if (iconDark) iconDark.hidden = true;
      if (iconLight) iconLight.hidden = false;
    }
  });
}
async function init() {
  initPages();
  initThemeToggle();
  initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid);
  initColumnProfilesGrid();
  initAnalysisControls(fetchAndRender);
  initColumnFilterModal(renderCurrentData, updateAnalysisYRange);
  initChartPageFilterGesture();
  initKeyboardShortcuts();
  initTransformModal();
  initOutlierModal();
  initTimeDistributionModal();
  initAnalyticsListeners();
  try {
    await ensureChartModules();
  } catch (e) {
    console.error("Chart/data modules failed to load:", e);
    setMetaText("Chart modules failed to load, but upload is available.");
    return;
  }
  const gpuError = await checkWebGPU();
  try {
    appState.metadata = await fetchMetadata();
    dbgGroup("metadata", () => dbg(appState.metadata));
    setMetaText("Loading chart\u2026");
    await initScatterPageModule();
    await initFftPage();
    await initHeatmapPage();
    await initSpectrogramPage();
    initCausalPage();
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
      const onFilterInput = debounce(() => {
        appState.filterText = (columnFilterInput.value || "").trim().toLowerCase();
        buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
      }, 120);
      columnFilterInput.addEventListener("input", onFilterInput);
    }
    const profileFilterInput = document.getElementById("profile-filter-input");
    if (profileFilterInput) {
      const onProfileFilterInput = debounce(() => {
        appState.profileFilterText = (profileFilterInput.value || "").trim().toLowerCase();
        renderColumnProfilesGrid(true);
      }, 120);
      profileFilterInput.addEventListener("input", onProfileFilterInput);
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
    if (gpuError) throw new Error(gpuError);
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
