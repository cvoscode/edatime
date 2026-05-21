import { createSignal, createEffect, onCleanup } from 'solid-js';
import { initChartEngine, registerTheme, DEFAULT_GRID, ECHARTS_GRID } from '../components/chart/chartEngine';
import { uiStore } from '../stores/uiStore';

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
  // @ts-ignore
  window.__useChartEngineCalled = true;
  // @ts-ignore - UNIQUE_MARKER_12345 for debugging
  const [chartInstance, setChartInstance] = createSignal<any>(null);
  const [engineName, setEngineName] = createSignal<string>('');
  const [chartStatus, setChartStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  const [webgpuReason, setWebgpuReason] = createSignal<string>('');
  const [themeVersion, setThemeVersion] = createSignal(0);

  let chartResult: { instance: any; engineName: 'ChartGPU' | 'ECharts'; dispose: () => void; resize: () => void } | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let initInProgress = false;

  const grid = () => options.grid ?? (options.type === 'echarts' ? ECHARTS_GRID : DEFAULT_GRID);

  const dispose = () => {
    initInProgress = false;
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
    if (initInProgress) {
      console.debug('[useChartEngine] init: already in progress, skipping');
      return;
    }
    initInProgress = true;
    // @ts-ignore - for debugging
    window.__chartInitCalled = Date.now();

    const ref = containerRef();
    if (!ref || !ref.parentElement) {
      console.error('[useChartEngine] init: container not in DOM, aborting');
      initInProgress = false;
      return;
    }

    console.error('[useChartEngine] init: have ref, proceeding', { refExists: !!ref, refTagName: ref.tagName });
    setChartStatus('loading');
    dispose();

    const chartGrid = grid();
    const xAxisType = options.type === 'timeseries' ? 'time' : 'value';

    try {
      console.debug('[useChartEngine] init: calling initChartEngine');
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
      console.debug('[useChartEngine] init: initChartEngine returned', { engineName: chartResult.engineName });

      setChartInstance(chartResult.instance);
      setEngineName(chartResult.engineName);
      options.onEngineReady?.(chartResult.engineName);
      options.onChartReady?.(chartResult.instance);
      console.debug('[useChartEngine] init: setting status to ready');
      setChartStatus('ready');
      console.debug('[useChartEngine] init: status set to ready');
      initInProgress = false;

      resizeObserver = new ResizeObserver(() => chartResult?.resize());
      resizeObserver.observe(ref);
    } catch (e) {
      console.error('[useChartEngine] init failed:', e);
      initInProgress = false;
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
    const status = chartStatus();
    void status;
    const result = chartResult;
    // @ts-ignore
    window.__effectRunCount = (window.__effectRunCount || 0) + 1;
    console.error('[useChartEngine] EFFECT RUN count:', window.__effectRunCount, { ref: !!ref, result: !!result, status });
    // Only call init if container is truly ready and no chart is in progress
    // Use parentElement as a proxy for "in DOM and stable" since Solid.js may still
    // be mounting the component tree at this point
    if (ref && ref.parentElement && !result && status === 'loading') {
      console.error('[useChartEngine] CONDITION MET');
      // Capture current ref to avoid stale closures
      const currentRef = ref;
      void init().then(() => {
        const newStatus = chartStatus();
        console.error('[useChartEngine] init completed, chartStatus now:', newStatus);
        void newStatus;
      }).catch(() => {
        // ignore - error handled in init()
      });
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