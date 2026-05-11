import { createStore } from 'solid-js/store';
import type { RollingBandConfig, AnomalyConfig, SpectralConfig } from '../types';

interface AnalyticsState {
  rollingBands: RollingBandConfig[];
  anomalyOverlay: AnomalyConfig | null;
  spectralConfig: SpectralConfig | null;
  fftData: Float64Array | null;
  spectrogramData: Float64Array[] | null;
  correlations: Record<string, number> | null;
}

const [analyticsState, setAnalyticsState] = createStore<AnalyticsState>({
  rollingBands: [],
  anomalyOverlay: null,
  spectralConfig: null,
  fftData: null,
  spectrogramData: null,
  correlations: null
});

export const analyticsStore = {
  get state() { return analyticsState; },

  addRollingBand(config: RollingBandConfig) {
    setAnalyticsState('rollingBands', [...analyticsState.rollingBands, config]);
  },

  removeRollingBand(column: string) {
    setAnalyticsState('rollingBands', analyticsState.rollingBands.filter(b => b.column !== column));
  },

  setAnomalyOverlay(config: AnomalyConfig | null) {
    setAnalyticsState('anomalyOverlay', config);
  },

  setSpectralConfig(config: SpectralConfig | null) {
    setAnalyticsState('spectralConfig', config);
  },

  setFftData(data: Float64Array | null) {
    setAnalyticsState('fftData', data);
  },

  setSpectrogramData(data: Float64Array[] | null) {
    setAnalyticsState('spectrogramData', data);
  },

  setCorrelations(corr: Record<string, number> | null) {
    setAnalyticsState('correlations', corr);
  },

  reset() {
    setAnalyticsState({
      rollingBands: [],
      anomalyOverlay: null,
      spectralConfig: null,
      fftData: null,
      spectrogramData: null,
      correlations: null
    });
  }
};