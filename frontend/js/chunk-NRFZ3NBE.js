// frontend/src/chart/ticks.ts
var EURO_DATE_ONLY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
var EURO_DATE_TIME = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
var EURO_DATE_TIME_SECONDS = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function formatTwoDecimalsLocal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}
function niceLinearTicks(min, max, count = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const n = Math.max(2, Math.floor(count));
  const range = niceNum(max - min, false);
  const step = niceNum(range / (n - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  const guard = Math.max(2, Math.min(1024, Math.ceil((niceMax - niceMin) / step) + 2));
  for (let i = 0; i < guard; i++) {
    const v = niceMin + i * step;
    if (v > niceMax + step * 0.5) break;
    ticks.push(v);
  }
  return ticks;
}
function niceTimeTicks(minMs, maxMs, count = 6) {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [];
  const span = maxMs - minMs;
  const n = Math.max(2, Math.floor(count));
  const target = span / (n - 1);
  const steps = [
    1e3,
    2e3,
    5e3,
    1e4,
    3e4,
    6e4,
    2 * 6e4,
    5 * 6e4,
    10 * 6e4,
    30 * 6e4,
    60 * 6e4,
    2 * 36e5,
    6 * 36e5,
    12 * 36e5,
    864e5,
    2 * 864e5,
    7 * 864e5,
    30 * 864e5
  ];
  const step = steps.find((s) => s >= target) ?? steps[steps.length - 1];
  const start = Math.ceil(minMs / step) * step;
  const ticks = [];
  const guard = Math.max(2, Math.min(2048, Math.ceil((maxMs - start) / step) + 3));
  for (let i = 0; i < guard; i++) {
    const t = start + i * step;
    if (t > maxMs + step * 0.25) break;
    ticks.push(t);
  }
  return ticks;
}
function formatTimeTick(ms, spanMs) {
  try {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return String(ms);
    if (spanMs <= 2 * 6e4) return EURO_DATE_TIME_SECONDS.format(d);
    if (spanMs <= 2 * 864e5) return EURO_DATE_TIME.format(d);
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
  formatTwoDecimalsLocal,
  niceNum,
  niceLinearTicks,
  niceTimeTicks,
  formatTimeTick,
  formatTimeTooltip
};
//# sourceMappingURL=chunk-NRFZ3NBE.js.map
