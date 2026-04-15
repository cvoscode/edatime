// frontend/src/formatUtils.ts
var EURO_DATE_ONLY = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
var EURO_DATE_TIME = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
var EURO_DATE_TIME_SECONDS = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
function formatTwoDecimals(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatTimestamp(ms, spanMs) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "\u2014";
  try {
    const d = new Date(n);
    if (!Number.isFinite(d.getTime())) return "\u2014";
    if (spanMs <= 2 * 6e4) return EURO_DATE_TIME_SECONDS.format(d);
    if (spanMs <= 2 * 24 * 60 * 6e4) return EURO_DATE_TIME.format(d);
    return EURO_DATE_ONLY.format(d);
  } catch {
    return String(ms);
  }
}
function formatTimeTooltip(ms, spanMs) {
  try {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return String(ms);
    if (spanMs <= 2 * 6e4) return EURO_DATE_TIME_SECONDS.format(d);
    return EURO_DATE_TIME.format(d);
  } catch {
    return String(ms);
  }
}

export {
  EURO_DATE_ONLY,
  EURO_DATE_TIME,
  EURO_DATE_TIME_SECONDS,
  formatTwoDecimals,
  formatTimestamp,
  formatTimeTooltip
};
//# sourceMappingURL=chunk-LZAZQ2R3.js.map
