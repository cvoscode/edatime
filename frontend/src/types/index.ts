/**
 * Types index — centralized exports for all domain and API types.
 *
 * PREFERRED IMPORTS (enforced from Phase 8):
 *   import type { DatasetMetadata } from '../types';      // ✅ from index
 *   import type { DatasetMetadata } from '../types/index'; // ⚠️ deep import (deprecated)
 *   import type { ColumnProfile } from '../types';        // ✅ from index
 *   import type { DataObject } from '../types';           // ✅ from index
 *   import type { TimeseriesDomain } from '../types';     // ✅ domain type
 */

// Re-export domain types (includes ChartViewport, TimeRange, ColumnFilters, etc.)
export * from './domains';

// Re-export API types
export * from './api';

// =============================================================================
// Legacy types still used by existing consumers
// These should be migrated to domain/api types over time
// =============================================================================

// Timeseries data object (used by datasetStore.ts)
export interface DataObject {
  ts: Float64Array;
  values: Record<string, Float64Array>;
}

// Legacy DatasetMetadata shape (field names differ from api.ts DatasetMetadata)
export interface LegacyDatasetMetadata {
  name: string;
  rowCount: number;
  columns: string[];
  numericColumns: string[];
  timestampColumn: string;
  fileSize: number;
  uploadedAt: string;
  timeRange: [number, number] | null;
  revision?: number;
}

// Legacy ColumnProfile shape (field names differ from api.ts ColumnProfile)
export interface LegacyColumnProfile {
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

// Re-export LegacyDatasetMetadata as DatasetMetadata for backwards compatibility
// Consumer code (datasetStore, pages) expects this shape
export type DatasetMetadata = LegacyDatasetMetadata;
export type ColumnProfile = LegacyColumnProfile;

// Additional FFT/Spectrogram types that don't fit cleanly into domains.ts
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

// AdaptiveLineFilter from domains.ts (x1/y1/x2/y2 version)
export type { AdaptiveLineFilter } from './domains';

// Points-based AdaptiveLineFilter for OverlayRenderer (uses array of [x,y] pairs)
export interface AdaptiveLineFilterPoints {
  id: string;
  column: string;
  points: [number, number][]; // [x,y] pairs in data coordinates
  keepAbove: boolean;
}