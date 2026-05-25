/**
 * ChartAdapter — interface contract for all chart engine adapters.
 * Decouples chart infrastructure from engine-specific implementations.
 */
import type { ChartViewport, RollingBandData, AnomalyRegionData } from '../../types';
import type { SeriesData } from '../../types';

// Re-export so consumers can import from ChartAdapter
export type { SeriesData };

/**
 * Chart series data for chart adapter setData operations.
 * Different from the api.ts SeriesData (which is ts/values-based).
 */
export interface ChartSeriesData {
  name: string;
  data: number[][]; // [[x, y], [x, y], ...]
  color?: string;
  visible?: boolean;
}

/**
 * ChartOptions — passed to ChartAdapter.initialize()
 */
export interface ChartOptions {
  xAxisType?: 'time' | 'value';
  xAxisLabel?: string;
  yAxisLabel?: string;
  chartTitle?: string;
  grid?: { left: number; right: number; top: number; bottom: number };
  engine?: 'ChartGPU' | 'ECharts';
}

export interface ChartAdapter {
  engineName: string;
  instance: any;
  initialize(container: HTMLElement, options: ChartOptions): void;
  setData(series: ChartSeriesData[]): void;
  setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number): void;
  setOverlays(rollingBands?: RollingBandData[], anomalyRegions?: AnomalyRegionData[]): void;
  setDrawMode(mode: 'pan' | 'zoom' | 'arrow' | 'box', color?: string, width?: number): void;
  setAxisLabels(xLabel?: string, yLabel?: string): void;
  resize(): void;

  // Export
  exportPNG(): Promise<Blob>;
  exportSVG(): Promise<string>;
  exportCSV(): Promise<string>;

  // Zoom helpers
  zoomIn(factor?: number): void;
  zoomOut(factor?: number): void;
  resetZoom(): void;

  // Event handlers — return unregister function for cleanup
  onZoom(callback: (start: number, end: number, yMin?: number, yMax?: number) => void): () => void;
  onClick(callback: (x: number, y: number) => void): () => void;
  onReady(callback: (engineName: string) => void): () => void;
  onEngineChanged?(callback: (engineName: string) => void): () => void;

  dispose(): void;
}

export type ChartAdapterConstructor = new () => ChartAdapter;