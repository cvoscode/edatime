/**
 * TimeseriesChart — Layer 2 of the chart loading redesign.
 *
 * Owns chart lifecycle. Receives processed series data as a prop.
 * Does NOT fetch data — that belongs to Layer 1 (useTimeseriesChartData).
 *
 * Props:
 *   data        — ChartSeriesData[] ready to render (from useTimeseriesChartData)
 *   viewport   — current viewport bounds
 *   options    — labels, overlays, draw settings
 *   onZoom     — zoom callback → chartStore
 *   onReady    — called with (updateFn, chartInstance) when chart is ready
 */
import { Component, createSignal, createEffect, createMemo, onCleanup } from 'solid-js';
import { DEFAULT_GRID } from './chart/chartEngine';
import { useChartEngine } from '../hooks/useChartEngine';
import { useChartViewport } from './chart/useChartViewport';
import CanvasOverlay from './chart/CanvasOverlay';
import { chartStore } from '../stores/chartStore';
import { uiStore } from '../stores/uiStore';
import { getColorPalette } from '../utils/colorScale';
import { getActivePlotTemplate } from '../utils/plotTemplate';
import type { PointerDragState } from '@/types';
import type { RollingBandData, AnomalyRegionData, AdaptiveLineFilter } from '@/types';

export interface TimeseriesChartOptions {
  rollingBands?: RollingBandData[];
  anomalyRegions?: AnomalyRegionData[];
  drawMode?: 'pan' | 'zoom' | 'arrow' | 'box';
  drawColor?: string;
  drawWidth?: number;
  chartTitle?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  pendingAdaptivePoint?: { x1: number; y1: number; x2: number | null; y2: number | null } | null;
  adaptiveLineFilters?: AdaptiveLineFilter[];
}

interface TimeseriesChartProps {
  containerId?: string;
  data: () => any[] | null;
  viewport: () => { xMin: number; xMax: number; yMin?: number; yMax?: number };
  options?: TimeseriesChartOptions;
  onZoom?: (start: number, end: number, yMin?: number, yMax?: number) => void;
  onZoomOut?: () => void;
  onCtrlClick?: (dataX: number, dataY: number, clientX: number, clientY: number) => void;
  onChartReady?: (instance: any) => void;
  onEngineReady?: (name: string) => void;
}

const CHART_GRID = DEFAULT_GRID;
const MIN_DRAG_PX = 8;

const TimeseriesChart: Component<TimeseriesChartProps> = (props) => {
  let wrapperRef: HTMLDivElement | undefined;
  let chartContainerRef: HTMLDivElement | undefined;
  let selectionBoxRef: HTMLDivElement | undefined;
  const [drag, setDrag] = createSignal<PointerDragState | null>(null);
  const [themeVersion, setThemeVersion] = createSignal(0);

  const opts = () => props.options ?? {};

  const activeTemplate = createMemo(() =>
    getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme)
  );

  const viewport = useChartViewport(
    () => wrapperRef,
    {
      grid: CHART_GRID,
      onZoom: (start: number, end: number, yMin?: number, yMax?: number) =>
        props.onZoom?.(start, end, yMin, yMax),
      onZoomOut: () => props.onZoomOut?.(),
      onCtrlClick: (dataX: number, dataY: number, clientX: number, clientY: number) =>
        props.onCtrlClick?.(dataX, dataY, clientX, clientY),
    }
  );

  const chartEngine = useChartEngine(
    () => chartContainerRef,
    {
      type: 'timeseries',
      grid: CHART_GRID,
      xAxisLabel: opts().xAxisLabel,
      yAxisLabel: opts().yAxisLabel,
      chartTitle: opts().chartTitle,
      onZoom: (start: number, end: number) => props.onZoom?.(start, end),
      onEngineReady: (name: string) => props.onEngineReady?.(name),
      onChartReady: (instance: any) => {
        props.onChartReady?.(instance);
      },
    }
  );

  const handleUpdateChart = (
    series: any[],
    xMin?: number,
    xMax?: number,
    yMin?: number,
    yMax?: number
  ) => {
    const instance = chartEngine.chartInstance();
    console.debug('[TimeseriesChart] handleUpdateChart', { hasInstance: !!instance, seriesCount: series.length, xMin, xMax, yMin, yMax, firstSeriesPoints: series[0]?.data?.length ?? 0 });
    if (!instance) return;

    const chartOpts: any = {
      grid: CHART_GRID,
      xAxis: { type: 'time' as const },
      yAxis: { type: 'value' as const },
      legend: { show: true, position: 'right' as const },
      series,
    };
    if (xMin !== undefined && xMax !== undefined) {
      chartOpts.xAxis = { type: 'time' as const, min: xMin, max: xMax };
      const yMinVal = yMin ?? 0;
      const yMaxVal = yMax ?? 1;
      viewport.setViewportBounds({ xMin, xMax, yMin: yMinVal, yMax: yMaxVal });
    }
    if (yMin !== undefined && yMax !== undefined && !chartStore.state.yAuto) {
      chartOpts.yAxis = { type: 'value' as const, min: yMin, max: yMax };
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
      const date = Number.isFinite(x)
        ? new Date(x).toISOString().replace('T', ' ').slice(0, 19)
        : '';
      const rows = list.map((p) => {
        const pp = p as TooltipEntry;
        const name = String(pp?.seriesName ?? 'series').replace(/__color_seg__.*/, '');
        const y = Number.isFinite(pp?.value?.[1]) ? pp.value![1].toFixed(2) : 'NaN';
        return `<div style="display:flex;justify-content:space-between;gap:12px;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span><span style="font-variant-numeric:tabular-nums;white-space:nowrap;">${y}</span></div>`;
      }).join('');
      return date ? `<div style="opacity:0.8;margin-bottom:6px;">${date}</div>${rows}` : rows;
    };
    chartOpts.tooltip = { show: true, trigger: 'axis' as const, formatter: tooltipFormatter };

    instance.setOption(chartOpts);
    instance.resize();
  };

  // Push data to chart when it changes
  createEffect(() => {
    const series = props.data();
    const vp = props.viewport();
    console.debug('[TimeseriesChart] effect fired', { hasSeries: !!series, seriesLength: series?.length ?? 0, chartStatus: chartEngine.chartStatus(), vp });
    if (series && chartEngine.chartStatus() === 'ready') {
      console.debug('[TimeseriesChart] calling handleUpdateChart');
      handleUpdateChart(series, vp.xMin, vp.xMax, vp.yMin, vp.yMax);
    }
  });

  // Theme changes
  createEffect(() => {
    void uiStore.state.plotTheme;
    void uiStore.state.colorScale;
    setThemeVersion((v) => v + 1);
  });

  createEffect(() => {
    void themeVersion();
    const instance = chartEngine.chartInstance();
    if (!instance) return;
    if (chartEngine.engineName() === 'ECharts') {
      instance.setOption({
        backgroundColor: activeTemplate().background,
        color: getColorPalette(uiStore.state.colorScale, 8),
      });
    }
  });

  // Pointer drag for box zoom
  const handlePointerDown = (e: PointerEvent) => {
    if (opts().drawMode !== 'zoom') return;
    if (e.button !== 0) return;
    const rect = wrapperRef?.getBoundingClientRect();
    if (!rect) return;
    wrapperRef?.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      startX: e.clientX - rect.left,
      endX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endY: e.clientY - rect.top,
    });
  };

  const handlePointerMove = (e: PointerEvent) => {
    const d = drag();
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = wrapperRef?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ pointerId: d.pointerId, startX: d.startX, endX: x, startY: d.startY, endY: y });
    if (selectionBoxRef) {
      const left = Math.min(d.startX, x);
      const top = Math.min(d.startY, y);
      selectionBoxRef.style.left = `${left}px`;
      selectionBoxRef.style.top = `${top}px`;
      selectionBoxRef.style.width = `${Math.abs(x - d.startX)}px`;
      selectionBoxRef.style.height = `${Math.abs(y - d.startY)}px`;
      selectionBoxRef.style.display = 'block';
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    const d = drag();
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = wrapperRef?.getBoundingClientRect();
    if (!rect) return;
    wrapperRef?.releasePointerCapture(e.pointerId);
    const dx = Math.abs(d.endX - d.startX);
    if (dx >= MIN_DRAG_PX && props.onZoom) {
      viewport.handleBoxZoom(d.startX, d.endX, d.startY, d.endY, rect.width, rect.height);
    }
    setDrag(null);
    if (selectionBoxRef) selectionBoxRef.style.display = 'none';
  };

  onCleanup(() => {
    chartEngine.dispose();
  });

  return (
    <div
      ref={wrapperRef}
      id={props.containerId ?? 'main-chart'}
      class="chart-container"
      data-status={chartEngine.chartStatus()}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        'background-color': activeTemplate().background,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={(e) => viewport.handleWheelZoom(e)}
    >
      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
        }}
      />
      {chartEngine.chartStatus() === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            color: 'var(--color-text-muted, #888)',
          }}
        >
          Loading chart engine...
        </div>
      )}
      {chartEngine.chartStatus() === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            'justify-content': 'center',
            color: 'var(--color-text-muted, #888)',
            'font-size': '14px',
            gap: '8px',
          }}
        >
          <span>Chart engine unavailable</span>
          <small style={{ 'font-size': '12px', 'max-width': '300px', 'text-align': 'center' }}>
            {chartEngine.webgpuReason()}
          </small>
        </div>
      )}
      <div
        ref={selectionBoxRef}
        style={{
          position: 'absolute',
          border: '1px solid rgba(0,212,255,0.9)',
          background: 'rgba(0,212,255,0.15)',
          'pointer-events': 'none',
          display: 'none',
          'z-index': 5,
        }}
      />
      {chartEngine.chartStatus() === 'ready' && (
        <CanvasOverlay
          rollingBands={opts().rollingBands ?? []}
          anomalyRegions={opts().anomalyRegions ?? []}
          xMin={viewport.viewportBounds().xMin}
          xMax={viewport.viewportBounds().xMax}
          yMin={viewport.viewportBounds().yMin}
          yMax={viewport.viewportBounds().yMax}
          drawMode={opts().drawMode ?? 'pan'}
          drawColor={opts().drawColor}
          drawWidth={opts().drawWidth}
          drag={drag() as any}
          containerWidth={wrapperRef?.clientWidth ?? 1200}
          containerHeight={wrapperRef?.clientHeight ?? 600}
          chartTitle={opts().chartTitle}
          xAxisLabel={opts().xAxisLabel}
          yAxisLabel={opts().yAxisLabel}
          pendingAdaptivePoint={opts().pendingAdaptivePoint}
          adaptiveLineFilters={opts().adaptiveLineFilters}
        />
      )}
    </div>
  );
};

export default TimeseriesChart;