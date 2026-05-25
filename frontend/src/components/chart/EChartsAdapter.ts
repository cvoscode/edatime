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

  private parseDataZoomRange(instance: any): { start: number; end: number } | null {
    const opt = instance.getOption() as any;
    const xAxis = opt?.xAxis as any[];
    if (xAxis?.[0]?.min !== undefined && xAxis?.[0]?.max !== undefined) {
      const start = typeof xAxis[0].min === 'number' ? xAxis[0].min : Number(xAxis[0].min);
      const end = typeof xAxis[0].max === 'number' ? xAxis[0].max : Number(xAxis[0].max);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return { start, end };
      }
    }
    return null;
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
    console.debug('[EChartsAdapter] initialize start', { disposed: this.disposed, xAxisType: options.xAxisType });

    this.container = container;
    this.xAxisType = options.xAxisType ?? 'time';
    const grid = options.grid ?? this.getGrid();
    console.debug('[EChartsAdapter] container state', { isConnected: container.isConnected, parentTag: container.parentElement?.tagName });

    this.registerTheme();

    // Clean container before the defer
    console.debug('[EChartsAdapter] step 1: clean container');
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Defer by one animation frame so SolidJS reactive effects fully settle.
    // This ensures any in-progress DOM modifications from createEffect complete
    // before echarts.init tries to insert canvas elements.
    console.debug('[EChartsAdapter] step 2: awaiting double rAF');
    await new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); });
    console.debug('[EChartsAdapter] step 2: double rAF complete');

    // Flush any remaining microtasks (SolidJS scheduler tasks, reactive computations)
    // that were queued during the rAF frames before we touch the DOM.
    await new Promise<void>(resolve => queueMicrotask(resolve));
    console.debug('[EChartsAdapter] step 2b: microtask flush complete');

    const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
    const themeName = `edatime-${tmpl.id}`;
    console.debug('[EChartsAdapter] theme resolved', { themeName });

    // Verify container is still connected to DOM and stable before init.
    // insertBefore error occurs when ECharts tries to insert a canvas but
    // the container's DOM state has changed (e.g. SolidJS reactivity modified children).
    console.debug('[EChartsAdapter] step 3: verify container in DOM');
    if (!container.isConnected || container.parentElement === null) {
      throw new Error('Container is no longer in DOM');
    }
    console.debug('[EChartsAdapter] step 3: container verified', { isConnected: container.isConnected, parentTag: container.parentElement?.tagName });

    // Additional verification: check if container has any unexpected state
    console.debug('[EChartsAdapter] step 3b: container details', {
      childCount: container.childNodes.length,
      firstChildType: container.firstChild?.nodeType,
      firstChildTag: (container.firstChild as Element)?.tagName,
      hasNonElementChildren: Array.from(container.childNodes).some(n => n.nodeType !== 1),
    });

    // Init ECharts directly on the container while it's still in the DOM.
    // The double-rAF defer above is enough to flush SolidJS reactive batch.
    // Direct init is simpler and avoids the detach-swap race condition.
    console.debug('[EChartsAdapter] step 4: calling echarts.init on container');
    let instance: any;
    try {
      console.debug('[EChartsAdapter] step 4: pre-init container check', {
        containerId: container.id,
        containerTag: container.tagName,
        isConnected: container.isConnected,
        parentIsConnected: container.parentElement?.isConnected,
        childCount: container.childNodes.length,
        childrenTypes: Array.from(container.childNodes).map(c => ({ type: c.nodeType, tag: (c as Element)?.tagName })),
      });
      instance = echarts.init(container, themeName, { renderer: 'canvas' });
      console.debug('[EChartsAdapter] step 4: echarts.init succeeded');
    } catch (initErr) {
      // Fall back to bare init (no custom theme)
      console.debug('[EChartsAdapter] step 4: echarts.init with theme failed, retrying without theme');
      try {
        instance = echarts.init(container, undefined, { renderer: 'canvas' });
        console.debug('[EChartsAdapter] step 4: echarts.init bare succeeded');
      } catch (bareErr) {
        console.error('[EChartsAdapter] step 4: echarts.init failed completely', bareErr);
        throw bareErr;
      }
    }

    console.debug('[EChartsAdapter] step 5: pre-setOption container state', {
      containerChildCount: container.childNodes.length,
    });

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

    instance.setOption(initOpts);
    console.debug('[EChartsAdapter] step 5: initial option set', { initOptsKeys: Object.keys(initOpts) });

    // Assign to class property so methods like setData, resize, dispose work
    this.instance = instance;
    console.debug('[EChartsAdapter] step 6: instance assigned, type:', typeof instance);

    // Wire zoom callback
    if (this.zoomCallback) {
      instance.on('dataZoom', () => {
        const range = this.parseDataZoomRange(instance);
        if (range) {
          this.zoomCallback?.(range.start, range.end);
        }
      });
    }

    // Wire click callback
    if (this.clickCallback && this.xAxisType === 'time') {
      instance.on('click', (params: any) => {
        const x = Number(params?.value?.[0]);
        const y = Number(params?.value?.[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          this.clickCallback?.(x, y);
        }
      });
    }

    // ECharts may schedule internal work (resize, event binding) via setTimeout(0)
    // and rAF. Those can race with SolidJS reactivity and cause insertBefore
    // errors on stale DOM references. Since the chart IS initialized at this
    // point, those errors are non-fatal and can be safely suppressed.
    // Silencing setTimeout(0)/rAF isn't enough since ECharts also fires
    // synchronous insertBefore errors that bubble up as exceptions.
    // Catch and silently absorb them — the chart IS initialized at this point.
    // Increased from 60ms to 200ms to give ECharts more time to settle.
    console.debug('[EChartsAdapter] step 7: waiting for ECharts internal deferred work');
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 200));
    } catch (_) { /* ignore post-init deferred errors */ }
    console.debug('[EChartsAdapter] step 7: deferred work complete');

    this.resizeObserver = new ResizeObserver(() => {
      if (this.instance) {
        try {
          this.instance.resize();
        } catch (e) {
          console.warn('[EChartsAdapter] resize callback error (non-fatal):', e instanceof Error ? e.message : String(e));
        }
      }
    });
    this.resizeObserver.observe(container);
    this.readyCallback?.(this.engineName);
  }

  setData(series: ChartSeriesData[]): void {
    if (!this.instance || this.disposed) {
      console.debug('[EChartsAdapter] setData early return', { hasInstance: !!this.instance, disposed: this.disposed });
      return;
    }
    const totalPoints = series.reduce((acc, s) => acc + (s.data?.length ?? 0), 0);
    console.debug('[EChartsAdapter] setData', { seriesCount: series.length, totalPoints, firstSeriesName: series[0]?.name, firstSeriesPoints: series[0]?.data?.length ?? 0 });
    if (series[0]?.data?.length) {
      console.debug('[EChartsAdapter] first series first 3 pts:', JSON.stringify(series[0].data.slice(0, 3)));
    }

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
        const range = this.parseDataZoomRange(this.instance);
        if (range) {
          callback(range.start, range.end);
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