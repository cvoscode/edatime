/**
 * domain/timeseries/components/TimeseriesChart.tsx
 *
 * Wraps ChartView with timeseries-specific callbacks and prop mapping.
 * All chart engine logic stays in ChartView; this component just maps
 * domain store state to ChartView props and wires up update callbacks.
 */
import { Component, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import { chartStore } from '../../../stores/chartStore';
import { analyticsStore } from '../../../stores/analyticsStore';
import { uiStore } from '../../../stores/uiStore';
import ChartView from '../../../components/chart/ChartView';
import type { RollingBandData, AnomalyRegionData } from '../../../types';
import type { ChartUpdateFn } from '../types';
import { timeseriesStore } from '../store';

interface TimeseriesChartProps {
  onChartReady?: (instance: any) => void;
  onEngineReady?: (name: string) => void;
  rollingBands?: RollingBandData[];
  anomalyRegions?: AnomalyRegionData[];
}

// FIXED: chartUpdateFn and chartReady were module-level mutable vars that bled
// state between component instances. Now they are proper component-level signals.
const TimeseriesChart: Component<TimeseriesChartProps> = (props) => {
  const [chartUpdateFn, setChartUpdateFn] = createSignal<ChartUpdateFn | null>(null);
  const [chartReady, setChartReady] = createSignal(false);

  const handleChartReady = (updateFn: ChartUpdateFn, chartInstance?: any) => {
    setChartUpdateFn(() => updateFn);
    setChartReady(true);
    props.onChartReady?.(chartInstance);
  };

  const handleZoom = (start: number, end: number, yMin?: number, yMax?: number) => {
    chartStore.setYAuto(false);
    chartStore.setViewport({
      xMin: start,
      xMax: end,
      yMin: yMin ?? chartStore.state.viewport.yMin,
      yMax: yMax ?? chartStore.state.viewport.yMax,
    });
  };

  const handleZoomOut = () => {
    chartStore.stepBackZoom();
  };

  const handleCtrlClick = (dataX: number, dataY: number, clientX: number, clientY: number) => {
    const pending = timeseriesStore.getAdaptiveFilterPoints();
    if (!pending) {
      timeseriesStore.setAdaptiveFilterPointsSignal({ x1: dataX, y1: dataY, x2: null, y2: null, screenX: clientX, screenY: clientY, column: '' });
      timeseriesStore.setPopupScreenPosSignal({ x: clientX, y: clientY });
    } else if (pending.x2 === null) {
      timeseriesStore.setAdaptiveFilterPointsSignal({ ...pending, x2: dataX, y2: dataY });
      timeseriesStore.setPopupScreenPosSignal({ x: clientX, y: clientY });
    }
  };

  const drawTool = timeseriesStore.getDrawTool();
  const drawColor = timeseriesStore.getDrawColor();
  const drawWidth = timeseriesStore.getDrawWidth();

  return (
    <ChartView
      containerId="main-chart"
      onReady={handleChartReady}
      onChartReady={props.onChartReady}
      onEngineReady={props.onEngineReady}
      onZoom={handleZoom}
      onZoomOut={handleZoomOut}
      onCtrlClick={handleCtrlClick}
      rollingBands={props.rollingBands ?? timeseriesStore.state.rollingBands}
      anomalyRegions={props.anomalyRegions ?? timeseriesStore.state.anomalyRegions}
      drawMode={drawTool() === 'zoom' ? 'zoom' : drawTool() === 'none' ? 'pan' : drawTool() as any}
      drawColor={drawColor()}
      drawWidth={drawWidth()}
      chartTitle={timeseriesStore.state.chartTitle}
      xAxisLabel={timeseriesStore.state.xAxisLabel}
      yAxisLabel={timeseriesStore.state.yAxisLabel}
      pendingAdaptivePoint={timeseriesStore.getAdaptiveFilterPoints() as any}
      adaptiveLineFilters={timeseriesStore.state.adaptiveLineFilters as any}
    />
  );
};

export default TimeseriesChart;