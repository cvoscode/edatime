/**
 * ChartGPUAdapter — ChartAdapter implementation using ChartGPU (WebGPU).
 *
 * Loads ChartGPU from `/libs/chartgpu/dist/index.js` as a blob URL to avoid
 * CORS issues with direct imports in some deployment contexts. The blob URL
 * is revoked after initialization to avoid memory leaks.
 */
import type { ChartAdapter, ChartOptions, ChartSeriesData } from './ChartAdapter';
import type { RollingBandData, AnomalyRegionData } from '../../types';
import { getColorPalette } from '../../utils/colorScale';
import { getActivePlotTemplate } from '../../utils/plotTemplate';
import { uiStore } from '../../stores/uiStore';

const CHARTGPU_INIT_TIMEOUT_MS = 5000;

import { isWebGPUSupported } from '../../chart/isWebGPU';

export class ChartGPUAdapter implements ChartAdapter {
  engineName = 'ChartGPU';
  instance: any = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private zoomCallback: ((start: number, end: number, yMin?: number, yMax?: number) => void) | null = null;
  private clickCallback: ((x: number, y: number) => void) | null = null;
  private readyCallback: ((engineName: string) => void) | null = null;
  private currentSeries: ChartSeriesData[] = [];
  private currentViewport = { xMin: 0, xMax: 100, yMin: 0, yMax: 1 };
  private disposed = false;

  private getGrid() {
    return { left: 120, right: 30, top: 16, bottom: 36 };
  }

  async initialize(container: HTMLElement, options: ChartOptions): Promise<void> {
    if (this.disposed) throw new Error('Adapter already disposed');
    if (!isWebGPUSupported()) throw new Error('WebGPU not supported');

    this.container = container;
    const grid = options.grid ?? this.getGrid();

    const chartgpuUrl = '/frontend/libs/chartgpu/index.js';
    const resp = await fetch(chartgpuUrl);
    if (!resp.ok) throw new Error(`ChartGPU fetch failed: ${resp.status}`);
    const code = await resp.text();
    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const chartModule = await import(/* @vite-ignore */ blobUrl);
      const createChartFn =
        (chartModule as any).createChart ??
        (chartModule as any).default?.createChart;
      if (!createChartFn) throw new Error('createChart not found');

      const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
      const chartOpts = {
        grid,
        xAxis: { type: options.xAxisType ?? 'time', name: options.xAxisLabel },
        yAxis: { type: 'value' as const, name: options.yAxisLabel },
        legend: { show: true, position: 'right' as const },
        series: [],
        theme: tmpl.id,
      };

      // Defer by one animation frame so SolidJS reactive effects fully settle.
      // This ensures any in-progress DOM modifications from createEffect complete
      // before ChartGPU tries to insert DOM elements.
      await new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); });

      // Flush any remaining microtasks (SolidJS scheduler tasks, reactive computations)
      await new Promise<void>(resolve => queueMicrotask(resolve));

      // Verify container is still connected to DOM and stable before ChartGPU init.
      if (!container.isConnected || container.parentElement === null) {
        throw new Error('Container is no longer in DOM');
      }

      const initPromise = createChartFn(container, chartOpts);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('ChartGPU init timeout (5s)')), CHARTGPU_INIT_TIMEOUT_MS)
      );

      let chartInstance;
      try {
        chartInstance = await Promise.race([initPromise, timeoutPromise]);
        if (!chartInstance || typeof chartInstance !== 'object' || (typeof chartInstance.on !== 'function' && typeof (chartInstance as any).setOption !== 'function')) {
          throw new Error('ChartGPU returned invalid instance type');
        }
      } catch (initError) {
        const errorMsg = initError instanceof Error ? initError.message : String(initError);
        throw new Error(`ChartGPU init failed: ${errorMsg}`);
      }

      this.instance = chartInstance;

      // Wire events
      if (this.zoomCallback) {
        this.instance.on('zoomRangeChange', (payload: any) => {
          const start = Number(payload?.start);
          const end = Number(payload?.end);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            this.zoomCallback?.(start, end);
          }
        });
      }

      if (this.clickCallback) {
        this.instance.on('click', (payload: any) => {
          const x = Number(payload?.x);
          const y = Number(payload?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            this.clickCallback?.(x, y);
          }
        });
      }

      // Resize observer
      this.resizeObserver = new ResizeObserver(() => this.instance?.resize?.());
      this.resizeObserver.observe(container);

      this.readyCallback?.(this.engineName);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  setData(series: ChartSeriesData[]): void {
    if (!this.instance || this.disposed) return;
    this.currentSeries = series;

    const colorPalette = getColorPalette(uiStore.state.colorScale, 8);
    const opts: any = {
      series: series.map((s, i) => ({
        ...s,
        color: s.color ?? colorPalette[i % colorPalette.length],
        visible: s.visible !== false,
      })),
    };

    this.instance.setOption?.(opts) ?? this.instance.updateSeries?.(opts.series);
  }

  setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number): void {
    if (!this.instance || this.disposed) return;
    this.currentViewport = { xMin, xMax, yMin: yMin ?? 0, yMax: yMax ?? 1 };

    if (typeof this.instance.setZoomRange === 'function') {
      this.instance.setZoomRange(xMin, xMax);
    }
    if (yMin !== undefined && yMax !== undefined && typeof this.instance.setYRange === 'function') {
      this.instance.setYRange(yMin, yMax);
    }
  }

  setOverlays(_rollingBands?: RollingBandData[], _anomalyRegions?: AnomalyRegionData[]): void {
    // Overlay rendering is handled by OverlayRenderer component, not the chart adapter
  }

  setDrawMode(_mode: 'pan' | 'zoom' | 'arrow' | 'box', _color?: string, _width?: number): void {
    // Drawing mode is handled by the overlay canvas, not the chart
  }

  setAxisLabels(xLabel?: string, yLabel?: string): void {
    if (!this.instance || this.disposed) return;
    const labelOpts: any = {
      xAxis: { type: 'time' as const, name: xLabel },
      yAxis: { type: 'value' as const, name: yLabel },
    };
    this.instance.setOption?.(labelOpts) ?? this.instance.updateAxes?.(labelOpts);
  }

  resize(): void {
    if (!this.instance || this.disposed) return;
    this.instance.resize?.();
  }

  async exportPNG(): Promise<Blob> {
    if (!this.instance) return new Blob();
    const canvas = this.instance.getCanvas?.();
    if (canvas) {
      return new Promise((resolve) => {
        canvas.toBlob((blob: Blob | null) => resolve(blob ?? new Blob()), 'image/png');
      });
    }
    return new Blob();
  }

  async exportSVG(): Promise<string> {
    // ChartGPU does not support SVG export natively — canvas fallback
    const canvas = this.instance?.getCanvas?.();
    if (!canvas) return '';
    const dataUrl = canvas.toDataURL('image/svg+xml');
    return dataUrl;
  }

  async exportCSV(): Promise<string> {
    // ChartGPU has no native CSV export — construct from series data
    if (!this.instance || !this.currentSeries.length) return '';
    const lines: string[] = ['series,x,y'];
    for (const s of this.currentSeries) {
      for (const [x, y] of s.data) {
        lines.push(`${JSON.stringify(s.name)},${x},${y}`);
      }
    }
    return lines.join('\n');
  }

  zoomIn(factor = 0.5): void {
    if (!this.instance || this.disposed) return;
    if (typeof this.instance.zoomIn === 'function') {
      this.instance.zoomIn(50, 1.5); // center at 50%, zoom factor
    }
  }

  zoomOut(factor = 0.5): void {
    if (!this.instance || this.disposed) return;
    if (typeof this.instance.zoomOut === 'function') {
      this.instance.zoomOut(50, 1.5);
    }
  }

  resetZoom(): void {
    if (!this.instance || this.disposed) return;
    if (typeof this.instance.setZoomRange === 'function') {
      this.instance.setZoomRange(this.currentViewport.xMin, this.currentViewport.xMax);
    }
  }

  onZoom(callback: (start: number, end: number, yMin?: number, yMax?: number) => void): () => void {
    this.zoomCallback = callback;
    if (this.instance) {
      this.instance.on('zoomRangeChange', (payload: any) => {
        const start = Number(payload?.start);
        const end = Number(payload?.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          callback(start, end);
        }
      });
    }
    return () => { this.zoomCallback = null; };
  }

  onClick(callback: (x: number, y: number) => void): () => void {
    this.clickCallback = callback;
    if (this.instance) {
      this.instance.on('click', (payload: any) => {
        const x = Number(payload?.x);
        const y = Number(payload?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          callback(x, y);
        }
      });
    }
    return () => { this.clickCallback = null; };
  }

  onReady(callback: (engineName: string) => void): () => void {
    this.readyCallback = callback;
    if (this.instance) {
      callback(this.engineName);
    }
    return () => { this.readyCallback = null; };
  }

  onEngineChanged?(callback: (engineName: string) => void): () => void {
    // ChartGPU does not emit engine change events
    return () => { };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    try {
      this.instance?.dispose?.();
    } catch (_) { }

    this.instance = null;
    this.container = null;
    this.zoomCallback = null;
    this.clickCallback = null;
    this.readyCallback = null;
  }
}