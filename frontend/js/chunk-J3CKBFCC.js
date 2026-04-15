import {
  DEBUG,
  dbg
} from "./chunk-44BHGKBD.js";

// frontend/src/dataClient.ts
var tableFromIPCFn = null;
async function ensureArrowParser() {
  if (tableFromIPCFn) return tableFromIPCFn;
  try {
    const arrow = await import("https://esm.sh/apache-arrow@16.0.0?bundle");
    if (!arrow?.tableFromIPC) {
      throw new Error("Apache Arrow module loaded but tableFromIPC is missing.");
    }
    tableFromIPCFn = arrow.tableFromIPC;
    return tableFromIPCFn;
  } catch (e) {
    throw new Error(`Failed to load Apache Arrow parser: ${e.message}`);
  }
}
async function fetchMetadata() {
  const res = await fetch("/api/metadata");
  if (!res.ok) throw new Error("Metadata check failed");
  return await res.json();
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
  const res = await fetch(url, signal ? { signal } : void 0);
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
    if (abs >= 1e12) return numericValue;
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
async function fetchAggregate(start, end, columns = "value", buckets = 50, agg = "mean", format = "json") {
  const params = new URLSearchParams({ start, end, columns, buckets: String(buckets), agg, format });
  const url = `/api/aggregate?${params.toString()}`;
  dbg("GET (aggregate)", url);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Aggregate fetch failed (${res.status}) ${text}`);
  }
  if (format === "arrow") {
    const tableFromIPC = await ensureArrowParser();
    const buffer = await res.arrayBuffer();
    return tableFromIPC(buffer);
  }
  return res.json();
}
async function fetchScatterPoints(x, y, limit = 1e6, color = null, options = null) {
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
  dbg("POST (scatter points)", { url, payload });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scatter points fetch failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function fetchScatterCorrelations(base, threshold = 0.7) {
  const params = new URLSearchParams({ threshold: String(threshold) });
  if (base !== null && base !== void 0 && String(base).trim() !== "") {
    params.set("base", String(base));
  }
  const url = `/api/scatter/correlations?${params.toString()}`;
  dbg("GET (scatter correlations)", url);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scatter correlations fetch failed (${res.status}) ${text}`);
  }
  return res.json();
}
async function fetchDistributions(columns, context = {}) {
  const body = {
    columns: Array.isArray(columns) ? columns : [columns]
  };
  if (Number.isFinite(context?.start)) body.start = context.start;
  if (Number.isFinite(context?.end)) body.end = context.end;
  if (Array.isArray(context?.filters) && context.filters.length > 0) body.filters = context.filters;
  if (Array.isArray(context?.lineFilters) && context.lineFilters.length > 0) body.line_filters = context.lineFilters;
  const url = "/api/scatter/distributions";
  dbg("POST (distributions)", { url, columns: body.columns.length });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Distributions fetch failed (${res.status}) ${text}`);
  }
  return res.json();
}

export {
  fetchMetadata,
  fetchData,
  fetchAggregate,
  fetchScatterPoints,
  fetchScatterCorrelations,
  fetchDistributions
};
//# sourceMappingURL=chunk-J3CKBFCC.js.map
