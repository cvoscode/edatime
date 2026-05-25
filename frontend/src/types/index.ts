/**
 * Types index — centralized exports for all domain and API types.
 *
 * PREFERRED IMPORTS (enforced from Phase 8):
 *   import type { DatasetMetadata } from '../types';      // ✅ from index
 *   import type { DataObject } from '../types';           // ✅ from index
 *   import type { TimeseriesDomain } from '../types';     // ✅ domain type
 */

// Re-export ALL domain types (includes ChartViewport, TimeRange, ColumnFilters,
// ToastMessage, RollingBandData, AnomalyRegionData, ZoomState, Drawing, DragState,
// SeriesData, FilteredDataObject, ChartInstance, Annotation, etc.)
export * from './domains';

// Re-export API types — only those that DON'T conflict with domains.ts
// API-specific types that have different shapes get explicit exports
export type {
  // Dataset metadata
  ColumnMetadata,
  Histogram,
  ColumnProfile,
  DatasetMetadata,
  // Upload API
  PreviewResponse,
  IngestResponse,
  // Correlation & Scatter
  CorrelationItem,
  SuggestionItem,
  // API-specific chart types (renamed to avoid domain conflicts)
  Annotation as ApiAnnotation,
  ChartInstance as ApiChartInstance,
  ApiFilteredDataObject,
  ApiSeriesData,
  DragState as ApiDragState,
  // Scatter responses
  CorrelationMatrixResponse,
  ScatterCorrelationsResponse,
  ScatterPointsResponse,
  // FFT
  FrequencyPeak,
  // Misc
  SpectralConfig,
  Theme,
} from './api';

// Also re-export the pointer-based DragState under its own name for consumers
// that import it directly (ChartView, OverlayRenderer)
export type { DragState as PointerDragState } from './api';

// =============================================================================
// Legacy types still used by existing consumers
// These should be migrated to domain/api types over time
// =============================================================================

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

// AdaptiveLineFilter from domains.ts (x1/y1/x2/y2 version)
export type { AdaptiveLineFilter } from './domains';

// Points-based AdaptiveLineFilter for OverlayRenderer (uses array of [x,y] pairs)
export interface AdaptiveLineFilterPoints {
  id: string;
  column: string;
  points: [number, number][]; // [x,y] pairs in data coordinates
  keepAbove: boolean;
}