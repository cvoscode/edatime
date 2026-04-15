import {
  appState,
  buildMetaBar,
  computeBounds,
  formatAnalysisNumber,
  getSeriesColor,
  sanitizeSelectedColumns,
  setSeriesColor
} from "./chunk-DJBC4VTI.js";

// frontend/src/ui/columns.ts
function buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn = null) {
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
  colorControl.style.margin = "0.35rem 0 0.8rem";
  colorControl.innerHTML = `
    <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:var(--text-muted);">
      <span>Color by</span>
      <select id="color-column-select" style="flex:1;padding:0.2rem;border:1px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:6px;"></select>
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
      if (typeof fetchAndRender === "function") fetchAndRender();
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
      <input type="checkbox" ${isActive ? "checked" : ""} value="${col}">
      <span class="chip-dot" style="background:${color}"></span>
      <span class="chip-label">${col}</span>
      <input type="color" class="chip-color-picker" value="${color}" aria-label="Set ${col} color" title="Set ${col} color">
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
        buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
        buildRangeControlsFn();
        appState.chart?.requestOverlayRender?.();
        if (!hadColumn) fetchAndRender();
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
      fetchAndRender();
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
function initColumnFilterModal(renderCurrentData, updateAnalysisYRange) {
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
    renderCurrentData();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, "filter");
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
    renderCurrentData();
    appState.chart?.fitYToData?.();
    const yr = appState.chart?.getYRange?.();
    if (yr) updateAnalysisYRange(yr.min, yr.max, "filter");
    emitColumnFiltersChange();
    closeModal();
  });
  modal.dataset.bound = "1";
}

export {
  buildColumnToggles,
  buildRangeControls,
  initColumnFilterModal
};
//# sourceMappingURL=chunk-46CWFQDH.js.map
