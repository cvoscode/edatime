// frontend/src/chart/chartInteractions.ts
var SELECTION_BOX_CSS = "position:absolute;top:0;left:0;width:0;height:0;border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);pointer-events:none;display:none;z-index:5";
function createSelectionBox(container) {
  const box = document.createElement("div");
  box.style.cssText = SELECTION_BOX_CSS;
  container.appendChild(box);
  return box;
}
function updateSelectionBox(box, drag, containerWidth, containerHeight) {
  const left = Math.max(0, Math.min(drag.startX, drag.endX));
  const right = Math.min(containerWidth, Math.max(drag.startX, drag.endX));
  const top = Math.max(0, Math.min(drag.startY, drag.endY));
  const bottom = Math.min(containerHeight, Math.max(drag.startY, drag.endY));
  box.style.left = `${left}px`;
  box.style.width = `${Math.max(0, right - left)}px`;
  box.style.top = `${top}px`;
  box.style.height = `${Math.max(0, bottom - top)}px`;
  box.style.display = "block";
}
function hideSelectionBox(box) {
  box.style.display = "none";
}
function createCanvasOverlay(container, onResize) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6";
  container.appendChild(canvas);
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      canvas.width = entry.contentRect.width;
      canvas.height = entry.contentRect.height;
      onResize();
    }
  });
  observer.observe(container);
  return { canvas, observer };
}
function startDrag(event, container) {
  const rect = container.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  try {
    container.setPointerCapture(event.pointerId);
  } catch {
  }
  return { pointerId: event.pointerId, startX: x, endX: x, startY: y, endY: y };
}
function moveDrag(event, drag, container) {
  const rect = container.getBoundingClientRect();
  drag.endX = event.clientX - rect.left;
  drag.endY = event.clientY - rect.top;
}
function dragToDataRange(drag, containerWidth, grid, dataMin, dataMax, minDragPx = 8) {
  const dx = Math.abs(drag.endX - drag.startX);
  if (dx < minDragPx) return null;
  const plotLeft = grid.left;
  const plotWidth = Math.max(1, containerWidth - grid.left - grid.right);
  const x0 = Math.max(plotLeft, Math.min(drag.startX, drag.endX));
  const x1 = Math.min(plotLeft + plotWidth, Math.max(drag.startX, drag.endX));
  const range = dataMax - dataMin;
  const newMin = dataMin + (x0 - plotLeft) / plotWidth * range;
  const newMax = dataMin + (x1 - plotLeft) / plotWidth * range;
  if (newMax <= newMin) return null;
  return { min: newMin, max: newMax };
}
function ensureRelativePosition(container) {
  if (window.getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
}
function initBoxZoom(opts) {
  const { container, grid, getXRange, onZoom, shouldIgnore, onClick, onDblClick } = opts;
  ensureRelativePosition(container);
  const selectionBox = createSelectionBox(container);
  let drag = null;
  container.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (shouldIgnore?.(e)) return;
    drag = startDrag(e, container);
  });
  container.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    moveDrag(e, drag, container);
    const rect = container.getBoundingClientRect();
    updateSelectionBox(selectionBox, drag, rect.width, rect.height);
  });
  const finishDrag = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    hideSelectionBox(selectionBox);
    try {
      container.releasePointerCapture(e.pointerId);
    } catch {
    }
    const rect = container.getBoundingClientRect();
    const dx = Math.abs(d.endX - d.startX);
    const { min: xMin, max: xMax } = getXRange();
    if (dx >= 8) {
      const range = dragToDataRange(d, rect.width, grid, xMin, xMax);
      if (range) onZoom(range.min, range.max);
    } else if (dx < 4 && onClick) {
      onClick(d.startX, d.startY);
    }
  };
  container.addEventListener("pointerup", finishDrag);
  container.addEventListener("pointercancel", (e) => {
    if (drag?.pointerId === e.pointerId) {
      drag = null;
      hideSelectionBox(selectionBox);
    }
  });
  if (onDblClick) {
    container.addEventListener("dblclick", (e) => {
      if (e.shiftKey || e.ctrlKey) return;
      onDblClick();
    });
  }
  return selectionBox;
}
function initWheelZoom(opts) {
  const { container, grid, getXRange, onZoom, clamp } = opts;
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const plotL = grid.left;
    const plotW = Math.max(1, rect.width - grid.left - grid.right);
    const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left - plotL) / plotW));
    const { min: curMin, max: curMax } = getXRange();
    const range = curMax - curMin;
    const focus = curMin + xNorm * range;
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const newRange = range * factor;
    let newMin = focus - xNorm * newRange;
    let newMax = newMin + newRange;
    if (clamp) {
      newMin = Math.max(clamp.min, newMin);
      newMax = Math.min(clamp.max, newMax);
    }
    if (newMax > newMin + 1e-30) onZoom(newMin, newMax);
  }, { passive: false });
}
function tooltipRow(name, value, color) {
  const dot = color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span>` : "";
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">${dot}<span>${name}</span><span style="font-variant-numeric:tabular-nums;font-weight:600;">${value}</span></div>`;
}
function tooltipWrap(header, rows) {
  return `<div style="opacity:0.8;margin-bottom:6px;">${header}</div>${rows}`;
}

export {
  createCanvasOverlay,
  ensureRelativePosition,
  initBoxZoom,
  initWheelZoom,
  tooltipRow,
  tooltipWrap
};
//# sourceMappingURL=chunk-667JW4DN.js.map
