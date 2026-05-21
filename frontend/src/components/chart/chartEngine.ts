/**
 * chartEngine.ts — ECharts-specific chart initialization.
 *
 * ChartGPU logic has moved to ChartGPUAdapter.ts.
 * New code should use the ChartAdapter / ChartRegistry pattern instead.
 *
 * Kept here for backward compatibility with existing consumers of initChartEngine.
 */
import * as echarts from 'echarts';
import { uiStore } from '../../stores/uiStore';
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

function isWebGPUSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  } catch {
    return false;
  }
}

function registerTheme(): void {
  const tmpl = getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme);
  const name = `edatime-${tmpl.id}`;
  if (!registerTheme._registered.has(name)) {
    (echarts as any).registerTheme(name, toEChartsTheme(tmpl));
    registerTheme._registered.add(name);
  }
}
registerTheme._registered = new Set<string>();

// Re-export for consumers that import from chartEngine
export { isWebGPUSupported, registerTheme };

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
    dispose: () => { try { instance.dispose(); } catch (_) { } },
    resize: () => instance.resize(),
  };
}

/**
 * initChartEngine — delegates to ChartAdapter via ChartRegistry.
 *
 * Provided for backward compatibility only.
 * New code should use createChartAdapter / createAndInitChartAdapter
 * from ChartRegistry.ts.
 */
export async function initChartEngine(config: ChartEngineConfig): Promise<ChartEngineResult> {
  const { container, grid = DEFAULT_GRID, xAxisType = 'time', xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick } = config;

  registerTheme();

  // Clean up any previous chart
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const { createAndInitChartAdapter } = await import('./ChartRegistry');

  let adapter: any;
  try {
    adapter = await createAndInitChartAdapter(
      container,
      { grid, xAxisType, xAxisLabel, yAxisLabel, chartTitle },
      { chartType: xAxisType === 'value' ? 'scatter' : 'timeseries' }
    );
  } catch (firstError) {
    console.error('[initChartEngine] First attempt failed:', firstError);
    // Clean container again
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    // Fall back to ECharts
    const { EChartsAdapter } = await import('./EChartsAdapter');
    adapter = new EChartsAdapter();
    await adapter.initialize(container, { grid, xAxisType, xAxisLabel, yAxisLabel, chartTitle });
    console.error('[initChartEngine] Fallback to ECharts succeeded');
  }

  // Wire callbacks
  if (onZoom) adapter.onZoom(onZoom);
  if (onClick) adapter.onClick(onClick);

  return {
    instance: adapter.instance,
    engineName: adapter.engineName as 'ChartGPU' | 'ECharts',
    dispose: () => adapter.dispose(),
    resize: () => adapter.resize(),
  };
}

export async function initScatterChartEngine(config: Omit<ChartEngineConfig, 'xAxisType'> & { xAxisType?: 'value' }): Promise<ChartEngineResult> {
  const { container, grid = ECHARTS_GRID, xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick } = config;
  return initChartEngine({ container, grid, xAxisType: 'value', xAxisLabel, yAxisLabel, chartTitle, onZoom, onClick });
}