import "./chunk-PZ5AY32C.js";

// frontend/src/drift/driftPage.ts
var COLOR_GREEN = "#00C896";
var COLOR_YELLOW = "#FFC041";
var COLOR_RED = "#FF6B6B";
var COLOR_DIM = "rgba(120,139,174,0.35)";
var COLOR_REF = "rgba(0,168,255,0.55)";
var COLOR_TEXT = "#D2DAF0";
var COLOR_TEXT_DIM = "#788BAE";
var COLOR_BORDER = "rgba(255,255,255,0.07)";
function driftColor(level) {
  if (level === "red") return COLOR_RED;
  if (level === "yellow") return COLOR_YELLOW;
  return COLOR_GREEN;
}
function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.scale(dpr, dpr);
}
function cssW(canvas) {
  return canvas.getBoundingClientRect().width;
}
function cssH(canvas) {
  return canvas.getBoundingClientRect().height;
}
var TIMELINE_PAD = { top: 24, right: 16, bottom: 56, left: 52 };
function drawTimeline(canvas, response, plotType, selectedIdx) {
  resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = cssW(canvas);
  const H = cssH(canvas);
  const { top, right, bottom, left } = TIMELINE_PAD;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  ctx.clearRect(0, 0, W, H);
  const windows = response.windows;
  const ref = response.reference;
  const n = windows.length;
  if (n === 0) return;
  let yMin = ref.min;
  let yMax = ref.max;
  for (const w of windows) {
    if (isFinite(w.min) && w.min < yMin) yMin = w.min;
    if (isFinite(w.max) && w.max > yMax) yMax = w.max;
  }
  const yRange = yMax - yMin || 1;
  const toY = (v) => top + plotH - (v - yMin) / yRange * plotH;
  const slotW = plotW / (n + 1);
  const boxW = Math.min(slotW * 0.55, 28);
  function slotX(idx) {
    return left + (idx + 1.5) * slotW;
  }
  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 1;
  const nYTicks = 5;
  ctx.font = `10px system-ui`;
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.textAlign = "right";
  for (let i = 0; i <= nYTicks; i++) {
    const v = yMin + i / nYTicks * yRange;
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(W - right, y);
    ctx.stroke();
    ctx.fillText(formatValue(v), left - 4, y + 3.5);
  }
  drawBoxOrViolin(ctx, ref, slotX(-1), boxW, toY, plotType, COLOR_REF, COLOR_REF, false);
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.textAlign = "center";
  ctx.font = "9px system-ui";
  drawRotatedLabel(ctx, "Ref", slotX(-1), top + plotH + 8, -35);
  for (let i = 0; i < n; i++) {
    const w = windows[i];
    const color = w.count < 5 ? COLOR_DIM : driftColor(w.drift_level);
    const isSelected = i === selectedIdx;
    if (isSelected) {
      ctx.fillStyle = "rgba(0,168,255,0.08)";
      ctx.fillRect(slotX(i) - slotW / 2, top, slotW, plotH);
    }
    drawBoxOrViolin(ctx, w, slotX(i), boxW, toY, plotType, color, color, isSelected);
    ctx.fillStyle = isSelected ? COLOR_TEXT : COLOR_TEXT_DIM;
    ctx.textAlign = "center";
    ctx.font = isSelected ? "9.5px system-ui" : "9px system-ui";
    drawRotatedLabel(ctx, w.label, slotX(i), top + plotH + 8, -35);
    if (w.count >= 5) {
      ctx.fillStyle = driftColor(w.drift_level);
      ctx.beginPath();
      ctx.arc(slotX(i), top + plotH + 42, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotH);
  ctx.lineTo(W - right, top + plotH);
  ctx.stroke();
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = "10px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(response.column, left, top - 6);
}
function drawBoxOrViolin(ctx, stats, cx, bw, toY, plotType, strokeColor, fillColor, selected) {
  const [q5, q25, q50, q75, q95] = stats.quantiles;
  if (!isFinite(q5) || stats.count === 0) return;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = selected ? 2 : 1.5;
  if (plotType === "violin") {
    drawViolin(ctx, stats, cx, bw, toY, strokeColor, fillColor);
    return;
  }
  const yQ5 = toY(q5);
  const yQ25 = toY(q25);
  const yQ50 = toY(q50);
  const yQ75 = toY(q75);
  const yQ95 = toY(q95);
  ctx.beginPath();
  ctx.moveTo(cx, yQ5);
  ctx.lineTo(cx, yQ25);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, yQ75);
  ctx.lineTo(cx, yQ95);
  ctx.stroke();
  const capW = bw * 0.4;
  ctx.beginPath();
  ctx.moveTo(cx - capW, yQ5);
  ctx.lineTo(cx + capW, yQ5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - capW, yQ95);
  ctx.lineTo(cx + capW, yQ95);
  ctx.stroke();
  const alpha = selected ? 0.22 : 0.12;
  ctx.fillStyle = hexToRgba(fillColor, alpha);
  ctx.fillRect(cx - bw / 2, yQ75, bw, yQ25 - yQ75);
  ctx.strokeRect(cx - bw / 2, yQ75, bw, yQ25 - yQ75);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = selected ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, yQ50);
  ctx.lineTo(cx + bw / 2, yQ50);
  ctx.stroke();
  ctx.lineWidth = selected ? 2 : 1.5;
}
function drawViolin(ctx, stats, cx, maxHalfW, toY, strokeColor, fillColor) {
  const counts = stats.hist_counts;
  const bins = stats.hist_bins;
  if (counts.length === 0 || bins.length < 2) return;
  const maxCnt = Math.max(...counts, 1);
  const pts = [];
  for (let i = 0; i < counts.length; i++) {
    const halfW = counts[i] / maxCnt * maxHalfW;
    const binMid = (bins[i] + bins[i + 1]) / 2;
    pts.push([halfW, toY(binMid)]);
  }
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [hw, y] = pts[i];
    if (i === 0) ctx.moveTo(cx + hw, y);
    else ctx.lineTo(cx + hw, y);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const [hw, y] = pts[i];
    ctx.lineTo(cx - hw, y);
  }
  ctx.closePath();
  ctx.fillStyle = hexToRgba(fillColor, 0.18);
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const [, q25, q50, q75] = stats.quantiles;
  if (isFinite(q50)) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    const y50 = toY(q50);
    const halfW50 = maxHalfW * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - halfW50, y50);
    ctx.lineTo(cx + halfW50, y50);
    ctx.stroke();
  }
  ctx.lineWidth = 1.5;
}
function drawRotatedLabel(ctx, text, x, y, angleDeg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleDeg * Math.PI / 180);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
var DETAIL_PAD = { top: 20, right: 16, bottom: 40, left: 44 };
function drawDetail(canvas, ref, win, plotType) {
  resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = cssW(canvas);
  const H = cssH(canvas);
  const { top, right, bottom, left } = DETAIL_PAD;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + i / 4 * plotH;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(W - right, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotH);
  ctx.lineTo(W - right, top + plotH);
  ctx.stroke();
  if (plotType === "histogram") {
    drawHistogramOverlay(ctx, ref, win, left, top, plotW, plotH);
  } else {
    drawECDFOverlay(ctx, ref, win, left, top, plotW, plotH);
  }
  const refLabel = "Reference";
  const winLabel = win ? win.label : "\u2014";
  ctx.font = "9px system-ui";
  ctx.fillStyle = COLOR_REF;
  ctx.fillRect(left + 4, top + 6, 10, 3);
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.fillText(refLabel, left + 18, top + 10);
  if (win) {
    const col = win.count < 5 ? COLOR_DIM : driftColor(win.drift_level || "green");
    ctx.fillStyle = col;
    ctx.fillRect(left + 4, top + 18, 10, 3);
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.fillText(winLabel, left + 18, top + 22);
  }
}
function drawHistogramOverlay(ctx, ref, win, px, py, pw, ph) {
  const bins = ref.hist_bins;
  const refCounts = ref.hist_counts;
  const winCounts = win?.hist_counts ?? [];
  const n = bins.length - 1;
  if (n <= 0) return;
  const maxCnt = Math.max(...refCounts, ...winCounts.length ? winCounts : [0], 1);
  const xMin = bins[0];
  const xMax = bins[bins.length - 1];
  const xRange = xMax - xMin || 1;
  const toX = (v) => px + (v - xMin) / xRange * pw;
  const toY = (cnt) => py + ph - cnt / maxCnt * ph;
  for (let i = 0; i < n; i++) {
    const x0 = toX(bins[i]);
    const x1 = toX(bins[i + 1]);
    const bw = Math.max(x1 - x0 - 1, 1);
    const ry = toY(refCounts[i] || 0);
    ctx.fillStyle = hexToRgba(COLOR_REF, 0.3);
    ctx.fillRect(x0, ry, bw, py + ph - ry);
    ctx.strokeStyle = hexToRgba(COLOR_REF, 0.7);
    ctx.strokeRect(x0, ry, bw, py + ph - ry);
    if (winCounts.length > i) {
      const col = win && win.count >= 5 ? driftColor(win.drift_level) : COLOR_DIM;
      const wy = toY(winCounts[i] || 0);
      ctx.fillStyle = hexToRgba(col, 0.18);
      ctx.fillRect(x0, wy, bw, py + ph - wy);
      ctx.strokeStyle = hexToRgba(col, 0.6);
      ctx.strokeRect(x0, wy, bw, py + ph - wy);
    }
  }
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = "9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(formatValue(xMin), px, py + ph + 14);
  ctx.fillText(formatValue((xMin + xMax) / 2), px + pw / 2, py + ph + 14);
  ctx.fillText(formatValue(xMax), px + pw, py + ph + 14);
  ctx.textAlign = "right";
  ctx.fillText("0", px - 4, py + ph + 3.5);
  ctx.fillText(String(maxCnt), px - 4, py + 10);
}
function drawECDFOverlay(ctx, ref, win, px, py, pw, ph) {
  const xMin = Math.min(ref.min, win?.min ?? Infinity, isFinite(win?.min ?? Infinity) ? win.min : ref.min);
  const xMax = Math.max(ref.max, win?.max ?? -Infinity, isFinite(win?.max ?? -Infinity) ? win.max : ref.max);
  const xRange = xMax - xMin || 1;
  const toX = (v) => px + (v - xMin) / xRange * pw;
  const toY = (p) => py + ph - p * ph;
  function drawECDF(xs, ys, color) {
    if (xs.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(toX(xs[0]), toY(ys[0]));
    for (let i = 1; i < xs.length; i++) {
      ctx.lineTo(toX(xs[i]), toY(ys[i - 1]));
      ctx.lineTo(toX(xs[i]), toY(ys[i]));
    }
    ctx.stroke();
  }
  drawECDF(ref.ecdf_x, ref.ecdf_y, hexToRgba(COLOR_REF, 0.9));
  if (win && win.ecdf_x.length > 0) {
    const col = win.count < 5 ? COLOR_DIM : driftColor(win.drift_level);
    drawECDF(win.ecdf_x, win.ecdf_y, col);
  }
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = "9px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(formatValue(xMin), px, py + ph + 14);
  ctx.fillText(formatValue((xMin + xMax) / 2), px + pw / 2, py + ph + 14);
  ctx.fillText(formatValue(xMax), px + pw, py + ph + 14);
  ctx.textAlign = "right";
  ctx.fillText("0", px - 4, py + ph + 3.5);
  ctx.fillText("1", px - 4, py + 10);
  ctx.save();
  ctx.translate(px - 30, py + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("CDF", 0, 0);
  ctx.restore();
}
function formatValue(v) {
  if (!isFinite(v)) return "\u2014";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(4);
  if (abs === 0) return "0";
  return v.toExponential(2);
}
function hexToRgba(hex, alpha) {
  if (hex.startsWith("rgba") || hex.startsWith("rgb(")) {
    return hex.replace(/[\d.]+\)$/, `${alpha})`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function toDatetimeLocal(ms) {
  if (!isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function initDriftPage(metadata) {
  const colSelect = document.getElementById("drift-col-select");
  const windowSelect = document.getElementById("drift-window-select");
  const plotTypeSelect = document.getElementById("drift-plot-type");
  const refStartInput = document.getElementById("drift-ref-start");
  const refEndInput = document.getElementById("drift-ref-end");
  const computeBtn = document.getElementById("drift-compute-btn");
  const statusEl = document.getElementById("drift-status");
  const timelineCanvas = document.getElementById("drift-timeline-canvas");
  const detailCanvas = document.getElementById("drift-detail-canvas");
  const loadingOverlay = document.getElementById("drift-loading");
  const emptyState = document.getElementById("drift-empty");
  const detailHeader = document.getElementById("drift-detail-header");
  const detailStatsEl = document.getElementById("drift-detail-stats");
  const windowListEl = document.getElementById("drift-window-list");
  if (!timelineCanvas || !detailCanvas || !colSelect) return;
  const numericCols = Array.isArray(metadata?.numeric_columns) ? metadata.numeric_columns.filter((c) => c && c.toLowerCase() !== "ts") : [];
  for (const col of numericCols) {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    colSelect.appendChild(opt);
  }
  const timeRange = metadata?.time_range;
  if (timeRange?.min != null && timeRange?.max != null) {
    const midMs = timeRange.min + (timeRange.max - timeRange.min) / 2;
    if (refStartInput) refStartInput.value = toDatetimeLocal(timeRange.min);
    if (refEndInput) refEndInput.value = toDatetimeLocal(midMs);
  }
  let currentResponse = null;
  let selectedWindowIdx = null;
  function renderTimeline() {
    if (!currentResponse || !timelineCanvas) return;
    const plotType = plotTypeSelect?.value || "box";
    drawTimeline(timelineCanvas, currentResponse, plotType, selectedWindowIdx);
  }
  function renderDetail() {
    if (!detailCanvas || !currentResponse) return;
    const plotType = plotTypeSelect?.value || "box";
    const detailType = plotType === "histogram" || plotType === "ecdf" ? plotType : "ecdf";
    const win = selectedWindowIdx !== null ? currentResponse.windows[selectedWindowIdx] : null;
    drawDetail(detailCanvas, currentResponse.reference, win, detailType);
  }
  function renderWindowList() {
    if (!windowListEl || !currentResponse) return;
    windowListEl.innerHTML = "";
    currentResponse.windows.forEach((w, idx) => {
      const item = document.createElement("div");
      item.className = "drift-window-item" + (idx === selectedWindowIdx ? " selected" : "");
      const badgeClass = w.count < 5 ? "empty" : w.drift_level;
      item.innerHTML = `
                <span class="drift-window-badge drift-window-badge--${badgeClass}"></span>
                <span class="drift-window-label">${w.label}</span>
                <span class="drift-window-psi">PSI ${isFinite(w.psi) ? w.psi.toFixed(3) : "\u2014"}</span>
            `;
      item.addEventListener("click", () => {
        selectedWindowIdx = idx;
        renderTimeline();
        renderDetail();
        updateDetailStats();
        renderWindowList();
      });
      windowListEl.appendChild(item);
    });
  }
  function updateDetailStats() {
    if (!detailStatsEl || !currentResponse) return;
    const win = selectedWindowIdx !== null ? currentResponse.windows[selectedWindowIdx] : null;
    if (!win) {
      detailStatsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">Select a window to see stats</span>';
      if (detailHeader) detailHeader.textContent = "Window Detail";
      return;
    }
    if (detailHeader) {
      detailHeader.textContent = win.label + (win.low_sample_warning ? " \u26A0 Low N" : "");
    }
    const levelClass = `drift-${win.drift_level}`;
    const rows = [
      ["Count", String(win.count)],
      ["Completeness", `${(win.completeness * 100).toFixed(1)}%`],
      ["Mean", formatValue(win.mean)],
      ["Std", formatValue(win.std)],
      ["Median (Q50)", formatValue(win.quantiles[2])],
      ["KS stat / p", `${win.ks_stat.toFixed(3)} / ${win.ks_pvalue.toFixed(3)}`],
      ["Wasserstein", formatValue(win.wasserstein)],
      ["PSI", win.psi.toFixed(4), levelClass],
      ["Drift level", win.drift_level.toUpperCase(), levelClass]
    ];
    if (win.low_sample_warning) {
      rows.unshift(["\u26A0 Low sample size", "N < 5, stats unreliable"]);
    }
    detailStatsEl.innerHTML = rows.map(([label, value, cls]) => `
            <div class="drift-detail-stat-row">
                <span class="drift-detail-stat-label">${label}</span>
                <span class="drift-detail-stat-value${cls ? " " + cls : ""}">${value}</span>
            </div>
        `).join("");
  }
  function syncEmptyState(show, message) {
    if (!emptyState) return;
    if (message) emptyState.innerHTML = `<strong>No drift data</strong><span>${message}</span>`;
    emptyState.hidden = !show;
  }
  async function runCompute() {
    if (!computeBtn) return;
    const column = colSelect?.value;
    if (!column) {
      if (statusEl) statusEl.textContent = "Select a column first.";
      return;
    }
    const refStart = refStartInput?.value;
    const refEnd = refEndInput?.value;
    if (!refStart || !refEnd) {
      if (statusEl) statusEl.textContent = "Set reference start and end dates.";
      return;
    }
    computeBtn.disabled = true;
    computeBtn.textContent = "Computing\u2026";
    if (loadingOverlay) loadingOverlay.hidden = false;
    syncEmptyState(false);
    if (statusEl) statusEl.textContent = "Computing drift\u2026";
    try {
      const body = {
        column,
        window: windowSelect?.value || "daily",
        reference_start: new Date(refStart).toISOString(),
        reference_end: new Date(refEnd).toISOString()
      };
      const res = await fetch("/api/drift/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }
      currentResponse = await res.json();
      selectedWindowIdx = currentResponse.windows.length > 0 ? 0 : null;
      const nWindows = currentResponse.windows.length;
      const nDrifting = currentResponse.windows.filter((w) => w.drift_level !== "green").length;
      if (statusEl) {
        statusEl.textContent = `${column} \xB7 ${nWindows} windows \xB7 ${nDrifting} flagged \xB7 Ref: ${currentResponse.reference.count} samples`;
      }
      renderTimeline();
      renderDetail();
      renderWindowList();
      updateDetailStats();
      syncEmptyState(nWindows === 0, nWindows === 0 ? "No data found in the monitoring range after the reference window." : void 0);
    } catch (err) {
      console.error("Drift compute failed:", err);
      if (statusEl) statusEl.textContent = `Error: ${err?.message || "unknown"}`;
      syncEmptyState(true, err?.message || "Computation failed. Check column and date ranges.");
    } finally {
      if (loadingOverlay) loadingOverlay.hidden = true;
      computeBtn.disabled = false;
      computeBtn.textContent = "Compute";
    }
  }
  computeBtn?.addEventListener("click", runCompute);
  plotTypeSelect?.addEventListener("change", () => {
    renderTimeline();
    renderDetail();
  });
  timelineCanvas.addEventListener("click", (e) => {
    if (!currentResponse || currentResponse.windows.length === 0) return;
    const rect = timelineCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const W = rect.width;
    const n = currentResponse.windows.length;
    const plotW = W - TIMELINE_PAD.left - TIMELINE_PAD.right;
    const slotW = plotW / (n + 1);
    const rawIdx = Math.round((clickX - TIMELINE_PAD.left) / slotW - 1.5);
    const idx = Math.max(0, Math.min(n - 1, rawIdx));
    if (rawIdx < 0) return;
    selectedWindowIdx = idx;
    renderTimeline();
    renderDetail();
    updateDetailStats();
    renderWindowList();
  });
  const ro = new ResizeObserver(() => {
    renderTimeline();
    renderDetail();
  });
  ro.observe(timelineCanvas);
  ro.observe(detailCanvas);
  window.addEventListener("edatime:page-change", (e) => {
    if (e?.detail?.page === "drift") {
      const existing = new Set(Array.from(colSelect.options).map((o) => o.value));
      const cols = Array.isArray(metadata?.numeric_columns) ? metadata.numeric_columns : [];
      for (const col of cols) {
        if (!existing.has(col) && col.toLowerCase() !== "ts") {
          const opt = document.createElement("option");
          opt.value = col;
          opt.textContent = col;
          colSelect.appendChild(opt);
        }
      }
      if (currentResponse) {
        renderTimeline();
        renderDetail();
      }
    }
  });
}
export {
  initDriftPage
};
//# sourceMappingURL=driftPage-I3S3OIXU.js.map
