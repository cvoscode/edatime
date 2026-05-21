/**
 * API request/response types
 *
 * Centralized API-level types that mirror the backend contracts.
 * These types are used by services/api.ts and dataFetch.ts.
 */

import type { ChartViewport, TimeRange } from './domains';

// FftTrace from domains to avoid duplicate export conflicts
export type { FftTrace } from './domains';

// SeriesData is defined later in this file and used by FilteredDataObject
export interface ColumnMetadata {
  name: string;
  dtype: string;
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
  timestampColumn: string | null;
  time_range: TimeRange | null;
  column_profiles: ColumnProfile[];
}

// =============================================================================
// Upload API
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
// Correlation & Scatter
// =============================================================================

export interface CorrelationItem {
  column: string;
  count: number;
  pearson: number | null;
  spearman: number | null;
}

/// Suggestion item from scatter correlations API - explicit x/y column names
export interface SuggestionItem {
  x: string;
  y: string;
  correlation: number;
}

// =============================================================================
// Chart Overlays
// =============================================================================

export interface RollingBandData {
  column: string;
  ts: number[];
  mean: (number | null)[];
  upper1: (number | null)[];
  lower1: (number | null)[];
  upper2: (number | null)[];
  lower2: (number | null)[];
}

export interface AnomalyRegionData {
  column: string;
  method: string;
  start_ms: number;
  end_ms: number;
  score: number;
}

// =============================================================================
// Chart State (shared across stores)
// =============================================================================

export interface ZoomState {
  zoomStack: ChartViewport[];
  currentIndex: number;
}

export interface Annotation {
  id: string;
  type: 'bookmark' | 'note' | 'region';
  title: string;
  color: string;
  timeRange: { start: number; end: number };
}

export interface ChartInstance {
  initialize(): void;
  setData(data: FilteredDataObject): void;
  setViewport(viewport: ChartViewport): void;
  dispose(): void;
  exportPNG(): Promise<Blob>;
  exportSVG(): Promise<string>;
}

export interface FilteredDataObject {
  series: Record<string, SeriesData>;
  tsRange: [number, number];
  rowCount: number;
}

export interface SeriesData {
  ts: Float64Array;
  values: Float64Array;
  color?: string;
}

export interface DragState {
  pointerId: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

export interface Drawing {
  id: string;
  kind: 'arrow' | 'box';
  color: string;
  lineWidth: number;
  points: [number, number][]; // [x,y] in data coordinates
}

// =============================================================================
// Scatter API Response Types
// =============================================================================

export interface CorrelationItem {
  column: string;
  count: number;
  pearson: number | null;
  spearman: number | null;
}

export interface CorrelationMatrixResponse {
  columns: string[];
  pearson: (number | null)[][];
  spearman: (number | null)[][];
}

export interface ScatterCorrelationsResponse {
  base_column: string;
  threshold: number;
  numeric_columns: string[];
  correlations: CorrelationItem[];
  suggestions: CorrelationItem[];
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
  size_values: number[] | null;
  size_min: number | null;
  size_max: number | null;
}

// =============================================================================
// FFT API Response Types
// =============================================================================

export interface FrequencyPeak {
  frequency_hz: number;
  magnitude: number;
  power: number;
  rank: number;
}

// FftResult is re-exported from domains.ts to avoid duplicate export conflicts

// FftTrace is re-exported from domains.ts to avoid duplicate export conflicts

// =============================================================================
// Misc chart types
// =============================================================================

export interface SpectralConfig {
  fftSize: number;
  overlap: number;
  windowFn: 'hann' | 'hamming' | 'blackman';
}

export type Theme = 'dark' | 'light' | 'system';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}