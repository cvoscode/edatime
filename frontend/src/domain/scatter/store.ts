/**
 * Scatter domain store — wraps the existing scatterStore with typed setters.
 *
 * NOTE: This module does NOT create its own store. It re-exports the existing
 * scatterStore from stores/scatterStore.ts and adds thin typed helpers on top.
 * All actual state lives in stores/scatterStore.ts so that pages and other
 * consumers continue to work without modification.
 */
import { scatterStore as _scatterStore } from '../../stores/scatterStore';
import type { ScatterConfig, ScatterState } from './types';

// Re-export the store and its state type
export { scatterStore } from '../../stores/scatterStore';
export type { ScatterConfig, ScatterState } from './types';

/**
 * Thin typed wrapper over the existing scatterStore.
 * All getters delegate to scatterStore.state; setters call scatterStore methods.
 */
export const scatterDomain = {
  get state(): ScatterState {
    return _scatterStore.state as unknown as ScatterState;
  },

  setConfig(partial: Partial<ScatterConfig>) {
    _scatterStore.setConfig(partial);
  },

  setCorrelations(corrs: Record<string, { pearson: number | null; spearman: number | null }>) {
    _scatterStore.setCorrelations(corrs);
  },

  setScatterData(data: {
    points: [number, number][];
    colorValues?: number[] | null;
    colorLabels?: (string | null)[] | null;
    colorMin?: number | null;
    colorMax?: number | null;
    sizeValues?: number[] | null;
    sizeMin?: number | null;
    sizeMax?: number | null;
    totalPoints: number;
  }) {
    _scatterStore.setScatterPoints(data.points, data.totalPoints);
    if (data.colorValues !== undefined) {
      _scatterStore.setColorValues(
        data.colorValues,
        data.colorMin ?? null,
        data.colorMax ?? null
      );
    }
    if (data.colorLabels !== undefined) {
      _scatterStore.setColorLabels(data.colorLabels);
    }
    if (data.sizeValues !== undefined) {
      _scatterStore.setSizeValues(data.sizeValues, data.sizeMin ?? null, data.sizeMax ?? null);
    }
  },

  setLoading(loading: boolean) {
    _scatterStore.setLoading(loading);
  },

  setRenderMode(mode: 'scatter' | 'density') {
    _scatterStore.setRenderMode(mode);
  },

  setView(view: 'plot' | 'matrix') {
    _scatterStore.setView(view);
  },

  setSuggestions(
    suggestions: Array<{ column: string; count: number; pearson: number | null; spearman: number | null }>
  ) {
    // scatterStore.setSuggestions expects CorrelationItem[] from types/api.ts
    _scatterStore.setSuggestions(
      suggestions.map((s) => ({
        column: s.column,
        count: s.count,
        pearson: s.pearson,
        spearman: s.spearman,
      }))
    );
  },
};