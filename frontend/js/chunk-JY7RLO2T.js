// frontend/src/utils/dom.ts
function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function downloadUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function getEl(id) {
  return document.getElementById(id);
}

export {
  escapeHtml,
  downloadUrl,
  downloadBlob,
  getEl
};
//# sourceMappingURL=chunk-JY7RLO2T.js.map
