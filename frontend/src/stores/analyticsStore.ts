/**
 * Analytics store — rolling statistics, anomaly detection, and correlation data for the timeseries page.
 * Uses solid-js store for reactive state management.
 */
import { createStore } from 'solid-js/store';
import type { RollingBandData, AnomalyRegionData } from '../types';

interface AnalyticsState {
  rollingEnabled: boolean;
  rollingWindow: number;
  rollingBands: RollingBandData[];
  rollingLoading: boolean;
  anomalyEnabled: boolean;
  anomalyMethod: 'zscore' | 'iqr';
  anomalyThreshold: number;
  anomalyRegions: AnomalyRegionData[];
  correlations: Record<string, number> | null;
}

const [analyticsState, setAnalyticsState] = createStore<AnalyticsState>({
  rollingEnabled: false,
  rollingWindow: 50,
  rollingBands: [],
  rollingLoading: false,
  anomalyEnabled: false,
  anomalyMethod: 'zscore',
  anomalyThreshold: 3.0,
  anomalyRegions: [],
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

  setRollingLoading(v: boolean) {
    setAnalyticsState('rollingLoading', v);
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

  setCorrelations(corr: Record<string, number> | null) {
    setAnalyticsState('correlations', corr);
  },

  reset() {
    setAnalyticsState({
      rollingEnabled: false,
      rollingWindow: 50,
      rollingBands: [],
      rollingLoading: false,
      anomalyEnabled: false,
      anomalyMethod: 'zscore',
      anomalyThreshold: 3.0,
      anomalyRegions: [],
      correlations: null
    });
  }
};