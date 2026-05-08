const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/frequency-DsOq7zgH.js","assets/chartgpu-CqrjGxnD.js","assets/DataChart-BlzPYbPm.js","assets/scatter-YST55Tu_.js","assets/drift-CTz8wK_7.js","assets/causal-QCmcQZom.js"])))=>i.map(i=>d[i]);
import { c as appState, s as formatAnalysisNumber, u as sanitizeSelectedColumns, v as getSeriesColor, h as escapeHtml$2, w as buildMetaBar, x as setSeriesColor, y as computeBounds, z as fetchMetadata$1, A as formatCount, B as formatToDatetimeLocal, C as formatAnalysisTime, P as PROFILE_ROW_HEIGHT, E as PROFILE_COLUMNS, F as normalizeDtypeLabel, G as formatProfileValue, H as getDefaultProfileColumnWidths, I as PROFILE_OVERSCAN, J as toFiniteNumberOrNull, K as dbgGroup, L as dbg, D as DEBUG, M as ensureRangeStateFromData, N as setMetaText, o as createEmptyStateController, O as applyColumnRanges, l as isRangeOutsideDataset, d as downloadBlob, b as buildAdaptiveLineFiltersForQuery, S as SERIES_COLORS, t as toast, _ as __vitePreload, Q as debounce, R as installWindowsWebGpuRequestAdapterWorkaround, T as getNumericColumns, U as getDefaultTimeseriesColumns, r as requestGpuAdapter, V as buildAdaptiveLineY, W as initFftPage$1, X as getAnalyticsChipColor, Y as initSpectrogramPage$1, Z as initHeatmapPage$1 } from './assets/frequency-DsOq7zgH.js';
import './assets/chartgpu-CqrjGxnD.js';

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
  colorControl.innerHTML = `
    <label>
      <span>Color by</span>
            <select id="color-column-select" name="color-column-select" aria-label="Color-by column"></select>
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
  visibleCols.forEach((col) => {
    const safeKey = col.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const colIdx = appState.numericCols.indexOf(col);
    const color = getSeriesColor(col, colIdx >= 0 ? colIdx : 0);
    const isActive = appState.selectedCols.includes(col);
    const isAdaptiveTarget = isActive && appState.adaptiveFilterColumn === col;
    const chip = document.createElement("label");
    chip.className = "series-chip" + (isActive ? " active" : "") + (isAdaptiveTarget ? " adaptive-target" : "");
    chip.style.setProperty("--chip-accent", color);
    chip.title = isAdaptiveTarget ? `Adaptive filter target: ${col}` : `Ctrl+click to target adaptive filters to ${col}`;
    chip.innerHTML = `
            <input type="checkbox" id="series-toggle-${safeKey}" name="series-toggle-${safeKey}" aria-label="Toggle ${escapeHtml$2(col)} series" ${isActive ? "checked" : ""} value="${escapeHtml$2(col)}">
      <span class="chip-label">${escapeHtml$2(col)}</span>
            <input type="color" class="chip-color-picker" id="series-color-${safeKey}" name="series-color-${safeKey}" value="${escapeHtml$2(color)}" aria-label="Set ${escapeHtml$2(col)} color" title="Set ${escapeHtml$2(col)} color">
            <button class="chip-menu-btn" type="button" aria-label="Chip options for ${escapeHtml$2(col)}" title="More options">
              <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
            </button>
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
      renderCurrentDataFn?.();
    });
    const menuBtn = chip.querySelector(".chip-menu-btn");
    if (menuBtn) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        document.querySelectorAll(".chip-menu").forEach((m) => m.remove());
        const menu = document.createElement("div");
        menu.className = "chip-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", `Options for ${col}`);
        const isTarget = appState.adaptiveFilterColumn === col;
        menu.innerHTML = `
                  <button class="chip-menu-item ${isTarget ? "chip-menu-item--active" : ""}" data-action="adaptive-target" role="menuitem">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h12M8 2v12"/></svg>
                    Set as adaptive target
                  </button>
                  <button class="chip-menu-item" data-action="open-filter" role="menuitem">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="4"/><circle cx="10" cy="10" r="4"/></svg>
                    Filter range…
                  </button>
                  <div class="chip-menu-divider"></div>
                  <button class="chip-menu-item" data-action="remove" role="menuitem">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
                    Remove from chart
                  </button>
                `;
        menu.querySelectorAll(".chip-menu-item").forEach((item) => {
          item.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const action = item.dataset.action;
            if (action === "adaptive-target") {
              if (!appState.selectedCols.includes(col)) appState.selectedCols.push(col);
              appState.adaptiveFilterColumn = col;
              appState.pendingAdaptivePoint = null;
              buildMetaBar(appState.metadata);
              buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
              buildRangeControlsFn();
              appState.chart?.requestOverlayRender?.();
              if (!appState.selectedCols.includes(col)) fetchAndRender();
            } else if (action === "open-filter") {
              const open = window.__edatime?.openFilterForCol;
              if (typeof open === "function") open(col);
            } else if (action === "remove") {
              appState.selectedCols = appState.selectedCols.filter((c) => c !== col);
              if (appState.adaptiveFilterColumn === col) {
                appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
              }
              buildMetaBar(appState.metadata);
              buildColumnToggles(fetchAndRender, buildRangeControlsFn, renderCurrentDataFn);
              buildRangeControlsFn();
              appState.chart?.requestOverlayRender?.();
              fetchAndRender();
            }
            menu.remove();
          });
        });
        chip.appendChild(menu);
        const closeMenu = (e2) => {
          if (!chip.contains(e2.target)) {
            menu.remove();
            document.removeEventListener("click", closeMenu);
          }
        };
        setTimeout(() => document.addEventListener("click", closeMenu), 0);
      });
    }
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
      <span class="range">${formatAnalysisNumber(range.from)} → ${formatAnalysisNumber(range.to)}</span>
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
    setHint(`Available range: ${formatAnalysisNumber(full.min)} → ${formatAnalysisNumber(full.max)}`);
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

const UI_MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
function getPartialTimeRangeInputs() {
  const startInput = document.getElementById("time-start-input");
  const endInput = document.getElementById("time-end-input");
  if (!startInput || !endInput) return null;
  return {
    startInput,
    endInput,
    hint: document.getElementById("time-range-hint")
  };
}
function clearPartialTimeRangeInputs(inputs) {
  if (inputs.hint) inputs.hint.textContent = "Time range not detected in this file.";
  inputs.startInput.min = "";
  inputs.startInput.max = "";
  inputs.endInput.min = "";
  inputs.endInput.max = "";
}
function setPartialTimeRangeInputs(inputs, minLocal, maxLocal, overwriteInputs) {
  inputs.startInput.min = minLocal;
  inputs.startInput.max = maxLocal;
  inputs.endInput.min = minLocal;
  inputs.endInput.max = maxLocal;
  if (overwriteInputs || !inputs.startInput.value) inputs.startInput.value = minLocal;
  if (overwriteInputs || !inputs.endInput.value) inputs.endInput.value = maxLocal;
}
function setUploadPreviewStatus(text, kind = "") {
  const el = document.getElementById("upload-preview-status");
  if (!el) return;
  el.textContent = text;
  el.className = `upload-preview-status ${kind}`.trim();
}
function formatUploadRowCount(rowCount) {
  return rowCount >= 1e6 ? (rowCount / 1e6).toFixed(1) + "M" : rowCount >= 1e3 ? (rowCount / 1e3).toFixed(0) + "K" : String(rowCount);
}
function setProfileMode(mode) {
  const badge = document.getElementById("profile-mode-badge");
  if (!badge) return;
  badge.setAttribute("data-mode", mode);
  badge.textContent = mode === "preview" ? "Upload preview" : "Current dataset";
}
function applyPartialTimeRangeFromMetadata(metadata, overwriteInputs = true) {
  const inputs = getPartialTimeRangeInputs();
  if (!inputs) return;
  const minMs = Number(metadata?.time_range?.min);
  const maxMs = Number(metadata?.time_range?.max);
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    clearPartialTimeRangeInputs(inputs);
    return;
  }
  const minLocal = formatToDatetimeLocal(minMs);
  const maxLocal = formatToDatetimeLocal(maxMs);
  setPartialTimeRangeInputs(inputs, minLocal, maxLocal, overwriteInputs);
  if (inputs.hint) {
    inputs.hint.textContent = `Detected: ${formatAnalysisTime(minMs)} → ${formatAnalysisTime(maxMs)}`;
  }
}
function initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid) {
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
  let dbStatusLoaded = false;
  function validateSelectedFile(file) {
    if (!file) return "Please select a file first.";
    const name = String(file.name || "").toLowerCase();
    if (!(name.endsWith(".csv") || name.endsWith(".parquet"))) {
      return "Only CSV and Parquet files are supported.";
    }
    if (Number(file.size) > UI_MAX_UPLOAD_BYTES) {
      const maxMb = Math.round(UI_MAX_UPLOAD_BYTES / (1024 * 1024));
      return `File exceeds ${maxMb} MB upload limit.`;
    }
    return null;
  }
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
    renderColumnProfilesGrid(false);
  }
  async function runFilePreview(file) {
    if (!file) {
      setUploadPreviewStatus("Select a file to preview columns");
      return;
    }
    if (previewController) previewController.abort();
    previewController = new AbortController();
    setUploadPreviewStatus("Profiling file…", "loading");
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
      hydrateColumnProfiles(previewMetadata);
      applyPreviewColumnSelection(previewMetadata);
      renderColumnProfilesGrid(true);
      applyPartialTimeRangeFromMetadata(previewMetadata, true);
      const previewRows = Number(previewMetadata.total_rows || result?.preview_rows || 0);
      if (!appState.previewTimeColumn && !previewMetadata.time_range) {
        setUploadPreviewStatus("No time column detected in preview. Please select one from the dropdown before upload.", "warning");
      } else {
        setUploadPreviewStatus(`Preview ready (${formatCount(previewRows)} rows)`, "success");
      }
      setProfileMode("preview");
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
  dropZone.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fileInput.click();
  });
  browseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files?.[0] || null;
    const invalidFileMsg = validateSelectedFile(selectedFile);
    if (invalidFileMsg) {
      selectedFile = null;
      fileInput.value = "";
      fileDisplay.textContent = "";
      setStatus(invalidFileMsg, "error");
      setUploadPreviewStatus(invalidFileMsg, "error");
      return;
    }
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
    const invalidFileMsg = validateSelectedFile(selectedFile);
    if (invalidFileMsg) {
      selectedFile = null;
      fileDisplay.textContent = "";
      setStatus(invalidFileMsg, "error");
      setUploadPreviewStatus(invalidFileMsg, "error");
      return;
    }
    fileDisplay.textContent = selectedFile ? selectedFile.name : "";
    appState.previewTimeColumn = null;
    if (selectedFile) runFilePreview(selectedFile);
  });
  partialChk.addEventListener("change", () => {
    partialFlds.classList.toggle("visible", partialChk.checked);
  });
  partialFlds.classList.toggle("visible", partialChk.checked);
  nRowsRange.addEventListener("input", () => {
    const v = parseInt(nRowsRange.value, 10);
    nRowsInput.value = String(v);
    nRowsDisp.textContent = formatUploadRowCount(v);
  });
  nRowsInput.addEventListener("input", () => {
    const v = parseInt(nRowsInput.value, 10);
    if (!isNaN(v)) {
      nRowsRange.value = String(Math.min(v, parseInt(nRowsRange.max, 10)));
      nRowsDisp.textContent = formatUploadRowCount(v);
    }
  });
  const defaultRows = parseInt(nRowsRange.value, 10);
  if (!isNaN(defaultRows) && defaultRows > 0) {
    nRowsInput.value = String(defaultRows);
    nRowsDisp.textContent = formatUploadRowCount(defaultRows);
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
    const invalidFileMsg = validateSelectedFile(selectedFile);
    if (invalidFileMsg) {
      setStatus(invalidFileMsg, "error");
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
      if (tStartIso && tEndIso && Date.parse(tStartIso) > Date.parse(tEndIso)) {
        setStatus("Start time must be before end time.", "error");
        return;
      }
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
    setStatus("Uploading…", "loading");
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
        setStatus(`Loaded ${result.rows.toLocaleString()} rows. Refreshing stats…`, "success");
        try {
          const freshMetadata = await fetchMetadata$1();
          appState.metadata = freshMetadata;
          const revision = freshMetadata?.revision;
          appState.datasetRevision = typeof revision === "number" ? revision : 0;
          selectedFile = null;
          fileInput.value = "";
          fileDisplay.textContent = "";
          setUploadPreviewStatus("Upload complete. Select a file to preview.", "");
          setProfileMode("dataset");
          hydrateColumnProfiles(freshMetadata);
          applyPartialTimeRangeFromMetadata(freshMetadata, false);
          renderColumnProfilesGrid(true);
        } catch {
          setTimeout(() => window.location.reload(), 1200);
        }
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
    if (progressWrap) progressWrap.setAttribute("aria-valuenow", "0");
    const t = setInterval(() => {
      w = Math.min(w + Math.random() * 8, 85);
      bar.style.width = w + "%";
      if (progressWrap) progressWrap.setAttribute("aria-valuenow", String(Math.round(w)));
      if (w >= 85) clearInterval(t);
    }, 120);
    return () => {
      clearInterval(t);
      if (progressWrap) {
        const current = Number(progressWrap.getAttribute("aria-valuenow") || "0");
        progressWrap.setAttribute("aria-valuenow", String(Math.max(current, 100)));
      }
    };
  }
  const fileTabBtn = document.getElementById("upload-source-file-btn");
  const dbTabBtn = document.getElementById("upload-source-database-btn");
  const filePanel = document.querySelector('[data-upload-source-panel="file"]');
  const dbPanel = document.querySelector('[data-upload-source-panel="database"]');
  function switchUploadSource(source) {
    if (source === "database") {
      fileTabBtn?.setAttribute("aria-selected", "false");
      dbTabBtn?.setAttribute("aria-selected", "true");
      fileTabBtn?.classList.remove("btn-primary");
      fileTabBtn?.classList.add("btn-ghost");
      dbTabBtn?.classList.remove("btn-ghost");
      dbTabBtn?.classList.add("btn-primary");
      if (filePanel) filePanel.hidden = true;
      if (dbPanel) dbPanel.hidden = false;
      void syncDatabaseStatus();
    } else {
      dbTabBtn?.setAttribute("aria-selected", "false");
      fileTabBtn?.setAttribute("aria-selected", "true");
      dbTabBtn?.classList.remove("btn-primary");
      dbTabBtn?.classList.add("btn-ghost");
      fileTabBtn?.classList.remove("btn-ghost");
      fileTabBtn?.classList.add("btn-primary");
      if (dbPanel) dbPanel.hidden = true;
      if (filePanel) filePanel.hidden = false;
    }
  }
  fileTabBtn?.addEventListener("click", () => switchUploadSource("file"));
  dbTabBtn?.addEventListener("click", () => switchUploadSource("database"));
  const dbConnectBtn = document.getElementById("db-connect-btn");
  const dbLoadBtn = document.getElementById("db-load-btn");
  const dbDisconnectBtn = document.getElementById("db-disconnect-btn");
  const dbStatus = document.getElementById("db-status");
  const dbTableSelect = document.getElementById("db-table-select");
  async function refreshDbTables() {
    if (!dbTableSelect) return;
    try {
      const r = await fetch("/api/database/tables");
      if (!r.ok) return;
      const data = await r.json();
      const tables = data.tables ?? [];
      dbTableSelect.innerHTML = '<option value="">— select table —</option>';
      for (const t of tables) {
        const opt = document.createElement("option");
        opt.value = t.name;
        opt.textContent = t.kind === "hypertable" ? `⏱ ${t.schema}.${t.name}` : `${t.schema}.${t.name}`;
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
        dbStatus.textContent = "Connecting…";
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
        dbStatus.textContent = "Loading data…";
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
        dbTableSelect.innerHTML = '<option value="">— connect first —</option>';
      }
    });
  }
  async function syncDatabaseStatus() {
    if (dbStatusLoaded) return;
    dbStatusLoaded = true;
    try {
      const s = await fetch("/api/database/status").then((r) => r.json());
      if (s.connected) {
        if (dbLoadBtn) dbLoadBtn.disabled = false;
        if (dbDisconnectBtn) dbDisconnectBtn.hidden = false;
        if (dbStatus) {
          dbStatus.textContent = `Connected to ${s.table || "(no table loaded)"}`;
          dbStatus.className = "upload-status success";
        }
        void refreshDbTables();
      }
    } catch {
      dbStatusLoaded = false;
    }
  }
}

function createProfileRow(raw) {
  const name = String(raw?.name || "").trim();
  if (!name) return null;
  const counts = Array.isArray(raw?.histogram?.counts) ? raw.histogram.counts.map((count) => Math.max(0, Number(count) || 0)) : [];
  return {
    name,
    dtype: String(raw?.dtype || ""),
    nonNullCount: Math.max(0, Number(raw?.non_null_count) || 0),
    nullCount: Math.max(0, Number(raw?.null_count) || 0),
    min: toFiniteNumberOrNull(raw?.min),
    max: toFiniteNumberOrNull(raw?.max),
    histCounts: counts
  };
}
function createProfileStub(column) {
  const name = String(column?.name || "").trim();
  if (!name) return null;
  return {
    name,
    dtype: String(column?.dtype || ""),
    nonNullCount: 0,
    nullCount: 0,
    min: null,
    max: null,
    histCounts: []
  };
}
function compareProfileValues(left, right, direction) {
  const leftValue = String(left || "").toLowerCase();
  const rightValue = String(right || "").toLowerCase();
  if (leftValue < rightValue) return -1 * direction;
  if (leftValue > rightValue) return 1 * direction;
  return 0;
}
function sortProfileRows(profiles, sortKey, sortDir) {
  const sortable = new Set(PROFILE_COLUMNS.filter((column) => column.sortable).map((column) => column.key));
  if (!sortKey || !sortable.has(sortKey)) return profiles;
  const direction = sortDir === "desc" ? -1 : 1;
  return profiles.sort((leftRow, rightRow) => {
    const leftValue = leftRow[sortKey];
    const rightValue = rightRow[sortKey];
    if (sortKey === "name" || sortKey === "dtype") {
      return compareProfileValues(leftValue, rightValue, direction);
    }
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    const leftFinite = Number.isFinite(leftNumber);
    const rightFinite = Number.isFinite(rightNumber);
    if (!leftFinite && !rightFinite) return 0;
    if (!leftFinite) return 1;
    if (!rightFinite) return -1;
    return (leftNumber - rightNumber) * direction;
  });
}
function hydrateColumnProfiles(metadata) {
  const incoming = Array.isArray(metadata?.column_profiles) ? metadata.column_profiles : [];
  const cols = Array.isArray(metadata?.columns) ? metadata.columns : [];
  const profileByName = /* @__PURE__ */ new Map();
  for (const raw of incoming) {
    const profile = createProfileRow(raw);
    if (!profile) continue;
    profileByName.set(profile.name, profile);
  }
  for (const col of cols) {
    const profile = createProfileStub(col);
    if (!profile || profileByName.has(profile.name)) continue;
    profileByName.set(profile.name, profile);
  }
  appState.columnProfiles = Array.from(profileByName.values());
}
function getFilteredColumnProfiles() {
  const profiles = appState.columnProfiles || [];
  const q = (appState.profileFilterText || "").trim().toLowerCase();
  const filtered = !q ? [...profiles] : profiles.filter((p) => p.name.toLowerCase().includes(q) || p.dtype.toLowerCase().includes(q));
  const { key, dir } = appState.profileGridSort || {};
  return sortProfileRows(filtered, key, dir);
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
  const allCheckbox = document.getElementById("profile-select-all-checkbox");
  const selectable = getSelectablePreviewColumns(profiles);
  const selected = new Set(appState.previewSelectedColumns || []);
  const selectedCount = selectable.filter((name) => selected.has(name)).length;
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
    empty.textContent = "—";
    cell.appendChild(empty);
    return cell;
  }
  const maxCount = Math.max(...counts);
  if (!Number.isFinite(maxCount) || maxCount <= 0) {
    const empty = document.createElement("span");
    empty.className = "profile-hist-empty";
    empty.textContent = "—";
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
      let sum = 0;
      let sumSq = 0;
      let cnt = 0;
      for (let j = start; j < end; j++) {
        const v = Number(ys[j]);
        if (Number.isFinite(v)) {
          sum += v;
          sumSq += v * v;
          cnt += 1;
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
function createTimeseriesPageController(deps) {
  let dataFetchController = null;
  function emitChartRangeChange(sourceKind = "data") {
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    window.dispatchEvent(new CustomEvent("edatime:chart-range-change", {
      detail: { start: appState.currentStart, end: appState.currentEnd, source: sourceKind }
    }));
  }
  function renderCurrentData() {
    const emptyState = getTimeseriesEmptyStateController();
    const hasSelection = Array.isArray(appState.selectedCols) && appState.selectedCols.length > 0;
    if (!hasSelection) {
      emptyState.update({
        visible: true,
        reason: "no-columns-selected",
        title: "Select one or more series",
        message: "Click a column chip above to add it to the chart. Start with 2-3 related columns for a clearer first view.",
        showResetAction: false
      });
    }
    if (!appState.chart) return;
    if (!hasSelection) {
      appState.rollingBands = null;
      appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
      return;
    }
    if (!appState.lastFetchedData) {
      emptyState.update({ visible: false, reason: "", title: "", message: "", showResetAction: false });
      return;
    }
    const filtered = applyColumnRanges(appState.lastFetchedData);
    const hasPoints = !!filtered?.ts && filtered.ts.length > 0;
    if (!hasPoints) {
      const start = Number(appState.currentStart);
      const end = Number(appState.currentEnd);
      const rangeOutside = isRangeOutsideDataset(appState.metadata?.time_range, start, end);
      emptyState.update({
        visible: true,
        reason: rangeOutside ? "linked-range-outside-dataset" : "no-data-after-filters",
        title: rangeOutside ? "Current range is outside this dataset" : "No points match current filters",
        message: rangeOutside ? "Reset to dataset range to recover visible data." : "Try widening the time range or clearing filters.",
        showResetAction: true
      });
      appState.rollingBands = null;
      appState.chart.updateDataMulti(EMPTY_TIMESERIES_DATA, []);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        appState.chart.setXRange(start, end);
      }
      return;
    }
    emptyState.update({ visible: false, reason: "", title: "", message: "", showResetAction: false });
    const preview = appState.spectralFilterPreview;
    let displayCols = [...appState.selectedCols];
    if (preview && preview.ts && preview.values && preview.ts.length > 0) {
      const previewKey = `${preview.column} [filtered]`;
      filtered.series = filtered.series || {};
      filtered.series[previewKey] = { x: preview.ts, y: preview.values };
      if (!displayCols.includes(previewKey)) displayCols = [...displayCols, previewKey];
    }
    appState.chart.updateDataMulti(filtered, displayCols);
    if (appState.rollingEnabled) {
      appState.rollingBands = computeFrontendRollingBands(filtered, appState.selectedCols, appState.rollingWindow || 50);
      appState.chart?.requestOverlayRender?.();
    }
    window.dispatchEvent(new CustomEvent("edatime:workflow-refresh"));
  }
  async function fetchAndRender() {
    sanitizeSelectedColumns();
    if (!Number.isFinite(appState.currentStart) || !Number.isFinite(appState.currentEnd)) return;
    const currentStart = Number(appState.currentStart);
    const currentEnd = Number(appState.currentEnd);
    if (currentStart >= currentEnd) return;
    if (!Array.isArray(appState.selectedCols) || appState.selectedCols.length === 0) {
      deps.buildRangeControls();
      renderCurrentData();
      return;
    }
    if (dataFetchController) dataFetchController.abort();
    dataFetchController = new AbortController();
    const signal = dataFetchController.signal;
    const loadingEl = document.getElementById("main-chart-loading");
    if (loadingEl) loadingEl.hidden = false;
    try {
      const startIso = new Date(currentStart).toISOString();
      const endIso = new Date(currentEnd).toISOString();
      const width = document.getElementById("main-chart")?.clientWidth || 1200;
      const cols = appState.selectedCols.join(",");
      const colorCol = appState.selectedColorColumn || null;
      dbgGroup("fetchAndRender", () => {
        dbg("request", { startIso, endIso, width, cols, colorCol });
        dbg("selectedCols", appState.selectedCols);
        dbg("selectedColorColumn", appState.selectedColorColumn);
      });
      const data = await deps.fetchData(startIso, endIso, width, cols, colorCol, signal);
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
        if (!data?.ts || data.ts.length === 0) {
          console.warn("[edatime] fetchAndRender: empty result for range", { startIso, endIso, width, cols });
        }
      }
      ensureRangeStateFromData(data);
      deps.buildRangeControls();
      appState.chart?.setXRange?.(currentStart, currentEnd);
      renderCurrentData();
      emitChartRangeChange("data");
      if (appState.anomalyEnabled) {
        deps.fetchAndRenderAnalytics().catch(() => {
        });
      }
      if (DEBUG) {
        const snapshot = computeRenderedYDebugSnapshot();
        window.__edatime.debugYSnapshot = snapshot;
        dbg("post-render renderedSnapshot", snapshot);
      }
      const yr = appState.chart?.getYRange?.();
      if (yr) deps.updateAnalysisYRange(yr.min, yr.max, "data");
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
      const snap = deps.getCurrentView();
      appState.zoomHistory = [...appState.zoomHistory, snap].slice(-5);
      dbg("pushed history snapshot", snap);
      dbg("history depth (after push)", appState.zoomHistory.length);
    }
    appState.currentStart = newStart;
    appState.currentEnd = newEnd;
    appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
    appState.pendingYMode = "fit";
    appState.pendingRestoreY = null;
    deps.updateAnalysisZoom(newStart, newEnd, sourceKind);
    emitChartRangeChange(sourceKind);
    appState.fetchDebounceId = setTimeout(fetchAndRender, 150);
  }
  return {
    emitChartRangeChange,
    fetchAndRender,
    onZoomRangeChange,
    renderCurrentData
  };
}

const STYLE_MODULES = {
  drift: "css/modules/drift.css?v=4",
  home: "css/modules/home.css?v=1"
};
function pageStyleModulesFor(pageName) {
  if (pageName === "drift") return ["drift"];
  if (pageName === "home") return ["home"];
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
function exportChartFilteredData$1(format = "csv") {
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
    `Range: ${formatAnalysisTime(startMs)} → ${formatAnalysisTime(endMs)} (${sourceKind})`
  );
}
function updateAnalysisYRange(min, max, sourceKind = "user") {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    setAnalysisStatus("analysis-y", "Y: —");
    return;
  }
  setAnalysisStatus("analysis-y", `Y: ${formatAnalysisNumber(min)} → ${formatAnalysisNumber(max)} (${sourceKind})`);
}
function updateAnalysisCursor(tsMs) {
  if (!Number.isFinite(tsMs)) {
    setAnalysisStatus("analysis-cursor", "Cursor: —");
    return;
  }
  setAnalysisStatus("analysis-cursor", `Cursor: ${formatAnalysisTime(tsMs)}`);
}
function updateAnalysisClick(payload) {
  if (!payload?.value || payload.value.length < 2) {
    setAnalysisStatus("analysis-click", "Click: —");
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
function applyViewport(view, fetchAndRender, sourceKind = "api") {
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
  appState.fetchDebounceId = setTimeout(fetchAndRender, 0);
}
function zoomOut(fetchAndRender) {
  dbgGroup("zoomOut (dblclick)", () => {
    dbg("history depth", appState.zoomHistory.length);
    dbg("initialView", appState.initialView);
  });
  if (appState.zoomHistory.length > 0) {
    applyViewport(appState.zoomHistory.pop(), fetchAndRender, "zoom-out");
  } else if (appState.initialView) {
    applyViewport(appState.initialView, fetchAndRender, "zoom-out");
  }
}
function resetZoom(fetchAndRender) {
  dbgGroup("resetZoom", () => {
    dbg("initialView", appState.initialView);
  });
  if (!appState.initialView) return;
  appState.zoomHistory = [];
  applyViewport(appState.initialView, fetchAndRender, "reset");
}
function initAnalysisControls(fetchAndRender) {
  window.__edatime = window.__edatime || {};
  window.__edatime.exportChartFilteredData = exportChartFilteredData$1;
  const zoomResetBtn = document.getElementById("zoom-reset-btn");
  if (zoomResetBtn && !zoomResetBtn.dataset.bound) {
    zoomResetBtn.addEventListener("click", () => resetZoom(fetchAndRender));
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
    exportDataCsvBtn.addEventListener("click", () => exportChartFilteredData$1("csv"));
    exportDataCsvBtn.dataset.bound = "1";
  }
  if (exportDataJsonBtn && !exportDataJsonBtn.dataset.bound) {
    exportDataJsonBtn.addEventListener("click", () => exportChartFilteredData$1("json"));
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
    preloadPageStyles(pageName);
    if (pageNeedsDatasetBootstrap(pageName)) {
      await window.__edatime?.ensureDatasetReady?.(pageName);
    }
    if (window.__edatime?.ensurePageModuleLoaded) {
      await window.__edatime.ensurePageModuleLoaded(pageName);
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
  showPage("home");
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
  "drift"
]);
const PAGE_ALIASES = {
  scattermatrix: "scatter"
  // "Scatter Matrix" is now the matrix sub-view
};
let _bound$1 = false;
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
  if (_bound$1) return;
  _bound$1 = true;
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

let _overlay = null;
let _input = null;
let _list = null;
let _commands = [];
let _filtered = [];
let _selectedIdx = 0;
function buildDOM() {
  if (_overlay) return;
  _overlay = document.createElement("div");
  _overlay.className = "palette-overlay";
  _overlay.hidden = true;
  const panel = document.createElement("div");
  panel.className = "palette-panel";
  _input = document.createElement("input");
  _input.className = "palette-input";
  _input.id = "command-palette-input";
  _input.name = "command-palette-input";
  _input.type = "text";
  _input.placeholder = "Type a command…";
  _input.setAttribute("aria-label", "Command search");
  _list = document.createElement("div");
  _list.className = "palette-list";
  _list.setAttribute("role", "listbox");
  panel.appendChild(_input);
  panel.appendChild(_list);
  _overlay.appendChild(panel);
  document.body.appendChild(_overlay);
  _overlay.addEventListener("click", (e) => {
    if (e.target === _overlay) close();
  });
  _input.addEventListener("input", () => {
    filterAndRender(_input.value);
  });
  _input.addEventListener("keydown", onInputKeydown);
}
function onInputKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveSelection(1);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    moveSelection(-1);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const cmd = _filtered[_selectedIdx];
    if (cmd) {
      close();
      cmd.action();
    }
  }
}
function moveSelection(delta) {
  _selectedIdx = Math.max(0, Math.min(_filtered.length - 1, _selectedIdx + delta));
  renderList();
  const el = _list?.children[_selectedIdx];
  el?.scrollIntoView({ block: "nearest" });
}
function filterAndRender(query) {
  const q = query.trim().toLowerCase();
  _filtered = q ? _commands.filter((c) => c.label.toLowerCase().includes(q) || (c.hint || "").toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : [..._commands];
  _selectedIdx = 0;
  renderList();
}
function renderList() {
  if (!_list) return;
  _list.innerHTML = "";
  if (_filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "No matching commands";
    _list.appendChild(empty);
    return;
  }
  let lastCategory = "";
  for (let i = 0; i < _filtered.length; i++) {
    const cmd = _filtered[i];
    if (cmd.category !== lastCategory) {
      lastCategory = cmd.category;
      const header = document.createElement("div");
      header.className = "palette-category";
      header.textContent = cmd.category;
      _list.appendChild(header);
    }
    const row = document.createElement("div");
    row.className = "palette-item" + (i === _selectedIdx ? " palette-item--selected" : "");
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(i === _selectedIdx));
    const label = document.createElement("span");
    label.className = "palette-item-label";
    label.textContent = cmd.label;
    row.appendChild(label);
    if (cmd.hint) {
      const hint = document.createElement("span");
      hint.className = "palette-item-hint";
      hint.textContent = cmd.hint;
      row.appendChild(hint);
    }
    if (cmd.shortcut) {
      const kbd = document.createElement("kbd");
      kbd.className = "palette-item-kbd";
      kbd.textContent = cmd.shortcut;
      row.appendChild(kbd);
    }
    row.addEventListener("click", () => {
      close();
      cmd.action();
    });
    row.addEventListener("mouseenter", () => {
      _selectedIdx = i;
      renderList();
    });
    _list.appendChild(row);
  }
}
function close() {
  if (_overlay) _overlay.hidden = true;
}
function open() {
  buildDOM();
  if (_input) {
    _input.value = "";
  }
  filterAndRender("");
  if (_overlay) _overlay.hidden = false;
  requestAnimationFrame(() => _input?.focus());
}
function registerCommands(commands) {
  _commands = commands;
}
function openPalette() {
  open();
}
function initCommandPalette() {
  buildDOM();
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      if (_overlay?.hidden === false) close();
      else open();
    }
  });
}

const palette = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  initCommandPalette,
  openPalette,
  registerCommands
}, Symbol.toStringTag, { value: 'Module' }));

let _panel = null;
let _content = null;
function escapeText(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function buildPanel() {
  if (_panel) return;
  _panel = document.createElement("div");
  _panel.className = "provenance-panel";
  _panel.hidden = true;
  _panel.id = "provenance-panel";
  const header = document.createElement("div");
  header.className = "provenance-header";
  header.innerHTML = '<span class="provenance-title">Analysis Context</span>';
  const closeBtn = document.createElement("button");
  closeBtn.className = "provenance-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close provenance panel");
  closeBtn.addEventListener("click", toggleProvenance);
  header.appendChild(closeBtn);
  _content = document.createElement("div");
  _content.className = "provenance-content";
  _panel.appendChild(header);
  _panel.appendChild(_content);
  const appContent = document.querySelector(".app-content");
  if (appContent) {
    appContent.appendChild(_panel);
  } else {
    document.body.appendChild(_panel);
  }
}
function renderContent() {
  if (!_content) return;
  const sections = [];
  if (appState.metadata) {
    const m = appState.metadata;
    const rows = m.total_rows?.toLocaleString() ?? "—";
    const cols = m.columns?.length ?? 0;
    const timeCol = m.time_column ?? "—";
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Dataset</div>
                <div class="provenance-row"><span class="provenance-key">Rows</span><span class="provenance-val">${rows}</span></div>
                <div class="provenance-row"><span class="provenance-key">Columns</span><span class="provenance-val">${cols}</span></div>
                <div class="provenance-row"><span class="provenance-key">Time column</span><span class="provenance-val">${escapeText(timeCol)}</span></div>
            </div>
        `);
  }
  if (Number.isFinite(appState.currentStart) && Number.isFinite(appState.currentEnd)) {
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Time Range</div>
                <div class="provenance-row"><span class="provenance-key">Start</span><span class="provenance-val">${formatAnalysisTime(appState.currentStart)}</span></div>
                <div class="provenance-row"><span class="provenance-key">End</span><span class="provenance-val">${formatAnalysisTime(appState.currentEnd)}</span></div>
            </div>
        `);
  }
  if (appState.selectedCols.length > 0) {
    const chips = appState.selectedCols.map((c) => `<span class="provenance-chip">${escapeText(c)}</span>`).join("");
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Selected Series (${appState.selectedCols.length})</div>
                <div class="provenance-chips">${chips}</div>
            </div>
        `);
  }
  if (appState.selectedColorColumn) {
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Color Encoding</div>
                <div class="provenance-row"><span class="provenance-key">Column</span><span class="provenance-val">${escapeText(appState.selectedColorColumn)}</span></div>
            </div>
        `);
  }
  const rangeEntries = Object.entries(appState.columnRanges || {});
  if (rangeEntries.length > 0) {
    const rows = rangeEntries.map(
      ([col, r]) => `<div class="provenance-row"><span class="provenance-key">${escapeText(col)}</span><span class="provenance-val">${formatAnalysisNumber(r.from)} → ${formatAnalysisNumber(r.to)}</span></div>`
    ).join("");
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Numeric Filters (${rangeEntries.length})</div>
                ${rows}
            </div>
        `);
  }
  if (appState.adaptiveLineFilters.length > 0) {
    const rows = appState.adaptiveLineFilters.map(
      (f) => `<div class="provenance-row"><span class="provenance-key">${escapeText(f.column)}</span><span class="provenance-val">${f.keepAbove ? "above" : "below"} line</span></div>`
    ).join("");
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Adaptive Filters (${appState.adaptiveLineFilters.length})</div>
                ${rows}
            </div>
        `);
  }
  const overlays = [];
  if (appState.rollingEnabled) overlays.push(`Rolling mean (window ${appState.rollingWindow})`);
  if (appState.anomalyEnabled) overlays.push(`Anomaly detection (${appState.anomalyMethod}, σ=${appState.anomalyThreshold})`);
  if (overlays.length > 0) {
    sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Analytics Overlays</div>
                ${overlays.map((o) => `<div class="provenance-row"><span class="provenance-val">${escapeText(o)}</span></div>`).join("")}
            </div>
        `);
  }
  if (sections.length === 0) {
    _content.innerHTML = '<div class="provenance-empty">No analysis context yet. Load a dataset and start exploring.</div>';
  } else {
    _content.innerHTML = sections.join("");
  }
}
function toggleProvenance() {
  buildPanel();
  _panel.hidden = !_panel.hidden;
  if (!_panel.hidden) renderContent();
}
function refreshProvenance() {
  if (_panel && !_panel.hidden) renderContent();
}
function initProvenance() {
  buildPanel();
  const btn = document.getElementById("provenance-toggle-btn");
  if (btn) btn.addEventListener("click", toggleProvenance);
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "i") {
      e.preventDefault();
      toggleProvenance();
    }
  });
  window.addEventListener("edatime:page-change", () => refreshProvenance());
  window.addEventListener("edatime:column-filters-change", () => refreshProvenance());
  window.addEventListener("edatime:adaptive-filters-change", () => refreshProvenance());
}

const provenance = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  initProvenance,
  refreshProvenance,
  toggleProvenance
}, Symbol.toStringTag, { value: 'Module' }));

const DEFAULT_SETTINGS = {
  theme: "dark",
  layoutDensity: "spacious",
  defaultPalette: "default",
  defaultExportFormat: "png",
  whiteBackgroundExport: false,
  defaultCorrelationMetric: "pearson",
  defaultCausalMethod: "pcmci",
  defaultTauMax: 5,
  defaultFftPreset: "auto"
};
const CHART_PALETTES = {
  default: ["#00d4ff", "#6c63ff", "#00c896", "#f5a623", "#ff4a6e", "#c77dff"],
  ocean: ["#00b4d8", "#0077b6", "#03045e", "#90e0ef", "#48cae4", "#023e8a"],
  sunset: ["#ff7b00", "#ff8800", "#ff9500", "#ffa200", "#ffaa00", "#ffb700"],
  forest: ["#2d6a4f", "#40916c", "#52b788", "#74c69d", "#95d5b2", "#b7e4c7"],
  monochrome: ["#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#6c757d"],
  neon: ["#ff00ff", "#00ffff", "#ff0080", "#80ff00", "#8000ff", "#00ff80"]
};
const STORAGE_KEY$3 = "edatime-settings";
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY$3);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY$3, JSON.stringify(settings));
  } catch {
  }
}
function applyTheme(theme) {
  let effectiveTheme = "dark";
  if (theme === "auto") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } else {
    effectiveTheme = theme;
  }
  if (effectiveTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const iconDark = document.getElementById("theme-icon-dark");
  const iconLight = document.getElementById("theme-icon-light");
  if (iconDark) iconDark.hidden = effectiveTheme === "light";
  if (iconLight) iconLight.hidden = effectiveTheme === "dark";
  localStorage.setItem("edatime-theme", effectiveTheme);
}
function applyLayoutDensity(density) {
  document.documentElement.setAttribute("data-layout", density);
}
function applyAllSettings(settings) {
  applyTheme(settings.theme);
  applyLayoutDensity(settings.layoutDensity);
}
function initSettings() {
  const settings = loadSettings();
  applyAllSettings(settings);
  if (settings.theme === "auto") {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      const current = loadSettings();
      if (current.theme === "auto") {
        applyTheme("auto");
      }
    });
  }
  return settings;
}

let currentSettings = null;
function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  currentSettings = loadSettings();
  populateSettingsForm(currentSettings);
  setActiveTab("appearance");
  modal.hidden = false;
}
function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.hidden = true;
  currentSettings = null;
}
function setActiveTab(tab) {
  document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".settings-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.tab !== tab;
  });
}
function populateSettingsForm(settings) {
  setSelectValue("settings-theme", settings.theme);
  setSelectValue("settings-layout", settings.layoutDensity);
  setSelectValue("settings-palette", settings.defaultPalette);
  setSelectValue("settings-export-format", settings.defaultExportFormat);
  setCheckboxValue("settings-white-bg", settings.whiteBackgroundExport);
  setSelectValue("settings-correlation", settings.defaultCorrelationMetric);
  setSelectValue("settings-causal-method", settings.defaultCausalMethod);
  setInputValue("settings-tau-max", settings.defaultTauMax.toString());
  setSelectValue("settings-fft-preset", settings.defaultFftPreset);
  renderPalettePreview(settings.defaultPalette);
}
function collectSettingsFromForm() {
  return {
    theme: getSelectValue("settings-theme") || DEFAULT_SETTINGS.theme,
    layoutDensity: getSelectValue("settings-layout") || DEFAULT_SETTINGS.layoutDensity,
    defaultPalette: getSelectValue("settings-palette") || DEFAULT_SETTINGS.defaultPalette,
    defaultExportFormat: getSelectValue("settings-export-format") || DEFAULT_SETTINGS.defaultExportFormat,
    whiteBackgroundExport: getCheckboxValue("settings-white-bg"),
    defaultCorrelationMetric: getSelectValue("settings-correlation") || DEFAULT_SETTINGS.defaultCorrelationMetric,
    defaultCausalMethod: getSelectValue("settings-causal-method") || DEFAULT_SETTINGS.defaultCausalMethod,
    defaultTauMax: parseInt(getInputValue("settings-tau-max"), 10) || DEFAULT_SETTINGS.defaultTauMax,
    defaultFftPreset: getSelectValue("settings-fft-preset") || DEFAULT_SETTINGS.defaultFftPreset
  };
}
function applySettings() {
  const settings = collectSettingsFromForm();
  saveSettings(settings);
  applyTheme(settings.theme);
  applyLayoutDensity(settings.layoutDensity);
  if (CHART_PALETTES[settings.defaultPalette]) {
    const palette = CHART_PALETTES[settings.defaultPalette];
    SERIES_COLORS.length = 0;
    SERIES_COLORS.push(...palette);
  }
  closeSettingsModal();
}
function resetSettings() {
  currentSettings = { ...DEFAULT_SETTINGS };
  populateSettingsForm(currentSettings);
}
function renderPalettePreview(paletteName) {
  const container = document.getElementById("settings-palette-preview");
  if (!container) return;
  const colors = CHART_PALETTES[paletteName] || CHART_PALETTES.default;
  container.innerHTML = colors.map((color) => `<span class="palette-swatch" style="background:${color}" title="${color}"></span>`).join("");
}
function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
function getSelectValue(id) {
  const el = document.getElementById(id);
  return el?.value || "";
}
function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
function getInputValue(id) {
  const el = document.getElementById(id);
  return el?.value || "";
}
function setCheckboxValue(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = checked;
}
function getCheckboxValue(id) {
  const el = document.getElementById(id);
  return el?.checked || false;
}
function initSettingsPanel() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  document.getElementById("settings-close-btn")?.addEventListener("click", closeSettingsModal);
  document.getElementById("settings-cancel-btn")?.addEventListener("click", closeSettingsModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeSettingsModal();
  });
  document.getElementById("settings-apply-btn")?.addEventListener("click", applySettings);
  document.getElementById("settings-reset-btn")?.addEventListener("click", resetSettings);
  document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) setActiveTab(tab);
    });
  });
  document.getElementById("settings-palette")?.addEventListener("change", (e) => {
    const value = e.target.value;
    renderPalettePreview(value);
  });
  document.getElementById("settings-theme")?.addEventListener("change", (e) => {
    const value = e.target.value;
    applyTheme(value);
  });
  document.getElementById("settings-layout")?.addEventListener("change", (e) => {
    const value = e.target.value;
    applyLayoutDensity(value);
  });
  document.getElementById("settings-btn")?.addEventListener("click", openSettingsModal);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      openSettingsModal();
    }
  });
}

const settingsPanel = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  closeSettingsModal,
  initSettingsPanel,
  openSettingsModal
}, Symbol.toStringTag, { value: 'Module' }));

const STORAGE_KEY$2 = "edatime-annotations";
let annotations = [];
function generateId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function loadAnnotations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY$2);
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
    localStorage.setItem(STORAGE_KEY$2, JSON.stringify(annotations));
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
                    <strong>${escapeHtml$1(ann.title)}</strong>
                    <div style="display:flex;gap:6px;">
                        <span style="font-size:11px;color:var(--text-muted,#888)">${ann.type} · ${ann.page}</span>
                        <button class="btn btn-ghost btn-xs ann-delete-btn" data-ann-id="${escapeAttr(ann.id)}" type="button" title="Delete">✕</button>
                    </div>
                </div>
                ${timeInfo}
                ${ann.content ? `<p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary,#ccc)">${escapeHtml$1(ann.content)}</p>` : ""}
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
  const start = appState.currentStart ?? Date.now() - 36e5;
  const end = appState.currentEnd ?? Date.now();
  createTimeRangeNote(
    title,
    start,
    end,
    content || void 0,
    void 0,
    color,
    appState.datasetRevision
  );
  toast(`Note "${title}" saved.`, "success");
  closeAddNoteModal();
  refreshOverlay();
}
function addBookmarkAtCurrentView() {
  const time = appState.currentStart ?? Date.now();
  const title = `Bookmark ${new Date(time).toLocaleTimeString()}`;
  createBookmark(title, time, appState.datasetRevision);
  toast(`Bookmark added at ${new Date(time).toLocaleString()}`, "success");
  refreshOverlay();
}
function escapeHtml$1(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function initAnnotationPanel() {
  document.getElementById("add-note-btn")?.addEventListener("click", openAddNoteModal);
  document.getElementById("add-bookmark-btn")?.addEventListener("click", addBookmarkAtCurrentView);
  document.getElementById("annotations-list-btn")?.addEventListener("click", openAnnotationsModal);
  document.getElementById("annotations-modal-close")?.addEventListener("click", closeAnnotationsModal);
  document.getElementById("annotations-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "annotations-modal") closeAnnotationsModal();
  });
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

const STORAGE_KEY$1 = "edatime-guided-workflow";
const WORKFLOW_STEPS = [
  { id: "upload", label: "Upload", page: "upload" },
  { id: "timeseries", label: "Timeseries", page: "timeseries" },
  { id: "correlations", label: "Correlations", page: "heatmap" },
  { id: "scatter", label: "Scatter", page: "scatter" },
  { id: "causal", label: "Causal", page: "causal" }
];
let _initialized = false;
let _currentNavPage = "home";
function sanitizeVisitedPages(value) {
  if (!Array.isArray(value)) return [];
  return value.map((page) => String(page || "").trim()).filter((page, index, all) => !!page && all.indexOf(page) === index);
}
function sanitizeVisitedPagesByDataset(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).map(([datasetKey, pages]) => [String(datasetKey || "").trim(), sanitizeVisitedPages(pages)]).filter(([datasetKey, pages]) => !!datasetKey && pages.length > 0);
  return Object.fromEntries(entries);
}
function currentDatasetKey() {
  const metadata = appState.metadata;
  const rows = Number(metadata?.total_rows || 0);
  const rangeStart = Number(metadata?.time_range?.min);
  const rangeEnd = Number(metadata?.time_range?.max);
  if (!rows || !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return "no-dataset";
  const revision = Number(appState.datasetRevision ?? metadata?.revision ?? 0);
  const numericColumns = Array.isArray(metadata?.numeric_columns) ? metadata.numeric_columns.join("|") : "";
  return [
    Number.isFinite(revision) ? revision : 0,
    rows,
    metadata?.time_column || "",
    rangeStart,
    rangeEnd,
    numericColumns
  ].join(":");
}
function getVisitedPagesForCurrentDataset(prefs) {
  const datasetKey = currentDatasetKey();
  if (datasetKey === "no-dataset") return sanitizeVisitedPages(prefs.visitedPages);
  return sanitizeVisitedPages(prefs.visitedPagesByDataset?.[datasetKey]);
}
function setVisitedPagesForCurrentDataset(prefs, pages) {
  const nextPages = sanitizeVisitedPages(pages);
  prefs.visitedPages = nextPages;
  const datasetKey = currentDatasetKey();
  if (datasetKey === "no-dataset") return;
  prefs.visitedPagesByDataset = {
    ...prefs.visitedPagesByDataset || {},
    [datasetKey]: nextPages
  };
}
function readPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY$1);
    if (!raw) return { enabled: true, visitedPages: [] };
    const parsed = JSON.parse(raw);
    const visitedPagesByDataset = sanitizeVisitedPagesByDataset(parsed.visitedPagesByDataset);
    const legacyVisitedPages = sanitizeVisitedPages(parsed.visitedPages);
    const datasetKey = currentDatasetKey();
    if (legacyVisitedPages.length > 0 && datasetKey !== "no-dataset" && !visitedPagesByDataset[datasetKey]?.length) {
      visitedPagesByDataset[datasetKey] = legacyVisitedPages;
    }
    return {
      enabled: parsed.enabled !== false,
      visitedPages: datasetKey === "no-dataset" ? legacyVisitedPages : sanitizeVisitedPages(visitedPagesByDataset[datasetKey]),
      visitedPagesByDataset
    };
  } catch {
    return { enabled: true, visitedPages: [] };
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY$1, JSON.stringify(prefs));
  } catch {
  }
}
function currentPage$1() {
  const active = document.querySelector(".sidebar .nav-item.active[data-page]");
  return active?.dataset.page || _currentNavPage || "home";
}
function readSelectValue(id) {
  return document.getElementById(id)?.value || "";
}
function collectSnapshot() {
  const graph = window.__edatimeCausalGraph;
  const prefs = readPrefs();
  const visited = getVisitedPagesForCurrentDataset(prefs);
  return {
    currentPage: currentPage$1(),
    hasDataset: !!appState.metadata?.time_range && Number(appState.metadata?.total_rows || 0) > 0,
    selectedSeriesCount: Array.isArray(appState.selectedCols) ? appState.selectedCols.length : 0,
    visitedPages: visited,
    scatterX: readSelectValue("scatter-x-col"),
    scatterY: readSelectValue("scatter-y-col"),
    causalLinkCount: Array.isArray(graph?.links) ? graph.links.length : 0
  };
}
function isRepeatVisitor(snapshot) {
  return snapshot.visitedPages.length >= 3;
}
function mapPageToStep(page, nextStepId) {
  if (page === "upload") return "upload";
  if (page === "timeseries") return "timeseries";
  if (page === "heatmap" || page === "scattermatrix") return "correlations";
  if (page === "scatter") return "scatter";
  if (page === "causal") return "causal";
  if (page === "fft" || page === "spectrogram") return nextStepId;
  return nextStepId;
}
function computeWorkflowProgress(snapshot) {
  const visited = new Set((snapshot.visitedPages || []).map(String));
  const completedStepIds = [];
  if (snapshot.hasDataset) completedStepIds.push("upload");
  if (snapshot.selectedSeriesCount > 0) completedStepIds.push("timeseries");
  if (visited.has("heatmap") || visited.has("scattermatrix")) completedStepIds.push("correlations");
  if (snapshot.scatterX && snapshot.scatterY) completedStepIds.push("scatter");
  if (snapshot.causalLinkCount > 0) completedStepIds.push("causal");
  const nextStepId = WORKFLOW_STEPS.find((step) => !completedStepIds.includes(step.id))?.id || null;
  const activeStepId = mapPageToStep(snapshot.currentPage, nextStepId);
  const steps = WORKFLOW_STEPS.map((step) => {
    const status = activeStepId === step.id ? "current" : completedStepIds.includes(step.id) ? "done" : nextStepId === step.id ? "next" : "pending";
    return {
      id: step.id,
      label: step.label,
      page: step.page,
      status
    };
  });
  return { steps, completedStepIds, activeStepId, nextStepId };
}
function defaultSuggestionForStep(stepId) {
  if (stepId === "timeseries") {
    return {
      title: "Open Timeseries next",
      body: "Start with 2 to 4 important numeric series so the first chart remains readable.",
      actionLabel: "Open Timeseries",
      actionPage: "timeseries"
    };
  }
  if (stepId === "correlations") {
    return {
      title: "Screen correlations next",
      body: "Use Heatmap or Matrix to separate strong candidates from weak relationships before a deeper scatter drill-down.",
      actionLabel: "Open Heatmap",
      actionPage: "heatmap",
      hint: "Scatter Matrix cells already open the detailed scatter view when clicked."
    };
  }
  if (stepId === "scatter") {
    return {
      title: "Deep dive in Scatter",
      body: "Pick a candidate pair and inspect its shape, outliers, and filter sensitivity in the detailed scatter view.",
      actionLabel: "Open Scatter",
      actionPage: "scatter"
    };
  }
  if (stepId === "causal") {
    return {
      title: "Use Causal as the late-stage check",
      body: "After narrowing the candidate variables, test a small plausible set with lag-aware causal discovery.",
      actionLabel: "Open Causal",
      actionPage: "causal"
    };
  }
  return {
    title: "Workflow complete",
    body: "You have touched each guided step. Revisit any page as needed and save or export the context you want to keep.",
    actionLabel: "Open Timeseries",
    actionPage: "timeseries"
  };
}
function buildWorkflowSuggestion(snapshot) {
  const progress = computeWorkflowProgress(snapshot);
  if (snapshot.currentPage === "home") {
    if (!snapshot.hasDataset) {
      return {
        title: "Start on Upload",
        body: "Load a CSV or Parquet file, verify the detected time column, and inspect the profile grid before plotting anything.",
        actionLabel: "Open Upload",
        actionPage: "upload"
      };
    }
    return defaultSuggestionForStep(progress.nextStepId);
  }
  if (snapshot.currentPage === "upload") {
    if (!snapshot.hasDataset) {
      return {
        title: "Validate the dataset first",
        body: "Use Upload to confirm row count, time range, numeric columns, and any obvious profile issues before moving on.",
        actionLabel: null,
        actionPage: null
      };
    }
    return {
      title: "Move to Timeseries",
      body: "Choose a small set of important series first so you can establish baseline trend, co-movement, and suspicious windows.",
      actionLabel: "Open Timeseries",
      actionPage: "timeseries"
    };
  }
  if (snapshot.currentPage === "timeseries") {
    if (snapshot.selectedSeriesCount === 0) {
      return {
        title: "Pick 2 to 4 key series",
        body: "The guided path starts by keeping the first chart legible. Select 2 to 4 important series before widening the scope.",
        actionLabel: null,
        actionPage: null
      };
    }
    return {
      title: "Screen relationships next",
      body: "Use Heatmap or Matrix to quickly identify strong candidate pairs before committing to a detailed scatter inspection.",
      actionLabel: "Open Heatmap",
      actionPage: "heatmap",
      hint: "You can also use Scatter Matrix if you want direct pairwise shape previews."
    };
  }
  if (snapshot.currentPage === "heatmap") {
    return {
      title: "Choose the strongest pair",
      body: "Use the heatmap to pick a promising relationship, then inspect it in Scatter where filter context and color-by are easier to read.",
      actionLabel: "Open Scatter",
      actionPage: "scatter"
    };
  }
  if (snapshot.currentPage === "scattermatrix") {
    return {
      title: "Use matrix cells as a drill-down",
      body: "Click any off-diagonal matrix cell to open the full scatter detail view for that exact pair.",
      actionLabel: "Open Scatter",
      actionPage: "scatter",
      hint: "Matrix click-through is already wired into the detailed scatter view."
    };
  }
  if (snapshot.currentPage === "scatter") {
    if (!snapshot.scatterX || !snapshot.scatterY) {
      return {
        title: "Set X and Y for the deep dive",
        body: "Pick two numeric columns so this step can validate the shape, spread, and filter sensitivity of the relationship.",
        actionLabel: null,
        actionPage: null
      };
    }
    return {
      title: "Use Causal as the final check",
      body: "After narrowing the variables, move to Causal with a small plausible set instead of starting broad.",
      actionLabel: "Open Causal",
      actionPage: "causal"
    };
  }
  if (snapshot.currentPage === "causal") {
    if (snapshot.causalLinkCount === 0) {
      return {
        title: "Run Causal on a focused subset",
        body: "Keep the variable list tight so the resulting graph stays interpretable and easier to compare across runs.",
        actionLabel: null,
        actionPage: null
      };
    }
    return {
      title: "Compare causal runs for stability",
      body: "Save multiple runs and compare them so stable edges stand out from parameter-sensitive ones.",
      actionLabel: null,
      actionPage: null
    };
  }
  if (snapshot.currentPage === "fft" || snapshot.currentPage === "spectrogram") {
    const fallback = defaultSuggestionForStep(progress.nextStepId);
    return {
      title: "Use spectral pages as side analysis",
      body: "These pages work best after you already know the interesting column or interval from the main workflow.",
      actionLabel: fallback.actionLabel,
      actionPage: fallback.actionPage,
      hint: fallback.title
    };
  }
  return defaultSuggestionForStep(progress.nextStepId);
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function navigateToPage(page) {
  if (!page) return;
  document.querySelector(`.sidebar .nav-item[data-page="${page}"]`)?.click?.();
}
function setEnabled(enabled, emitToast = true) {
  const prefs = readPrefs();
  prefs.enabled = enabled;
  savePrefs(prefs);
  renderGuidedWorkflow();
  if (emitToast) {
    toast(enabled ? "Guided workflow enabled." : "Guided workflow hidden.", "info");
  }
}
function markVisited(page) {
  const prefs = readPrefs();
  const visitedPages = getVisitedPagesForCurrentDataset(prefs);
  if (!page || visitedPages.includes(page)) return;
  setVisitedPagesForCurrentDataset(prefs, [...visitedPages, page]);
  savePrefs(prefs);
}
function bindStaticEvents() {
  document.getElementById("workflow-toggle-btn")?.addEventListener("click", () => {
    const prefs = readPrefs();
    setEnabled(!prefs.enabled);
  });
  const panel = document.getElementById("workflow-panel");
  panel?.addEventListener("click", (event) => {
    const target = event.target;
    const action = target?.closest("[data-workflow-action]")?.dataset.workflowAction;
    const page = target?.closest("[data-workflow-page]")?.dataset.workflowPage || null;
    if (!action) return;
    if (action === "goto") {
      navigateToPage(page);
      return;
    }
    if (action === "skip") {
      setEnabled(false, false);
      toast("Guided workflow hidden. Use the Guide button or command palette to restore it.", "info");
      return;
    }
    if (action === "next") {
      goToNextGuidedStep();
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    const id = target?.id || "";
    if (id === "scatter-x-col" || id === "scatter-y-col") renderGuidedWorkflow();
  });
  window.addEventListener("edatime:page-change", (event) => {
    const nextPage = event?.detail?.navPage || event?.detail?.page || currentPage$1();
    _currentNavPage = nextPage;
    markVisited(nextPage);
    renderGuidedWorkflow();
  });
  window.addEventListener("edatime:session-restored", renderGuidedWorkflow);
  window.addEventListener("edatime:workflow-refresh", renderGuidedWorkflow);
}
function renderGuidedWorkflow() {
  const panel = document.getElementById("workflow-panel");
  const toggleBtn = document.getElementById("workflow-toggle-btn");
  if (!panel) return;
  const prefs = readPrefs();
  panel.hidden = !prefs.enabled;
  if (toggleBtn) {
    toggleBtn.classList.toggle("btn-accent", prefs.enabled);
    toggleBtn.classList.toggle("btn-ghost", !prefs.enabled);
    toggleBtn.setAttribute("aria-pressed", prefs.enabled ? "true" : "false");
  }
  if (!prefs.enabled) return;
  const snapshot = collectSnapshot();
  const progress = computeWorkflowProgress(snapshot);
  const suggestion = buildWorkflowSuggestion(snapshot);
  const isRepeat = isRepeatVisitor(snapshot);
  if (isRepeat && snapshot.hasDataset) {
    renderCompactAssistant(panel, suggestion, progress);
    return;
  }
  renderFullWorkflowPanel(panel, progress, suggestion);
}
function renderCompactAssistant(panel, suggestion, progress) {
  const activeStep = progress.steps.find((s) => s.status === "current");
  const completedCount = progress.completedStepIds.length;
  panel.innerHTML = `
        <div class="workflow-panel--compact">
            <div class="workflow-panel__summary">
                <div class="workflow-panel__eyebrow">Guided Workflow</div>
                <span class="workflow-panel__hint-text">${completedCount > 0 ? `✓ ${completedCount} completed` : "Start"}</span>
                ${activeStep ? `<span class="workflow-panel__current-step">→ ${escapeHtml(activeStep.label)}</span>` : ""}
            </div>
            <div class="workflow-panel__actions">
                ${suggestion.actionLabel && suggestion.actionPage ? `
                    <button class="btn btn-accent btn-sm" type="button" data-workflow-action="next">${escapeHtml(suggestion.actionLabel)}</button>
                ` : ""}
                <button class="btn btn-ghost btn-sm" type="button" data-workflow-action="skip" title="Hide guide">✕</button>
            </div>
        </div>
    `;
}
function renderFullWorkflowPanel(panel, progress, suggestion) {
  const crumbs = progress.steps.map((step) => `
        <button
            class="workflow_step workflow_step--${step.status}"
            type="button"
            data-workflow-action="goto"
            data-workflow-page="${escapeHtml(step.page)}"
            title="Open ${escapeHtml(step.label)}"
        >
            <span class="workflow-step__dot"></span>
            <span class="workflow-step__label">${escapeHtml(step.label)}</span>
        </button>
    `).join("");
  panel.innerHTML = `
        <div class="workflow-panel__header workflow-panel__header--compact">
            <div class="workflow-panel__summary">
                <div class="workflow-panel__eyebrow">Guided Workflow</div>
                <div class="workflow-panel__title">${escapeHtml(suggestion.title)}</div>
                <p class="workflow-panel__copy workflow-panel__copy--compact">${escapeHtml(suggestion.body)}</p>
            </div>
            <div class="workflow-panel__actions">
                ${suggestion.actionLabel && suggestion.actionPage ? `
                    <button class="btn btn-accent btn-sm" type="button" data-workflow-action="next">${escapeHtml(suggestion.actionLabel)}</button>
                ` : ""}
                <button class="btn btn-ghost btn-sm" type="button" data-workflow-action="skip">Hide Guide</button>
            </div>
        </div>
        <div class="workflow-panel__crumbs">${crumbs}</div>
        ${suggestion.hint ? `<div class="workflow-panel__hint">${escapeHtml(suggestion.hint)}</div>` : ""}
    `;
}
function enableGuidedWorkflow() {
  setEnabled(true);
}
function disableGuidedWorkflow() {
  setEnabled(false);
}
function goToNextGuidedStep() {
  const suggestion = buildWorkflowSuggestion(collectSnapshot());
  navigateToPage(suggestion.actionPage);
}
function initGuidedWorkflow() {
  if (_initialized) return;
  _initialized = true;
  _currentNavPage = currentPage$1();
  markVisited(_currentNavPage);
  bindStaticEvents();
  renderGuidedWorkflow();
  window.__edatime = window.__edatime || {};
  window.__edatime.guidedWorkflow = {
    enable: enableGuidedWorkflow,
    disable: disableGuidedWorkflow,
    next: goToNextGuidedStep,
    render: renderGuidedWorkflow
  };
}

const guidedWorkflow = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  buildWorkflowSuggestion,
  computeWorkflowProgress,
  disableGuidedWorkflow,
  enableGuidedWorkflow,
  goToNextGuidedStep,
  initGuidedWorkflow,
  renderGuidedWorkflow
}, Symbol.toStringTag, { value: 'Module' }));

function initModalClose(modalId, closeBtnId, cancelBtnId, onClose) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;
  const close = () => {
    modal.hidden = true;
    onClose?.();
  };
  document.getElementById(closeBtnId)?.addEventListener("click", close);
  document.getElementById(cancelBtnId)?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  return close;
}

function initTransformModal(deps) {
  const applyBtn = document.getElementById("transform-apply-btn");
  const exprInput = document.getElementById("transform-expression");
  const nameInput = document.getElementById("transform-output-name");
  const errorEl = document.getElementById("transform-error");
  const close = initModalClose("transform-modal", "transform-close-btn", "transform-cancel-btn", () => {
    if (errorEl) errorEl.textContent = "";
  });
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
      if (applyBtn) {
        applyBtn.textContent = "Applying…";
        applyBtn.disabled = true;
      }
      const { postTransform } = await __vitePreload(async () => { const { postTransform } = await import('./assets/frequency-DsOq7zgH.js').then(n => n.a3);return { postTransform }},true              ?__vite__mapDeps([0,1]):void 0);
      await postTransform(expr, name);
      close();
      await deps.refreshDataset({ selectedColumn: name });
    } catch (error) {
      if (errorEl) errorEl.textContent = error?.message || "Transform failed.";
    } finally {
      if (applyBtn) {
        applyBtn.textContent = "Apply";
        applyBtn.disabled = false;
      }
    }
  });
}
function initOutlierModal(deps) {
  const openBtn = document.getElementById("outlier-open-btn");
  const applyBtn = document.getElementById("outlier-apply-btn");
  const methodSelect = document.getElementById("outlier-method");
  const thresholdInput = document.getElementById("outlier-threshold");
  const windowInput = document.getElementById("outlier-window");
  const errorEl = document.getElementById("outlier-error");
  const resultEl = document.getElementById("outlier-result");
  const close = initModalClose("outlier-modal", "outlier-close-btn", "outlier-cancel-btn", () => {
    if (errorEl) errorEl.textContent = "";
    if (resultEl) resultEl.textContent = "";
  });
  if (!close) return;
  const modal = document.getElementById("outlier-modal");
  openBtn?.addEventListener("click", () => {
    if (modal) modal.hidden = false;
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
    const threshold = Number.parseFloat(thresholdInput?.value || "3");
    const windowSize = Number.parseInt(windowInput?.value || "0", 10);
    const columns = appState.selectedCols.length > 0 ? appState.selectedCols : null;
    try {
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = "Removing…";
      }
      const { postRemoveOutliers } = await __vitePreload(async () => { const { postRemoveOutliers } = await import('./assets/frequency-DsOq7zgH.js').then(n => n.a3);return { postRemoveOutliers }},true              ?__vite__mapDeps([0,1]):void 0);
      const result = await postRemoveOutliers(
        columns,
        method,
        threshold,
        windowSize > 0 ? windowSize : void 0
      );
      if (resultEl) {
        resultEl.textContent = `Removed ${result.rows_removed} rows (${result.rows_before} → ${result.rows_after})`;
      }
      await deps.refreshDataset();
    } catch (error) {
      if (errorEl) errorEl.textContent = error?.message || "Outlier removal failed.";
    } finally {
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = "Remove Outliers";
      }
    }
  });
}

function exportChartFilteredData(format) {
  window.__edatime?.exportChartFilteredData?.(format);
}
function triggerAdaptiveFilterClear() {
  document.getElementById("adaptive-clear-btn")?.click?.();
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
  { id: "session-save", label: "Export session to file", category: "Session", action: () => __vitePreload(async () => { const {exportSessionToFile} = await Promise.resolve().then(() => session);return { exportSessionToFile }},true              ?void 0:void 0).then(({ exportSessionToFile }) => exportSessionToFile()) },
  { id: "session-load", label: "Import session from file", category: "Session", action: () => __vitePreload(async () => { const {importSessionFromFile} = await Promise.resolve().then(() => session);return { importSessionFromFile }},true              ?void 0:void 0).then(({ importSessionFromFile }) => importSessionFromFile()) },
  { id: "provenance", label: "Show analysis context panel", shortcut: "Ctrl+I", category: "Analysis", action: () => __vitePreload(async () => { const {toggleProvenance} = await Promise.resolve().then(() => provenance);return { toggleProvenance }},true              ?void 0:void 0).then(({ toggleProvenance }) => toggleProvenance()) },
  { id: "cmd-palette", label: "Open command palette", shortcut: "Ctrl+K", category: "Analysis", action: () => __vitePreload(async () => { const {openPalette} = await Promise.resolve().then(() => palette);return { openPalette }},true              ?void 0:void 0).then(({ openPalette }) => openPalette()) },
  { id: "settings", label: "Open settings", shortcut: "Ctrl+,", category: "Analysis", action: () => __vitePreload(async () => { const {openSettingsModal} = await Promise.resolve().then(() => settingsPanel);return { openSettingsModal }},true              ?void 0:void 0).then(({ openSettingsModal }) => openSettingsModal()) },
  { id: "workflow-enable", label: "Enable guided workflow", category: "Analysis", action: () => __vitePreload(async () => { const {enableGuidedWorkflow} = await Promise.resolve().then(() => guidedWorkflow);return { enableGuidedWorkflow }},true              ?void 0:void 0).then(({ enableGuidedWorkflow }) => enableGuidedWorkflow()) },
  { id: "workflow-disable", label: "Hide guided workflow", category: "Analysis", action: () => __vitePreload(async () => { const {disableGuidedWorkflow} = await Promise.resolve().then(() => guidedWorkflow);return { disableGuidedWorkflow }},true              ?void 0:void 0).then(({ disableGuidedWorkflow }) => disableGuidedWorkflow()) },
  { id: "workflow-next", label: "Go to next guided step", category: "Analysis", action: () => __vitePreload(async () => { const {goToNextGuidedStep} = await Promise.resolve().then(() => guidedWorkflow);return { goToNextGuidedStep }},true              ?void 0:void 0).then(({ goToNextGuidedStep }) => goToNextGuidedStep()) }
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
function registerAppCommands(deps) {
  registerCommands(buildPaletteCommands(deps));
}

const KEYBOARD_ONLY_SHORTCUTS = [
  { key: "e", shift: true, action: () => triggerActivePageCsvExport() }
];
function triggerActivePageCsvExport() {
  if (currentPageName() === "scatter") {
    document.getElementById("scatter-export-csv-btn")?.click?.();
    return;
  }
  window.__edatime?.exportChartFilteredData?.("csv");
}
function isTypingTarget(target) {
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
function currentPageName() {
  return document.querySelector(".page[data-page-name]:not([hidden])")?.dataset?.pageName || "upload";
}
function matchesKeyboardShortcut(shortcut, key, pageName, options) {
  return shortcut.key.toLowerCase() === key.toLowerCase() && Boolean(shortcut.alt) === Boolean(options.alt) && Boolean(shortcut.shift) === Boolean(options.shift);
}
function findMatchingShortcut(key, pageName, options, commandDefs, deps) {
  const commandShortcut = commandDefs.find((definition) => {
    const keyboard = definition.keyboard;
    return keyboard && matchesKeyboardShortcut(keyboard, key, pageName, options);
  });
  if (commandShortcut) {
    const keyboard = commandShortcut.keyboard;
    return {
      key: keyboard.key,
      alt: keyboard.alt,
      shift: keyboard.shift,
      page: keyboard.page,
      action: () => commandShortcut.action(deps)
    };
  }
  return KEYBOARD_ONLY_SHORTCUTS.find((shortcut) => matchesKeyboardShortcut(shortcut, key, pageName, options));
}
let _bound = false;
function initKeyboardShortcuts(deps, commandDefs) {
  if (_bound) return;
  _bound = true;
  window.__edatime = window.__edatime || {};
  const onKeydown = (event) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const key = String(event.key || "").toLowerCase();
    const pageName = currentPageName();
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const shortcut2 = findMatchingShortcut(key, pageName, { alt: true, shift: false }, commandDefs, deps);
      if (shortcut2) {
        event.preventDefault();
        shortcut2.action();
        return;
      }
    }
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcut = findMatchingShortcut(key, pageName, { alt: false, shift: true }, commandDefs, deps);
    if (shortcut) {
      event.preventDefault();
      shortcut.action();
    }
  };
  window.addEventListener("keydown", onKeydown);
  deps.registerCleanup(() => window.removeEventListener("keydown", onKeydown));
  window.__edatime.keyboardShortcutsBound = true;
}

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  const iconDark = document.getElementById("theme-icon-dark");
  const iconLight = document.getElementById("theme-icon-light");
  if (!btn) return;
  const savedTheme = localStorage.getItem("edatime-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (savedTheme) {
    if (savedTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      if (iconDark) iconDark.hidden = true;
      if (iconLight) iconLight.hidden = false;
    } else {
      document.documentElement.removeAttribute("data-theme");
      if (iconDark) iconDark.hidden = false;
      if (iconLight) iconLight.hidden = true;
    }
  } else if (prefersDark) {
    if (iconDark) iconDark.hidden = false;
    if (iconLight) iconLight.hidden = true;
  } else {
    if (iconDark) iconDark.hidden = false;
    if (iconLight) iconLight.hidden = true;
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const manualPreference = localStorage.getItem("edatime-theme");
    if (manualPreference) return;
    if (e.matches) {
      document.documentElement.removeAttribute("data-theme");
      if (iconDark) iconDark.hidden = false;
      if (iconLight) iconLight.hidden = true;
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      if (iconDark) iconDark.hidden = true;
      if (iconLight) iconLight.hidden = false;
    }
  });
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
function humanizeControlId(id) {
  return String(id || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (match) => match.toUpperCase());
}
function normalizeFormControlAccessibility() {
  const controls = document.querySelectorAll("input, select, textarea");
  controls.forEach((control) => {
    if (!control.name && control.id) {
      control.name = control.id;
    }
    if (control.getAttribute("aria-label")) return;
    const labelledByText = Array.from(control.labels || []).map((label) => label.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean).join(" ");
    const placeholder = control.getAttribute("placeholder") || "";
    const title = control.getAttribute("title") || "";
    const fallback = humanizeControlId(control.id) || (control.type === "file" ? "Upload file" : "Form field");
    const derived = labelledByText || placeholder || title || fallback;
    {
      control.setAttribute("aria-label", derived);
    }
  });
}
function wireHomeNavigationCards(showPage) {
  document.querySelectorAll("[data-home-nav]").forEach((element) => {
    element.addEventListener("click", () => {
      const target = element.dataset.homeNav;
      if (target) showPage(target);
    });
  });
}
function wireSampleDatasetCards(showPage) {
  document.querySelectorAll("[data-sample-dataset]").forEach((element) => {
    element.addEventListener("click", () => {
      const dataset = element.dataset.sampleDataset;
      if (dataset) {
        loadSampleDataset(dataset, showPage);
      }
    });
  });
}
function generateSinusoidalCsv() {
  const rows = ["timestamp,temperature,humidity,pressure"];
  const start = (/* @__PURE__ */ new Date("2024-01-01T00:00:00Z")).getTime();
  const end = (/* @__PURE__ */ new Date("2024-01-08T00:00:00Z")).getTime();
  const interval = 15 * 60 * 1e3;
  for (let t = start; t < end; t += interval) {
    const temp = 20 + 5 * Math.sin((t - start) / (3600 * 1e3)) + (Math.random() - 0.5) * 0.5;
    const hum = 50 + 20 * Math.sin((t - start) / (7200 * 1e3)) + (Math.random() - 0.5) * 2;
    const pres = 1013 + 5 * Math.sin((t - start) / (5400 * 1e3)) + (Math.random() - 0.5) * 0.3;
    rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)}`);
  }
  return rows.join("\n");
}
function generateWeatherCsv() {
  const rows = ["timestamp,temperature,humidity,pressure,wind_speed"];
  const start = (/* @__PURE__ */ new Date("2024-03-01T00:00:00Z")).getTime();
  const end = (/* @__PURE__ */ new Date("2024-03-08T00:00:00Z")).getTime();
  const interval = 10 * 60 * 1e3;
  for (let t = start; t < end; t += interval) {
    const hour = new Date(t).getUTCHours();
    const dayFactor = Math.sin((t - start) / (86400 * 1e3));
    const temp = 15 + 8 * dayFactor + 3 * Math.sin(hour * Math.PI / 12) + (Math.random() - 0.5) * 0.5;
    const hum = 60 + 15 * Math.cos((t - start) / (43200 * 1e3)) + (Math.random() - 0.5) * 3;
    const pres = 1010 + 8 * dayFactor + (Math.random() - 0.5) * 0.5;
    const wind = 5 + 3 * Math.abs(Math.sin((t - start) / (21600 * 1e3))) + (Math.random() - 0.5) * 1;
    rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)},${wind.toFixed(3)}`);
  }
  return rows.join("\n");
}
async function loadSampleDataset(datasetId, showPage) {
  const { toast } = await __vitePreload(async () => { const { toast } = await import('./assets/frequency-DsOq7zgH.js').then(n => n.a4);return { toast }},true              ?__vite__mapDeps([0,1]):void 0);
  if (datasetId === "ettm2") {
    const dismissLoading = toast("Loading ETTm2 sample dataset…", "info", 0);
    let file;
    try {
      const res = await fetch(`/api/sample/ETTm2.csv`);
      if (!res.ok) throw new Error(`Failed to fetch ETTm2.csv: ${res.status}`);
      const blob = await res.blob();
      file = new File([blob], "ETTm2.csv", { type: "text/csv" });
    } catch (err) {
      dismissLoading();
      toast(`Could not load ETTm2: ${err}`, "error");
      return;
    }
    const homePage = document.getElementById("page-home");
    if (homePage) homePage.hidden = true;
    showPage("upload");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const fileInput = document.getElementById("file-upload");
    if (fileInput) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      dismissLoading();
    } else {
      dismissLoading();
      toast("Upload panel not ready. Please navigate to Upload and drop the file manually.", "error");
    }
  } else if (datasetId === "sinusoidal") {
    const dismissLoading = toast("Loading Sinusoidal Waves sample dataset…", "info", 0);
    const file = new File([generateSinusoidalCsv()], "sinusoidal.csv", { type: "text/csv" });
    const homePage = document.getElementById("page-home");
    if (homePage) homePage.hidden = true;
    showPage("upload");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const fileInput = document.getElementById("file-upload");
    if (fileInput) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      dismissLoading();
    } else {
      dismissLoading();
      toast("Upload panel not ready.", "error");
    }
  } else if (datasetId === "weather") {
    const dismissLoading = toast("Loading Weather Patterns sample dataset…", "info", 0);
    const file = new File([generateWeatherCsv()], "weather.csv", { type: "text/csv" });
    const homePage = document.getElementById("page-home");
    if (homePage) homePage.hidden = true;
    showPage("upload");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const fileInput = document.getElementById("file-upload");
    if (fileInput) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      dismissLoading();
    } else {
      dismissLoading();
      toast("Upload panel not ready.", "error");
    }
  }
}
function initAppShell(deps) {
  window.__edatime = window.__edatime || {};
  window.__edatime.ensurePageModuleLoaded = deps.ensurePageModuleLoaded;
  normalizeFormControlAccessibility();
  initPages();
  initHashRouting();
  initSettings();
  initAnnotations();
  initAnnotationPanel();
  initGuidedWorkflow();
  initThemeToggle();
  initSettingsPanel();
  wireHomeNavigationCards(deps.showPage);
  wireSampleDatasetCards(deps.showPage);
  initUploadPanel(deps.hydrateColumnProfiles, deps.renderColumnProfilesGrid);
  initColumnProfilesGrid();
  initAnalysisControls(deps.fetchAndRender);
  initColumnFilterModal(deps.renderCurrentData, deps.updateAnalysisYRange);
  initChartPageFilterGesture();
  initKeyboardShortcuts(deps, APP_COMMAND_DEFINITIONS);
  initCommandPalette();
  initProvenance();
  registerAppCommands(deps);
  initTransformModal({ refreshDataset: deps.refreshDatasetAfterMutation });
  initOutlierModal({ refreshDataset: deps.refreshDatasetAfterMutation });
  deps.initAnalyticsListeners();
}

const STORAGE_KEY = "edatime-session";
function currentPage() {
  return document.querySelector(".page[data-page-name]:not([hidden])")?.dataset?.pageName || "upload";
}
function readSelect(id) {
  return document.getElementById(id)?.value || "";
}
function captureSession() {
  return {
    version: 1,
    timestamp: Date.now(),
    page: currentPage(),
    selectedCols: [...appState.selectedCols],
    seriesColors: { ...appState.seriesColors },
    columnRanges: { ...appState.columnRanges },
    adaptiveLineFilters: appState.adaptiveLineFilters.map((f) => ({ ...f })),
    currentStart: appState.currentStart,
    currentEnd: appState.currentEnd,
    selectedColorColumn: appState.selectedColorColumn,
    chartText: { ...appState.chartText },
    rollingEnabled: appState.rollingEnabled,
    rollingWindow: appState.rollingWindow,
    anomalyEnabled: appState.anomalyEnabled,
    anomalyMethod: appState.anomalyMethod,
    anomalyThreshold: appState.anomalyThreshold,
    scatterX: readSelect("scatter-x-col"),
    scatterY: readSelect("scatter-y-col"),
    scatterColorColumn: readSelect("scatter-color-column"),
    scatterRenderMode: readSelect("scatter-render-mode"),
    theme: document.documentElement.getAttribute("data-theme") || "dark",
    datasetRevision: Number.isFinite(Number(appState.datasetRevision)) ? Number(appState.datasetRevision) : 0
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
  const metadataTimeRange = options.metadataTimeRange || (appState.metadata?.time_range ?? null);
  const currentRevision = Number(
    options.currentDatasetRevision ?? appState.datasetRevision ?? appState.metadata?.revision ?? 0
  );
  const snapshotRevision = Number(snap.datasetRevision ?? 0);
  const hasRevisions = Number.isFinite(currentRevision) && currentRevision > 0 && Number.isFinite(snapshotRevision) && snapshotRevision > 0;
  const revisionMismatch = hasRevisions && currentRevision !== snapshotRevision;
  result.revisionMismatch = revisionMismatch;
  appState.selectedCols = Array.isArray(snap.selectedCols) ? snap.selectedCols : [];
  if (snap.seriesColors) appState.seriesColors = { ...snap.seriesColors };
  if (revisionMismatch) {
    const staleRanges = Object.keys(snap.columnRanges || {}).length;
    const staleLines = Array.isArray(snap.adaptiveLineFilters) ? snap.adaptiveLineFilters.length : 0;
    result.droppedFilterCount = staleRanges + staleLines;
    appState.columnRanges = {};
    appState.adaptiveLineFilters = [];
  } else {
    if (snap.columnRanges) appState.columnRanges = { ...snap.columnRanges };
    if (Array.isArray(snap.adaptiveLineFilters)) {
      appState.adaptiveLineFilters = snap.adaptiveLineFilters.map((f) => ({ ...f }));
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
      appState.currentStart = nextStart;
      appState.currentEnd = nextEnd;
    }
  }
  if (snap.selectedColorColumn !== void 0) appState.selectedColorColumn = snap.selectedColorColumn;
  if (snap.chartText) appState.chartText = { ...snap.chartText };
  if (snap.rollingEnabled !== void 0) appState.rollingEnabled = snap.rollingEnabled;
  if (Number.isFinite(snap.rollingWindow)) appState.rollingWindow = snap.rollingWindow;
  if (snap.anomalyEnabled !== void 0) appState.anomalyEnabled = snap.anomalyEnabled;
  if (snap.anomalyMethod) appState.anomalyMethod = snap.anomalyMethod;
  if (Number.isFinite(snap.anomalyThreshold)) appState.anomalyThreshold = snap.anomalyThreshold;
  const setSelect = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };
  setSelect("scatter-x-col", snap.scatterX);
  setSelect("scatter-y-col", snap.scatterY);
  setSelect("scatter-color-column", snap.scatterColorColumn);
  setSelect("scatter-render-mode", snap.scatterRenderMode);
  if (snap.theme === "light" || snap.theme === "dark") {
    document.documentElement.setAttribute("data-theme", snap.theme);
    localStorage.setItem("edatime-theme", snap.theme);
  }
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

function initDatasetSearchInputs(deps) {
  const columnFilterInput = document.getElementById("column-filter-input");
  if (columnFilterInput) {
    const onFilterInput = debounce(() => {
      appState.filterText = (columnFilterInput.value || "").trim().toLowerCase();
      deps.rebuildColumnToggles();
    }, 120);
    columnFilterInput.addEventListener("input", onFilterInput);
  }
  const profileFilterInput = document.getElementById("profile-filter-input");
  if (profileFilterInput) {
    const onProfileFilterInput = debounce(() => {
      appState.profileFilterText = (profileFilterInput.value || "").trim().toLowerCase();
      deps.renderColumnProfilesGrid(true);
    }, 120);
    profileFilterInput.addEventListener("input", onProfileFilterInput);
  }
}
function initTimeseriesActions(deps) {
  const resetChartRangeToDataset = async (source = "reset") => {
    const minMs = Number(appState.metadata?.time_range?.min);
    const maxMs = Number(appState.metadata?.time_range?.max);
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs >= maxMs) return;
    appState.currentStart = minMs;
    appState.currentEnd = maxMs;
    appState.chart?.setXRange?.(minMs, maxMs);
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
    appState.columnRanges = {};
    appState.adaptiveLineFilters = [];
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

const _appCleanups = [];
function storeFetchedMetadata(metadata) {
  appState.metadata = metadata;
  const revision = metadata?.revision;
  appState.datasetRevision = typeof revision === "number" ? revision : 0;
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
let fetchMetadata = null;
let fetchData = null;
let fetchAnomalies = null;
let DataChartCtor = null;
async function ensureChartModules() {
  if (fetchMetadata && fetchData && DataChartCtor) return;
  const [dataClient, chartModule] = await Promise.all([
    __vitePreload(() => import('./assets/frequency-DsOq7zgH.js').then(n => n.a3),true              ?__vite__mapDeps([0,1]):void 0),
    __vitePreload(() => import('./assets/DataChart-BlzPYbPm.js'),true              ?__vite__mapDeps([2,1,0]):void 0)
  ]);
  fetchMetadata = dataClient.fetchMetadata;
  fetchData = dataClient.fetchData;
  fetchAnomalies = dataClient.fetchAnomalies;
  dataClient.postTransform;
  DataChartCtor = chartModule.DataChart;
  registerChartType("line", {
    label: "Line",
    create: (containerId, callbacks) => {
      const ctor = DataChartCtor;
      if (!ctor) throw new Error("DataChart module not loaded");
      return new ctor(
        containerId,
        callbacks.onZoom ?? null,
        callbacks.onYRange ?? null,
        callbacks.onZoomOut ?? null
      );
    }
  });
  registerChartType("fallback", {
    label: "Fallback (Canvas 2D)",
    create: (containerId) => new FallbackChart(containerId)
  });
}
async function checkWebGPU() {
  if (!navigator.gpu) {
    return "WebGPU is not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 18+.";
  }
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("requestAdapter timed out")), 5e3));
    const adapter = await Promise.race([
      requestGpuAdapter(),
      timeout
    ]);
    if (!adapter) {
      return "No WebGPU adapter found. Your GPU may not be supported or hardware acceleration may be disabled.";
    }
  } catch (e) {
    const message = e.message ?? "Unknown error";
    return `WebGPU adapter request failed: ${message}`;
  }
  return null;
}
const timeseriesPage = createTimeseriesPageController({
  fetchData: (start, end, width, columns, colorColumn, signal) => fetchData(start, end, width, columns, colorColumn, signal),
  buildRangeControls,
  updateAnalysisYRange,
  updateAnalysisZoom,
  getCurrentView,
  fetchAndRenderAnalytics: () => fetchAndRenderAnalytics()
});
let _timeseriesReady = false;
let _timeseriesReadyPromise = null;
let _sessionPersistenceStarted = false;
const renderCurrentData = () => timeseriesPage.renderCurrentData();
const emitChartRangeChange = (sourceKind = "data") => timeseriesPage.emitChartRangeChange(sourceKind);
const fetchAndRender = async () => {
  await ensureTimeseriesReady();
  return timeseriesPage.fetchAndRender();
};
const onZoomRangeChange = (newStart, newEnd, sourceKind = "user") => timeseriesPage.onZoomRangeChange(newStart, newEnd, sourceKind);
function ensureSessionPersistenceStarted() {
  if (_sessionPersistenceStarted) return;
  startSessionPersistence();
  _sessionPersistenceStarted = true;
}
async function ensureTimeseriesReady() {
  if (_timeseriesReady) return;
  if (_timeseriesReadyPromise) {
    await _timeseriesReadyPromise;
    return;
  }
  _timeseriesReadyPromise = (async () => {
    if (appState.chart) {
      _timeseriesReady = true;
      return;
    }
    const gpuError = await checkWebGPU();
    try {
      dbg("initial X range (ms)", { start: appState.currentStart, end: appState.currentEnd });
      const lineType = getChartType("line");
      if (lineType) {
        appState.chart = lineType.create("main-chart", {
          onZoom: onZoomRangeChange,
          onYRange: updateAnalysisYRange,
          onZoomOut: () => zoomOut(fetchAndRender)
        });
      } else {
        if (!DataChartCtor) throw new Error("DataChart module not loaded");
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
      setAnnotationOverlayCallback(() => appState.chart?.requestOverlayRender?.());
      appState.chart?.setXRange?.(appState.currentStart, appState.currentEnd);
      appState.chart?.setChartText?.(
        appState.chartText?.title || "",
        appState.chartText?.xLabel || "",
        appState.chartText?.yLabel || ""
      );
      renderCurrentData();
      await timeseriesPage.fetchAndRender();
      appState.initialView = getCurrentView();
      dbgGroup("initialView snapshot", () => dbg(appState.initialView));
      await restoreSessionAfterChartReady({
        metadataTimeRange: appState.metadata?.time_range ?? null,
        currentDatasetRevision: Number(appState.datasetRevision ?? 0),
        buildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
        buildRangeControls,
        renderCurrentData,
        fetchAndRender: () => timeseriesPage.fetchAndRender()
      });
      _timeseriesReady = true;
    } catch (e) {
      console.error("Primary chart failed, switching to fallback:", e);
      try {
        const fallbackType = getChartType("fallback");
        appState.chart = fallbackType ? fallbackType.create("main-chart", {}) : new FallbackChart("main-chart");
        await appState.chart.init();
        appState.analysisBound = false;
        bindAnalysisChartEvents();
        refreshZoomControlsState();
        await timeseriesPage.fetchAndRender();
        setMetaText("Fallback renderer active");
        _timeseriesReady = true;
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error("Fallback chart also failed:", fallbackErr);
        setMetaText("Error: " + msg);
      }
    }
  })();
  try {
    await _timeseriesReadyPromise;
  } finally {
    _timeseriesReadyPromise = null;
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
function showPage(pageName) {
  document.querySelector(`.sidebar .nav-item[data-page="${pageName}"]`)?.click?.();
}
async function initScatterPageModule() {
  const scatterPage = document.getElementById("page-scatter");
  if (!scatterPage) return;
  const { initScatterPage } = await __vitePreload(async () => { const { initScatterPage } = await import('./assets/scatter-YST55Tu_.js');return { initScatterPage }},true              ?__vite__mapDeps([3,1,0]):void 0);
  await initScatterPage(appState.metadata);
}
let analyticsController = null;
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
    if (!(e instanceof Error) || e.name !== "AbortError") {
      console.warn("Anomaly fetch failed:", e);
    }
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
    fetchAndRenderAnalytics().catch((err) => {
      console.warn("Analytics fetch failed:", err);
    });
  });
}
async function initFftPage() {
  await initFftPage$1({
    renderTimeseries: renderCurrentData
  });
}
async function initHeatmapPage() {
  await initHeatmapPage$1({ showPage });
}
const _loadedPageModules = /* @__PURE__ */ new Set();
let _metadataReady = false;
async function ensurePageModuleLoaded(page) {
  if (_loadedPageModules.has(page)) return;
  const loader = pageModuleLoaders[page];
  if (!loader) return;
  if (!_metadataReady) {
    await new Promise((resolve) => {
      const onReady = () => {
        window.removeEventListener("edatime:metadata-ready", onReady);
        resolve();
      };
      window.addEventListener("edatime:metadata-ready", onReady);
    });
  }
  try {
    await loader();
    _loadedPageModules.add(page);
  } catch (error) {
    console.error(`Failed to load page module for ${page}:`, error);
  }
}
const pageModuleLoaders = {
  scatter: initScatterPageModule,
  scattermatrix: initScatterPageModule,
  heatmap: initHeatmapPage,
  spectrogram: initSpectrogramPage,
  causal: initCausalPage,
  fft: initFftPage,
  drift: initDriftPage
};
let _datasetReadyPromise = null;
let _datasetUiReady = false;
function initializeDatasetUi(metadata) {
  if (!_datasetUiReady) {
    initDatasetSearchInputs({
      rebuildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
      renderColumnProfilesGrid
    });
    initTimeseriesActions({
      rebuildColumnToggles: () => buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData),
      renderColumnProfilesGrid,
      buildRangeControls,
      renderCurrentData,
      fetchAndRender,
      updateAnalysisZoom,
      emitChartRangeChange,
      registerCleanup: (cleanup) => _appCleanups.push(cleanup)
    });
    ensureSessionPersistenceStarted();
    window.addEventListener("edatime:page-change", (event) => {
      const ce = event;
      if (ce.detail?.page === "timeseries") {
        void ensureTimeseriesReady();
      }
    });
    _datasetUiReady = true;
  }
  hydrateColumnProfiles(metadata);
  renderColumnProfilesGrid(true);
  applyPartialTimeRangeFromMetadata(metadata, false);
  setUploadPreviewStatus("Showing current dataset profile. Drop/select a file to preview before loading.");
  setProfileMode("dataset");
  buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
  buildMetaBar(metadata);
  buildRangeControls();
  window.dispatchEvent(new CustomEvent("edatime:workflow-refresh"));
  const timeRange = metadata.time_range;
  if (!timeRange) return;
  appState.currentStart = Number(timeRange.min);
  appState.currentEnd = Number(timeRange.max);
  updateAnalysisZoom(appState.currentStart, appState.currentEnd, "initial");
  emitChartRangeChange("initial");
}
async function ensureDatasetReady(_pageName = "timeseries") {
  if (_metadataReady) return;
  if (_datasetReadyPromise) return _datasetReadyPromise;
  _datasetReadyPromise = (async () => {
    await ensureChartModules();
    const metadata = await fetchMetadata();
    storeFetchedMetadata(metadata);
    _metadataReady = true;
    window.dispatchEvent(new Event("edatime:metadata-ready"));
    dbgGroup("metadata", () => dbg(appState.metadata));
    const metadataTimeRange = appState.metadata?.time_range;
    if (!metadataTimeRange) {
      setMetaText("No valid time range found.");
      return;
    }
    appState.numericCols = getNumericColumns(metadata);
    if (!appState.selectedCols.length) {
      appState.selectedCols = getDefaultTimeseriesColumns(metadata);
    }
    appState.adaptiveFilterColumn = appState.selectedCols[0] || null;
    sanitizeSelectedColumns();
    initializeDatasetUi(metadata);
  })().catch((error) => {
    _datasetReadyPromise = null;
    throw error;
  });
  return _datasetReadyPromise;
}
async function initSpectrogramPage() {
  await initSpectrogramPage$1({
    setLoading: setComputeLoading
  });
}
async function initDriftPage() {
  const { initDriftPage: init2 } = await __vitePreload(async () => { const { initDriftPage: init2 } = await import('./assets/drift-CTz8wK_7.js');return { initDriftPage: init2 }},true              ?__vite__mapDeps([4,0,1]):void 0);
  await init2(appState.metadata);
}
async function initCausalPage() {
  const { initCausalPage: init2 } = await __vitePreload(async () => { const { initCausalPage: init2 } = await import('./assets/causal-QCmcQZom.js').then(n => n.a);return { initCausalPage: init2 }},true              ?__vite__mapDeps([5,0,1]):void 0);
  const { initCausalComparison } = await __vitePreload(async () => { const { initCausalComparison } = await import('./assets/causal-QCmcQZom.js').then(n => n.c);return { initCausalComparison }},true              ?__vite__mapDeps([5,0,1]):void 0);
  init2({
    getMetadata: () => appState.metadata,
    chipColor: (col, idx) => getAnalyticsChipColor(col, idx),
    numericColumns: () => getNumericColumns(appState.metadata),
    setLoading: setComputeLoading
  });
  initCausalComparison();
}
async function refreshDatasetAfterMutation(options) {
  if (!fetchMetadata) return;
  storeFetchedMetadata(await fetchMetadata());
  appState.numericCols = getNumericColumns(appState.metadata);
  const selectedColumn = options?.selectedColumn;
  if (selectedColumn && !appState.selectedCols.includes(selectedColumn)) {
    appState.selectedCols.push(selectedColumn);
  }
  sanitizeSelectedColumns();
  buildColumnToggles(fetchAndRender, buildRangeControls, renderCurrentData);
  buildMetaBar(appState.metadata);
  await fetchAndRender();
}
async function init() {
  installWindowsWebGpuRequestAdapterWorkaround();
  buildMetaBar(null);
  initAppShell({
    ensurePageModuleLoaded,
    showPage,
    fetchAndRender,
    renderCurrentData,
    updateAnalysisYRange,
    zoomOut: () => zoomOut(fetchAndRender),
    resetZoom: () => resetZoom(fetchAndRender),
    initAnalyticsListeners,
    refreshDatasetAfterMutation,
    hydrateColumnProfiles,
    renderColumnProfilesGrid,
    registerCleanup: (cleanup) => _appCleanups.push(cleanup)
  });
  window.__edatime = window.__edatime || {};
  window.__edatime.ensureDatasetReady = ensureDatasetReady;
  try {
    const initialPage = getHashPage();
    if (pageNeedsDatasetBootstrap(initialPage)) {
      await ensureDatasetReady(initialPage);
    }
    if (initialPage === "timeseries" && _metadataReady) {
      await ensureTimeseriesReady();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Initial bootstrap failed:", e);
    setMetaText("Error: " + message);
  }
}
init();
//# sourceMappingURL=app.js.map
