/**
 * useTimeseriesChartData — Layer 1 of the chart loading redesign.
 *
 * Single hook that owns the full fetch → transform → cache lifecycle.
 * No more duplicated stores, no more manual cache invalidation.
 */
import { createSignal, createEffect, onCleanup } from 'solid-js';
import { fetchTimeseriesData, buildSeriesConfig } from '../services/dataFetch';
import { datasetStore } from '../stores/datasetStore';
import { uiStore } from '../stores/uiStore';
import type { ColorScaleName } from '../utils/colorScale';
import type { AdaptiveLineFilter } from '../types';
import { useAbortController } from './useAbortController';
import { debugLog } from '../utils/debug';

export interface TimeseriesChartDataOptions {
  viewport: () => { xMin: number; xMax: number };
  columns: () => string[];
  xAxisColumn: () => string | null;
  colors: () => Record<string, string>;
  filters: () => Record<string, { min: number; max: number }>;
  colorColumn: () => string | null;
  adaptiveFilters: () => AdaptiveLineFilter[];
}

export interface TimeseriesChartDataResult {
  data: () => any[] | null;
  isLoading: () => boolean;
  isDownsampled: () => boolean;
  error: () => string | null;
  lastDataYRange: () => { min: number; max: number } | null;
  fetch: () => void;
  invalidateCache: () => void;
}

interface CacheEntry {
  xValues: Float64Array;
  series: Record<string, Float64Array>;
  colorByColumn?: Record<string, Float64Array>;
  returnedRows: number;
  downsampled: boolean;
  builtConfig: any[] | null;
  dataYMin: number;
  dataYMax: number;
}

function buildCacheKey(vp: { xMin: number; xMax: number }, columns: string[]): string {
  return `${vp.xMin.toFixed(0)}_${vp.xMax.toFixed(0)}_${columns.slice().sort().join(',')}`;
}

function computeYRange(config: any[]): { min: number; max: number } {
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of config) {
    if (!Array.isArray(s.data)) continue;
    for (const pt of s.data) {
      const y = Number(pt?.[1]);
      if (Number.isFinite(y)) {
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return { min: 0, max: 1 };
  }
  return { min: yMin, max: yMax };
}

export function useTimeseriesChartData(
  options: TimeseriesChartDataOptions
): TimeseriesChartDataResult {
  const { signal: abortSignal, abort, restart: restartAbort } = useAbortController();

  const [isLoading, setIsLoading] = createSignal(false);
  const [isDownsampled, setIsDownsampled] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [data, setData] = createSignal<any[] | null>(null);
  const [lastDataYRange, setLastDataYRange] = createSignal<{ min: number; max: number } | null>(null);

  let cache = new Map<string, CacheEntry>();
  let currentCacheKey = '';
  let fetchTimer: ReturnType<typeof setTimeout> | null = null;

  function rebuildWithCurrentOptions(
    xValues: Float64Array,
    series: Record<string, Float64Array>,
    colorByColumn?: Record<string, Float64Array>
  ): any[] | null {
    if (!xValues || !series) return null;
    return buildSeriesConfig(
      xValues,
      series,
      options.colors(),
      options.filters(),
      colorByColumn,
      options.colorColumn(),
      true,
      uiStore.state.colorScale as ColorScaleName,
      options.adaptiveFilters()
    );
  }

  const doFetch = async () => {
    const xCol = options.xAxisColumn();
    const cols = options.columns();
    console.debug('[useTimeseriesChartData] doFetch', { xCol, colCount: cols.length, colSlice: cols.slice(0, 5) });
    if (!xCol || cols.length === 0) {
      console.debug('[useTimeseriesChartData] doFetch early return - no xCol or cols');
      setData(null);
      return;
    }

    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.time_range;
    if (!timeRange) {
      debugLog('useTimeseriesChartData: no timeRange in metadata');
      console.debug('[useTimeseriesChartData] no timeRange in metadata');
      return;
    }

    const vp = options.viewport();
    const cacheKey = buildCacheKey(vp, cols);
    console.debug('[useTimeseriesChartData] viewport & cacheKey', { vp, cacheKey });

    const cached = cache.get(cacheKey);
    if (cached?.builtConfig) {
      console.debug('[useTimeseriesChartData] cache hit, rebuilding with current options');
      const built = rebuildWithCurrentOptions(cached.xValues, cached.series, cached.colorByColumn);
      if (built) {
        setData(built);
        setIsDownsampled(cached.downsampled);
        setLastDataYRange(computeYRange(built));
        console.debug('[useTimeseriesChartData] cache hit built', { seriesCount: built.length });
        return;
      }
    }

    const start = new Date(vp.xMin || timeRange.min).toISOString();
    const end = new Date(vp.xMax || timeRange.max).toISOString();
    console.debug('[useTimeseriesChartData] fetching data', { start, end });

    setIsLoading(true);
    setError(null);
    abort();
    restartAbort();

    try {
      console.debug('[useTimeseriesChartData] calling fetchTimeseriesData');
      const result = await fetchTimeseriesData(
        start,
        end,
        1200,
        xCol,
        cols,
        abortSignal,
        options.colorColumn()
      );
      console.debug('[useTimeseriesChartData] fetchTimeseriesData returned', { returnedRows: result.returnedRows, downsampled: result.downsampled, xValuesLen: result.xValues.length, seriesKeys: Object.keys(result.series) });

      const built = rebuildWithCurrentOptions(result.xValues, result.series, result.colorByColumn);
      console.debug('[useTimeseriesChartData] rebuildWithCurrentOptions result', { builtLen: built?.length ?? 0 });

      const entry: CacheEntry = {
        xValues: result.xValues,
        series: result.series,
        colorByColumn: result.colorByColumn,
        returnedRows: result.returnedRows,
        downsampled: result.downsampled,
        builtConfig: built,
        dataYMin: Number.POSITIVE_INFINITY,
        dataYMax: Number.NEGATIVE_INFINITY,
      };

      if (built) {
        const yRange = computeYRange(built);
        entry.dataYMin = yRange.min;
        entry.dataYMax = yRange.max;
        setLastDataYRange(yRange);
        console.debug('[useTimeseriesChartData] built yRange', yRange);
      }

      cache.set(cacheKey, entry);
      currentCacheKey = cacheKey;
      setData(built);
      setIsDownsampled(result.downsampled);
      console.debug('[useTimeseriesChartData] data set', { builtLen: built?.length ?? 0 });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        debugLog('useTimeseriesChartData: aborted');
        console.debug('[useTimeseriesChartData] aborted');
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useTimeseriesChartData] error:', msg);
      setError(msg);
      setData(null);
      console.error('[useTimeseriesChartData]', msg);
    } finally {
      setIsLoading(false);
      console.debug('[useTimeseriesChartData] loading false');
    }
  };

  const invalidateCache = () => {
    if (fetchTimer) clearTimeout(fetchTimer);
    cache.clear();
    currentCacheKey = '';
    fetchTimer = setTimeout(() => doFetch(), 50);
  };

  // Re-fetch when viewport changes (debounced 150ms)
  createEffect(() => {
    const vp = options.viewport();
    const cols = options.columns();
    const xCol = options.xAxisColumn();
    if (!xCol || cols.length === 0) return;
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => doFetch(), 150);
  });

  // Invalidate cache + re-fetch when structural options change
  createEffect(() => {
    // Touch signals to track them as dependencies
    void options.columns();
    void options.colorColumn();
    void options.filters();
    void options.adaptiveFilters();
    invalidateCache();
  });

  // Re-render when colors change (debounced 50ms, no re-fetch)
  createEffect(() => {
    void options.colors();
    void options.colorColumn();
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
      if (!currentCacheKey) return;
      const cached = cache.get(currentCacheKey);
      if (cached) {
        const built = rebuildWithCurrentOptions(cached.xValues, cached.series, cached.colorByColumn);
        if (built) {
          setData(built);
          setLastDataYRange(computeYRange(built));
        }
      }
    }, 50);
  });

  onCleanup(() => {
    if (fetchTimer) clearTimeout(fetchTimer);
    abort();
  });

  return {
    data,
    isLoading,
    isDownsampled,
    error,
    lastDataYRange,
    fetch: doFetch,
    invalidateCache,
  };
}