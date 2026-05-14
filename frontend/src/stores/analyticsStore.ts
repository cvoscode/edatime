import { createStore } from 'solid-js/store';
import type { RollingBandData, AnomalyRegionData } from '../types';

interface AnalyticsState {
  rollingEnabled: boolean;
  rollingWindow: number;
  rollingBands: RollingBandData[];
  anomalyEnabled: boolean;
  anomalyMethod: 'zscore' | 'iqr';
  anomalyThreshold: number;
  anomalyRegions: AnomalyRegionData[];
  spectralConfig: import('../types').SpectralConfig | null;
  fftData: Float64Array | null;
  spectrogramData: Float64Array[] | null;
  correlations: Record<string, number> | null;
}

const [analyticsState, setAnalyticsState] = createStore<AnalyticsState>({
  rollingEnabled: false,
  rollingWindow: 50,
  rollingBands: [],
  anomalyEnabled: false,
  anomalyMethod: 'zscore',
  anomalyThreshold: 3.0,
  anomalyRegions: [],
  spectralConfig: null,
  fftData: null,
  spectrogramData: null,
  correlations: null
});

export const analyticsStore = {
  get state() { return analyticsState; },

  setRollingEnabled(v: boolean) {
    setAnalyticsState('rollingEnabled', v);
  },

  setRollingWindow(n: number) {
    setAnalyticsState('rollingWindow', n);
  },

  setRollingBands(bands: RollingBandData[]) {
    setAnalyticsState('rollingBands', bands);
  },

  setAnomalyEnabled(v: boolean) {
    setAnalyticsState('anomalyEnabled', v);
  },

  setAnomalyMethod(m: 'zscore' | 'iqr') {
    setAnalyticsState('anomalyMethod', m);
  },

  setAnomalyThreshold(t: number) {
    setAnalyticsState('anomalyThreshold', t);
  },

  setAnomalyRegions(regions: AnomalyRegionData[]) {
    setAnalyticsState('anomalyRegions', regions);
  },

  setSpectralConfig(config: import('../types').SpectralConfig | null) {
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
      rollingEnabled: false,
      rollingWindow: 50,
      rollingBands: [],
      anomalyEnabled: false,
      anomalyMethod: 'zscore',
      anomalyThreshold: 3.0,
      anomalyRegions: [],
      spectralConfig: null,
      fftData: null,
      spectrogramData: null,
      correlations: null
    });
  }
};