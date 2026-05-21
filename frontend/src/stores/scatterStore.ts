/**
 * Scatter store — scatter plot config, correlations, points, and rendering state.
 * Handles both scatter and density rendering modes.
 */
import { createStore } from 'solid-js/store';
import type { ScatterConfig, CorrelationItem, SuggestionItem } from '../types';

// Module-level revision tracker for cache invalidation
let _currentRevision: number | null = null;

interface ScatterState {
  config: ScatterConfig;
  view: 'plot' | 'matrix';
  zoomLevel: number;
  matrixColumns: string[];
  isLoading: boolean;
  correlations: Record<string, { pearson: number | null; spearman: number | null }>;
  suggestions: SuggestionItem[];
  suggestionThreshold: number;
  scatterPoints: [number, number][];
  colorValues: number[] | null;
  colorLabels: (string | null)[] | null;
  colorMin: number | null;
  colorMax: number | null;
  colorKind: 'continuous' | 'categorical' | null;
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
  sizeCol: '',
  limit: 10000,
  renderMode: 'scatter',
  densityNormalization: 'linear',
  binSize: 20
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
  colorKind: null,
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

  setSuggestions(suggestions: SuggestionItem[]) {
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

  setColorKind(kind: 'continuous' | 'categorical' | null) {
    setScatterState('colorKind', kind);
  },

  setSizeValues(values: number[] | null, sizeMin: number | null, sizeMax: number | null) {
    setScatterState('sizeValues', values);
    setScatterState('sizeMin', sizeMin);
    setScatterState('sizeMax', sizeMax);
  },

  setRenderMode(mode: 'scatter' | 'density') {
    setScatterState('renderMode', mode);
  },

  setState(patch: Partial<ScatterState>) {
    if (patch.config !== undefined) {
      setScatterState('config', { ...scatterState.config, ...patch.config });
    }
    if (patch.view !== undefined) setScatterState('view', patch.view);
    if (patch.zoomLevel !== undefined) setScatterState('zoomLevel', patch.zoomLevel);
    if (patch.matrixColumns !== undefined) setScatterState('matrixColumns', patch.matrixColumns);
    if (patch.isLoading !== undefined) setScatterState('isLoading', patch.isLoading);
    if (patch.correlations !== undefined) setScatterState('correlations', patch.correlations);
    if (patch.suggestions !== undefined) setScatterState('suggestions', patch.suggestions);
    if (patch.suggestionThreshold !== undefined) setScatterState('suggestionThreshold', patch.suggestionThreshold);
    if (patch.scatterPoints !== undefined) setScatterState('scatterPoints', patch.scatterPoints);
    if (patch.colorValues !== undefined) setScatterState('colorValues', patch.colorValues);
    if (patch.colorLabels !== undefined) setScatterState('colorLabels', patch.colorLabels);
    if (patch.colorMin !== undefined) setScatterState('colorMin', patch.colorMin);
    if (patch.colorMax !== undefined) setScatterState('colorMax', patch.colorMax);
    if (patch.colorKind !== undefined) setScatterState('colorKind', patch.colorKind);
    if (patch.sizeValues !== undefined) setScatterState('sizeValues', patch.sizeValues);
    if (patch.sizeMin !== undefined) setScatterState('sizeMin', patch.sizeMin);
    if (patch.sizeMax !== undefined) setScatterState('sizeMax', patch.sizeMax);
    if (patch.totalPoints !== undefined) setScatterState('totalPoints', patch.totalPoints);
    if (patch.renderMode !== undefined) setScatterState('renderMode', patch.renderMode);
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
      colorKind: null,
      sizeValues: null,
      sizeMin: null,
      sizeMax: null,
      totalPoints: 0,
      renderMode: 'scatter',
    });
  },

  serialize(): { xColumn: string; yColumn: string; colorColumn: string; renderMode: string } {
    return {
      xColumn: scatterState.config.xCol,
      yColumn: scatterState.config.yCol,
      colorColumn: scatterState.config.colorCol,
      renderMode: scatterState.renderMode,
    };
  },

  deserialize(data: { xCol?: string; yCol?: string; colorCol?: string; renderMode?: string }): void {
    if (data.xCol !== undefined) setScatterState('config', 'xCol', data.xCol);
    if (data.yCol !== undefined) setScatterState('config', 'yCol', data.yCol);
    if (data.colorCol !== undefined) setScatterState('config', 'colorCol', data.colorCol);
    if (data.renderMode !== undefined) setScatterState('renderMode', data.renderMode as 'scatter' | 'density');
  },

  getCurrentRevision(): number | null {
    return _currentRevision;
  },

  setRevision(revision: number | null) {
    _currentRevision = revision;
  }
};