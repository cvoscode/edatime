const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Arrow.dom.DnJpT_aJ.js","assets/serialization.B92cbl4P.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from './index.C65iRSEf.js';

const API_BASE = "/api";
async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function uploadPreview(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/upload/preview`, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Preview failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function uploadIngest(file, options) {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.columns) formData.append("columns", options.columns.join(","));
  if (options?.max_rows != null) formData.append("n_rows", String(options.max_rows));
  if (options?.skip_rows != null) formData.append("skip_rows", String(options.skip_rows));
  if (options?.time_start) formData.append("time_start", options.time_start);
  if (options?.time_end) formData.append("time_end", options.time_end);
  if (options?.time_column) formData.append("time_column", options.time_column);
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ingest failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function fetchMetadata() {
  return getJson(`${API_BASE}/metadata`);
}
async function fetchRollingBands(start, end, columns, window = 50) {
  const params = new URLSearchParams({ start, end, columns, window: String(window) });
  return getJson(`${API_BASE}/analytics/rolling?${params.toString()}`);
}
async function fetchAnomalies(start, end, columns, method = "zscore", threshold) {
  const params = new URLSearchParams({ start, end, columns, method });
  if (threshold !== void 0) params.set("threshold", String(threshold));
  return getJson(`${API_BASE}/analytics/anomalies?${params.toString()}`);
}
async function fetchFft(start, end, columns, maxPoints = 8192) {
  const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
  return getJson(`${API_BASE}/analytics/fft?${params.toString()}`);
}
async function fetchSpectrogram(start, end, column, windowSize = 256, hopSize, maxPoints = 32768, signal) {
  const params = new URLSearchParams({
    start,
    end,
    column,
    window_size: String(windowSize),
    max_points: String(maxPoints)
  });
  if (hopSize != null) params.set("hop_size", String(hopSize));
  return getJson(`${API_BASE}/analytics/spectrogram?${params.toString()}`);
}
async function fetchSampleETTm2() {
  const res = await fetch(`${API_BASE}/sample/ETTm2.csv`);
  if (!res.ok) throw new Error(`Failed to fetch ETTm2.csv: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], "ETTm2.csv", { type: "text/csv" });
}
async function fetchCorrelationMatrix() {
  return getJson(`${API_BASE}/scatter/correlations/matrix`);
}
async function fetchScatterCorrelations(base, threshold = 0.7) {
  const params = new URLSearchParams({ threshold: String(threshold) });
  if (base !== null && base !== void 0 && String(base).trim() !== "") {
    params.set("base", String(base));
  }
  return getJson(`${API_BASE}/scatter/correlations?${params.toString()}`);
}
async function fetchScatterPoints(x, y, limit, color, options, signal) {
  const payload = {
    x: String(x),
    y: String(y),
    limit: Number(limit)
  };
  if (color !== null && color !== void 0 && String(color).trim() !== "") {
    payload.color = String(color);
  }
  const start = Number(options?.start);
  const end = Number(options?.end);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    payload.start = start;
    payload.end = end;
  }
  if (Array.isArray(options?.filters) && options.filters.length > 0) {
    payload.filters = JSON.stringify(options.filters);
  }
  if (Array.isArray(options?.line_filters) && options.line_filters.length > 0) {
    payload.line_filters = JSON.stringify(options.line_filters);
  }
  const res = await fetch(`${API_BASE}/scatter/points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
  if (!res.ok) {
    throw new Error(`Scatter points failed (${res.status})`);
  }
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.includes("apache-arrow") || ct.includes("arrow.stream")) {
    const { tableFromIPC } = await __vitePreload(async () => { const { tableFromIPC } = await import('./Arrow.dom.DnJpT_aJ.js');return { tableFromIPC }},true              ?__vite__mapDeps([0,1]):void 0);
    const buffer = await res.arrayBuffer();
    const table = tableFromIPC(buffer);
    const xCol = table.getChild("x");
    const yCol = table.getChild("y");
    const colorCol = table.getChild("color_value") ?? table.getChild("color_label");
    const n = table.numRows;
    const points = new Array(n);
    const color_values = colorCol && table.getChild("color_value") ? [] : null;
    const color_labels = table.getChild("color_label") ? [] : null;
    for (let i = 0; i < n; i++) {
      points[i] = [xCol?.get(i), yCol?.get(i)];
      if (color_values) color_values.push(colorCol.get(i));
      if (color_labels) color_labels.push(colorCol.get(i));
    }
    const total = Number(res.headers.get("x-edatime-scatter-total") ?? n);
    const returned = Number(res.headers.get("x-edatime-scatter-returned") ?? n);
    const color_min = res.headers.get("x-edatime-color-min");
    const color_max = res.headers.get("x-edatime-color-max");
    return {
      x,
      y,
      color: color ?? null,
      total_points: total,
      returned_points: returned,
      points,
      color_values,
      color_labels,
      color_min: color_min !== null ? Number(color_min) : null,
      color_max: color_max !== null ? Number(color_max) : null
    };
  }
  return res.json();
}

export { fetchRollingBands as a, fetchSampleETTm2 as b, uploadIngest as c, fetchMetadata as d, fetchCorrelationMatrix as e, fetchAnomalies as f, fetchScatterCorrelations as g, fetchScatterPoints as h, fetchSpectrogram as i, fetchFft as j, uploadPreview as u };
//# sourceMappingURL=api.CIKlHxkp.js.map
