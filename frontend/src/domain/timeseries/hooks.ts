/**
 * domain/timeseries/hooks.ts
 * Custom hooks for the timeseries domain.
 */
import { createSignal, createEffect, onCleanup, createMemo } from 'solid-js';
import { timeseriesStore } from './store';
import { chartStore } from '../../stores/chartStore';
import { datasetStore } from '../../stores/datasetStore';
import { uiStore } from '../../stores/uiStore';
import { analyticsStore } from '../../stores/analyticsStore';
import { useAbortController } from '../../hooks/useAbortController';
import { fetchTimeseriesData, buildSeriesConfig, updateCachedColors } from '../../services/dataFetch';
import { fetchRollingBands, fetchAnomalies } from '../../services/api';
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect';
import type { ColorScaleName } from '../../utils/colorScale';
import type { AdaptiveLineFilter } from '../../types';
import { debugLog, debugLogOnce } from '../../utils/debug';
import { VIEWPORT_DEBOUNCE_MS, COLOR_UPDATE_DEBOUNCE_MS } from './constants';

// =============================================================================
// useTimeseriesData — fetch/decode/render cycle
// =============================================================================

export interface UseTimeseriesDataOptions {
  xAxisColumn: () => string | null;
  traceColumns: () => string[];
  colorColumn: () => string | null;
  mergedColors: () => Record<string, string>;
  allTraceColumns: () => string[];
}

export interface UseTimeseriesDataResult {
  isLoading: () => boolean;
  isDownsampled: () => boolean;
  fetch: () => void;
  cleanup: () => void;
}

export function useTimeseriesData(
  options: UseTimeseriesDataOptions,
  updateChartFn: (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void
): UseTimeseriesDataResult {
  const [isLoading, setIsLoading] = createSignal(false);
  const [isDownsampled, setIsDownsampled] = createSignal(false);

  const { signal: abortSignal, abort } = useAbortController();
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
    timeseriesStore.setLoading(true);
    timeseriesStore.setShowSkeletonSignal(true);
    abort();
    try {
      const result = await fetchTimeseriesData(
        start, end, 1200, xCol, traces, abortSignal, options.colorColumn()
      );
      debugLogOnce('useTimeseriesData-result', 'useTimeseriesData result', {
        returnedRows: result.returnedRows,
        downsampled: result.downsampled,
      });
      setIsDownsampled(result.downsampled);
      timeseriesStore.setDownsampled(result.downsampled);

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

      updateChartFn(
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
      timeseriesStore.setLoading(false);
      timeseriesStore.setShowSkeletonSignal(false);
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
  createEffect(() => {
    const viewport = chartStore.state.viewport;
    const metadata = datasetStore.state.metadata;
    if (metadata && viewport && !fetchInProgress) {
      if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
      viewportDebounceTimer = setTimeout(() => {
        fetchInProgress = true;
        fetchAndRender().finally(() => { fetchInProgress = false; });
      }, VIEWPORT_DEBOUNCE_MS);
    }
  });

  const cleanup = () => {
    if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
    abort();
  };

  onCleanup(cleanup);

  return {
    isLoading,
    isDownsampled,
    fetch: fetchAndRender,
    cleanup,
  };
}

// =============================================================================
// useTimeseriesViewport — zoom/pan helpers
// =============================================================================

export function useTimeseriesViewport() {
  const zoomBadgeText = createMemo(() => {
    const vp = chartStore.state.viewport;
    if (!Number.isFinite(vp.xMin) || !Number.isFinite(vp.xMax)) return '—';
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    return `${fmt(vp.xMin)} – ${fmt(vp.xMax)}`;
  });

  const handleZoomOut = () => {
    chartStore.stepBackZoom();
  };

  const handleZoomReset = () => {
    chartStore.forceResetZoom();
  };

  return {
    zoomBadgeText,
    handleZoomOut,
    handleZoomReset,
    canZoomOut: () => chartStore.canZoomOut(),
    canZoomForward: () => chartStore.canZoomForward(),
    zoomForward: () => chartStore.zoomForward(),
  };
}

// =============================================================================
// useTimeseriesExport — export handlers
// =============================================================================

import { getCachedData } from '../../services/dataFetch';
import { exportChartAsPNG, exportChartAsCSV, exportChartAsSVG, exportChartAsJSON, exportChartAsHTML } from '../../utils/exportUtils';

export function useTimeseriesExport(chartInstanceRef: () => any) {
  const handleExportPNG = () => {
    const instance = chartInstanceRef();
    if (instance) exportChartAsPNG(instance, 'edatime_chart.png');
  };

  const handleExportCSV = () => {
    const cached = getCachedData();
    if (cached) exportChartAsCSV(cached.xValues, cached.series, 'edatime_data.csv');
  };

  const handleExportSVG = () => {
    const instance = chartInstanceRef();
    if (instance) exportChartAsSVG(instance, 'edatime_chart.svg');
  };

  const handleExportJSON = () => {
    const cached = getCachedData();
    if (cached) exportChartAsJSON(cached.xValues, cached.series, 'edatime_data.json');
  };

  const handleExportHTML = () => {
    const instance = chartInstanceRef();
    if (instance) exportChartAsHTML(instance, 'edatime_chart.html');
  };

  return {
    handleExportPNG,
    handleExportCSV,
    handleExportSVG,
    handleExportJSON,
    handleExportHTML,
  };
}

// =============================================================================
// useTimeseriesColorUpdates — debounced color refresh
// =============================================================================

export function useTimeseriesColorUpdates(
  mergedColors: () => Record<string, string>,
  updateChartFn: (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void
) {
  useDebouncedEffect(mergedColors, (colors) => {
    const seriesConfig = updateCachedColors(colors);
    if (seriesConfig && updateChartFn) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      const viewport = chartStore.state.viewport;
      updateChartFn(
        seriesConfig,
        viewport.xMin || timeRange?.[0],
        viewport.xMax || timeRange?.[1],
        viewport.yMin,
        viewport.yMax
      );
    }
  }, COLOR_UPDATE_DEBOUNCE_MS);
}

// =============================================================================
// useTimeseriesChartReady — chart ready callback
// =============================================================================

let _updateChartFn: ((series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void) | null = null;
let _chartReady = false;

export function getUpdateChartFn() { return _updateChartFn; }
export function isChartReady() { return _chartReady; }

export function useTimeseriesChartReady(
  onChartReady?: (instance: any) => void,
  onEngineReady?: (name: string) => void
) {
  const handleChartReady = (updateFn: any, chartInstance?: any) => {
    _updateChartFn = updateFn;
    _chartReady = true;
    onChartReady?.(chartInstance);
  };

  return { handleChartReady, onEngineReady };
}