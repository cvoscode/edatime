import { createStore } from 'solid-js/store';
import type { ScatterConfig } from '../types';

interface ScatterState {
  config: ScatterConfig;
  view: 'plot' | 'matrix';
  zoomLevel: number;
  matrixColumns: string[];
  isLoading: boolean;
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
  isLoading: false
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

  reset() {
    setScatterState({
      config: { ...defaultConfig },
      view: 'plot',
      zoomLevel: 1,
      matrixColumns: [],
      isLoading: false
    });
  }
};