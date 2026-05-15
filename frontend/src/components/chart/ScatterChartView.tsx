import { Component, createSignal, createEffect, createMemo, onMount, onCleanup } from 'solid-js';
import * as echarts from 'echarts';
import { uiStore } from '../../stores';
import { getColorForValue, getColorPalette, sampleGradient } from '../../utils/colorScale';
import { getActivePlotTemplate, toEChartsTheme } from '../../utils/plotTemplate';

interface ScatterChartViewProps {
  containerId?: string;
  onReady?: (updateChart: (options: ChartOptions) => void) => void;
  onEngineReady?: (engineName: string) => void;
  onEngineChanged?: (engineName: string) => void;
  onZoom?: (xMin: number, xMax: number, yMin: number, yMax: number) => void;
  chartTitle?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  renderMode?: 'scatter' | 'density';
  binSize?: number;
  densityColormap?: string;
  densityNormalization?: 'linear' | 'sqrt' | 'log';
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

interface ChartSeries {
  type: 'scatter';
  name: string;
  data: any[];
  mode?: 'points' | 'density';
  binSize?: number;
  densityColormap?: string;
  densityNormalization?: 'linear' | 'sqrt' | 'log';
  symbolSize?: number | ((value: any[]) => number);
  color?: string;
  sampling?: 'none' | 'lttb';
  visualMap?: any;
}

interface ChartOptions {
  series: ChartSeries[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

const CHART_GRID = { left: 72, right: 72, top: 24, bottom: 50 };

const ScatterChartView: Component<ScatterChartViewProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [chartStatus, setChartStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  const [engineName, setEngineName] = createSignal<string>('');
  const [webgpuReason, setWebgpuReason] = createSignal<string>('');
  const [themeVersion, setThemeVersion] = createSignal(0);
  let chartInstance: any = null;
  let resizeObserver: ResizeObserver | null = null;
  let chartgpuBlobUrl: string | null = null;
  let chartModule: any = null;

  const activeTemplate = createMemo(() =>
    getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme)
  );
  const echartsThemeName = createMemo(() =>
    `edatime-scatter-${activeTemplate().id}`
  );

  const registerTheme = () => {
    const tmpl = activeTemplate();
    echarts.registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };

  const initChart = async () => {
    if (!containerRef) return;
    setChartStatus('loading');

    const template = activeTemplate();
    console.debug('[ScatterChartView] initChart: theme =', template.id);

    if (chartInstance) {
      try {
        chartInstance.dispose?.();
      } catch (_) {}
      chartInstance = null;
    }

    resizeObserver?.disconnect();
    resizeObserver = null;

    if (chartgpuBlobUrl) {
      URL.revokeObjectURL(chartgpuBlobUrl);
      chartgpuBlobUrl = null;
    }

    registerTheme();

    try {
      const isDev = import.meta.env.DEV;
      const chartgpuUrl = isDev
        ? '/frontend/libs/chartgpu/index.js'
        : '/frontend/libs/chartgpu/index.js';

      if (!chartModule) {
        const resp = await fetch(chartgpuUrl);
        if (!resp.ok) throw new Error(`ChartGPU fetch failed: ${resp.status}`);
        const code = await resp.text();
        const blob = new Blob([code], { type: 'application/javascript' });
        chartgpuBlobUrl = URL.createObjectURL(blob);
        chartModule = await import(/* @vite-ignore */ chartgpuBlobUrl);
      }

      const { checkWebGPUSupport } = chartModule as any;
      if (checkWebGPUSupport) {
        const result = await checkWebGPUSupport();
        if (!result.supported) {
          throw new Error(`WebGPU unavailable: ${result.reason ?? 'unknown reason'}`);
        }
      }

      const createChart = (chartModule as any).createChart ?? (chartModule as any).default?.createChart;
      if (!createChart) throw new Error('createChart not found');

      const chartOpts = {
        grid: CHART_GRID,
        xAxis: { type: 'value' as const, name: props.xAxisLabel },
        yAxis: { type: 'value' as const, name: props.yAxisLabel },
        legend: { show: false },
        series: [],
        theme: activeTemplate().id,
      };
      console.debug('[ScatterChartView] createChart options:', { theme: chartOpts.theme });
      chartInstance = await createChart(containerRef, chartOpts);

      setEngineName('ChartGPU');
      props.onEngineReady?.('ChartGPU');
      setChartStatus('ready');
    } catch (e) {
      console.warn('ChartGPU not available, falling back to ECharts:', e);

      try {
        const echartsInstance = echarts.init(containerRef, echartsThemeName(), { renderer: 'canvas' });
        chartInstance = echartsInstance;

        echartsInstance.setOption({
          grid: CHART_GRID,
          xAxis: { type: 'value', name: props.xAxisLabel },
          yAxis: { type: 'value', name: props.yAxisLabel },
          series: [],
          color: getColorPalette(uiStore.state.colorScale, 8),
          ...(props.chartTitle ? { title: { text: props.chartTitle, left: 'center' } } : {}),
        });

        setEngineName('ECharts');
        setChartStatus('ready');

        resizeObserver = new ResizeObserver(() => echartsInstance.resize());
        resizeObserver.observe(containerRef);
      } catch (echartsErr) {
        console.error('ECharts fallback also failed:', echartsErr);
        const msg = e instanceof Error ? e.message : String(e);
        setWebgpuReason(msg);
        setChartStatus('error');
      }
    }
  };

  const buildChartGPUSeries = (options: ChartOptions): any[] => {
    const mode = props.renderMode ?? 'scatter';
    const isDensity = mode === 'density';

    const result: any[] = [];

    for (const s of options.series) {
      if (s.visualMap && !isDensity) {
        const colorMin = s.visualMap.min ?? 0;
        const colorMax = s.visualMap.max ?? 1;
        const colorScale = s.visualMap.inRange?.color;
        const scaleName = uiStore.state.colorScale;
        const n = s.data.length;
        const bins = 64;
        const span = colorMax - colorMin || 1;
        const grouped: any[][] = Array.from({ length: bins }, () => []);

        for (let i = 0; i < n; i++) {
          const pt = s.data[i];
          if (!Array.isArray(pt) || pt.length < 3) continue;
          const cv = pt[2];
          if (typeof cv !== 'number' || !Number.isFinite(cv)) continue;
          let b = Math.floor(((cv - colorMin) / span) * bins);
          if (b < 0) b = 0;
          if (b >= bins) b = bins - 1;
          grouped[b].push(pt);
        }

        const palette = getColorPalette(scaleName, 64);
        for (let b = 0; b < bins; b++) {
          if (grouped[b].length === 0) continue;
          const t = (b + 0.5) / bins;
          result.push({
            type: 'scatter',
            name: `${s.name} [${b}]`,
            data: grouped[b],
            mode: 'points',
            symbolSize: s.symbolSize ?? 4,
            color: sampleGradient(palette, t),
            sampling: 'none' as const,
          });
        }
      } else {
        result.push({
          type: 'scatter',
          name: s.name,
          data: s.data,
          mode: isDensity ? 'density' : 'points',
          binSize: isDensity ? (props.binSize ?? 2) : undefined,
          densityColormap: isDensity ? uiStore.state.colorScale : undefined,
          densityNormalization: isDensity ? (props.densityNormalization ?? 'log') : undefined,
          symbolSize: s.symbolSize ?? 4,
          color: s.color,
          sampling: 'none' as const,
        });
      }
    }

    return result;
  };

  const handleUpdateChart = (options: ChartOptions) => {
    if (!chartInstance) {
      console.debug('[ScatterChartView] handleUpdateChart: no chartInstance');
      return;
    }
    console.debug('[ScatterChartView] handleUpdateChart: engine =', engineName(), 'seriesLen =', options.series?.length);

    const prevVisibility = new Map<string, boolean>();
    const currentSeries = chartInstance.options?.series;
    if (Array.isArray(currentSeries)) {
      for (const s of currentSeries) {
        const name = typeof s?.name === 'string' ? s.name : '';
        if (name) prevVisibility.set(name, s.visible !== false);
      }
    }

    if (engineName() === 'ChartGPU') {
      const seriesWithVisibility = options.series.map(s => ({
        ...s,
        visible: prevVisibility.get(s.name) !== false,
      }));

      const opts: any = {
        grid: CHART_GRID,
        xAxis: { type: 'value' as const, name: props.xAxisLabel },
        yAxis: { type: 'value' as const, name: props.yAxisLabel },
        series: buildChartGPUSeries({ series: seriesWithVisibility }),
      };
      if (options.xMin !== undefined && options.xMax !== undefined) {
        opts.xAxis = { type: 'value' as const, name: props.xAxisLabel, min: options.xMin, max: options.xMax };
      }
      if (options.yMin !== undefined && options.yMax !== undefined) {
        opts.yAxis = { type: 'value' as const, name: props.yAxisLabel, min: options.yMin, max: options.yMax };
      }
      chartInstance.setOption(opts);
      chartInstance.resize();
    } else {
      const seriesWithVisibility = options.series.map(s => ({
        ...s,
        visible: prevVisibility.get(s.name) !== false,
      }));

      let visualMapConfig: any = undefined;
      const echartsSeries = seriesWithVisibility.map((s: ChartSeries) => {
        const base: any = {
          type: 'scatter',
          name: s.name,
          data: s.data,
          symbolSize: s.symbolSize ?? 4,
          color: s.color,
        };
        if (s.visualMap) {
          visualMapConfig = {
            ...s.visualMap,
            type: 'continuous',
            text: [s.visualMap.max?.toFixed(2) ?? '1.00', s.visualMap.min?.toFixed(2) ?? '0.00'],
            textStyle: { fontSize: 10 },
            itemHeight: 120,
            itemWidth: 14,
          };
        }
        return base;
      });

      const opts: any = {
        grid: CHART_GRID,
        xAxis: { type: 'value', name: props.xAxisLabel },
        yAxis: { type: 'value', name: props.yAxisLabel },
        series: echartsSeries,
        ...(visualMapConfig ? { visualMap: visualMapConfig } : {}),
        ...(props.chartTitle ? { title: { text: props.chartTitle, left: 'center' } } : {}),
      };
      if (options.xMin !== undefined && options.xMax !== undefined) {
        opts.xAxis = { type: 'value', name: props.xAxisLabel, min: options.xMin, max: options.xMax };
      }
      if (options.yMin !== undefined && options.yMax !== undefined) {
        opts.yAxis = { type: 'value', name: props.yAxisLabel, min: options.yMin, max: options.yMax };
      }
      chartInstance.setOption(opts);
      chartInstance.resize();
    }
  };

  onMount(async () => {
    await initChart();

    if (chartStatus() === 'ready') {
      props.onReady?.(handleUpdateChart);
    }
  });

  createEffect(() => {
    void uiStore.state.plotTheme;
    void uiStore.state.colorScale;
    setThemeVersion(v => v + 1);
  });

  createEffect(() => {
    void themeVersion();
    if (!chartInstance) return;

    const currentEngine = engineName();
    console.debug('[ScatterChartView] themeVersion effect: engine =', currentEngine);

    if (currentEngine === 'ECharts') {
      registerTheme();
      chartInstance.setOption({
        backgroundColor: activeTemplate().background,
        color: getColorPalette(uiStore.state.colorScale, 8),
      });
    } else if (currentEngine === 'ChartGPU') {
      console.debug('[ScatterChartView] recreating ChartGPU for theme change');
      const oldInstance = chartInstance;
      chartInstance = null;
      oldInstance?.dispose?.();

      initChart().then(() => {
        console.debug('[ScatterChartView] ChartGPU recreated, chartStatus =', chartStatus());
        if (chartStatus() === 'ready') {
          props.onReady?.(handleUpdateChart);
          props.onEngineChanged?.(engineName());
        }
      });
    }
  });

  createEffect(() => {
    if (!chartInstance) return;
    const labelOpts: any = {
      xAxis: { type: 'value' as const, name: props.xAxisLabel },
      yAxis: { type: 'value' as const, name: props.yAxisLabel },
    };
    if (engineName() === 'ECharts' && props.chartTitle) {
      labelOpts.title = { text: props.chartTitle, left: 'center' };
    }
    chartInstance.setOption(labelOpts, false);
  });

  createEffect(() => {
    void props.renderMode;
    void props.binSize;
    void props.densityColormap;
    void props.densityNormalization;
    if (chartInstance && chartStatus() === 'ready') {
      props.onReady?.(handleUpdateChart);
    }
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    if (chartInstance) {
      try {
        chartInstance.dispose?.();
      } catch (_) {}
      chartInstance = null;
    }
    if (chartgpuBlobUrl) {
      URL.revokeObjectURL(chartgpuBlobUrl);
      chartgpuBlobUrl = null;
    }
  });

  return (
    <div
      ref={containerRef}
      id={props.containerId ?? 'scatter-chart'}
      class="scatter-chart-container"
      data-status={chartStatus()}
      style={{ width: '100%', height: '100%', position: 'relative', 'background-color': activeTemplate().background }}
    >
      {chartStatus() === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'var(--color-text-muted, #888)' }}>
          Loading chart engine...
        </div>
      )}
      {chartStatus() === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', color: 'var(--color-text-muted, #888)', 'font-size': '14px', gap: '8px' }}>
          <span>Chart engine unavailable</span>
          <small style={{ 'font-size': '12px', 'max-width': '300px', 'text-align': 'center' }}>{webgpuReason()}</small>
        </div>
      )}
    </div>
  );
};

export default ScatterChartView;