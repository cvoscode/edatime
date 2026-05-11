export interface DatasetMetadata {
  name: string;
  rowCount: number;
  columns: ColumnProfile[];
  timestampColumn: string;
  fileSize: number;
  uploadedAt: string;
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
  startX: number;
  endX: number;
  label: string;
  color: string;
}

export interface RollingBandConfig {
  column: string;
  window: number;
  stats: ('mean' | 'std' | 'min' | 'max')[];
  color: string;
}

export interface AnomalyConfig {
  column: string;
  threshold: number;
  method: 'std' | 'iqr';
  color: string;
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