import {
  DEBUG,
  dbg
} from "./chunk-P2MGEQ7G.js";

// frontend/src/dataClient.ts
var tableFromIPCFn = null;
async function ensureArrowParser() {
  if (tableFromIPCFn) return tableFromIPCFn;
  try {
    const arrow = await import("./Arrow.dom-W4CKWPGY.js");
    if (!arrow?.tableFromIPC) {
      throw new Error("Apache Arrow module loaded but tableFromIPC is missing.");
    }
    tableFromIPCFn = arrow.tableFromIPC;
    return tableFromIPCFn;
  } catch (e) {
    throw new Error(`Failed to load Apache Arrow parser: ${e.message}`);
  }
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function assertDatasetMetadata(data) {
  if (!isObject(data)) throw new Error("Metadata response is not an object");
  if (typeof data.total_rows !== "number") throw new Error("Metadata missing total_rows");
  if (!Array.isArray(data.columns)) throw new Error("Metadata missing columns array");
  if (!Array.isArray(data.numeric_columns)) throw new Error("Metadata missing numeric_columns");
}
function assertScatterPoints(data) {
  if (!isObject(data)) throw new Error("Scatter points response is not an object");
  if (typeof data.x !== "string") throw new Error("Scatter response missing x column name");
  if (typeof data.y !== "string") throw new Error("Scatter response missing y column name");
  if (!Array.isArray(data.points)) throw new Error("Scatter response missing points array");
}
function assertScatterCorrelations(data) {
  if (!isObject(data)) throw new Error("Correlations response is not an object");
  if (!Array.isArray(data.correlations)) throw new Error("Correlations response missing correlations array");
}
async function getJson(url, label, signal) {
  dbg(`GET (${label})`, url);
  const res = await fetch(url, signal ? { signal, cache: "no-store" } : { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function postJson(url, body, label, signal) {
  dbg(`POST (${label})`, { url, body });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function fetchMetadata() {
  const data = await getJson("/api/metadata", "Metadata");
  assertDatasetMetadata(data);
  return data;
}
async function fetchData(start, end, width, columns = "value", colorColumn = null, signal) {
  const params = new URLSearchParams({
    start,
    end,
    width: String(width),
    columns
  });
  if (colorColumn) params.set("color_column", colorColumn);
  const tableFromIPC = await ensureArrowParser();
  const url = `/api/data?${params.toString()}`;
  dbg("GET", url);
  const res = await fetch(url, signal ? { signal, cache: "no-store" } : { cache: "no-store" });
  if (DEBUG) {
    dbg("status", res.status, res.statusText);
    dbg("content-type", res.headers.get("content-type"));
    dbg("content-length", res.headers.get("content-length"));
  }
  const downsampledHeader = res.headers.get("x-edatime-downsampled");
  const returnedRowsHeader = res.headers.get("x-edatime-returned-rows");
  const targetPointsHeader = res.headers.get("x-edatime-target-points");
  const hasDownsampleHeader = downsampledHeader === "0" || downsampledHeader === "1";
  let isDownsampled = downsampledHeader === "1";
  const returnedRows = Number.parseInt(returnedRowsHeader ?? "", 10);
  const targetPoints = Number.parseInt(targetPointsHeader ?? "", 10);
  if (DEBUG) {
    dbg("x-edatime-downsampled", downsampledHeader);
    dbg("x-edatime-returned-rows", returnedRowsHeader);
    dbg("x-edatime-target-points", targetPointsHeader);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Data fetch failed (${res.status}) ${text}`);
  }
  const buffer = await res.arrayBuffer();
  if (DEBUG) {
    dbg("arrow bytes", buffer.byteLength);
  }
  const table = tableFromIPC(buffer);
  if (DEBUG) {
    try {
      const fields = table.schema?.fields?.map((f) => `${f?.name}:${String(f?.type)}`) ?? [];
      dbg("arrow schema", fields);
      dbg("rows", table.numRows);
    } catch {
    }
  }
  const tsCol = table.getChild("ts");
  if (!tsCol) throw new Error("No timestamp column found");
  const len = table.numRows;
  const tsArray = new Float64Array(len);
  function toEpochMs(value) {
    if (value instanceof Date) return value.getTime();
    const numericValue = typeof value === "bigint" ? Number(value) : Number(value);
    const abs = Math.abs(numericValue);
    if (abs >= 1e17) return numericValue / 1e6;
    if (abs >= 1e14) return numericValue / 1e3;
    if (abs >= 1e11) return numericValue;
    return numericValue * 1e3;
  }
  for (let i = 0; i < len; i++) {
    tsArray[i] = toEpochMs(tsCol.get(i));
  }
  if (DEBUG && len > 0) {
    dbg("ts epoch-ms first/last", tsArray[0], tsArray[len - 1]);
  }
  if (!hasDownsampleHeader) {
    isDownsampled = len >= width * 2;
  }
  const dataObj = {
    ts: tsArray,
    values: {},
    color: null,
    color_column: null,
    _meta: {
      downsampled: isDownsampled,
      downsampleKnown: hasDownsampleHeader,
      returnedRows: Number.isFinite(returnedRows) ? returnedRows : len,
      targetPoints: Number.isFinite(targetPoints) ? targetPoints : width * 2
    }
  };
  if (DEBUG) {
    dbg("downsample meta", dataObj._meta);
  }
  const requestedCols = columns.split(",");
  for (const colName of requestedCols) {
    const valCol = table.getChild(colName);
    if (valCol) {
      const valArray = new Float64Array(len);
      for (let i = 0; i < len; i++) {
        valArray[i] = Number(valCol.get(i));
      }
      dataObj.values[colName] = valArray;
    }
  }
  if (colorColumn) {
    const colorCol = table.getChild(colorColumn);
    if (colorCol) {
      dataObj.color_column = colorColumn;
      const colorArray = new Array(len);
      for (let i = 0; i < len; i++) {
        colorArray[i] = colorCol.get(i);
      }
      dataObj.color = colorArray;
    }
  }
  return dataObj;
}
async function fetchScatterPoints(x, y, limit = 1e6, color = null, options = null, signal) {
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
  if (Array.isArray(options?.lineFilters) && options.lineFilters.length > 0) {
    payload.line_filters = JSON.stringify(options.lineFilters);
  }
  const url = "/api/scatter/points";
  const data = await postJson(url, payload, "Scatter points", signal);
  assertScatterPoints(data);
  return data;
}
async function fetchScatterCorrelations(base, threshold = 0.7) {
  const params = new URLSearchParams({ threshold: String(threshold) });
  if (base !== null && base !== void 0 && String(base).trim() !== "") {
    params.set("base", String(base));
  }
  const url = `/api/scatter/correlations?${params.toString()}`;
  const data = await getJson(url, "Scatter correlations");
  assertScatterCorrelations(data);
  return data;
}
async function fetchRollingBands(start, end, columns, window = 50, signal) {
  const params = new URLSearchParams({ start, end, columns, window: String(window) });
  const url = `/api/analytics/rolling?${params.toString()}`;
  return getJson(url, "Rolling bands", signal);
}
async function fetchAnomalies(start, end, columns, method = "zscore", threshold, signal) {
  const params = new URLSearchParams({ start, end, columns, method });
  if (threshold !== void 0) params.set("threshold", String(threshold));
  const url = `/api/analytics/anomalies?${params.toString()}`;
  return getJson(url, "Anomaly detection", signal);
}
async function fetchFft(start, end, columns, maxPoints = 8192, signal) {
  const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
  const url = `/api/analytics/fft?${params.toString()}`;
  return getJson(url, "FFT", signal);
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
  const url = `/api/analytics/spectrogram?${params.toString()}`;
  return getJson(url, "Spectrogram", signal);
}
async function fetchCausalGraph(columns, tauMax = 3, alpha = 0.05, method = "pcmci", maxPoints = 5e3, signal, pcAlpha = 0.2, test = "par_corr", maxCondsDim, fdrMethod = "none") {
  const url = "/api/analytics/causal";
  const body = {
    columns: columns.join(","),
    tau_max: tauMax,
    alpha,
    method,
    max_points: maxPoints,
    pc_alpha: pcAlpha,
    test,
    fdr_method: fdrMethod
  };
  if (maxCondsDim != null) body.max_conds_dim = maxCondsDim;
  return postJson(url, body, "Causal graph", signal);
}
async function postTransform(expression, outputName) {
  const url = "/api/transform";
  return postJson(url, { expression, output_name: outputName }, "Transform");
}
async function fetchCorrelationMatrix() {
  return getJson("/api/scatter/correlations/matrix", "Correlation matrix");
}
async function postRemoveOutliers(columns, method = "zscore", threshold, window) {
  const body = { method };
  if (columns) body.columns = columns.join(",");
  if (threshold !== void 0) body.threshold = threshold;
  if (window !== void 0) body.window = window;
  const url = "/api/analytics/remove_outliers";
  return postJson(url, body, "Outlier removal");
}

export {
  fetchMetadata,
  fetchData,
  fetchScatterPoints,
  fetchScatterCorrelations,
  fetchRollingBands,
  fetchAnomalies,
  fetchFft,
  fetchSpectrogram,
  fetchCausalGraph,
  postTransform,
  fetchCorrelationMatrix,
  postRemoveOutliers
};
//# sourceMappingURL=chunk-M7RFYJA6.js.map
