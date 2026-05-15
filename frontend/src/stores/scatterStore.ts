import { createStore } from 'solid-js/store';
import type { ScatterConfig, CorrelationItem } from '../types';

interface ScatterState {
  config: ScatterConfig;
  view: 'plot' | 'matrix';
  zoomLevel: number;
  matrixColumns: string[];
  isLoading: boolean;
  correlations: Record<string, { pearson: number | null; spearman: number | null }>;
  suggestions: CorrelationItem[];
  suggestionThreshold: number;
  scatterPoints: [number, number][];
  colorValues: number[] | null;
  colorLabels: (string | null)[] | null;
  colorMin: number | null;
  colorMax: number | null;
  sizeValues: number[] | null;
  sizeMin: number | null;
  sizeMax: number | null;
  totalPoints: number;
  renderMode: 'scatter' | 'density';
}

const defaultConfig: ScatterConfig = {
  xCol: '',
  yCol: '',
  colorCol: '',
  sizeCol: ''
};

const [scatterState, setScatterState] = createStore<ScatterState>({
  config: { ...defaultConfig },
  view: 'plot',
  zoomLevel: 1,
  matrixColumns: [],
  isLoading: false,
  correlations: {},
  suggestions: [],
  suggestionThreshold: 0.7,
  scatterPoints: [],
  colorValues: null,
  colorLabels: null,
  colorMin: null,
  colorMax: null,
  sizeValues: null,
  sizeMin: null,
  sizeMax: null,
  totalPoints: 0,
  renderMode: 'scatter',
});

export const scatterStore = {
  get state() { return scatterState; },

  setConfig(config: Partial<ScatterConfig>) {
    setScatterState('config', { ...scatterState.config, ...config });
  },

  setView(view: 'plot' | 'matrix') {
    setScatterState('view', view);
  },

  setZoomLevel(level: number) {
    setScatterState('zoomLevel', level);
  },

  setMatrixColumns(columns: string[]) {
    setScatterState('matrixColumns', columns);
  },

  setLoading(loading: boolean) {
    setScatterState('isLoading', loading);
  },

  setCorrelations(correlations: Record<string, { pearson: number | null; spearman: number | null }>) {
    setScatterState('correlations', correlations);
  },

  setSuggestions(suggestions: CorrelationItem[]) {
    setScatterState('suggestions', suggestions);
  },

  setSuggestionThreshold(threshold: number) {
    setScatterState('suggestionThreshold', threshold);
  },

  setScatterPoints(points: [number, number][], totalPoints: number) {
    setScatterState('scatterPoints', points);
    setScatterState('totalPoints', totalPoints);
  },

  setColorValues(values: number[] | null, colorMin: number | null, colorMax: number | null) {
    setScatterState('colorValues', values);
    setScatterState('colorMin', colorMin);
    setScatterState('colorMax', colorMax);
  },

  setColorLabels(labels: (string | null)[] | null) {
    setScatterState('colorLabels', labels);
  },

  setSizeValues(values: number[] | null, sizeMin: number | null, sizeMax: number | null) {
    setScatterState('sizeValues', values);
    setScatterState('sizeMin', sizeMin);
    setScatterState('sizeMax', sizeMax);
  },

  setRenderMode(mode: 'scatter' | 'density') {
    setScatterState('renderMode', mode);
  },

  reset() {
    setScatterState({
      config: { ...defaultConfig },
      view: 'plot',
      zoomLevel: 1,
      matrixColumns: [],
      isLoading: false,
      correlations: {},
      suggestions: [],
      suggestionThreshold: 0.7,
      scatterPoints: [],
      colorValues: null,
      colorLabels: null,
      colorMin: null,
      colorMax: null,
      sizeValues: null,
      sizeMin: null,
      sizeMax: null,
      totalPoints: 0,
      renderMode: 'scatter',
    });
  }
};