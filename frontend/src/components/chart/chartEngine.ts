import * as echarts from 'echarts';
import { uiStore } from '../../stores';
import { getColorPalette } from '../../utils/colorScale';
import { getActivePlotTemplate, toEChartsTheme } from '../../utils/plotTemplate';

export interface GridConfig {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ChartEngineConfig {
  container: HTMLElement;
  grid?: GridConfig;
  xAxisType?: 'time' | 'value';
  xAxisLabel?: string;
  yAxisLabel?: string;
  chartTitle?: string;
  onZoom?: (start: number, end: number, yMin?: number, yMax?: number) => void;
  onClick?: (x: number, y: number) => void;
}

export interface ChartEngineResult {
  instance: any;
  engineName: 'ChartGPU' | 'ECharts';
  dispose: () => void;
  resize: () => void;
}

export const DEFAULT_GRID: GridConfig = { left: 120, right: 30, top: 16, bottom: 36 };
export const ECHARTS_GRID: GridConfig = { left: 80, right: 40, top: 20, bottom: 50 };
const CHARTGPU_INIT_TIMEOUT_MS = 5000;

export function isWebGPUSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  } catch {
    return false;
  }
}

export function registerTheme(): void {
  const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
  const name = `edatime-${tmpl.id}`;
  echarts.registerTheme(name, toEChartsTheme(tmpl));
}

async function loadChartGPU(container: HTMLElement, grid: GridConfig, xAxisType: 'time' | 'value', xAxisLabel?: string, yAxisLabel?: string): Promise<any> {
  const chartgpuUrl = `/libs/chartgpu/dist/index.js`;
  const resp = await fetch(chartgpuUrl);
  if (!resp.ok) throw new Error(`ChartGPU fetch failed: ${resp.status}`);
  const code = await resp.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const chartModule = await import(/* @vite-ignore */ blobUrl);
    const createChartFn = (chartModule as any).createChart ?? (chartModule as any).default?.createChart;
    if (!createChartFn) throw new Error('createChart not found');
    const chartOpts = {
      grid,
      xAxis: { type: xAxisType, name: xAxisLabel },
      yAxis: { type: 'value' as const, name: yAxisLabel },
      legend: { show: true, position: 'right' as const },
      series: [],
      theme: getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme).id,
    };
    return await createChartFn(container, chartOpts);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function initECharts(
  container: HTMLElement,
  grid: GridConfig,
  xAxisType: 'time' | 'value',
  xAxisLabel?: string,
  yAxisLabel?: string,
  chartTitle?: string,
  onZoom?: (start: number, end: number) => void,
  onClick?: (x: number, y: number) => void
): Promise<{ instance: any; dispose: () => void; resize: () => void }> {
  const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
  const themeName = `edatime-${tmpl.id}`;
  const instance = echarts.init(container, themeName, { renderer: 'canvas' });

  instance.setOption({
    grid,
    xAxis: { type: xAxisType, name: xAxisLabel },
    yAxis: { type: 'value' as const, name: yAxisLabel },
    legend: { show: true, position: 'right' as const },
    series: [],
    color: getColorPalette(uiStore.state.colorScale, 8),
    ...(chartTitle ? { title: { text: chartTitle, left: 'center' as const } } : {}),
  });

  if (onZoom) {
    instance.on('dataZoom', () => {
      const opt = instance.getOption() as any;
      const xAxis = opt?.xAxis as any[];
      if (xAxis?.[0]?.min !== undefined && xAxis?.[0]?.max !== undefined) {
        const start = typeof xAxis[0].min === 'number' ? xAxis[0].min : Number(xAxis[0].min);
        const end = typeof xAxis[0].max === 'number' ? xAxis[0].max : Number(xAxis[0].max);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          onZoom(start, end);
        }
      }
    });
  }

  if (onClick) {
    if (xAxisType === 'time') {
      instance.on('click', (params: any) => {
        const x = Number(params?.value?.[0]);
        const y = Number(params?.value?.[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          onClick(x, y);
        }
      });
    }
  }

  return {
    instance,
    dispose: () => { try { instance.dispose(); } catch (_) {} },
    resize: () => instance.resize(),
  };
}

export async function initChartEngine(config: ChartEngineConfig): Promise<ChartEngineResult> {
  const { container, grid = DEFAULT_GRID, xAxisType = 'time', xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick } = config;

  registerTheme();

  // Clean up any previous chart
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  let chartgpuBlobUrl: string | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Try ChartGPU first
  if (isWebGPUSupported()) {
    try {
      const chartPromise = loadChartGPU(container, grid, xAxisType, xAxisLabel, yAxisLabel);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('ChartGPU init timeout (5s)')), CHARTGPU_INIT_TIMEOUT_MS)
      );

      const instance = await Promise.race([chartPromise, timeoutPromise]);

      if (onZoom) {
        instance.on('zoomRangeChange', (payload: any) => {
          const start = Number(payload?.start);
          const end = Number(payload?.end);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            onZoom(start, end);
          }
        });
      }

      if (onClick) {
        instance.on('click', (payload: any) => {
          const x = Number(payload?.x);
          const y = Number(payload?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            onClick(x, y);
          }
        });
      }

      resizeObserver = new ResizeObserver(() => instance.resize?.());
      resizeObserver.observe(container);

      return {
        instance,
        engineName: 'ChartGPU',
        dispose: () => {
          resizeObserver?.disconnect();
          try { instance.dispose?.(); } catch (_) {}
        },
        resize: () => instance.resize?.(),
      };
    } catch (e) {
      console.warn('[chartEngine] ChartGPU failed or timed out, falling back to ECharts:', e);
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
  }

  // ECharts fallback
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  if (!container.parentNode) {
    throw new Error('Chart container is no longer in the DOM');
  }

  // Clean up again after RAF defer
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const echartsResult = await initECharts(container, grid, xAxisType, xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick);

  resizeObserver = new ResizeObserver(() => echartsResult.instance.resize());
  resizeObserver.observe(container);

  return {
    instance: echartsResult.instance,
    engineName: 'ECharts',
    dispose: () => {
      resizeObserver?.disconnect();
      echartsResult.dispose();
    },
    resize: echartsResult.resize,
  };
}

export async function initScatterChartEngine(config: Omit<ChartEngineConfig, 'xAxisType'> & { xAxisType?: 'value' }): Promise<ChartEngineResult> {
  const { container, grid = ECHARTS_GRID, xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick } = config;
  return initChartEngine({ container, grid, xAxisType: 'value', xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick });
}