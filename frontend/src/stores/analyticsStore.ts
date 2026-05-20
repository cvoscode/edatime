/**
 * Analytics store — rolling statistics, anomaly detection, and correlation data for the timeseries page.
 * Uses solid-js store for reactive state management.
 */
import { createStore } from 'solid-js/store';
import type { RollingBandData, AnomalyRegionData } from '../types';

interface AnalyticsState {
  rollingEnabled: boolean;
  rollingWindow: number;
  anomalyEnabled: boolean;
  anomalyMethod: 'zscore' | 'iqr';
  anomalyThreshold: number;
  correlations: Record<string, number> | null;
}

const [analyticsState, setAnalyticsState] = createStore<AnalyticsState>({
  rollingEnabled: false,
  rollingWindow: 50,
  anomalyEnabled: false,
  anomalyMethod: 'zscore',
  anomalyThreshold: 3.0,
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

  setAnomalyEnabled(v: boolean) {
    setAnalyticsState('anomalyEnabled', v);
  },

  setAnomalyMethod(m: 'zscore' | 'iqr') {
    setAnalyticsState('anomalyMethod', m);
  },

  setAnomalyThreshold(t: number) {
    setAnalyticsState('anomalyThreshold', t);
  },

  setCorrelations(corr: Record<string, number> | null) {
    setAnalyticsState('correlations', corr);
  },

  reset() {
    setAnalyticsState({
      rollingEnabled: false,
      rollingWindow: 50,
      anomalyEnabled: false,
      anomalyMethod: 'zscore',
      anomalyThreshold: 3.0,
      correlations: null
    });
  }
};