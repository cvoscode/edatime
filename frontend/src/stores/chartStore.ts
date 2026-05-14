import { createStore } from 'solid-js/store';
import type { ChartViewport, ZoomState, Annotation, ChartInstance } from '../types';

interface ChartState {
  viewport: ChartViewport;
  zoomHistory: ZoomState;
  chartInstance: ChartInstance | null;
  annotations: Annotation[];
  isDrawing: boolean;
  drawMode: 'pan' | 'zoom' | 'select' | 'arrow' | 'box';
  isLoading: boolean;
  lastDataYMin: number | null;
  lastDataYMax: number | null;
  yAuto: boolean;
  seriesVisibility: Record<string, boolean>;
}

const defaultViewport: ChartViewport = {
  xMin: 0,
  xMax: 100,
  yMin: 0,
  yMax: 1
};

const [chartState, setChartState] = createStore<ChartState>({
  viewport: { ...defaultViewport },
  zoomHistory: { zoomStack: [{ ...defaultViewport }], currentIndex: 0 },
  chartInstance: null,
  annotations: [],
  isDrawing: false,
  drawMode: 'pan',
  isLoading: false,
  lastDataYMin: null,
  lastDataYMax: null,
  yAuto: true,
  seriesVisibility: {},
});

export const chartStore = {
  get state() { return chartState; },

  setViewport(viewport: ChartViewport) {
    setChartState('viewport', viewport);
    const newStack = chartState.zoomHistory.zoomStack.slice(0, chartState.zoomHistory.currentIndex + 1);
    newStack.push(viewport);
    setChartState('zoomHistory', {
      zoomStack: newStack,
      currentIndex: newStack.length - 1
    });
  },

  zoomIn() {
    const current = chartState.viewport;
    const xRange = current.xMax - current.xMin;
    const yRange = current.yMax - current.yMin;
    const factor = 0.5;

    this.setViewport({
      xMin: current.xMin + xRange * factor,
      xMax: current.xMax - xRange * factor,
      yMin: current.yMin + yRange * factor,
      yMax: current.yMax - yRange * factor
    });
  },

  zoomOut() {
    const history = chartState.zoomHistory;
    if (history.currentIndex > 0) {
      const newIndex = history.currentIndex - 1;
      setChartState('viewport', history.zoomStack[newIndex]);
      setChartState('zoomHistory', 'currentIndex', newIndex);
    }
  },

  resetZoom() {
    const first = chartState.zoomHistory.zoomStack[0];
    if (first) {
      this.setViewport({ ...first });
    }
  },

  setChartInstance(instance: ChartInstance | null) {
    setChartState('chartInstance', instance);
  },

  addAnnotation(annotation: Annotation) {
    setChartState('annotations', [...chartState.annotations, annotation]);
  },

  removeAnnotation(id: string) {
    setChartState('annotations', chartState.annotations.filter(a => a.id !== id));
  },

  setDrawMode(mode: 'pan' | 'zoom' | 'select' | 'arrow' | 'box') {
    setChartState('drawMode', mode);
  },

  setLoading(loading: boolean) {
    setChartState('isLoading', loading);
  },

  setLastDataYRange(min: number, max: number) {
    setChartState('lastDataYMin', min);
    setChartState('lastDataYMax', max);
  },

  getLastDataYRange(): { min: number; max: number } | null {
    if (chartState.lastDataYMin !== null && chartState.lastDataYMax !== null && chartState.lastDataYMax > chartState.lastDataYMin) {
      return { min: chartState.lastDataYMin, max: chartState.lastDataYMax };
    }
    return null;
  },

  setYAuto(auto: boolean) {
    setChartState('yAuto', auto);
  },

  fitYToData() {
    const yRange = this.getLastDataYRange();
    if (yRange) {
      const pad = (yRange.max - yRange.min) * 0.04;
      this.setViewport({
        xMin: chartState.viewport.xMin,
        xMax: chartState.viewport.xMax,
        yMin: yRange.min - pad,
        yMax: yRange.max + pad,
      });
    }
  },

  setSeriesVisibility(name: string, visible: boolean) {
    setChartState('seriesVisibility', name, visible);
  },

  getSeriesVisibility(name: string): boolean {
    return chartState.seriesVisibility[name] !== false;
  },

  getAllSeriesVisibility(): Record<string, boolean> {
    return { ...chartState.seriesVisibility };
  },

  clearSeriesVisibility() {
    setChartState('seriesVisibility', {});
  }
};