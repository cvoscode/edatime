// services/api/types.ts
// All TypeScript request/response interfaces for the API

import type { AdaptiveLineFilter } from '../../types';

// =============================================================================
// Metadata types
// =============================================================================

export interface ColumnMetadata {
  name: string;
  dtype: string;
}

export interface TimeRange {
  min: number;
  max: number;
}

export interface Histogram {
  bins: number[];
  counts: number[];
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

export interface DatasetMetadata {
  revision: number;
  total_rows: number;
  columns: ColumnMetadata[];
  numeric_columns: string[];
  time_column: string | null;
  time_range: TimeRange | null;
  column_profiles: ColumnProfile[];
}

export interface MetadataResponse extends DatasetMetadata {
  status: 'ok';
}

// =============================================================================
// Upload types
// =============================================================================

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

// =============================================================================
// Database types
// =============================================================================

export interface DbTablesResponse {
  status: 'ok';
  tables: string[];
}

// =============================================================================
// Timeseries types
// =============================================================================

export interface TimeseriesRangeResponse {
  status: 'ok';
  ts_range: [number, number];
}

export interface TimeseriesRequest {
  start: string;
  end: string;
  width: number;
  columns: string[];
  xAxisColumn?: string;
  colorColumn?: string | null;
  signal?: AbortSignal;
}

export interface ArrowResponse {
  xValues: Float64Array;
  series: Record<string, Float64Array>;
  returnedRows: number;
  downsampled: boolean;
  colorByColumn?: Record<string, Float64Array>;
}

// =============================================================================
// Scatter types
// =============================================================================

export interface ScatterPointsResponse {
  status: 'ok';
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
  size_values: number[] | null;
  size_min: number | null;
  size_max: number | null;
}

export interface ScatterRequest {
  x: string;
  y: string;
  limit: number;
  color?: string | null;
  size?: string | null;
  options?: {
    start?: number;
    end?: number;
    filters?: Array<{ column: string; min: number; max: number }>;
    line_filters?: Array<{ column: string; op: string; value: number }>;
  };
  signal?: AbortSignal;
}

export interface CorrelationsResponse {
  status: 'ok';
  base_column: string;
  threshold: number;
  numeric_columns: string[];
  correlations: Array<{
    column: string;
    count: number;
    pearson: number | null;
    spearman: number | null;
  }>;
  suggestions?: Array<{ x: string; y: string; correlation: number }>;
}

export interface CorrelationMatrixResponse {
  status: 'ok';
  columns: string[];
  pearson: (number | null)[][];
  spearman: (number | null)[][];
}

// =============================================================================
// Analytics types
// =============================================================================

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
  status: 'ok';
  bands: RollingBand[];
}

export interface RollingRequest {
  start: string;
  end: string;
  columns: string;
  window?: number;
}

export interface AnomalyRegion {
  column: string;
  method: string;
  start_ms: number;
  end_ms: number;
  score: number;
}

export interface AnomalyResponse {
  status: 'ok';
  method: string;
  threshold: number;
  regions: AnomalyRegion[];
}

export interface AnomalyRequest {
  start: string;
  end: string;
  columns: string;
  method?: string;
  threshold?: number;
}

export interface FftResult {
  column: string;
  frequencies: number[];
  magnitudes: number[];
  psd: number[];
}

export interface FftResponse {
  status: 'ok';
  sample_count: number;
  results: FftResult[];
}

export interface FftRequest {
  start: string;
  end: string;
  columns: string;
  maxPoints?: number;
}

export interface SpectrogramResponse {
  status: 'ok';
  sample_count: number;
  result: {
    times_ms: number[];
    frequencies: number[];
    magnitudes: number[][];
  };
}

export interface SpectrogramRequest {
  start: string;
  end: string;
  column: string;
  windowSize?: number;
  hopSize?: number;
  maxPoints?: number;
}