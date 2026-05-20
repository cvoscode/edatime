/**
 * Scatter domain hooks — useScatterData, useScatterCorrelations, useScatterColorScale.
 */
import { createEffect, createMemo } from 'solid-js';
import { scatterDomain } from './store';
import { fetchScatterCorrelations } from '../../services/api/endpoints';
import { fetchScatterData } from '../../services/dataFetch';
import { scatterStore } from '../../stores/scatterStore';
import { datasetStore } from '../../stores/datasetStore';
import { uiStore } from '../../stores/uiStore';
import { chartStore } from '../../stores/chartStore';
import type { ScatterFilterParams, ColorScaleInfo } from './types';

// =============================================================================
// useScatterData
// Fetches scatter points based on current config and linked filters from main chart.
// =============================================================================

export function useScatterData() {
  const config = createMemo(() => scatterStore.state.config);
  const timeRange = createMemo(() => {
    const vp = chartStore.state.viewport;
    return vp ? { start: vp.xMin, end: vp.xMax } : null;
  });
  const filters = createMemo(() => uiStore.state.filters);
  const adaptiveLineFilters = createMemo(() => uiStore.state.adaptiveLineFilters);
  const colorScaleName = createMemo(() => uiStore.state.colorScale);

  const fetchPoints = async () => {
    const { xCol, yCol, colorCol, sizeCol, limit } = config();
    if (!xCol || !yCol) return;

    scatterStore.setLoading(true);
    try {
      // Build linked filter params from main chart state
      const params: ScatterFilterParams = { limit };

      const tr = timeRange();
      if (tr && tr.start && tr.end) {
        params.start = tr.start;
        params.end = tr.end;
      }

      const numericFilters = filters();
      const filterEntries = Object.entries(numericFilters);
      if (filterEntries.length > 0) {
        params.filters = filterEntries.map(([column, { min, max }]) => ({ column, min, max }));
      }

      const lineFilters = adaptiveLineFilters();
      if (lineFilters.length > 0) {
        params.line_filters = lineFilters.map((f) => ({
          column: f.column,
          op: f.keepAbove ? 'above' : 'below',
          value: 0, // not used by backend
        }));
      }

      const resp = await fetchScatterData(
        xCol,
        yCol,
        limit,
        colorCol || null,
        sizeCol || null,
        params,
      );

      scatterDomain.setScatterData({
        points: resp.points,
        colorValues: resp.colorValues ?? null,
        colorLabels: resp.colorLabels ?? null,
        colorMin: resp.colorMin ?? null,
        colorMax: resp.colorMax ?? null,
        sizeValues: resp.sizeValues ?? null,
        sizeMin: resp.sizeMin ?? null,
        sizeMax: resp.sizeMax ?? null,
        totalPoints: resp.totalPoints,
      });
    } catch (e) {
      console.error('[useScatterData] failed to fetch scatter points:', e);
    } finally {
      scatterStore.setLoading(false);
    }
  };

  // Re-fetch when config or linked filters change
  createEffect(() => {
    const { xCol, yCol, colorCol, sizeCol } = config();
    void xCol; void yCol; void colorCol; void sizeCol;
    void timeRange();
    void filters();
    void adaptiveLineFilters();
    fetchPoints();
  });

  return { refetch: fetchPoints };
}

// =============================================================================
// useScatterCorrelations
// Fetches correlation suggestions from /api/scatter/correlations.
// =============================================================================

export function useScatterCorrelations() {
  const config = createMemo(() => scatterStore.state.config);
  const threshold = createMemo(() => scatterStore.state.suggestionThreshold);

  const refreshCorrelations = async (base: string) => {
    if (!base) return;
    try {
      const resp = await fetchScatterCorrelations(base, threshold());
      const corrMap: Record<string, { pearson: number | null; spearman: number | null }> = {};
      for (const item of resp.correlations) {
        corrMap[item.column] = { pearson: item.pearson, spearman: item.spearman };
      }
      scatterDomain.setCorrelations(corrMap);
      scatterDomain.setSuggestions(
        (resp.suggestions ?? []).map((s) => ({
          column: `${s.x} × ${s.y}`,
          count: 0,
          pearson: s.correlation,
          spearman: null,
        }))
      );
    } catch (e) {
      console.error('[useScatterCorrelations] failed to fetch correlations:', e);
    }
  };

  createEffect(() => {
    const x = config().xCol;
    if (x) refreshCorrelations(x);
  });

  return { refreshCorrelations };
}

// =============================================================================
// useScatterColorScale
// Returns color scale info based on the color column dtype.
// Handles the scatter color-by-column reliability issue:
// - Numeric columns: gradient scale with colorMin/colorMax from response
// - Categorical columns: discrete palette with categories from response
// - Missing/infinite values: fallback color handled by caller
// =============================================================================

export function useScatterColorScale(): () => ColorScaleInfo {
  return createMemo(() => {
    const colorCol = scatterStore.state.config.colorCol;
    if (!colorCol) {
      return { isNumeric: false as const, categories: [] as string[] };
    }

    // Check if color column is categorical
    const meta = datasetStore.state.metadata;
    const columns = meta?.columns;
    if (!columns) return { isNumeric: false as const, categories: [] as string[] };
    const colMeta = columns.find((c) => (c as any).name === colorCol);
    const isNumeric = colMeta
      ? (colMeta as any).dtype === 'Float64' || (colMeta as any).dtype === 'Int64' || (colMeta as any).dtype === 'UInt64'
      : false;

    if (isNumeric) {
      const info: ColorScaleInfo = {
        isNumeric: true,
        min: scatterStore.state.colorMin ?? 0,
        max: scatterStore.state.colorMax ?? 1,
      };
      return info;
    }

    // Categorical: build unique categories from colorLabels
    const colorLabels = scatterStore.state.colorLabels;
    if (colorLabels) {
      const seen = new Set<string>();
      const categories: string[] = [];
      for (const label of colorLabels) {
        if (label == null) continue;
        const key = String(label).trim() || 'Missing';
        if (!seen.has(key)) {
          seen.add(key);
          categories.push(key);
        }
      }
      const info: ColorScaleInfo = { isNumeric: false, categories };
      return info;
    }

    const info: ColorScaleInfo = { isNumeric: false, categories: [] };
    return info;
  });
}