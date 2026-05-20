/**
 * ChartController — lifecycle controller for chart adapters.
 *
 * Replaces useChartController with proper signal-based state, onCleanup disposal,
 * and RAF-debounced ResizeObserver management.
 *
 * Chart adapters (ChartGPU, ECharts) are inherently imperative, so ChartController
 * wraps them with a reactive SolidJS layer while keeping the adapter pattern intact.
 */
import { createSignal, createEffect, onCleanup, Accessor } from 'solid-js';
import type { ChartAdapter, ChartSeriesData, ChartOptions, DrawMode } from '../adapters/ChartAdapter';
import type { RollingBandData, AnomalyRegionData, Drawing } from '../../types';
import { ChartGPUAdapter } from '../adapters/ChartGPUAdapter';
import { EChartsAdapter } from '../adapters/EChartsAdapter';

export interface ChartControllerConfig {
  /** Container element ref */
  containerRef: () => HTMLElement | undefined;
  /** Chart type — used to select adapter */
  chartType?: 'timeseries' | 'scatter' | 'heatmap';
  /** Grid config */
  grid?: { left: number; right: number; top: number; bottom: number };
  /** X-axis label */
  xAxisLabel?: string;
  /** Y-axis label */
  yAxisLabel?: string;
  /** Chart title */
  chartTitle?: string;
  /** Called when zoom changes (start/end in data coordinates) */
  onZoom?: (start: number, end: number, yMin?: number, yMax?: number) => void;
  /** Called on chart click (x, y in data coordinates) */
  onClick?: (x: number, y: number) => void;
  /** Called when engine is ready (receives engine name) */
  onEngineReady?: (engineName: string) => void;
  /** Called when the underlying engine changes (e.g., fallback from WebGPU to ECharts) */
  onEngineChanged?: (engineName: string) => void;
}

export interface ChartController {
  /** Chart instance accessor */
  instance: Accessor<unknown>;
  /** Engine name accessor */
  engineName: Accessor<string>;
  /** Whether the adapter is ready */
  isReady: Accessor<boolean>;

  /** Set chart series data */
  setData(series: ChartSeriesData[]): void;
  /** Set viewport (time range for timeseries, data extent for scatter) */
  setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number): void;
  /** Set overlay regions */
  setOverlays(rollingBands?: RollingBandData[], anomalyRegions?: AnomalyRegionData[], drawings?: Drawing[]): void;
  /** Set drawing mode */
  setDrawMode(mode: DrawMode, color?: string, width?: number): void;
  /** Update axis labels */
  setAxisLabels(xLabel?: string, yLabel?: string): void;

  /** Export chart as PNG blob */
  exportPNG(): Promise<Blob>;
  /** Export chart as SVG string */
  exportSVG(): Promise<string>;
  /** Export chart as CSV string */
  exportCSV(): Promise<string>;

  /** Zoom in by factor (centered on current viewport) */
  zoomIn(factor?: number): void;
  /** Zoom out (step back in zoom history) */
  zoomOut(): void;
  /** Reset zoom to initial range */
  resetZoom(): void;

  /** Resize the chart */
  resize(): void;

  /** Dispose all resources */
  dispose(): void;
}

function isWebGPUSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  } catch {
    return false;
  }
}

function selectAdapter(chartType: string): new () => ChartAdapter {
  if (chartType === 'scatter' || chartType === 'heatmap') {
    return EChartsAdapter;
  }
  // For timeseries, prefer ChartGPU if available, otherwise ECharts
  if (isWebGPUSupported()) {
    return ChartGPUAdapter;
  }
  return EChartsAdapter;
}

export function createChartController(config: ChartControllerConfig): ChartController {
  const containerRef = config.containerRef;
  const chartType = config.chartType ?? 'timeseries';
  const grid = config.grid ?? { left: 80, right: 40, top: 20, bottom: 50 };
  const xAxisLabel = config.xAxisLabel;
  const yAxisLabel = config.yAxisLabel;
  const chartTitle = config.chartTitle;

  // Signal state — no module-level mutable vars
  const [instance, setInstance] = createSignal<unknown>(null);
  const [engineName, setEngineName] = createSignal<string>('');
  const [isReady, setIsReady] = createSignal(false);

  // Current adapter reference (not a signal — adapter is internal)
  let adapter: ChartAdapter | null = null;
  let disposed = false;

  // ResizeObserver managed centrally with RAF debouncing
  let resizeObserver: ResizeObserver | null = null;
  let resizeRafId: number | null = null;

  // Event unregister functions
  const unregisters: (() => void)[] = [];

  // Current state for zoom helpers
  let currentViewport = { xMin: 0, xMax: 100, yMin: 0, yMax: 1 };
  let currentSeries: ChartSeriesData[] = [];

  // Initialize adapter when container becomes available
  createEffect(() => {
    const container = containerRef();
    if (!container) return;
    if (disposed) return;

    const adapterClass = selectAdapter(chartType);
    const newAdapter: ChartAdapter = new adapterClass();

    const options: ChartOptions = {
      grid,
      xAxisType: chartType === 'scatter' ? 'value' : 'time',
      xAxisLabel,
      yAxisLabel,
      chartTitle,
    };

    newAdapter.initialize(container, options).then(() => {
      if (disposed) {
        newAdapter.dispose();
        return;
      }

      adapter = newAdapter;
      setInstance(newAdapter.instance);
      setEngineName(newAdapter.engineName);
      setIsReady(true);

      // Wire event handlers with unregister tracking
      if (config.onZoom) {
        const unreg = newAdapter.onZoom(config.onZoom);
        unregisters.push(unreg);
      }
      if (config.onClick) {
        const unreg = newAdapter.onClick(config.onClick);
        unregisters.push(unreg);
      }
      if (config.onEngineReady) {
        const unreg = newAdapter.onReady(config.onEngineReady);
        unregisters.push(unreg);
      }
      if (config.onEngineChanged && newAdapter.onEngineChanged) {
        const unreg = newAdapter.onEngineChanged(config.onEngineChanged);
        unregisters.push(unreg);
      }

      // Setup ResizeObserver with RAF debouncing
      resizeObserver = new ResizeObserver(() => {
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
          if (!disposed) newAdapter.resize();
        });
      });
      resizeObserver.observe(container);

      // Re-apply last series data if any
      if (currentSeries.length > 0) {
        newAdapter.setData(currentSeries);
      }
      // Re-apply last viewport if any
      newAdapter.setViewport(currentViewport.xMin, currentViewport.xMax, currentViewport.yMin, currentViewport.yMax);
    }).catch((err: unknown) => {
      console.error('[ChartController] adapter init failed:', err);
      // Try fallback to ECharts if ChartGPU failed
      if (newAdapter.engineName === 'ChartGPU' && !disposed) {
        const fallback = new EChartsAdapter();
        fallback.initialize(container, options).then(() => {
          if (disposed) { fallback.dispose(); return; }
          adapter = fallback;
          setInstance(fallback.instance);
          setEngineName(fallback.engineName);
          setIsReady(true);

          if (config.onZoom) {
            const unreg = fallback.onZoom(config.onZoom);
            unregisters.push(unreg);
          }
          if (config.onClick) {
            const unreg = fallback.onClick(config.onClick);
            unregisters.push(unreg);
          }
          if (config.onEngineReady) {
            const unreg = fallback.onReady(config.onEngineReady);
            unregisters.push(unreg);
          }
          if (config.onEngineChanged && fallback.onEngineChanged) {
            const unreg = fallback.onEngineChanged(config.onEngineChanged);
            unregisters.push(unreg);
          }

          resizeObserver?.disconnect();
          resizeObserver = new ResizeObserver(() => {
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
            resizeRafId = requestAnimationFrame(() => {
              if (!disposed) fallback.resize();
            });
          });
          resizeObserver.observe(container);

          if (currentSeries.length > 0) fallback.setData(currentSeries);
          fallback.setViewport(currentViewport.xMin, currentViewport.xMax, currentViewport.yMin, currentViewport.yMax);
        });
      }
    });
  });

  // Cleanup on dispose
  onCleanup(() => {
    disposed = true;
    for (const unreg of unregisters) unreg();
    unregisters.length = 0;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (resizeRafId !== null) {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = null;
    }
    adapter?.dispose();
    adapter = null;
    setIsReady(false);
  });

  return {
    instance,
    engineName,
    isReady,

    setData(series: ChartSeriesData[]) {
      currentSeries = series;
      if (adapter && !disposed) adapter.setData(series);
    },

    setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number) {
      currentViewport = { xMin, xMax, yMin: yMin ?? 0, yMax: yMax ?? 1 };
      if (adapter && !disposed) adapter.setViewport(xMin, xMax, yMin, yMax);
    },

    setOverlays(rollingBands?: RollingBandData[], anomalyRegions?: AnomalyRegionData[], _drawings?: Drawing[]) {
      if (adapter && !disposed) adapter.setOverlays(rollingBands, anomalyRegions);
    },

    setDrawMode(mode: DrawMode, color?: string, width?: number) {
      if (adapter && !disposed) adapter.setDrawMode(mode, color, width);
    },

    setAxisLabels(xLabel?: string, yLabel?: string) {
      if (adapter && !disposed) adapter.setAxisLabels(xLabel, yLabel);
    },

    async exportPNG() {
      if (!adapter) return new Blob();
      return adapter.exportPNG();
    },

    async exportSVG() {
      if (!adapter) return '';
      return adapter.exportSVG();
    },

    async exportCSV() {
      if (!adapter) return '';
      return adapter.exportCSV();
    },

    zoomIn(factor = 0.5) {
      if (!adapter || disposed) return;
      adapter.zoomIn(factor);
    },

    zoomOut() {
      if (!adapter || disposed) return;
      adapter.zoomOut();
    },

    resetZoom() {
      if (!adapter || disposed) return;
      adapter.resetZoom();
    },

    resize() {
      if (!adapter || disposed) return;
      adapter.resize();
    },

    dispose() {
      disposed = true;
      for (const unreg of unregisters) unreg();
      unregisters.length = 0;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = null;
      }
      adapter?.dispose();
      adapter = null;
      setIsReady(false);
    },
  };
}