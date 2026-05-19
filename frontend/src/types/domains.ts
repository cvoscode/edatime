/**
 * Phase 7.1: Domain Types
 *
 * Discriminated union types for each analytics domain.
 * Each domain is tagged with a `kind` field for exhaustive matching.
 */

import type {
  ChartViewport,
  FilteredDataObject,
  RollingBandData,
  AnomalyRegionData,
  FftResult,
  SpectrogramResult,
  DriftConfig,
  CausalConfig,
  // Re-use scatter store state shape
} from './index';

// =============================================================================
// Timeseries Domain
// =============================================================================

export interface TimeseriesConfig {
  viewport: ChartViewport;
  selectedColumns: string[];
  colorColumn: string | null;
}

export interface TimeseriesData {
  filtered: FilteredDataObject;
  isDownsampled: boolean;
}

export interface TimeseriesFilterParams {
  start: number;
  end: number;
  columns?: string[];
  colorColumn?: string | null;
}

export interface TimeseriesDomain {
  kind: 'timeseries';
  config: TimeseriesConfig;
  data: TimeseriesData | null;
  filterParams: TimeseriesFilterParams | null;
}

// =============================================================================
// Scatter Domain
// =============================================================================

export interface ScatterConfig {
  xCol: string;
  yCol: string;
  colorCol: string;
  sizeCol: string;
}

export interface ScatterData {
  points: [number, number][];
  totalPoints: number;
  returnedPoints: number;
  colorValues: number[] | null;
  colorLabels: (string | null)[] | null;
  colorMin: number | null;
  colorMax: number | null;
  sizeValues: number[] | null;
  sizeMin: number | null;
  sizeMax: number | null;
}

export interface ScatterFilterParams {
  xCol: string;
  yCol: string;
  start?: number;
  end?: number;
  limit: number;
  color?: string | null;
  size?: string | null;
  filters?: Array<{ column: string; min: number; max: number }>;
  line_filters?: Array<{ column: string; op: string; value: number }>;
}

export interface ScatterDomain {
  kind: 'scatter';
  config: ScatterConfig;
  data: ScatterData | null;
  filterParams: ScatterFilterParams | null;
}

// =============================================================================
// FFT Domain
// =============================================================================

export interface FftConfig {
  mode: 'magnitude' | 'psd';
  logScale: boolean;
  windowSize: number;
}

export interface FftData {
  results: FftResult[];
  sampleCount: number;
}

export interface FftFilterParams {
  start: string;
  end: string;
  columns: string;
  maxPoints?: number;
}

export interface FftDomain {
  kind: 'fft';
  config: FftConfig;
  data: FftData | null;
  filterParams: FftFilterParams | null;
}

// =============================================================================
// Spectrogram Domain
// =============================================================================

export interface SpectrogramDomain {
  kind: 'spectrogram';
  config: {
    windowSize: number;
    hopSize: number;
    column: string;
  };
  data: SpectrogramResult | null;
  filterParams: {
    start: string;
    end: string;
    column: string;
    windowSize: number;
    hopSize?: number;
    maxPoints?: number;
  } | null;
}

// =============================================================================
// Heatmap Domain
// =============================================================================

export interface HeatmapConfig {
  columns: string[];
  windowSize: number;
  method: 'correlation' | 'covariance';
}

export interface HeatmapData {
  matrix: number[][];
  columns: string[];
}

export interface HeatmapFilterParams {
  start?: string;
  end?: string;
  columns: string[];
  windowSize: number;
}

export interface HeatmapDomain {
  kind: 'heatmap';
  config: HeatmapConfig;
  data: HeatmapData | null;
  filterParams: HeatmapFilterParams | null;
}

// =============================================================================
// Drift Domain
// =============================================================================

export interface DriftDomain {
  kind: 'drift';
  config: DriftConfig;
  data: {
    referenceStats: Record<string, { mean: number; std: number }>;
    testStats: Record<string, { mean: number; std: number }>;
    driftScores: Record<string, number>;
  } | null;
  filterParams: {
    referenceWindow: [number, number];
    testWindow: [number, number];
    method: 'kl' | 'wasserstein' | 'psi';
  } | null;
}

// =============================================================================
// Causal Domain
// =============================================================================

export interface CausalDomain {
  kind: 'causal';
  config: CausalConfig;
  data: {
    edges: Array<{ source: string; target: string; strength: number }>;
    lagMatrix: number[][];
  } | null;
  filterParams: {
    columns: string[];
    maxLags: number;
    significanceThreshold: number;
  } | null;
}

// =============================================================================
// Union type
// =============================================================================

export type Domain =
  | TimeseriesDomain
  | ScatterDomain
  | FftDomain
  | SpectrogramDomain
  | HeatmapDomain
  | DriftDomain
  | CausalDomain;

// =============================================================================
// Domain helpers
// =============================================================================

export type DomainKind = Domain['kind'];

export function isTimeseries(d: Domain): d is TimeseriesDomain {
  return d.kind === 'timeseries';
}

export function isScatter(d: Domain): d is ScatterDomain {
  return d.kind === 'scatter';
}

export function isFft(d: Domain): d is FftDomain {
  return d.kind === 'fft';
}

export function isSpectrogram(d: Domain): d is SpectrogramDomain {
  return d.kind === 'spectrogram';
}

export function isHeatmap(d: Domain): d is HeatmapDomain {
  return d.kind === 'heatmap';
}

export function isDrift(d: Domain): d is DriftDomain {
  return d.kind === 'drift';
}

export function isCausal(d: Domain): d is CausalDomain {
  return d.kind === 'causal';
}