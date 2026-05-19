/**
 * Chart store — manages viewport, zoom history, annotations, and drawing state for timeseries charts.
 * Coordinates with ChartGPU or fallback chart adapters.
 */
import { createStore } from 'solid-js/store';
import type { ChartViewport, ZoomState, Annotation, ChartInstance } from '../types';

export interface Drawing {
  id: string;
  kind: 'arrow' | 'box';
  color: string;
  lineWidth: number;
  points: [number, number][]; // [x,y] in data coordinates
}

interface ChartState {
  viewport: ChartViewport;
  zoomHistory: ZoomState;
  initialView: ChartViewport | null;
  chartInstance: ChartInstance | null;
  annotations: Annotation[];
  drawings: Drawing[];
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
  initialView: null,
  chartInstance: null,
  annotations: [],
  drawings: [],
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

  setInitialView(viewport: ChartViewport) {
    setChartState('initialView', { ...viewport });
    // Also set as current if viewport not yet set
    if (!Number.isFinite(chartState.viewport.xMin) || !Number.isFinite(chartState.viewport.xMax)) {
      this.setViewport(viewport);
    }
  },

  setViewport(viewport: ChartViewport) {
    // Save current view to history before changing
    const currentView = { ...chartState.viewport };
    setChartState('viewport', viewport);

    // Push current view to history stack (limit to 10 entries)
    const newStack = chartState.zoomHistory.zoomStack.slice(0, chartState.zoomHistory.currentIndex + 1);
    newStack.push(currentView);
    if (newStack.length > 5) newStack.shift();
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
      const prevView = history.zoomStack[newIndex];
      if (prevView) {
        // Save current to history's forward side (for potential "redo")
        setChartState('viewport', { ...prevView });
        setChartState('zoomHistory', 'currentIndex', newIndex);
      }
    } else if (chartState.initialView) {
      // At bottom of history, go to initial view
      setChartState('viewport', { ...chartState.initialView });
    }
  },

  canZoomOut(): boolean {
    return chartState.zoomHistory.currentIndex > 0 || chartState.initialView !== null;
  },

  zoomForward() {
    const history = chartState.zoomHistory;
    if (history.currentIndex < history.zoomStack.length - 1) {
      const newIndex = history.currentIndex + 1;
      const nextView = history.zoomStack[newIndex];
      if (nextView) {
        setChartState('viewport', { ...nextView });
        setChartState('zoomHistory', 'currentIndex', newIndex);
      }
    }
  },

  canZoomForward(): boolean {
    return chartState.zoomHistory.currentIndex < chartState.zoomHistory.zoomStack.length - 1;
  },

  resetZoom() {
    if (chartState.initialView) {
      setChartState('viewport', { ...chartState.initialView });
    }
  },

  stepBackZoom() {
    const history = chartState.zoomHistory;
    if (history.currentIndex > 0) {
      const newIndex = history.currentIndex - 1;
      const prevView = history.zoomStack[newIndex];
      setChartState('viewport', { ...prevView });
      setChartState('zoomHistory', 'currentIndex', newIndex);
    } else if (chartState.initialView) {
      setChartState('viewport', { ...chartState.initialView });
    }
  },

  forceResetZoom() {
    if (chartState.initialView) {
      setChartState('zoomHistory', {
        zoomStack: [{ ...chartState.initialView }],
        currentIndex: 0
      });
      setChartState('viewport', { ...chartState.initialView });
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
    const keys = Object.keys(chartState.seriesVisibility);
    if (keys.length === 0) return;
    const patch: Record<string, undefined> = {};
    for (const k of keys) patch[k] = undefined;
    setChartState('seriesVisibility', patch);
  },

  addDrawing(drawing: Drawing) {
    setChartState('drawings', [...chartState.drawings, drawing]);
  },

  clearDrawings() {
    setChartState('drawings', []);
  },

  reset() {
    setChartState({
      viewport: { ...defaultViewport },
      zoomHistory: { zoomStack: [{ ...defaultViewport }], currentIndex: 0 },
      initialView: null,
      annotations: [],
      drawings: [],
      isDrawing: false,
      drawMode: 'pan',
      isLoading: false,
      lastDataYMin: null,
      lastDataYMax: null,
      yAuto: true,
      seriesVisibility: {},
    });
  },

  serialize() {
    return {
      viewport: chartState.viewport,
      initialView: chartState.initialView,
      seriesVisibility: chartState.seriesVisibility,
    };
  },

  deserialize(state: ReturnType<typeof this.serialize>) {
    setChartState({
      viewport: state.viewport ?? { ...defaultViewport },
      initialView: state.initialView ?? null,
      seriesVisibility: state.seriesVisibility ?? {},
    });
  }
};