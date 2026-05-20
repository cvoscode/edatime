import { createSignal, onCleanup } from 'solid-js';
import { chartStore } from '../stores/chartStore';
import { analyticsStore } from '../stores/analyticsStore';
import { timeseriesStore } from '../domain/timeseries/store';
import { datasetStore } from '../stores/datasetStore';
import { uiStore } from '../stores/uiStore';
import { fetchTimeseriesData, buildSeriesConfig, updateCachedColors, getCachedData } from '../services/dataFetch';
import { fetchRollingBands, fetchAnomalies } from '../services/api';
import type { ColorScaleName } from '../utils/colorScale';
import type { AdaptiveLineFilter } from '../types';
import { useAbortController } from './useAbortController';
import { debugLog, debugLogOnce } from '../utils/debug';

export interface UseTimeseriesDataOptions {
  xAxisColumn: () => string | null;
  traceColumns: () => string[];
  colorColumn: () => string | null;
  mergedColors: () => Record<string, string>;
  allTraceColumns: () => string[];
  colorPalette: () => string[];
  onUpdateChart: (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void;
}

export interface UseTimeseriesDataResult {
  isLoading: () => boolean;
  isDownsampled: () => boolean;
  fetch: () => void;
  refetch: () => void;
  cleanup: () => void;
}

export function useTimeseriesData(options: UseTimeseriesDataOptions): UseTimeseriesDataResult {
  const [isLoading, setIsLoading] = createSignal(false);
  const [isDownsampled, setIsDownsampled] = createSignal(false);

  const { signal: abortSignal, abort, restart: restartAbort } = useAbortController();
  let fetchInProgress = false;
  let viewportDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const fetchAndRender = async () => {
    const xCol = options.xAxisColumn();
    const traces = options.traceColumns();
    if (!xCol || traces.length === 0) {
      debugLog('useTimeseriesData.fetchAndRender skipped', { xCol, tracesLen: traces.length });
      return;
    }

    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.timeRange;
    if (!timeRange) {
      debugLog('useTimeseriesData.fetchAndRender skipped: no timeRange');
      return;
    }

    const viewport = chartStore.state.viewport;
    const start = new Date(viewport.xMin || timeRange[0]).toISOString();
    const end = new Date(viewport.xMax || timeRange[1]).toISOString();

    debugLog('useTimeseriesData.fetchAndRender start', { xCol, traces, start, end, viewport });

    setIsLoading(true);
    abort();
    try {
      const result = await fetchTimeseriesData(start, end, 1200, xCol, traces, abortSignal, options.colorColumn());
      debugLogOnce('useTimeseriesData-result', 'useTimeseriesData result', { returnedRows: result.returnedRows, downsampled: result.downsampled });
      setIsDownsampled(result.downsampled);

      const seriesConfig = buildSeriesConfig(
        result.xValues,
        result.series,
        options.mergedColors(),
        uiStore.state.filters,
        result.colorByColumn,
        options.colorColumn(),
        !result.downsampled,
        uiStore.state.colorScale as ColorScaleName,
        uiStore.state.adaptiveLineFilters as AdaptiveLineFilter[]
      );
      options.onUpdateChart(
        seriesConfig,
        viewport.xMin || timeRange[0],
        viewport.xMax || timeRange[1],
        viewport.yMin,
        viewport.yMax
      );

      if (analyticsStore.state.rollingEnabled) {
        void fetchAndCacheRollingBands(start, end, traces.join(','));
      }
      if (analyticsStore.state.anomalyEnabled) {
        void fetchAndCacheAnomalyRegions(start, end, traces.join(','));
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        debugLog('useTimeseriesData.fetchAndRender aborted (stale request)');
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error('useTimeseriesData: Failed to fetch/render timeseries:', msg);
      uiStore.addToast({ message: msg, type: 'error', duration: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAndCacheRollingBands = async (start: string, end: string, columns: string) => {
    try {
      const response = await fetchRollingBands({ start, end, columns, window: analyticsStore.state.rollingWindow });
      timeseriesStore.setRollingBands(response.bands);
    } catch (e) {
      console.warn('Failed to fetch rolling bands:', e);
    }
  };

  const fetchAndCacheAnomalyRegions = async (start: string, end: string, columns: string) => {
    try {
      const response = await fetchAnomalies({ start, end, columns, method: analyticsStore.state.anomalyMethod, threshold: analyticsStore.state.anomalyThreshold });
      timeseriesStore.setAnomalyRegions(response.regions);
    } catch (e) {
      console.warn('Failed to fetch anomaly regions:', e);
    }
  };

  // Debounced viewport-triggered fetch
  const scheduleViewportFetch = () => {
    if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
    viewportDebounceTimer = setTimeout(() => {
      fetchInProgress = true;
      fetchAndRender().finally(() => { fetchInProgress = false; });
    }, 150);
  };

  const cleanup = () => {
    if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
    abort();
  };

  onCleanup(cleanup);

  return {
    isLoading,
    isDownsampled,
    fetch: fetchAndRender,
    refetch: fetchAndRender,
    cleanup,
  };
}