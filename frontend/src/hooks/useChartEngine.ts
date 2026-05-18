import { createSignal, createEffect, onCleanup } from 'solid-js';
import { initChartEngine, registerTheme, DEFAULT_GRID, ECHARTS_GRID } from '../components/chart/chartEngine';
import { uiStore } from '../stores';

export type ChartEngineType = 'timeseries' | 'scatter' | 'echarts';

export interface ChartEngineOptions {
  type: ChartEngineType;
  xAxisLabel?: string;
  yAxisLabel?: string;
  chartTitle?: string;
  grid?: { left: number; right: number; top: number; bottom: number };
  onZoom?: (...args: any[]) => void;
  onClick?: (...args: any[]) => void;
  onEngineReady?: (name: string) => void;
  onChartReady?: (instance: any) => void;
}

export interface ChartEngineResult {
  chartInstance: () => any;
  engineName: () => string;
  chartStatus: () => 'loading' | 'ready' | 'error';
  webgpuReason: () => string;
  themeVersion: () => number;
  dispose: () => void;
  resize: () => void;
  init: () => Promise<void>;
}

export function useChartEngine(
  containerRef: () => HTMLElement | undefined,
  options: ChartEngineOptions
): ChartEngineResult {
  const [chartInstance, setChartInstance] = createSignal<any>(null);
  const [engineName, setEngineName] = createSignal<string>('');
  const [chartStatus, setChartStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  const [webgpuReason, setWebgpuReason] = createSignal<string>('');
  const [themeVersion, setThemeVersion] = createSignal(0);

  let chartResult: { instance: any; engineName: 'ChartGPU' | 'ECharts'; dispose: () => void; resize: () => void } | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const grid = () => options.grid ?? (options.type === 'echarts' ? ECHARTS_GRID : DEFAULT_GRID);

  const dispose = () => {
    if (chartResult) {
      chartResult.dispose();
      chartResult = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    setChartInstance(null);
  };

  const resize = () => {
    chartResult?.resize();
  };

  const init = async () => {
    const ref = containerRef();
    if (!ref) return;

    dispose();
    setChartStatus('loading');
    registerTheme();

    const chartGrid = grid();
    const xAxisType = options.type === 'timeseries' ? 'time' : 'value';

    try {
      chartResult = await initChartEngine({
        container: ref,
        grid: chartGrid,
        xAxisType,
        xAxisLabel: options.xAxisLabel,
        yAxisLabel: options.yAxisLabel,
        chartTitle: options.chartTitle,
        onZoom: options.onZoom as (start: number, end: number) => void,
        onClick: options.onClick as (x: number, y: number) => void,
      });

      setChartInstance(chartResult.instance);
      setEngineName(chartResult.engineName);
      options.onEngineReady?.(chartResult.engineName);
      options.onChartReady?.(chartResult.instance);
      setChartStatus('ready');

      resizeObserver = new ResizeObserver(() => chartResult?.resize());
      resizeObserver.observe(ref);
    } catch (e) {
      console.error('[useChartEngine] init failed:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setWebgpuReason(msg);
      uiStore.addToast({ message: `Chart error: ${msg}`, type: 'error', duration: 0 });
      setChartStatus('error');
    }
  };

  createEffect(() => {
    void uiStore.state.theme;
    void uiStore.state.plotTheme;
    const ref = containerRef();
    if (ref && chartStatus() !== 'loading') {
      void init();
    }
  });

  onCleanup(() => dispose());

  return {
    chartInstance,
    engineName,
    chartStatus,
    webgpuReason,
    themeVersion,
    dispose,
    resize,
    init,
  };
}