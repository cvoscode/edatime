import { Component, createSignal, createEffect, createMemo, onMount, onCleanup } from 'solid-js';
import CanvasOverlay from './CanvasOverlay';
import type { RollingBandData, AnomalyRegionData, DragState } from '../../types';
import { uiStore, chartStore } from '../../stores';
import { getColorPalette } from '../../utils/colorScale';
import { getActivePlotTemplate } from '../../utils/plotTemplate';
import { initChartEngine, registerTheme, DEFAULT_GRID } from './chartEngine';

interface ChartViewProps {
  containerId?: string;
  onReady?: (updateChart: (series: any[], xAxisMin?: number, xAxisMax?: number, yAxisMin?: number, yAxisMax?: number) => void) => void;
  onChartReady?: (chartInstance: any) => void;
  onEngineReady?: (engineName: string) => void;
  onEngineChanged?: (engineName: string) => void;
  onZoom?: (start: number, end: number, yMin?: number, yMax?: number) => void;
  onZoomOut?: () => void;
  onChartClick?: (x: number, y: number) => void;
  onCtrlClick?: (dataX: number, dataY: number, clientX: number, clientY: number) => void;
  rollingBands?: RollingBandData[];
  anomalyRegions?: AnomalyRegionData[];
  drawMode?: 'pan' | 'zoom' | 'arrow' | 'box';
  drawColor?: string;
  drawWidth?: number;
  chartTitle?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  pendingAdaptivePoint?: { x1: number; y1: number; x2: number | null; y2: number | null } | null;
  adaptiveLineFilters?: import('../../types').AdaptiveLineFilter[];
}

const CHART_GRID = DEFAULT_GRID;
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
  let chartResult: { instance: any; engineName: 'ChartGPU' | 'ECharts'; dispose: () => void; resize: () => void } | null = null;
  let axisLabelX = '';
  let axisLabelY = '';

  const activeTemplate = createMemo(() =>
    getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme)
  );

  const initChart = async () => {
    if (!containerRef) return;
    setChartStatus('loading');

    if (chartInstance) {
      try { chartInstance.dispose?.(); } catch (_) {}
      chartInstance = null;
    }
    if (chartResult) {
      chartResult.dispose();
      chartResult = null;
    }

    registerTheme();

    try {
      chartResult = await initChartEngine({
        container: containerRef,
        grid: CHART_GRID,
        xAxisType: 'time',
        xAxisLabel: props.xAxisLabel,
        yAxisLabel: props.yAxisLabel,
        chartTitle: props.chartTitle,
        onZoom: (start, end, yMin, yMax) => props.onZoom?.(start, end, yMin, yMax),
        onClick: (x, y) => props.onChartClick?.(x, y),
      });

      chartInstance = chartResult.instance;
      setEngineName(chartResult.engineName);
      props.onEngineReady?.(chartResult.engineName);
      props.onChartReady?.(chartInstance);
      setChartStatus('ready');
    } catch (e) {
      console.error('[ChartView] initChart error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setWebgpuReason(msg);
      uiStore.addToast({ message: `Chart error: ${msg}`, type: 'error', duration: 0 });
      setChartStatus('error');
    }
  };

  const handleUpdateChart = (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => {
    if (!chartInstance) {
      console.debug('[ChartView] handleUpdateChart: no chartInstance');
      return;
    }
    const prevVisibility = chartStore.getAllSeriesVisibility();
    const seriesWithVisibility = series.map(s => ({
      ...s,
      visible: prevVisibility[s.name] !== false,
    }));

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
      grid: CHART_GRID,
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

    chartInstance.setOption(opts);
    chartInstance.resize();

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

    containerRef?.addEventListener('click', (e: MouseEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const bounds = containerRef.getBoundingClientRect();
      const cssX = e.clientX - bounds.left;
      const cssY = e.clientY - bounds.top;
      const vp = viewportBounds();
      const plotLeft = CHART_GRID.left;
      const plotRight = bounds.width - CHART_GRID.right;
      const plotTop = CHART_GRID.top;
      const plotBottom = bounds.height - CHART_GRID.bottom;
      const plotWidth = plotRight - plotLeft;
      const plotHeight = plotBottom - plotTop;
      const xNorm = Math.max(0, Math.min(1, (cssX - plotLeft) / plotWidth));
      const dataX = vp.xMin + xNorm * (vp.xMax - vp.xMin);
      const yNorm = Math.max(0, Math.min(1, (cssY - plotTop) / plotHeight));
      const dataY = vp.yMax - yNorm * (vp.yMax - vp.yMin);
      if (Number.isFinite(dataX) && Number.isFinite(dataY)) {
        props.onCtrlClick?.(dataX, dataY, e.clientX, e.clientY);
      }
    });
  });

  createEffect(() => {
    void uiStore.state.plotTheme;
    void uiStore.state.colorScale;
    setThemeVersion(v => v + 1);
  });

  let isReinitializing = false;

  createEffect(() => {
    void themeVersion();
    if (!chartInstance) return;
    if (isReinitializing) return;

    const currentEngine = engineName();

    if (currentEngine === 'ECharts') {
      registerTheme();
      chartInstance.setOption({
        backgroundColor: activeTemplate().background,
        color: getColorPalette(uiStore.state.colorScale, 8),
      });
    } else if (currentEngine === 'ChartGPU') {
      isReinitializing = true;
      const oldInstance = chartInstance;
      chartInstance = null;
      oldInstance?.dispose?.();

      initChart().then(() => {
        if (isReinitializing) return;
        isReinitializing = false;
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
    const xLabel = props.xAxisLabel ?? '';
    const yLabel = props.yAxisLabel ?? '';
    axisLabelX = xLabel;
    axisLabelY = yLabel;
    const labelOpts: any = {
      xAxis: { type: 'time' as const, name: xLabel },
      yAxis: { type: 'value' as const, name: yLabel },
    };
    if (engineName() === 'ECharts') {
      const title = props.chartTitle;
      if (title) {
        labelOpts.title = { text: title, left: 'center' };
      }
      chartInstance.setOption(labelOpts, false);
    } else if (engineName() === 'ChartGPU') {
      chartInstance.setOption(labelOpts);
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
      const plotTop = CHART_GRID.top;
      const plotBottom = rect.height - CHART_GRID.bottom;
      const plotWidth = Math.max(1, plotRight - plotLeft);
      const plotHeight = Math.max(1, plotBottom - plotTop);
      const vb = viewportBounds();
      const dataXMin = vb.xMin + ((xMin - plotLeft) / plotWidth) * (vb.xMax - vb.xMin);
      const dataXMax = vb.xMin + ((xMax - plotLeft) / plotWidth) * (vb.xMax - vb.xMin);
      const yTop = Math.min(d.startY, d.endY);
      const yBottom = Math.max(d.startY, d.endY);
      const dataYMin = vb.yMin + ((yBottom - plotTop) / plotHeight) * (vb.yMax - vb.yMin);
      const dataYMax = vb.yMin + ((yTop - plotTop) / plotHeight) * (vb.yMax - vb.yMin);
      if (dataXMax > dataXMin && dataYMax > dataYMin) {
        props.onZoom(dataXMin, dataXMax, dataYMin, dataYMax);
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
    if (e.shiftKey || e.ctrlKey || e.altKey) return;
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
    if (chartResult) {
      chartResult.dispose();
      chartResult = null;
    }
    chartInstance = null;
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
          pendingAdaptivePoint={props.pendingAdaptivePoint}
          adaptiveLineFilters={props.adaptiveLineFilters}
        />
      )}
    </div>
  );
};

export default ChartView;