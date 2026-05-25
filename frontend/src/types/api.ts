/**
 * API request/response types
 *
 * Centralized API-level types that mirror the backend contracts.
 * These types are used by services/api.ts and dataFetch.ts.
 *
 * NOTE: Shared chart/domain types (ToastMessage, RollingBandData,
 * AnomalyRegionData, ZoomState, Drawing, etc.) live in domains.ts.
 * Only API-specific shapes belong here.
 */

import type { ChartViewport, TimeRange } from './domains';

// Re-export FftTrace from domains to avoid duplicate export conflicts
export type { FftTrace } from './domains';

// =============================================================================
// Dataset Metadata
// =============================================================================

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
// Chart State — API-specific shapes
// (These differ from domains.ts counterparts in structure)
// =============================================================================

/**
 * Rich annotation with type, color, and time range.
 * Differs from domains.ts Annotation which is a simple {id, text, x, y} marker.
 */
export interface Annotation {
  id: string;
  type: 'bookmark' | 'note' | 'region';
  title: string;
  color: string;
  timeRange: { start: number; end: number };
}

/**
 * Method-based chart instance interface for API consumers.
 * Differs from domains.ts ChartInstance which is an opaque record.
 */
export interface ChartInstance {
  initialize(): void;
  setData(data: ApiFilteredDataObject): void;
  setViewport(viewport: ChartViewport): void;
  dispose(): void;
  exportPNG(): Promise<Blob>;
  exportSVG(): Promise<string>;
}

/**
 * API-level filtered data object using named series records.
 * Differs from domains.ts FilteredDataObject which uses Float64Array-based series.
 */
export interface ApiFilteredDataObject {
  series: Record<string, ApiSeriesData>;
  tsRange: [number, number];
  rowCount: number;
}

/**
 * API-level series data with ts/values Float64Arrays.
 * Differs from domains.ts SeriesData which uses {name, color, visible, data[]}.
 */
export interface ApiSeriesData {
  ts: Float64Array;
  values: Float64Array;
  color?: string;
}

/**
 * Pointer-based drag state for chart interactions.
 * Differs from domains.ts DragState which uses a mode-based state.
 */
export interface DragState {
  pointerId: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

// =============================================================================
// Scatter API Response Types
// =============================================================================

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

// FftResult and FftTrace are re-exported from domains.ts

// =============================================================================
// Misc chart types
// =============================================================================

export interface SpectralConfig {
  fftSize: number;
  overlap: number;
  windowFn: 'hann' | 'hamming' | 'blackman';
}

export type Theme = 'dark' | 'light' | 'system';