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

export async function fetchSampleETTm2(): Promise<File> {
  const res = await fetch(`${API_BASE}/sample/ETTm2.csv`);
  if (!res.ok) throw new Error(`Failed to fetch ETTm2.csv: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], 'ETTm2.csv', { type: 'text/csv' });
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