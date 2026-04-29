import {
  toast
} from "./chunk-T63Y6LQO.js";
import {
  downloadBlob,
  downloadUrl
} from "./chunk-W3LBOP5Z.js";

// frontend/src/utils/chartExport.ts
function exportContainerCanvasPNG(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) {
    toast("No chart canvas found for export.", "warning");
    return;
  }
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const c of canvases) {
    const cr = c.getBoundingClientRect();
    const dx = (cr.left - rect.left) * dpr;
    const dy = (cr.top - rect.top) * dpr;
    try {
      ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
    } catch {
    }
  }
  downloadUrl(out.toDataURL("image/png"), filename);
  toast("PNG exported.", "success");
}
async function exportElementPNG(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) {
    toast("Element not found for export.", "warning");
    return;
  }
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const clone = el.cloneNode(true);
  inlineComputedStyles(el, clone);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("xmlns", svgNs);
  const fo = document.createElementNS(svgNs, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  fo.appendChild(clone);
  svg.appendChild(fo);
  const svgStr = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG image"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast("Canvas not available.", "error");
      return;
    }
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, w, h);
    downloadUrl(canvas.toDataURL("image/png"), filename);
    toast("PNG exported.", "success");
  } catch {
    toast("PNG export failed. Try CSV export instead.", "error");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
function inlineComputedStyles(original, clone) {
  if (original instanceof HTMLElement && clone instanceof HTMLElement) {
    const computed = getComputedStyle(original);
    for (const prop of [
      "color",
      "background",
      "background-color",
      "font-size",
      "font-family",
      "font-weight",
      "display",
      "grid-template-columns",
      "grid-template-rows",
      "gap",
      "padding",
      "margin",
      "border",
      "border-radius",
      "text-align",
      "white-space",
      "overflow",
      "text-overflow",
      "writing-mode",
      "text-orientation",
      "align-items",
      "justify-content",
      "flex-direction",
      "font-variant-numeric",
      "letter-spacing"
    ]) {
      clone.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }
  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    inlineComputedStyles(origChildren[i], cloneChildren[i]);
  }
}
function exportElementSVG(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) {
    toast("Element not found for export.", "warning");
    return;
  }
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const clone = el.cloneNode(true);
  inlineComputedStyles(el, clone);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("xmlns", svgNs);
  svg.setAttribute("xmlns:xhtml", "http://www.w3.org/1999/xhtml");
  const fo = document.createElementNS(svgNs, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  fo.appendChild(clone);
  svg.appendChild(fo);
  const svgStr = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("SVG exported.", "success");
}
function exportEChartsPNG(chartInstance, filename) {
  if (!chartInstance) {
    toast("Chart not available for export.", "warning");
    return;
  }
  try {
    const url = chartInstance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10"
    });
    downloadUrl(url, filename);
    toast("PNG exported.", "success");
  } catch {
    toast("Failed to export chart.", "error");
  }
}
function exportContainerCanvasSVG(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) {
    toast("No chart canvas found for export.", "warning");
    return;
  }
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const c of canvases) {
    const cr = c.getBoundingClientRect();
    const dx = (cr.left - rect.left) * dpr;
    const dy = (cr.top - rect.top) * dpr;
    try {
      ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
    } catch {
    }
  }
  const pngDataUrl = out.toDataURL("image/png");
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${pngDataUrl}" width="${w}" height="${h}" />
</svg>`;
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("SVG exported.", "success");
}
function exportContainerCanvasHTML(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) {
    toast("No chart canvas found for export.", "warning");
    return;
  }
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const c of canvases) {
    const cr = c.getBoundingClientRect();
    const dx = (cr.left - rect.left) * dpr;
    const dy = (cr.top - rect.top) * dpr;
    try {
      ctx.drawImage(c, dx, dy, cr.width * dpr, cr.height * dpr);
    } catch {
    }
  }
  const pngDataUrl = out.toDataURL("image/png");
  const html = buildStandaloneHtml(`<img src="${pngDataUrl}" style="max-width:100%;display:block;">`, filename.replace(".html", ""));
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("HTML exported.", "success");
}
function exportEChartsSVG(chartInstance, filename) {
  if (!chartInstance) {
    toast("Chart not available for export.", "warning");
    return;
  }
  try {
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    const pngUrl = chartInstance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg });
    const domEl = chartInstance.getDom?.() ?? null;
    const w = domEl?.offsetWidth ?? 800;
    const h = domEl?.offsetHeight ?? 500;
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${pngUrl}" width="${w}" height="${h}" />
</svg>`;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, filename);
    toast("SVG exported.", "success");
  } catch {
    toast("Failed to export SVG.", "error");
  }
}
function exportEChartsHTML(chartInstance, filename) {
  if (!chartInstance) {
    toast("Chart not available for export.", "warning");
    return;
  }
  try {
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    const pngUrl = chartInstance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg });
    const html = buildStandaloneHtml(`<img src="${pngUrl}" style="max-width:100%;display:block;">`, filename.replace(".html", ""));
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, filename);
    toast("HTML exported.", "success");
  } catch {
    toast("Failed to export HTML.", "error");
  }
}
async function exportElementHTML(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) {
    toast("Element not found for export.", "warning");
    return;
  }
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const clone = el.cloneNode(true);
  inlineComputedStyles(el, clone);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("xmlns", svgNs);
  const fo = document.createElementNS(svgNs, "foreignObject");
  fo.setAttribute("width", "100%");
  fo.setAttribute("height", "100%");
  fo.appendChild(clone);
  svg.appendChild(fo);
  const svgStr = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG load failed"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast("Canvas not available.", "error");
      return;
    }
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, w, h);
    const pngUrl = canvas.toDataURL("image/png");
    const html = buildStandaloneHtml(`<img src="${pngUrl}" style="max-width:100%;display:block;">`, filename.replace(".html", ""));
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, filename);
    toast("HTML exported.", "success");
  } catch {
    toast("HTML export failed.", "error");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
function buildStandaloneHtml(bodyContent, title) {
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#080a10";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} \u2014 EdaTime</title>
  <style>body{margin:0;padding:16px;background:${bg};font-family:sans-serif;}</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function exportMatrixCSV(columns, data, filename) {
  if (!columns.length || !data.length) {
    toast("No data to export.", "warning");
    return;
  }
  const header = ["", ...columns].join(",");
  const rows = data.map(
    (row, i) => [columns[i], ...row.map((v) => v !== null ? v.toFixed(6) : "")].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("CSV exported.", "success");
}
function exportTraceCSV(traces, xLabel, filename) {
  if (traces.length === 0) {
    toast("No data to export.", "warning");
    return;
  }
  const ref = traces[0];
  const headers = [xLabel, ...traces.map((t) => t.column)];
  const lines = [headers.join(",")];
  for (let i = 0; i < ref.xs.length; i++) {
    const vals = [String(ref.xs[i]), ...traces.map((t) => t.ys[i] != null ? String(t.ys[i]) : "")];
    lines.push(vals.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
  toast("CSV exported.", "success");
}

export {
  exportContainerCanvasPNG,
  exportElementPNG,
  exportElementSVG,
  exportEChartsPNG,
  exportContainerCanvasSVG,
  exportContainerCanvasHTML,
  exportEChartsSVG,
  exportEChartsHTML,
  exportElementHTML,
  exportMatrixCSV,
  exportTraceCSV
};
//# sourceMappingURL=chunk-WJIQG5LM.js.map
