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
  URL.revokeObjectURL(url);
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
//# sourceMappingURL=chunk-QF7GDSH3.js.map
