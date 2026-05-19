/**
 * Chart controller hook — higher-level chart lifecycle controller.
 * Wraps useChartEngine and exposes structured chart operations.
 */
import { createSignal, Accessor, onCleanup } from 'solid-js';
import { useChartEngine, type ChartEngineType } from './useChartEngine';
import { DEFAULT_GRID } from '../components/chart/chartEngine';
import { exportChartAsPNG, exportChartAsSVG } from '../utils/exportUtils';

// Re-export chart types for consumers
export type { ChartEngineType };

export type ChartUpdateCallback = (
  series: any[],
  xMin?: number,
  xMax?: number,
  yMin?: number,
  yMax?: number
) => void;

export interface ChartControllerOptions {
  containerRef: () => HTMLElement | undefined;
  chartType: 'timeseries' | 'scatter' | 'echarts';
  xAxisLabel?: string;
  yAxisLabel?: string;
  chartTitle?: string;
  grid?: { left: number; right: number; top: number; bottom: number };
  onEngineReady?: (name: string) => void;
  onChartReady?: (instance: any) => void;
  onUpdateReady?: (callback: ChartUpdateCallback) => void;
}

export function createChartController(opts: ChartControllerOptions) {
  return useChartController(opts as any);
}

export interface ChartControllerConfig {
  /** Container element ref (function returning element) */
  container: () => HTMLDivElement | undefined;
  /** Chart type */
  type: 'timeseries' | 'scatter' | 'heatmap';
  /** Grid config */
  grid?: { left: number; right: number; top: number; bottom: number };
  /** X-axis label */
  xAxisLabel?: string;
  /** Y-axis label */
  yAxisLabel?: string;
  /** Chart title */
  chartTitle?: string;
  /** Called when zoom changes (start/end in data coordinates) */
  onZoom?: (start: number, end: number) => void;
  /** Called on chart click (x, y in data coordinates) */
  onClick?: (x: number, y: number) => void;
  /** Called when engine is ready (receives engine name) */
  onEngineReady?: (name: string) => void;
  /** Called when chart instance is ready */
  onChartReady?: (instance: any) => void;
}

export interface ChartController {
  /** Chart instance accessor */
  chartInstance: Accessor<any>;
  /** Engine name accessor ('ChartGPU' | 'ECharts') */
  engineName: Accessor<string>;
  /** Whether chart is ready */
  isReady: () => boolean;

  /** Set chart series data */
  setData(series: any[]): void;
  /** Set viewport (time range for timeseries, data extent for scatter) */
  setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number): void;
  /** Set overlay regions (rolling bands, anomaly regions) */
  setOverlays(rollingBands?: any[], anomalyRegions?: any[]): void;
  /** Set drawing mode for annotations */
  setDrawMode(mode: 'pan' | 'zoom' | 'arrow' | 'box', color?: string, width?: number): void;
  /** Update axis labels */
  setAxisLabels(xLabel?: string, yLabel?: string): void;
  /** Export chart as PNG blob */
  exportPNG(): Promise<Blob>;
  /** Export chart as SVG string */
  exportSVG(): Promise<string>;
  /** Zoom in by factor */
  zoomIn(): void;
  /** Zoom out by factor */
  zoomOut(): void;
  /** Reset zoom to initial range */
  resetZoom(): void;
  /** Dispose chart resources */
  dispose(): void;
}

function seriesToChartGPUFormat(series: any[]): any {
  // ChartGPU expects { series: [{ name, data: [[x,y], ...], ... }] }
  return { series };
}

function seriesToEChartsFormat(series: any[]): any {
  return {
    series: series.map(s => ({
      name: s.name,
      type: 'line',
      data: s.data,
      showSymbol: false,
      lineStyle: { width: 1.5 },
      emphasis: { disabled: true },
    })),
  };
}

function applyViewportToChartGPU(instance: any, xMin: number, xMax: number, yMin?: number, yMax?: number): void {
  if (typeof instance.setZoomRange === 'function') {
    instance.setZoomRange(xMin, xMax);
  }
  if (yMin !== undefined && yMax !== undefined && typeof instance.setYRange === 'function') {
    instance.setYRange(yMin, yMax);
  }
}

function applyViewportToECharts(instance: any, xMin: number, xMax: number, yMin?: number, yMax?: number): void {
  instance.setOption({
    xAxis: { min: xMin, max: xMax },
    yAxis: yMin !== undefined && yMax !== undefined ? { min: yMin, max: yMax } : undefined,
  }, { replace: false });
}

function zoomInChartGPU(instance: any): void {
  if (typeof instance.zoomIn === 'function') {
    instance.zoomIn(50, 1.5); // center at 50%, zoom factor 1.5x
  }
}

function zoomOutChartGPU(instance: any): void {
  if (typeof instance.zoomOut === 'function') {
    instance.zoomOut(50, 1.5);
  }
}

function resetZoomChartGPU(instance: any): void {
  if (typeof instance.setZoomRange === 'function') {
    instance.setZoomRange(0, 100);
  }
}

function zoomInECharts(instance: any): void {
  const option = instance.getOption() as any;
  instance.dispatchAction({
    type: 'dataZoom',
    start: 0,
    end: 100,
    dataZoomIndex: 0,
  });
}

function zoomOutECharts(instance: any): void {
  const option = instance.getOption() as any;
  const currentStart = option?.dataZoom?.[0]?.start ?? 0;
  const currentEnd = option?.dataZoom?.[0]?.end ?? 100;
  const range = currentEnd - currentStart;
  const center = (currentStart + currentEnd) / 2;
  const newRange = Math.min(100, range * 1.5);
  const newStart = Math.max(0, center - newRange / 2);
  const newEnd = Math.min(100, center + newRange / 2);
  instance.dispatchAction({
    type: 'dataZoom',
    start: newStart,
    end: newEnd,
    dataZoomIndex: 0,
  });
}

function resetZoomECharts(instance: any): void {
  instance.dispatchAction({
    type: 'dataZoom',
    start: 0,
    end: 100,
    dataZoomIndex: 0,
  });
}

/**
 * Creates a typed chart lifecycle controller.
 * Uses useChartEngine internally — does not reimplement engine initialization.
 *
 * Usage:
 *   const chart = useChartController({
 *     container: () => containerRef,
 *     type: 'timeseries',
 *     onZoom: (start, end) => { ... },
 *   });
 *
 *   onMount(() => chart.init());
 */
export function useChartController(config: ChartControllerConfig): ChartController {
  const {
    container,
    type,
    grid = DEFAULT_GRID,
    xAxisLabel,
    yAxisLabel,
    chartTitle,
    onZoom,
    onClick,
    onEngineReady,
    onChartReady,
  } = config;

  const engine = useChartEngine(container, {
    type: type as ChartEngineType,
    grid,
    xAxisLabel,
    yAxisLabel,
    chartTitle,
    onZoom,
    onClick,
    onEngineReady,
    onChartReady,
  });

  const [isReadySignal] = createSignal(false);

  const isReady = () => engine.chartStatus() === 'ready';

  const setData = (series: any[]) => {
    const instance = engine.chartInstance();
    if (!instance) return;

    const name = engine.engineName();
    if (name === 'ChartGPU') {
      const data = seriesToChartGPUFormat(series);
      if (typeof instance.setData === 'function') {
        instance.setData(data);
      }
    } else if (name === 'ECharts') {
      const opts = seriesToEChartsFormat(series);
      instance.setOption(opts, { replace: false });
    }
  };

  const setViewport = (xMin: number, xMax: number, yMin?: number, yMax?: number) => {
    const instance = engine.chartInstance();
    if (!instance) return;

    const name = engine.engineName();
    if (name === 'ChartGPU') {
      applyViewportToChartGPU(instance, xMin, xMax, yMin, yMax);
    } else {
      applyViewportToECharts(instance, xMin, xMax, yMin, yMax);
    }
  };

  const setOverlays = (rollingBands?: any[], _anomalyRegions?: any[]) => {
    const instance = engine.chartInstance();
    if (!instance) return;

    // Rolling bands overlay - ChartGPU/ECharts handle via setOption or dedicated method
    if (rollingBands && typeof instance.setRollingBands === 'function') {
      instance.setRollingBands(rollingBands);
    }
    // anomalyRegions currently not wired in chartEngine - reserved for future
  };

  const setDrawMode = (mode: 'pan' | 'zoom' | 'arrow' | 'box', color?: string, width?: number) => {
    const instance = engine.chartInstance();
    if (!instance) return;

    if (typeof instance.setDrawMode === 'function') {
      instance.setDrawMode(mode, color, width);
    }
  };

  const setAxisLabels = (xLabel?: string, yLabel?: string) => {
    const instance = engine.chartInstance();
    if (!instance) return;

    if (engine.engineName() === 'ECharts') {
      instance.setOption({
        xAxis: { name: xLabel },
        yAxis: { name: yLabel },
      }, { replace: false });
    }
  };

  const exportPNG = async (): Promise<Blob> => {
    const instance = engine.chartInstance();
    if (!instance) return new Blob();

    return new Promise((resolve) => {
      const canvas = instance.getCanvas?.() ?? instance.renderer?.canvas;
      if (!canvas) {
        resolve(new Blob());
        return;
      }
      canvas.toBlob((blob: Blob | null) => {
        resolve(blob ?? new Blob());
      }, 'image/png');
    });
  };

  const exportSVG = async (): Promise<string> => {
    const instance = engine.chartInstance();
    if (!instance) return '';

    if (typeof instance.exportSVG === 'function') {
      return instance.exportSVG() ?? '';
    }

    // Fallback: try to construct from canvas
    const canvas = instance.getCanvas?.() ?? instance.renderer?.canvas;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}"/></svg>`;
    }
    return '';
  };

  const zoomIn = () => {
    const instance = engine.chartInstance();
    if (!instance) return;

    const name = engine.engineName();
    if (name === 'ChartGPU') {
      zoomInChartGPU(instance);
    } else {
      zoomInECharts(instance);
    }
  };

  const zoomOut = () => {
    const instance = engine.chartInstance();
    if (!instance) return;

    const name = engine.engineName();
    if (name === 'ChartGPU') {
      zoomOutChartGPU(instance);
    } else {
      zoomOutECharts(instance);
    }
  };

  const resetZoom = () => {
    const instance = engine.chartInstance();
    if (!instance) return;

    const name = engine.engineName();
    if (name === 'ChartGPU') {
      resetZoomChartGPU(instance);
    } else {
      resetZoomECharts(instance);
    }
  };

  const dispose = () => engine.dispose();

  return {
    chartInstance: engine.chartInstance,
    engineName: engine.engineName,
    isReady,
    setData,
    setViewport,
    setOverlays,
    setDrawMode,
    setAxisLabels,
    exportPNG,
    exportSVG,
    zoomIn,
    zoomOut,
    resetZoom,
    dispose,
  };
}