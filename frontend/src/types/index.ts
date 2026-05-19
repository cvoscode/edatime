/**
 * Types index — centralized exports for all domain types.
 *
 * PREFERRED IMPORTS (enforced from Phase 8):
 *   import type { DatasetMetadata } from '../types';      // ✅ from index
 *   import type { DatasetMetadata } from '../types/index'; // ⚠️ deep import (deprecated)
 *   import type { ColumnProfile } from '../types';        // ✅ from index
 *   import type { DataObject } from '../types';           // ✅ from index
 */

// Re-export domain types
export * from './domains';

export interface DatasetMetadata {
  name: string;
  rowCount: number;
  columns: string[];
  numericColumns: string[];
  timestampColumn: string;
  fileSize: number;
  uploadedAt: string;
  timeRange: [number, number] | null;
  revision?: number; // monotonic counter for cache invalidation
}

export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'datetime';
  min?: number;
  max?: number;
  nullCount: number;
  stats?: {
    mean: number;
    std: number;
    p50: number;
    p95: number;
  };
}

export interface DataObject {
  ts: Float64Array;
  values: Record<string, Float64Array>;
}

export interface SeriesData {
  ts: Float64Array;
  values: Float64Array;
  color?: string;
}

export interface FilteredDataObject {
  series: Record<string, SeriesData>;
  tsRange: [number, number];
  rowCount: number;
}

export interface ChartViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ZoomState {
  zoomStack: ChartViewport[];
  currentIndex: number;
}

export interface ChartOverlays {
  rollingBands: RollingBandData[];
  anomalyRegions: AnomalyRegionData[];
}

export interface DragState {
  pointerId: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

export interface ChartInstance {
  initialize(): void;
  setData(data: FilteredDataObject): void;
  setViewport(viewport: ChartViewport): void;
  dispose(): void;
  exportPNG(): Promise<Blob>;
  exportSVG(): Promise<string>;
}

export interface Annotation {
  id: string;
  type: 'bookmark' | 'note' | 'region';
  title: string;
  color: string;
  timeRange: { start: number; end: number };
}

export interface RollingBandConfig {
  column: string;
  window: number;
  stats: ('mean' | 'std' | 'min' | 'max')[];
  color: string;
}

export interface RollingBandData {
  column: string;
  ts: number[];
  mean: (number | null)[];
  upper1: (number | null)[];
  lower1: (number | null)[];
  upper2: (number | null)[];
  lower2: (number | null)[];
}

export interface AnomalyConfig {
  column: string;
  threshold: number;
  method: 'std' | 'iqr';
  color: string;
}

export interface AnomalyRegionData {
  column: string;
  method: string;
  start_ms: number;
  end_ms: number;
  score: number;
}

export interface SpectralConfig {
  fftSize: number;
  overlap: number;
  windowFn: 'hann' | 'hamming' | 'blackman';
}

export interface ScatterConfig {
  xCol: string;
  yCol: string;
  colorCol: string;
  sizeCol: string;
}

export interface DriftConfig {
  referenceWindow: [number, number];
  testWindow: [number, number];
  method: 'kl' | 'wasserstein' | ' psi';
}

export interface CausalConfig {
  columns: string[];
  maxLags: number;
  significanceThreshold: number;
}

export type Theme = 'dark' | 'light' | 'system';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}

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

export interface FrequencyPeak {
  frequency_hz: number;
  magnitude: number;
  power: number;
  rank: number;
}

export interface FftResult {
  column: string;
  frequencies: number[];
  magnitudes: number[];
  psd: number[];
  sample_rate_hz: number;
  nyquist_hz: number;
  dominant_peaks: FrequencyPeak[];
}

export interface FftResponse {
  sample_count: number;
  results: FftResult[];
}

export interface FftTrace {
  column: string;
  frequencies: number[];
  magnitudes: number[];
  psd: number[];
  color: string;
}

export interface FftConfig {
  mode: 'magnitude' | 'psd';
  logScale: boolean;
}

export interface SpectrogramResult {
  column: string;
  time_points: number[];
  freq_points: number[];
  power_matrix: number[][];
}

export interface SpectrogramConfig {
  windowSize: number;
  hopSize: number;
  column: string;
}

// Adaptive line filter types
export interface PendingAdaptivePoint {
  x1: number;
  y1: number;
  x2: number | null;
  y2: number | null;
}

export interface AdaptiveLineFilter {
  id: string;
  column: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  keepAbove: boolean; // true=keep above line, false=keep below
}