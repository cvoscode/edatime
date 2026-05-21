/**
 * EChartsAdapter — ChartAdapter implementation using Apache ECharts.
 *
 * Wraps the ECharts instance with the ChartAdapter interface.
 * Used as both the default fallback and explicit canvas-based renderer.
 */
import * as echarts from 'echarts';
import type { ChartAdapter, ChartOptions, ChartSeriesData } from './ChartAdapter';
import type { RollingBandData, AnomalyRegionData } from '../../types';
import { getColorPalette } from '../../utils/colorScale';
import { getActivePlotTemplate } from '../../utils/plotTemplate';
import { uiStore } from '../../stores/uiStore';

export class EChartsAdapter implements ChartAdapter {
  engineName = 'ECharts';
  instance: any = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private zoomCallback: ((start: number, end: number, yMin?: number, yMax?: number) => void) | null = null;
  private clickCallback: ((x: number, y: number) => void) | null = null;
  private readyCallback: ((engineName: string) => void) | null = null;
  private xAxisType: 'time' | 'value' = 'time';
  private disposed = false;
  private _registeredThemes = new Set<string>();

  private getGrid() {
    return { left: 80, right: 40, top: 20, bottom: 50 };
  }

  private registerTheme(): void {
    const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
    const name = `edatime-${tmpl.id}`;
    const themeObj = {
      backgroundColor: tmpl.background,
      textStyle: { color: tmpl.text ?? '#e0e0e0' },
    };
    // ECharts 5 does not have getTheme — use a Set to avoid double-registration
    if (!this._registeredThemes.has(name)) {
      (echarts as any).registerTheme(name, themeObj);
      this._registeredThemes.add(name);
    }
  }

  async initialize(container: HTMLElement, options: ChartOptions): Promise<void> {
    if (this.disposed) throw new Error('Adapter already disposed');

    this.container = container;
    this.xAxisType = options.xAxisType ?? 'time';
    const grid = options.grid ?? this.getGrid();

    this.registerTheme();

    // Clean container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
    const themeName = `edatime-${tmpl.id}`;

    this.instance = echarts.init(container, themeName, { renderer: 'canvas' });

    // ECharts may fire resize/events during init - suppress until fully ready
    this._initializing = true;

    const colorPalette = getColorPalette(uiStore.state.colorScale, 8);
    const initOpts: any = {
      grid,
      xAxis: { type: this.xAxisType, name: options.xAxisLabel },
      yAxis: { type: 'value', name: options.yAxisLabel },
      legend: { show: true, position: 'right' },
      series: [],
      color: colorPalette,
      ...(options.chartTitle ? { title: { text: options.chartTitle, left: 'center' } } : {}),
    };

    this.instance.setOption(initOpts);

    // Wire zoom callback
    if (this.zoomCallback) {
      this.instance.on('dataZoom', () => {
        const opt = this.instance.getOption() as any;
        const xAxis = opt?.xAxis as any[];
        if (xAxis?.[0]?.min !== undefined && xAxis?.[0]?.max !== undefined) {
          const start = typeof xAxis[0].min === 'number' ? xAxis[0].min : Number(xAxis[0].min);
          const end = typeof xAxis[0].max === 'number' ? xAxis[0].max : Number(xAxis[0].max);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            this.zoomCallback?.(start, end);
          }
        }
      });
    }

    // Wire click callback
    if (this.clickCallback && this.xAxisType === 'time') {
      this.instance.on('click', (params: any) => {
        const x = Number(params?.value?.[0]);
        const y = Number(params?.value?.[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          this.clickCallback?.(x, y);
        }
      });
    }

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.instance.resize());
    this.resizeObserver.observe(container);
    // Defer readyCallback to avoid triggering Solid.js reactive updates during chart init.
    // Solid.js processes effects after microtask queue is empty, so scheduling after
    // a double rAF ensures all reactive updates from initialization complete first.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      console.error('[EChartsAdapter] initialize COMPLETE, calling readyCallback');
      this.readyCallback?.(this.engineName);
    }));
  }

  setData(series: ChartSeriesData[]): void {
    if (!this.instance || this.disposed) return;

    const colorPalette = getColorPalette(uiStore.state.colorScale, 8);
    const seriesOpts = series.map((s, i) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      showSymbol: false,
      lineStyle: { width: 1.5 },
      emphasis: { disabled: true },
      color: s.color ?? colorPalette[i % colorPalette.length],
      visible: s.visible !== false,
    }));

    this.instance.setOption({
      series: seriesOpts,
      legend: { show: true, position: 'right' as const },
    });
  }

  setViewport(xMin: number, xMax: number, yMin?: number, yMax?: number): void {
    if (!this.instance || this.disposed) return;

    const opts: any = {
      xAxis: { min: xMin, max: xMax },
    };

    if (yMin !== undefined && yMax !== undefined) {
      opts.yAxis = { min: yMin, max: yMax };
    }

    this.instance.setOption(opts, { replace: false });
  }

  setOverlays(_rollingBands?: RollingBandData[], _anomalyRegions?: AnomalyRegionData[]): void {
    // Overlays are handled by the OverlayRenderer component
  }

  setDrawMode(_mode: 'pan' | 'zoom' | 'arrow' | 'box', _color?: string, _width?: number): void {
    // Drawing mode is handled by the overlay canvas, not ECharts
  }

  setAxisLabels(xLabel?: string, yLabel?: string): void {
    if (!this.instance || this.disposed) return;
    const xAxisType = this.xAxisType ?? 'value';
    const opts: any = {
      xAxis: { type: xAxisType, name: xLabel },
      yAxis: { type: 'value' as const, name: yLabel },
    };
    this.instance.setOption(opts, false);
  }

  resize(): void {
    if (!this.instance || this.disposed) return;
    this.instance.resize();
  }

  async exportPNG(): Promise<Blob> {
    if (!this.instance) return new Blob();
    return this.instance.getDataURL({ type: 'png', pixelRatio: 2, excludeBackground: false }) as Promise<Blob>;
  }

  async exportSVG(): Promise<string> {
    return '';
  }

  async exportCSV(): Promise<string> {
    // ECharts has no native CSV export — construct from series data
    const series = this.instance?.getOption()?.series as any[] ?? [];
    if (!series.length) return '';
    const lines: string[] = ['series,x,y'];
    for (const s of series) {
      const data = s?.data as any[] ?? [];
      for (const pt of data) {
        const x = Array.isArray(pt) ? pt[0] : pt;
        const y = Array.isArray(pt) ? pt[1] : undefined;
        lines.push(`${JSON.stringify(s.name ?? '')},${x},${y}`);
      }
    }
    return lines.join('\n');
  }

  zoomIn(_factor?: number): void {
    // ECharts zoom is handled through setViewport
  }

  zoomOut(_factor?: number): void {
    // ECharts zoom is handled through setViewport
  }

  resetZoom(): void {
    if (this.instance) this.instance.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  }

  onZoom(callback: (start: number, end: number, yMin?: number, yMax?: number) => void): () => void {
    this.zoomCallback = callback;
    if (this.instance) {
      this.instance.on('dataZoom', () => {
        const opt = this.instance.getOption() as any;
        const xAxis = opt?.xAxis as any[];
        if (xAxis?.[0]?.min !== undefined && xAxis?.[0]?.max !== undefined) {
          const start = typeof xAxis[0].min === 'number' ? xAxis[0].min : Number(xAxis[0].min);
          const end = typeof xAxis[0].max === 'number' ? xAxis[0].max : Number(xAxis[0].max);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            callback(start, end);
          }
        }
      });
    }
    return () => { this.zoomCallback = null; };
  }

  onClick(callback: (x: number, y: number) => void): () => void {
    this.clickCallback = callback;
    if (this.instance && this.xAxisType === 'time') {
      this.instance.on('click', (params: any) => {
        const x = Number(params?.value?.[0]);
        const y = Number(params?.value?.[1]);
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
    // ECharts does not emit engine change events
    return () => { };
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.instance?.dispose();
    this.instance = null;
  }
}