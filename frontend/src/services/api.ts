const API_BASE = '/api';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res.json() as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res.json() as T;
}

export interface ColumnMetadata {
  name: string;
  dtype: string;
}

export interface TimeRange {
  min: number;
  max: number;
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  non_null_count: number;
  null_count: number;
  min: number | null;
  max: number | null;
  histogram: Histogram | null;
}

export interface Histogram {
  bins: number[];
  counts: number[];
}

export interface DatasetMetadata {
  revision: number;
  total_rows: number;
  columns: ColumnMetadata[];
  numeric_columns: string[];
  time_column: string | null;
  time_range: TimeRange | null;
  column_profiles: ColumnProfile[];
}

export interface PreviewResponse {
  status: 'ok' | string;
  metadata: DatasetMetadata;
}

export interface IngestResponse {
  status: 'ok' | 'error' | 'success' | string;
  row_count?: number;
  rows?: number;
  columns: string[];
  numeric_columns: string[];
  timestamp_column: string;
}

export async function uploadPreview(file: File): Promise<PreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upload/preview`, { method: 'POST', body: formData });
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
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest failed (${res.status}) ${text}`);
  }
  return res.json() as Promise<IngestResponse>;
}

export interface DbTablesResponse {
  tables: string[];
}

export async function dbConnect(connectionString: string): Promise<{ status: string }> {
  return postJson(`${API_BASE}/database/connect`, { connection_string: connectionString });
}

export async function dbTables(): Promise<DbTablesResponse> {
  return getJson<DbTablesResponse>(`${API_BASE}/database/tables`);
}

export async function dbLoad(
  table: string,
  options?: {
    max_rows?: number;
    time_start?: string;
    time_end?: string;
    time_column?: string;
  }
): Promise<IngestResponse> {
  const body: Record<string, unknown> = { table };
  if (options?.max_rows != null) body.max_rows = options.max_rows;
  if (options?.time_start) body.time_start = options.time_start;
  if (options?.time_end) body.time_end = options.time_end;
  if (options?.time_column) body.time_column = options.time_column;
  return postJson(`${API_BASE}/database/load`, body);
}

export async function dbDisconnect(): Promise<{ status: string }> {
  return postJson(`${API_BASE}/database/disconnect`, {});
}

export interface MetadataResponse {
  revision: number;
  total_rows: number;
  columns: ColumnMetadata[];
  numeric_columns: string[];
  time_column: string | null;
  time_range: TimeRange | null;
  column_profiles: ColumnProfile[];
}

export async function fetchMetadata(): Promise<MetadataResponse> {
  return getJson<MetadataResponse>(`${API_BASE}/metadata`);
}

export interface TimeseriesRangeResponse {
  ts_range: [number, number];
}

export async function fetchTimeseriesRange(): Promise<TimeseriesRangeResponse> {
  return getJson<TimeseriesRangeResponse>(`${API_BASE}/timeseries/range`);
}

export interface RollingBand {
  column: string;
  ts: number[];
  mean: (number | null)[];
  upper1: (number | null)[];
  lower1: (number | null)[];
  upper2: (number | null)[];
  lower2: (number | null)[];
}

export interface RollingResponse {
  bands: RollingBand[];
}

export async function fetchRollingBands(
  start: string,
  end: string,
  columns: string,
  window = 50
): Promise<RollingResponse> {
  const params = new URLSearchParams({ start, end, columns, window: String(window) });
  return getJson<RollingResponse>(`${API_BASE}/analytics/rolling?${params.toString()}`);
}

export interface AnomalyRegion {
  column: string;
  method: string;
  start_ms: number;
  end_ms: number;
  score: number;
}

export interface AnomalyResponse {
  method: string;
  threshold: number;
  regions: AnomalyRegion[];
}

export async function fetchAnomalies(
  start: string,
  end: string,
  columns: string,
  method = 'zscore',
  threshold?: number
): Promise<AnomalyResponse> {
  const params = new URLSearchParams({ start, end, columns, method });
  if (threshold !== undefined) params.set('threshold', String(threshold));
  return getJson<AnomalyResponse>(`${API_BASE}/analytics/anomalies?${params.toString()}`);
}

export interface FftResult {
  column: string;
  frequencies: number[];
  magnitudes: number[];
  psd: number[];
}

export interface FftResponse {
  sample_count: number;
  results: FftResult[];
}

export async function fetchFft(
  start: string,
  end: string,
  columns: string,
  maxPoints = 8192
): Promise<FftResponse> {
  const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
  return getJson<FftResponse>(`${API_BASE}/analytics/fft?${params.toString()}`);
}

export interface SpectrogramResponse {
  sample_count: number;
  result: {
    times_ms: number[];
    frequencies: number[];
    magnitudes: number[][];
  };
}

export async function fetchSpectrogram(
  start: string,
  end: string,
  column: string,
  windowSize = 256,
  hopSize?: number,
  maxPoints = 32768,
  signal?: AbortSignal
): Promise<SpectrogramResponse> {
  const params = new URLSearchParams({
    start, end, column,
    window_size: String(windowSize),
    max_points: String(maxPoints),
  });
  if (hopSize != null) params.set('hop_size', String(hopSize));
  return getJson<SpectrogramResponse>(`${API_BASE}/analytics/spectrogram?${params.toString()}`);
}

// In-memory cache for sample datasets to avoid re-fetching
const _sampleFileCache: Record<string, File> = {};

// Lightweight metadata for cached sample datasets (avoids re-parsing)
interface CachedSampleMetadata {
  metadata: PreviewResponse['metadata'];
  file: File;
}

const _sampleMetadataCache: Record<string, CachedSampleMetadata | null> = {};

export async function fetchSampleETTm2(useParquet = false): Promise<File> {
  const cacheKey = useParquet ? 'ettm2-parquet' : 'ettm2-csv';

  // Return cached file if available
  if (_sampleFileCache[cacheKey]) {
    return _sampleFileCache[cacheKey];
  }

  const filename = useParquet ? 'ETTm2.parquet' : 'ETTm2.csv';
  const res = await fetch(`${API_BASE}/sample/${filename}`);
  if (!res.ok) {
    // Fallback to CSV if parquet not available
    if (res.status === 404 && useParquet) {
      const fallbackRes = await fetch(`${API_BASE}/sample/ETTm2.csv`);
      if (!fallbackRes.ok) throw new Error(`Failed to fetch ETTm2 sample: ${fallbackRes.status}`);
      const blob = await fallbackRes.blob();
      const file = new File([blob], 'ETTm2.csv', { type: 'text/csv' });
      _sampleFileCache['ettm2-csv'] = file;
      _sampleFileCache['ettm2-parquet'] = file; // avoid re-fetch attempt
      return file;
    }
    throw new Error(`Failed to fetch ETTm2 sample: ${res.status}`);
  }
  const blob = await res.blob();
  const file = new File([blob], filename, { type: useParquet ? 'application/octet-stream' : 'text/csv' });
  _sampleFileCache[cacheKey] = file;
  return file;
}

export function clearSampleCache() {
  Object.keys(_sampleFileCache).forEach(k => delete _sampleFileCache[k]);
}

export async function ingestFile(
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
  return uploadIngest(file, options);
}

export interface CorrelationMatrixResponse {
  columns: string[];
  pearson: (number | null)[][];
  spearman: (number | null)[][];
}

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
  return getJson<CorrelationMatrixResponse>(`${API_BASE}/scatter/correlations/matrix`);
}

export interface ScatterCorrelationsResponse {
  base_column: string;
  threshold: number;
  correlations: Array<{
    column: string;
    count: number;
    pearson: number | null;
    spearman: number | null;
  }>;
}

export async function fetchScatterCorrelations(
  base: string | null,
  threshold = 0.7
): Promise<ScatterCorrelationsResponse> {
  const params = new URLSearchParams({ threshold: String(threshold) });
  if (base !== null && base !== undefined && String(base).trim() !== '') {
    params.set('base', String(base));
  }
  return getJson<ScatterCorrelationsResponse>(`${API_BASE}/scatter/correlations?${params.toString()}`);
}

export interface ScatterPointsResponse {
  x: string;
  y: string;
  color: string | null;
  total_points: number;
  returned_points: number;
  points: [number, number][];
  color_values: number[] | null;
  color_labels: (string | null)[] | null;
  color_min: number | null;
  color_max: number | null;
}

export async function fetchScatterPoints(
  x: string,
  y: string,
  limit: number,
  color?: string | null,
  options?: {
    start?: number;
    end?: number;
    filters?: Array<{ column: string; min: number; max: number }>;
    line_filters?: Array<{ column: string; op: string; value: number }>;
  },
  signal?: AbortSignal
): Promise<ScatterPointsResponse> {
  const payload: Record<string, unknown> = {
    x: String(x),
    y: String(y),
    limit: Number(limit),
  };
  if (color !== null && color !== undefined && String(color).trim() !== '') {
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Scatter points failed (${res.status})`);
  }

  const ct = res.headers.get('Content-Type') ?? '';
  if (ct.includes('apache-arrow') || ct.includes('arrow.stream')) {
    const { tableFromIPC } = await import('apache-arrow');
    const buffer = await res.arrayBuffer();
    const table = tableFromIPC(buffer);

    const xCol = table.getChild('x');
    const yCol = table.getChild('y');
    const colorCol = table.getChild('color_value') ?? table.getChild('color_label');

    const n = table.numRows;
    const points: [number, number][] = new Array(n);
    const color_values: number[] | null = colorCol && table.getChild('color_value') ? [] : null;
    const color_labels: (string | null)[] | null = table.getChild('color_label') ? [] : null;

    for (let i = 0; i < n; i++) {
      points[i] = [xCol?.get(i) as number, yCol?.get(i) as number];
      if (color_values) color_values.push((colorCol as unknown as { get(i: number): number }).get(i));
      if (color_labels) color_labels.push((colorCol as unknown as { get(i: number): string | null }).get(i));
    }

    const total = Number(res.headers.get('x-edatime-scatter-total') ?? n);
    const returned = Number(res.headers.get('x-edatime-scatter-returned') ?? n);
    const color_min = res.headers.get('x-edatime-color-min');
    const color_max = res.headers.get('x-edatime-color-max');

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
      color_max: color_max !== null ? Number(color_max) : null,
    };
  }

  return res.json() as Promise<ScatterPointsResponse>;
}