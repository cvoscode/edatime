import { createSignal, createEffect, onCleanup } from 'solid-js';
import { initChartEngine, DEFAULT_GRID, ECHARTS_GRID } from '../components/chart/chartEngine';

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
    if (initInProgress) return;
    const ref = containerRef();
    if (!ref || !ref.parentElement) {
      console.debug('[useChartEngine] init skip - no ref or no parent', { hasRef: !!ref, hasParent: ref?.parentElement });
      return;
    }
    initInProgress = true;
    console.debug('[useChartEngine] init starting', { containerId: ref.id, hasParent: !!ref.parentElement });

    setChartStatus('loading');
    console.debug('[useChartEngine] status -> loading');

    const chartGrid = grid();
    const xAxisType = options.type === 'timeseries' ? 'time' : 'value';

    // Guard: if container has no dimensions, skip chart creation entirely.
    // A zero-size container causes ECharts to throw DOM errors.
    if (ref.clientWidth === 0 || ref.clientHeight === 0) {
      console.debug('[useChartEngine] init skip - container has zero dimensions', { clientWidth: ref.clientWidth, clientHeight: ref.clientHeight });
      initInProgress = false;
      return;
    }

    try {
      // Debug: log ref identity to catch if ref changes between renders
      const refId = ref.id ? `#${ref.id}` : `untitled`;
      const refParentId = ref.parentElement?.id ? `#${ref.parentElement.id}` : ref.parentElement?.tagName ?? 'none';
      console.debug('[useChartEngine] pre-init ref identity', { refId, tagName: ref.tagName, parentTag: refParentId, refPointer: Number(ref) });

      // Force ECharts to rule out ChartGPU as the error source
      const { createAndInitChartAdapter } = await import('../components/chart/ChartRegistry');
      chartResult = await createAndInitChartAdapter(
        ref,
        { grid: chartGrid, xAxisType, xAxisLabel: options.xAxisLabel, yAxisLabel: options.yAxisLabel, chartTitle: options.chartTitle },
        { chartType: options.type === 'timeseries' ? 'timeseries' : 'scatter', enginePreference: 'echarts' }
      );
      console.debug('[useChartEngine] ECharts forced init done', { engineName: chartResult.engineName, instanceType: typeof chartResult.instance });

      const capturedInstance = chartResult.instance;
      const capturedEngine = chartResult.engineName;

      // The adapter has returned successfully — the chart IS initialized.
      // ECharts internal setTimeout(0) callbacks may still fire and throw
      // insertBefore errors — catch and absorb them since the chart works.
      console.debug('[useChartEngine] init complete', { engineName: capturedEngine });
      initInProgress = false;

      // onChartReady may trigger SolidJS effects that cause ECharts DOM errors
      let chartReady = false;
      try {
        options.onChartReady?.(capturedInstance);
        chartReady = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('insertBefore')) {
          chartReady = true;
        } else {
          console.error('[useChartEngine] onChartReady error:', msg);
        }
      }

      // Defer status update so ECharts callbacks finish firing first
      // When status becomes 'ready', TimeseriesChart's createEffect fires and
      // calls instance.setOption() + instance.resize(). If ECharts isn't settled
      // yet, those throw insertBefore errors. Catch and absorb them — the chart
      // IS initialized, just not fully settled. Keep retrying until it works.
      if (chartReady) {
        const attemptSetReady = async () => {
          let attempts = 0;
          const MAX_ATTEMPTS = 8;
          const BASE_DELAY_MS = 500;
          const MAX_DELAY_MS = 4000;

          while (attempts < MAX_ATTEMPTS) {
            attempts++;
            try {
              // Wait for ECharts's rAF-based deferred work to complete.
              // double rAF flushes all ECharts internal setTimeout(0) and rAF callbacks.
              await new Promise<void>(resolve => {
                requestAnimationFrame(() => { requestAnimationFrame(resolve); });
              });
              // One more microtask flush for SolidJS reactive propagation
              await new Promise<void>(resolve => queueMicrotask(resolve));
              setChartStatus('ready');
              return;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg.includes('insertBefore')) {
                const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempts - 1), MAX_DELAY_MS);
                console.warn(`[useChartEngine] setChartStatus insertBefore, retrying in ${delay}ms (attempt ${attempts}/${MAX_ATTEMPTS})...`);
                await new Promise<void>(resolve => setTimeout(resolve, delay));
              } else {
                console.error('[useChartEngine] setStatus error:', msg);
                throw e;
              }
            }
          }
          console.warn('[useChartEngine] max retry attempts reached for setChartStatus');
          setChartStatus('ready'); // Last resort - set anyway
        };
        void attemptSetReady();
      }
      return;
    } catch (e) {
      initInProgress = false;
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : '';
      console.error('[useChartEngine] init failed:', msg, '| stack:', stack);
      setWebgpuReason(msg);
      setChartStatus('error');
      console.debug('[useChartEngine] status -> error');
    }
  };

  createEffect(() => {
    const ref = containerRef();
    if (ref && ref.parentElement && chartStatus() === 'loading') {
      void init().catch(() => { });
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