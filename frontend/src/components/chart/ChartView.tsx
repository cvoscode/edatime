import { Component, createSignal, createEffect, createMemo, onMount, onCleanup } from 'solid-js';
import * as echarts from 'echarts';
import CanvasOverlay from './CanvasOverlay';
import type { RollingBandData, AnomalyRegionData, DragState } from '../../types';
import { uiStore, chartStore } from '../../stores';
import { getColorPalette } from '../../utils/colorScale';
import { getActivePlotTemplate, toEChartsTheme } from '../../utils/plotTemplate';
import { createChart } from '../../../libs/chartgpu/dist/index';

interface ChartViewProps {
  containerId?: string;
  onReady?: (updateChart: (series: any[], xAxisMin?: number, xAxisMax?: number, yAxisMin?: number, yAxisMax?: number) => void) => void;
  onChartReady?: (chartInstance: any) => void;
  onEngineReady?: (engineName: string) => void;
  onEngineChanged?: (engineName: string) => void;
  onZoom?: (start: number, end: number) => void;
  onZoomOut?: () => void;
  onChartClick?: (x: number, y: number) => void;
  rollingBands?: RollingBandData[];
  anomalyRegions?: AnomalyRegionData[];
  drawMode?: 'pan' | 'zoom' | 'arrow' | 'box';
  drawColor?: string;
  drawWidth?: number;
  chartTitle?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

const CHART_GRID = { left: 120, right: 30, top: 16, bottom: 36 };
const MIN_DRAG_PX = 8;

const ChartView: Component<ChartViewProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let selectionBoxRef: HTMLDivElement | undefined;
  const [chartStatus, setChartStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  const [engineName, setEngineName] = createSignal<string>('');
  const [webgpuReason, setWebgpuReason] = createSignal<string>('');
  const [drag, setDrag] = createSignal<DragState | null>(null);
  const [viewportBounds, setViewportBounds] = createSignal({ xMin: 0, xMax: 100, yMin: 0, yMax: 1 });
  const [themeVersion, setThemeVersion] = createSignal(0);
  let chartInstance: any = null;
  let axisLabelX = '';
  let axisLabelY = '';
  let resizeObserver: ResizeObserver | null = null;
  let chartgpuBlobUrl: string | null = null;

  const activeTemplate = createMemo(() =>
    getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme)
  );
  const echartsThemeName = createMemo(() =>
    `edatime-${activeTemplate().id}`
  );

  const registerTheme = () => {
    const tmpl = activeTemplate();
    echarts.registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };

  const initChart = async () => {
    if (!containerRef) return;
    console.debug('[ChartView] initChart: START, current status:', chartStatus());
    setChartStatus('loading');
    console.debug('[ChartView] initChart: set loading, containerRef:', !!containerRef);

    const template = activeTemplate();
    console.debug('[ChartView] initChart: theme =', template.id, 'colorScale =', uiStore.state.colorScale);

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
      // ChartGPU is imported statically from frontend/libs/chartgpu
      // WebGPU support check happens via try/catch around createChart
      let webgpuSupported = true;
      try {
        if (typeof navigator !== 'undefined' && !navigator.gpu) {
          webgpuSupported = false;
        }
      } catch (_) {
        webgpuSupported = false;
      }

      if (!webgpuSupported) {
        throw new Error('WebGPU not available');
      }

      const chartOpts = {
        grid: { left: 120, right: 30, top: 16, bottom: 36 },
        xAxis: { type: 'time' as const, name: props.xAxisLabel },
        yAxis: { type: 'value' as const, name: props.yAxisLabel },
        legend: { show: true, position: 'right' as const },
        series: [],
        theme: activeTemplate().id,
      };
      console.debug('[ChartView] createChart options:', { theme: chartOpts.theme });
      chartInstance = await createChart(containerRef, chartOpts);

      // Wire up ChartGPU events
      chartInstance.on('zoomRangeChange', (payload: any) => {
        const start = Number(payload?.start);
        const end = Number(payload?.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          props.onZoom?.(start, end);
        }
      });

      chartInstance.on('click', (payload: any) => {
        const x = Number(payload?.x);
        const y = Number(payload?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          props.onChartClick?.(x, y);
        }
      });

      setEngineName('ChartGPU');
      props.onEngineReady?.('ChartGPU');
      props.onChartReady?.(chartInstance);
      setChartStatus('ready');
    } catch (e) {
      console.warn('ChartGPU not available, falling back to ECharts:', e);

      try {
        // Clean up any orphaned DOM nodes left by ChartGPU attempt
        const cleanup = () => {
          if (!containerRef) return;
          while (containerRef.firstChild) {
            containerRef.removeChild(containerRef.firstChild);
          }
        };
        cleanup();

        // Defer echarts.init to ensure any async ChartGPU DOM mutations have settled
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // Verify container is still owned by us before calling init
        if (!containerRef || !containerRef.parentNode) {
          throw new Error('Chart container is no longer in the DOM');
        }

        // Double-clean after rAF
        cleanup();

        const echartsInstance = echarts.init(containerRef, echartsThemeName(), { renderer: 'canvas' });
        chartInstance = echartsInstance;
        props.onChartReady?.(echartsInstance);

        echartsInstance.setOption({
          grid: { left: 120, right: 30, top: 16, bottom: 36 },
          xAxis: { type: 'time' as const, name: props.xAxisLabel },
          yAxis: { type: 'value' as const, name: props.yAxisLabel },
          legend: { show: true, position: 'right' as const },
          series: [],
          color: getColorPalette(uiStore.state.colorScale, 8),
          ...(props.chartTitle ? { title: { text: props.chartTitle, left: 'center' as const } } : {}),
        });

        echartsInstance.on('dataZoom', () => {
          const option = echartsInstance.getOption() as any;
          const xAxis = option?.xAxis as any[];
          if (xAxis?.[0]?.min !== undefined && xAxis?.[0]?.max !== undefined) {
            const start = typeof xAxis[0].min === 'number' ? xAxis[0].min : Number(xAxis[0].min);
            const end = typeof xAxis[0].max === 'number' ? xAxis[0].max : Number(xAxis[0].max);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
              props.onZoom?.(start, end);
            }
          }
        });

        echartsInstance.on('click', (params: any) => {
          const x = Number(params?.value?.[0]);
          const y = Number(params?.value?.[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            props.onChartClick?.(x, y);
          }
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

  const handleUpdateChart = (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => {
    if (!chartInstance) {
      console.debug('[ChartView] handleUpdateChart: no chartInstance');
      return;
    }
    console.debug('[ChartView] handleUpdateChart: engine =', engineName(), 'seriesLen =', series?.length, 'chartInstance id =', chartInstance._chartId ?? 'unknown');
    const prevVisibility = chartStore.getAllSeriesVisibility();

    const seriesWithVisibility = series.map(s => ({
      ...s,
      visible: prevVisibility[s.name] !== false,
    }));

    // Calculate y-range for series visibility and store it
    let dataYMin = Number.POSITIVE_INFINITY;
    let dataYMax = Number.NEGATIVE_INFINITY;
    for (const s of series) {
      if (Array.isArray(s.data)) {
        for (const pt of s.data) {
          const y = Number(pt?.[1]);
          if (Number.isFinite(y)) {
            if (y < dataYMin) dataYMin = y;
            if (y > dataYMax) dataYMax = y;
          }
        }
      }
    }

    const opts: any = {
      grid: { left: 120, right: 30, top: 16, bottom: 36 },
      xAxis: { type: 'time' as const, name: axisLabelX },
      yAxis: { type: 'value' as const, name: axisLabelY },
      legend: { show: true, position: 'right' },
      series: seriesWithVisibility,
    };
    if (xMin !== undefined && xMax !== undefined) {
      opts.xAxis = { type: 'time' as const, min: xMin, max: xMax, name: axisLabelX };
      const yRange = chartStore.getLastDataYRange();
      const yMinVal = yMin ?? (yRange?.min ?? 0);
      const yMaxVal = yMax ?? (yRange?.max ?? 1);
      setViewportBounds({ xMin, xMax, yMin: yMinVal, yMax: yMaxVal });
    }
    if (yMin !== undefined && yMax !== undefined && !chartStore.state.yAuto) {
      opts.yAxis = { type: 'value' as const, min: yMin, max: yMax, name: axisLabelY };
    }

    const tooltipFormatter = (params: unknown): string => {
      type TooltipEntry = { seriesName?: string; value?: [number, number] };
      const rawList: unknown[] = Array.isArray(params) ? params : [params];
      const seen = new Set<string>();
      const list = rawList.filter((p): p is TooltipEntry => {
        const pp = p as TooltipEntry;
        const base = String(pp?.seriesName ?? '').replace(/__color_seg__.*/, '');
        if (!base || seen.has(base)) return false;
        seen.add(base);
        return true;
      });
      if (list.length === 0) return '';
      const first = list[0] as TooltipEntry;
      const x = Number(first?.value?.[0]);
      const date = Number.isFinite(x) ? new Date(x).toISOString().replace('T', ' ').slice(0, 19) : '';
      const rows = list.map((p) => {
        const pp = p as TooltipEntry;
        const name = String(pp?.seriesName ?? 'series').replace(/__color_seg__.*/, '');
        const y = Number.isFinite(pp?.value?.[1]) ? pp.value![1].toFixed(2) : 'NaN';
        return `<div style="display:flex;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${y}</span></div>`;
      }).join('');
      return date ? `<div style="opacity:0.8;margin-bottom:6px;">${date}</div>${rows}` : rows;
    };
    opts.tooltip = { show: true, trigger: 'axis', formatter: tooltipFormatter };

    console.debug('[ChartView] updateChart called', { engine: engineName(), seriesLen: seriesWithVisibility.length, firstSeriesPoints: seriesWithVisibility[0]?.data?.length, yAuto: chartStore.state.yAuto });
    chartInstance.setOption(opts);
    chartInstance.resize();

    // Defer chartStore writes to break reactive cycles - these writes can trigger
    // downstream effects that would otherwise cause recursion in the theme effect
    const finalDataYMin = dataYMin;
    const finalDataYMax = dataYMax;
    const newVisibility: Record<string, boolean> = {};
    for (const s of series) {
      newVisibility[s.name] = s.visible !== false;
    }
    setTimeout(() => {
      if (Number.isFinite(finalDataYMin) && Number.isFinite(finalDataYMax)) {
        chartStore.setLastDataYRange(finalDataYMin, finalDataYMax);
      }
      for (const [name, visible] of Object.entries(newVisibility)) {
        chartStore.setSeriesVisibility(name, visible);
      }
    }, 0);
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

  // Guard against concurrent initChart calls during theme change
  let isReinitializing = false;

  createEffect(() => {
    void themeVersion();
    if (!chartInstance) return;
    if (isReinitializing) return;

    const currentEngine = engineName();
    console.debug('[ChartView] themeVersion effect: engine =', currentEngine, 'plotTheme =', uiStore.state.plotTheme, 'uiTheme =', uiStore.state.theme);

    if (currentEngine === 'ECharts') {
      registerTheme();
      chartInstance.setOption({
        backgroundColor: activeTemplate().background,
        color: getColorPalette(uiStore.state.colorScale, 8),
      });
    } else if (currentEngine === 'ChartGPU') {
      console.debug('[ChartView] recreating ChartGPU for theme change');
      isReinitializing = true;
      const oldInstance = chartInstance;
      chartInstance = null;
      oldInstance?.dispose?.();

      initChart().then(() => {
        // Guard against re-entry: if isReinitializing was set again while we were
        // async initializing, abort this callback and let the newer run handle it
        if (isReinitializing) return;
        isReinitializing = false;
        console.debug('[ChartView] ChartGPU recreated, chartStatus =', chartStatus());
        if (chartStatus() === 'ready') {
          props.onReady?.(handleUpdateChart);
          props.onChartReady?.(chartInstance);
          props.onEngineChanged?.(engineName());
        }
      });
    }
  });

  createEffect(() => {
    if (!chartInstance) return;
    axisLabelX = props.xAxisLabel ?? '';
    axisLabelY = props.yAxisLabel ?? '';
    const labelOpts: any = {
      xAxis: { type: 'time' as const, name: props.xAxisLabel },
      yAxis: { type: 'value' as const, name: props.yAxisLabel },
    };
    if (engineName() === 'ECharts') {
      if (props.chartTitle) {
        labelOpts.title = { text: props.chartTitle, left: 'center' };
      }
      chartInstance.setOption(labelOpts, false);
    }
  });

  const handlePointerDown = (e: PointerEvent) => {
    if (props.drawMode !== 'zoom') return;
    if (e.button !== 0) return;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    containerRef?.setPointerCapture(e.pointerId);
    setDrag({ pointerId: e.pointerId, startX: x, endX: x, startY: y, endY: y });
  };

  const handlePointerMove = (e: PointerEvent) => {
    const d = drag();
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ ...d, endX: x, endY: y });

    if (selectionBoxRef) {
      const left = Math.min(d.startX, x);
      const top = Math.min(d.startY, y);
      const width = Math.abs(x - d.startX);
      const height = Math.abs(y - d.startY);
      selectionBoxRef.style.left = `${left}px`;
      selectionBoxRef.style.top = `${top}px`;
      selectionBoxRef.style.width = `${width}px`;
      selectionBoxRef.style.height = `${height}px`;
      selectionBoxRef.style.display = 'block';
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    const d = drag();
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    containerRef?.releasePointerCapture(e.pointerId);

    const dx = Math.abs(d.endX - d.startX);
    const xMin = Math.min(d.startX, d.endX);
    const xMax = Math.max(d.startX, d.endX);

    if (dx >= MIN_DRAG_PX && props.onZoom) {
      const plotLeft = CHART_GRID.left;
      const plotRight = rect.width - CHART_GRID.right;
      const plotWidth = Math.max(1, plotRight - plotLeft);
      const vb = viewportBounds();
      const dataXMin = vb.xMin + ((xMin - plotLeft) / plotWidth) * (vb.xMax - vb.xMin);
      const dataXMax = vb.xMin + ((xMax - plotLeft) / plotWidth) * (vb.xMax - vb.xMin);
      if (dataXMax > dataXMin) {
        props.onZoom(dataXMin, dataXMax);
      }
    }

    setDrag(null);
    if (selectionBoxRef) {
      selectionBoxRef.style.display = 'none';
    }
  };

  const handleDoubleClick = () => {
    props.onZoomOut?.();
  };

  const handleWheel = (e: WheelEvent) => {
    if (e.shiftKey || e.ctrlKey || e.altKey) return; // Only plain wheel; modifiers reserved for browser/shortcuts
    e.preventDefault();
    const viewport = viewportBounds();
    const xRange = viewport.xMax - viewport.xMin;
    if (xRange <= 0) return;
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const rect = containerRef?.getBoundingClientRect();
    if (!rect) return;
    const plotLeft = CHART_GRID.left;
    const plotRight = rect.width - CHART_GRID.right;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const relX = (e.clientX - rect.left - plotLeft) / plotWidth;
    const centerDataX = viewport.xMin + relX * xRange;
    const newXMin = centerDataX - (centerDataX - viewport.xMin) * factor;
    const newXMax = centerDataX + (viewport.xMax - centerDataX) * factor;
    if (newXMax > newXMin && Number.isFinite(newXMin) && Number.isFinite(newXMax)) {
      props.onZoom?.(newXMin, newXMax);
    }
  };

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
      id={props.containerId ?? 'main-chart'}
      class="chart-container"
      data-status={chartStatus()}
      style={{ width: '100%', height: '100%', position: 'relative', 'background-color': activeTemplate().background }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDblClick={handleDoubleClick}
      onWheel={handleWheel}
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
      <div
        ref={selectionBoxRef}
        style={{
          position: 'absolute',
          'border': '1px solid rgba(0,212,255,0.9)',
          'background': 'rgba(0,212,255,0.15)',
          'pointer-events': 'none',
          'display': 'none',
          'z-index': 5,
        }}
      />
      {(chartStatus() === 'ready') && (
        <CanvasOverlay
          rollingBands={props.rollingBands ?? []}
          anomalyRegions={props.anomalyRegions ?? []}
          xMin={viewportBounds().xMin}
          xMax={viewportBounds().xMax}
          yMin={viewportBounds().yMin}
          yMax={viewportBounds().yMax}
          drawMode={props.drawMode ?? 'pan'}
          drawColor={props.drawColor}
          drawWidth={props.drawWidth}
          drag={drag()}
          containerWidth={containerRef?.clientWidth ?? 1200}
          containerHeight={containerRef?.clientHeight ?? 600}
          chartTitle={props.chartTitle}
          xAxisLabel={axisLabelX}
          yAxisLabel={axisLabelY}
        />
      )}
    </div>
  );
};

export default ChartView;