// services/api/endpoints.ts
// All API endpoint functions using client.ts
// NO SolidJS imports

import type {
  TimeseriesRequest,
  ArrowResponse,
  ScatterRequest,
  ScatterPointsResponse,
  CorrelationsResponse,
  CorrelationMatrixResponse,
  RollingBand,
  RollingRequest,
  AnomalyResponse,
  AnomalyRequest,
  FftRequest,
  FftResponse,
  SpectrogramRequest,
  SpectrogramResponse,
  MetadataResponse,
  PreviewResponse,
  IngestResponse,
  DbTablesResponse,
} from './types';

import { getJson, postJson, buildUrl } from './client';

// =============================================================================
// Metadata API
// =============================================================================

export async function fetchMetadata(): Promise<MetadataResponse> {
  return getJson<MetadataResponse>(buildUrl('/metadata'));
}

export async function fetchTimeseriesRange(): Promise<{ status: 'ok'; ts_range: [number, number] }> {
  return getJson(buildUrl('/timeseries/range'));
}

// =============================================================================
// Timeseries data — returns raw Arrow Response for streaming decode
// =============================================================================

export async function fetchTimeseriesData(params: TimeseriesRequest): Promise<ArrowResponse> {
  const url = buildUrl('/data', {
    start: params.start,
    end: params.end,
    width: params.width,
    columns: params.columns.join(','),
    color_column: params.colorColumn,
  });
  // Returns raw Response — caller handles Arrow decoding
  return getJson(url) as Promise<ArrowResponse>;
}

// =============================================================================
// Analytics API
// =============================================================================

export async function fetchRollingBands(params: RollingRequest): Promise<{ status: 'ok'; bands: RollingBand[] }> {
  return getJson(buildUrl('/analytics/rolling', {
    start: params.start,
    end: params.end,
    columns: params.columns,
    window: params.window,
  }));
}

export async function fetchAnomalies(params: AnomalyRequest): Promise<AnomalyResponse> {
  return getJson(buildUrl('/analytics/anomalies', {
    start: params.start,
    end: params.end,
    columns: params.columns,
    method: params.method,
    threshold: params.threshold,
  }));
}

export async function fetchFftData(params: FftRequest): Promise<FftResponse> {
  return getJson(buildUrl('/analytics/fft', {
    start: params.start,
    end: params.end,
    columns: params.columns,
    max_points: params.maxPoints,
  }));
}

export async function fetchSpectrogram(params: SpectrogramRequest): Promise<SpectrogramResponse> {
  return getJson(buildUrl('/analytics/spectrogram', {
    start: params.start,
    end: params.end,
    column: params.column,
    window_size: params.windowSize,
    hop_size: params.hopSize,
    max_points: params.maxPoints,
  }));
}

// =============================================================================
// Scatter API
// =============================================================================

export async function fetchScatterCorrelations(
  base: string | null,
  threshold = 0.7
): Promise<CorrelationsResponse> {
  return getJson(buildUrl('/scatter/correlations', {
    threshold,
    base: base && String(base).trim() !== '' ? base : undefined,
  }));
}

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
  return getJson(buildUrl('/scatter/correlations/matrix'));
}

export async function fetchScatterPoints(params: ScatterRequest): Promise<ScatterPointsResponse> {
  const payload: Record<string, unknown> = {
    x: String(params.x),
    y: String(params.y),
    limit: Number(params.limit),
  };
  if (params.color !== null && params.color !== undefined && String(params.color).trim() !== '') {
    payload.color = String(params.color);
  }
  if (params.size !== null && params.size !== undefined && String(params.size).trim() !== '') {
    payload.size = String(params.size);
  }
  const start = Number(params.options?.start);
  const end = Number(params.options?.end);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    payload.start = start;
    payload.end = end;
  }
  if (Array.isArray(params.options?.filters) && params.options.filters.length > 0) {
    payload.filters = JSON.stringify(params.options.filters);
  }
  if (Array.isArray(params.options?.line_filters) && params.options.line_filters.length > 0) {
    payload.line_filters = JSON.stringify(params.options.line_filters);
  }

  return postJson<ScatterPointsResponse>(buildUrl('/scatter/points'), payload, params.signal);
}

/**
 * Scatter points via Arrow IPC — returns raw Response for streaming decode.
 * Backend returns application/vnd.apache.arrow.stream with metadata headers:
 *   x-edatime-scatter-total, x-edatime-scatter-returned,
 *   x-edatime-color-min, x-edatime-color-max, x-edatime-scatter-color
 */
export async function fetchScatterPointsArrow(params: ScatterRequest): Promise<Response> {
  const payload: Record<string, unknown> = {
    x: String(params.x),
    y: String(params.y),
    limit: Number(params.limit),
  };
  if (params.color !== null && params.color !== undefined && String(params.color).trim() !== '') {
    payload.color = String(params.color);
  }
  if (params.size !== null && params.size !== undefined && String(params.size).trim() !== '') {
    payload.size = String(params.size);
  }
  const start = Number(params.options?.start);
  const end = Number(params.options?.end);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    payload.start = start;
    payload.end = end;
  }
  if (Array.isArray(params.options?.filters) && params.options.filters.length > 0) {
    payload.filters = JSON.stringify(params.options.filters);
  }
  if (Array.isArray(params.options?.line_filters) && params.options.line_filters.length > 0) {
    payload.line_filters = JSON.stringify(params.options.line_filters);
  }

  const url = buildUrl('/scatter/points');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: params.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res;
}

// =============================================================================
// Upload API
// =============================================================================

export async function uploadPreview(file: File): Promise<PreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(buildUrl('/upload/preview'), { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Preview failed (${res.status}) ${text}`);
  }
  return res.json() as Promise<PreviewResponse>;
}

export async function uploadIngest(
  file: File,
  options?: {
    columns?: string[];
    max_rows?: number;
    skip_rows?: number;
    time_start?: string;
    time_end?: string;
    time_column?: string;
  }
): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.columns) formData.append('columns', options.columns.join(','));
  if (options?.max_rows != null) formData.append('n_rows', String(options.max_rows));
  if (options?.skip_rows != null) formData.append('skip_rows', String(options.skip_rows));
  if (options?.time_start) formData.append('time_start', options.time_start);
  if (options?.time_end) formData.append('time_end', options.time_end);
  if (options?.time_column) formData.append('time_column', options.time_column);
  const res = await fetch(buildUrl('/upload'), { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest failed (${res.status}) ${text}`);
  }
  return res.json() as Promise<IngestResponse>;
}

// =============================================================================
// Database API
// =============================================================================

export async function dbConnect(connectionString: string, schema = 'public'): Promise<{ status: string }> {
  return postJson(buildUrl('/database/connect'), { connection_string: connectionString, schema, load_snapshot: false });
}

export async function dbTables(): Promise<DbTablesResponse> {
  return getJson<DbTablesResponse>(buildUrl('/database/tables'));
}

export async function dbLoad(
  table: string,
  options?: {
    schema?: string;
    max_rows?: number;
    time_start?: string;
    time_end?: string;
    time_column?: string;
  }
): Promise<IngestResponse> {
  const body: Record<string, unknown> = {
    schema: options?.schema ?? 'public',
    table,
    time_column: options?.time_column || null,
    limit: 1_000_000,
  };
  if (options?.max_rows != null) body.max_rows = options.max_rows;
  if (options?.time_start) body.time_start = options.time_start;
  if (options?.time_end) body.time_end = options.time_end;
  return postJson(buildUrl('/database/load'), body);
}

export async function dbDisconnect(): Promise<{ status: string }> {
  return postJson(buildUrl('/database/disconnect'), {});
}

// =============================================================================
// Sample data API
// =============================================================================

// In-memory cache for sample datasets to avoid re-fetching
const _sampleFileCache: Record<string, File> = {};

export async function fetchSampleETTm2(useParquet = false): Promise<File> {
  const cacheKey = useParquet ? 'ettm2-parquet' : 'ettm2-csv';
  if (_sampleFileCache[cacheKey]) {
    return _sampleFileCache[cacheKey];
  }

  const filename = useParquet ? 'ETTm2.parquet' : 'ETTm2.csv';
  const res = await fetch(buildUrl(`/sample/${filename}`));
  if (!res.ok) {
    if (res.status === 404 && useParquet) {
      const fallbackRes = await fetch(buildUrl('/sample/ETTm2.csv'));
      if (!fallbackRes.ok) throw new Error(`Failed to fetch ETTm2 sample: ${fallbackRes.status}`);
      const blob = await fallbackRes.blob();
      const file = new File([blob], 'ETTm2.csv', { type: 'text/csv' });
      _sampleFileCache['ettm2-csv'] = file;
      _sampleFileCache['ettm2-parquet'] = file;
      return file;
    }
    throw new Error(`Failed to fetch ETTm2 sample: ${res.status}`);
  }
  const blob = await res.blob();
  const file = new File([blob], filename, { type: useParquet ? 'application/octet-stream' : 'text/csv' });
  _sampleFileCache[cacheKey] = file;
  return file;
}

export function clearSampleCache(): void {
  Object.keys(_sampleFileCache).forEach(k => delete _sampleFileCache[k]);
}