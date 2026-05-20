import { Component, createSignal, Show, createMemo, onMount, createEffect, onCleanup, untrack } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { chartStore } from '../stores/chartStore';
import { datasetStore } from '../stores/datasetStore';
import { uiStore } from '../stores/uiStore';
import { analyticsStore } from '../stores/analyticsStore';
import { timeseriesStore } from '../domain/timeseries/store';
import ChartView from '../components/chart/ChartView';
import SeriesToolbar from './SeriesToolbar';
import ChartToolbar from './ChartToolbar';
import ColumnFilterModal from '../domain/timeseries/components/ColumnFilterModal';
import AnalyticsDrawer from '../domain/timeseries/components/AnalyticsDrawer';
import LabelsDrawer from '../domain/timeseries/components/LabelsDrawer';
import AdaptiveFilterPopup from '../domain/timeseries/components/AdaptiveFilterPopup';
import { fetchTimeseriesData, buildSeriesConfig, updateCachedColors, getCachedData } from '../services/dataFetch';
import { fetchRollingBands, fetchAnomalies } from '../services/api';
import { exportChartAsPNG, exportChartAsCSV, exportChartAsSVG, exportChartAsJSON, exportChartAsHTML } from '../utils/exportUtils';
import { debugLog, debugLogOnce } from '../utils/debug';
import { getColorPalette } from '../utils/colorScale';
import { useDebouncedEffect } from '../hooks/useDebouncedEffect';
import { useAbortController } from '../hooks/useAbortController';
import styles from './TimeseriesPage.module.css';

const TimeseriesPage: Component = () => {
  let pageRef: HTMLDivElement | undefined;
  const navigate = useNavigate();

  const [drawTool, setDrawTool] = createSignal<'none' | 'zoom' | 'arrow' | 'box'>('none');
  const [drawColor, setDrawColor] = createSignal('#ff0055');
  const [drawWidth, setDrawWidth] = createSignal(2);
  const [showAnalytics, setShowAnalytics] = createSignal(false);
  const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
  const [showExportMore, setShowExportMore] = createSignal(false);
  const [chartTitle, setChartTitle] = createSignal('');
  const [xAxisLabel, setXAxisLabel] = createSignal('');
  const [yAxisLabel, setYAxisLabel] = createSignal('');
  const [chartEngine, setChartEngine] = createSignal<string>('');
  const [filterModalOpen, setFilterModalOpen] = createSignal(false);
  const [filterModalColumn, setFilterModalColumn] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isDownsampled, setIsDownsampled] = createSignal(false);
  const [showSkeleton, setShowSkeleton] = createSignal(false);
  const [colorColumn, setColorColumn] = createSignal<string | null>(null);
  const [showAdaptivePopup, setShowAdaptivePopup] = createSignal(false);
  const [adaptiveFilterPoints, setAdaptiveFilterPoints] = createSignal<{
    x1: number; y1: number; x2: number; y2: number; screenX: number; screenY: number;
  } | null>(null);

  // FIXED: chartUpdateFn, chartReady, chartInstanceRef, lastContextMenuTime, fetchInProgress,
  // and viewportDebounceTimer were module-level mutable vars that bypassed reactivity.
  // Now they are proper signals at component level.
  const [updateChartFn, setUpdateChartFn] = createSignal<((series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void) | null>(null);
  const [chartReady, setChartReady] = createSignal(false);
  const [chartInstanceRef, setChartInstanceRef] = createSignal<any>(null);
  const [lastContextMenuTime, setLastContextMenuTime] = createSignal(0);
  const [fetchInProgress, setFetchInProgress] = createSignal(false);
  const { signal: abortSignal, abort, restart: restartAbort } = useAbortController();
  let viewportDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const datetimeCols = createMemo(() => datasetStore.state.datetimeCols);

  const xAxisColumn = createMemo(() =>
    datasetStore.state.xAxisColumn ?? datasetStore.state.metadata?.timestampColumn ?? numericCols()[0] ?? null
  );

  const selectedColumns = createMemo(() => {
    const s = uiStore.state.selectedColumns;
    const xCol = xAxisColumn();
    if (s.length === 0) {
      return numericCols().filter(c => c !== xCol);
    }
    return s;
  });

  const initViewportFromMetadata = () => {
    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.timeRange;
    if (timeRange && chartStore.state.viewport.xMax < timeRange[1] * 0.01) {
      const newViewport = {
        xMin: timeRange[0],
        xMax: timeRange[1],
        yMin: chartStore.state.viewport.yMin,
        yMax: chartStore.state.viewport.yMax,
      };
      // Set initial view once from metadata
      if (!chartStore.state.initialView) {
        chartStore.setInitialView(newViewport);
      }
      chartStore.setViewport(newViewport);
    }
  };

  const allTraceColumns = createMemo(() => numericCols().filter(c => c !== xAxisColumn()));
  const traceColumns = createMemo(() =>
    selectedColumns().filter(c => c !== xAxisColumn() && !uiStore.state.hiddenColumns.includes(c))
  );
  const colorPalette = createMemo(() => getColorPalette(uiStore.state.colorScale, allTraceColumns().length));

  const mergedColors = createMemo(() => {
    const result: Record<string, string> = { ...uiStore.state.colors };
    allTraceColumns().forEach((col, idx) => {
      if (!result.hasOwnProperty(col)) {
        result[col] = colorPalette()[idx % colorPalette().length];
      }
    });
    return result;
  });

  const columnBounds = createMemo(() => {
    const bounds: Record<string, { min: number; max: number }> = {};
    for (const col of numericCols()) {
      const profile = datasetStore.state.columns.find(c => c.name === col);
      if (profile?.min !== undefined && profile?.max !== undefined) {
        bounds[col] = { min: profile.min, max: profile.max };
      }
    }
    return bounds;
  });

  const handleChartReady = (updateFn: (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void, chartInstance?: any) => {
    setUpdateChartFn(() => updateFn);
    setChartReady(true);
    if (chartInstance) setChartInstanceRef(chartInstance);
    initViewportFromMetadata();
    void fetchAndRender();
  };

  const handleEngineReady = (engineName: string) => {
    setChartEngine(engineName);
  };

  const handleChartInstance = (instance: any) => {
    setChartInstanceRef(instance);
  };

  const handleLabelsChange = (title: string, xLabel: string, yLabel: string) => {
    setChartTitle(title);
    setXAxisLabel(xLabel);
    setYAxisLabel(yLabel);
  };

  const fetchAndRender = async () => {
    const xCol = xAxisColumn();
    const traces = traceColumns();
    if (!updateChartFn() || !xCol || traces.length === 0) {
      debugLog('fetchAndRender skipped', { hasUpdateFn: !!updateChartFn(), xCol, tracesLen: traces.length });
      return;
    }

    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.timeRange;
    if (!timeRange) {
      debugLog('fetchAndRender skipped: no timeRange');
      return;
    }

    const viewport = chartStore.state.viewport;
    const start = new Date(viewport.xMin || timeRange[0]).toISOString();
    const end = new Date(viewport.xMax || timeRange[1]).toISOString();

    debugLog('fetchAndRender start', { xCol, traces, start, end, viewport });

    setIsLoading(true);
    setShowSkeleton(true);
    abort();
    try {
      const result = await fetchTimeseriesData(start, end, 1200, xCol, traces, abortSignal, colorColumn());
      debugLogOnce('fetchAndRender-result', 'fetchAndRender result', { returnedRows: result.returnedRows, downsampled: result.downsampled });
      setIsDownsampled(result.downsampled);

      const seriesConfig = buildSeriesConfig(result.xValues, result.series, mergedColors(), uiStore.state.filters, result.colorByColumn, colorColumn(), !result.downsampled, uiStore.state.colorScale, uiStore.state.adaptiveLineFilters);
      const doUpdate = updateChartFn();
      if (!doUpdate) {
        debugLog('fetchAndRender skipped: no updateChartFn');
        return;
      }
      doUpdate(seriesConfig, viewport.xMin || timeRange[0], viewport.xMax || timeRange[1], viewport.yMin, viewport.yMax);

      if (analyticsStore.state.rollingEnabled) {
        void fetchAndCacheRollingBands(start, end, traces.join(','));
      }
      if (analyticsStore.state.anomalyEnabled) {
        void fetchAndCacheAnomalyRegions(start, end, traces.join(','));
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        debugLog('fetchAndRender aborted (stale request)');
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Failed to fetch/render timeseries:', msg);
      uiStore.addToast({ message: msg, type: 'error', duration: 0 });
    } finally {
      setIsLoading(false);
      setShowSkeleton(false);
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

  const handleRollingChange = (enabled: boolean, window: number) => {
    analyticsStore.setRollingEnabled(enabled);
    analyticsStore.setRollingWindow(window);
    if (enabled && chartReady()) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      if (timeRange) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange[0]).toISOString();
        const end = new Date(vp.xMax || timeRange[1]).toISOString();
        void fetchAndCacheRollingBands(start, end, traceColumns().join(','));
      }
    } else {
      timeseriesStore.setRollingBands([]);
    }
  };

  const handleAnomalyChange = (enabled: boolean, method: string, threshold: number) => {
    analyticsStore.setAnomalyEnabled(enabled);
    analyticsStore.setAnomalyMethod(method as 'zscore' | 'iqr');
    analyticsStore.setAnomalyThreshold(threshold);
    if (enabled && chartReady()) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      if (timeRange) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange[0]).toISOString();
        const end = new Date(vp.xMax || timeRange[1]).toISOString();
        void fetchAndCacheAnomalyRegions(start, end, traceColumns().join(','));
      }
    }
  };

  const handleZoom = (start: number, end: number, yMin?: number, yMax?: number) => {
    console.debug('[TimeseriesPage] handleZoom', { start, end, yMin, yMax });
    chartStore.setYAuto(false);
    chartStore.setViewport({
      xMin: start, xMax: end,
      yMin: yMin ?? chartStore.state.viewport.yMin,
      yMax: yMax ?? chartStore.state.viewport.yMax
    });
  };

  const handleZoomOut = () => {
    chartStore.stepBackZoom();
  };

  const openFilterModal = (col: string | null) => {
    setFilterModalColumn(col);
    setFilterModalOpen(true);
  };

  const handleFilterApply = (column: string, range: { min: number; max: number }) => {
    uiStore.setFilter(column, range);
  };

  const handleFilterClear = (column: string) => {
    uiStore.removeFilter(column);
  };

  const handleXAxisChange = (col: string) => {
    datasetStore.setXAxisColumn(col);
  };

  const handleDrawToolChange = (tool: 'none' | 'zoom' | 'arrow' | 'box') => {
    setDrawTool(tool);
    chartStore.setDrawMode(tool === 'none' ? 'pan' : tool as 'pan' | 'zoom' | 'select' | 'arrow' | 'box');
  };

  createEffect(() => {
    const xCol = xAxisColumn();
    const traces = traceColumns();
    const metadata = datasetStore.state.metadata;
    if (chartReady() && xCol && traces.length > 0 && metadata) {
      void fetchAndRender();
    }
  });

  useDebouncedEffect(mergedColors, (colors) => {
    if (!chartReady()) return;
    const seriesConfig = updateCachedColors(colors);
    const doUpdate = updateChartFn();
    if (seriesConfig && doUpdate) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      const viewport = chartStore.state.viewport;
      doUpdate(seriesConfig, viewport.xMin || timeRange?.[0], viewport.xMax || timeRange?.[1], viewport.yMin, viewport.yMax);
    }
  }, 50);

  createEffect(() => {
    const viewport = chartStore.state.viewport;
    const metadata = datasetStore.state.metadata;
    if (chartReady() && metadata && viewport && !fetchInProgress()) {
      if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
      viewportDebounceTimer = setTimeout(() => {
        setFetchInProgress(true);
        fetchAndRender().finally(() => { setFetchInProgress(false); });
      }, 150);
    }
  });

  const zoomBadgeText = createMemo(() => {
    const vp = chartStore.state.viewport;
    if (!Number.isFinite(vp.xMin) || !Number.isFinite(vp.xMax)) return '—';
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    return `${fmt(vp.xMin)} – ${fmt(vp.xMax)}`;
  });

  onMount(() => {
    if (numericCols().length > 0) {
      uiStore.setSelectedColumns(numericCols());
      uiStore.setHiddenColumns([]);
    }

    const handleShortcut = (e: Event) => {
      const key = (e as CustomEvent).detail.key as string;
      if (key === 'r') {
        chartStore.forceResetZoom();
        void fetchAndRender();
      } else if (key === 'z') {
        chartStore.zoomOut();
      } else if (key === 'p') {
        handleExportPNG();
      } else if (key === 'e') {
        handleExportCSV();
      } else if (key === 'c') {
        const filters = uiStore.state.filters;
        for (const col of Object.keys(filters)) {
          uiStore.removeFilter(col);
        }
        void fetchAndRender();
      }
    };
    window.addEventListener('edatime:shortcut', handleShortcut);

    // Double-right-click to open filter modal (same as old frontend viewport.ts behavior)
    pageRef?.addEventListener('contextmenu', (e: MouseEvent) => {
      const now = performance.now();
      const isDoubleContext = (now - lastContextMenuTime()) <= 450;
      setLastContextMenuTime(now);
      if (!isDoubleContext) return;
      setLastContextMenuTime(0);
      e.preventDefault();
      // If click is on a series chip, open filter for that column
      const chip = (e.target as HTMLElement)?.closest?.('.series-chip');
      if (chip) {
        const col = chip.getAttribute('data-column');
        if (col) openFilterModal(col);
      } else {
        // Double-right-click outside chart area opens generic filter modal
        const inChart = (e.target as HTMLElement)?.closest?.('#main-chart');
        if (!inChart) openFilterModal(null);
      }
    });
    onCleanup(() => window.removeEventListener('edatime:shortcut', handleShortcut));

    // Ctrl+Click key tracking for adaptive line filters
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        uiStore.setPendingAdaptivePoint(null); // clear on new Ctrl press
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        const pending = uiStore.state.pendingAdaptivePoint;
        if (pending?.x2 !== null && pending?.x2 !== undefined) {
          const screenPos = popupScreenPos();
          setAdaptiveFilterPoints({
            x1: pending.x1, y1: pending.y1,
            x2: pending.x2!, y2: pending.y2!,
            screenX: screenPos?.x ?? (pending.x1 + pending.x2!) / 2,
            screenY: screenPos?.y ?? (pending.y1 + pending.y2!) / 2
          });
          setShowAdaptivePopup(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    });
  });

  // Popup screen position for AdaptiveFilterPopup
  const [popupScreenPos, setPopupScreenPos] = createSignal<{ x: number; y: number } | null>(null);

  // handleCtrlClick - called by ChartView when Ctrl+Click on chart
  const handleCtrlClick = (dataX: number, dataY: number, clientX: number, clientY: number) => {
    const pending = uiStore.state.pendingAdaptivePoint;
    if (!pending) {
      // First click - start line
      uiStore.setPendingAdaptivePoint({ x1: dataX, y1: dataY, x2: null, y2: null });
      setPopupScreenPos({ x: clientX, y: clientY });
    } else if (pending.x2 === null) {
      // Second click - complete line (don't overwrite x1/y1)
      uiStore.setPendingAdaptivePoint({ x1: pending.x1, y1: pending.y1, x2: dataX, y2: dataY });
      // Use midpoint between first and second click for popup position
      setPopupScreenPos({ x: clientX, y: clientY });
    }
    // Third+ clicks while holding Ctrl are ignored - wait for release
  };

  // handleAdaptiveSelect - called when user selects a column in the popup
  const handleAdaptiveSelect = (column: string, keepAbove: boolean) => {
    const pts = adaptiveFilterPoints();
    if (!pts) return;

    uiStore.appendAdaptiveLineFilter({
      id: `f_${Date.now()}`,
      column,
      op: keepAbove ? 'above' : 'below',
      value: (pts.y1 + pts.y2) / 2,
      x1: pts.x1,
      y1: pts.y1,
      x2: pts.x2,
      y2: pts.y2,
      keepAbove
    });

    uiStore.setPendingAdaptivePoint(null);
    setShowAdaptivePopup(false);
    setAdaptiveFilterPoints(null);
    void fetchAndRender();
  };

  // Reset selection when dataset changes (new columns detected)
  let lastColCount = 0;
  createEffect(() => {
    const cols = numericCols();
    const metadata = datasetStore.state.metadata;
    // Use untrack to avoid reactive tracking of lastColCount
    const prevColCount = untrack(() => lastColCount);
    if (cols.length > 0 && cols.length !== prevColCount && prevColCount > 0) {
      uiStore.setSelectedColumns(cols);
      uiStore.setHiddenColumns([]);
    }
    if (cols.length > 0 && metadata?.timeRange) {
      const [t0, t1] = metadata.timeRange;
      const vp = chartStore.state.viewport;
      // Only reset if not already at initial range
      if (vp.xMin !== t0 || vp.xMax !== t1) {
        chartStore.setViewport({ xMin: t0, xMax: t1, yMin: 0, yMax: 1 });
        chartStore.forceResetZoom();
      }
    }
    lastColCount = cols.length;
  });

  const hasData = createMemo(() => datasetStore.state.metadata !== null);
  const canShowChart = createMemo(() => hasData() && numericCols().length > 0);

  // Compute the reason for empty state display
  const emptyStateInfo = createMemo(() => {
    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.timeRange;
    const vp = chartStore.state.viewport;
    const selected = selectedColumns();

    // Check various conditions to determine empty state reason
    if (!metadata || numericCols().length === 0) {
      return { reason: 'no-data' as const, title: 'No data loaded', message: 'Upload a dataset to visualize timeseries data.' };
    }
    if (selected.length === 0) {
      return { reason: 'no-columns-selected' as const, title: 'Select one or more series', message: 'Click a column chip above to add it to the chart.' };
    }
    if (timeRange && (vp.xMin < timeRange[0] || vp.xMax > timeRange[1])) {
      return { reason: 'range-outside-dataset' as const, title: 'Current range is outside this dataset', message: 'Reset to dataset range to recover visible data.' };
    }
    // Check if any filters would exclude all data
    const filters = uiStore.state.filters;
    const hasActiveFilters = Object.keys(filters).length > 0;
    if (hasActiveFilters && !canShowChart()) {
      return { reason: 'data-filtered-out' as const, title: 'No points match current filters', message: 'Try widening the time range or clearing filters.' };
    }
    return null;
  });

  const handleExportPNG = () => {
    if (chartInstanceRef()) {
      exportChartAsPNG(chartInstanceRef(), 'edatime_chart.png');
    }
  };

  const handleExportSVG = () => {
    if (chartInstanceRef()) {
      exportChartAsSVG(chartInstanceRef(), 'edatime_chart.svg');
    }
  };

  const handleExportJSON = () => {
    const cached = getCachedData();
    if (cached) {
      exportChartAsJSON(cached.xValues, cached.series, 'edatime_data.json');
    }
  };

  const handleExportCSV = () => {
    const cached = getCachedData();
    if (cached) {
      exportChartAsCSV(cached.xValues, cached.series, 'edatime_data.csv');
    }
  };

  const handleExportHTML = () => {
    if (chartInstanceRef()) {
      exportChartAsHTML(chartInstanceRef(), 'edatime_chart.html');
    }
  };

  return (
    <div ref={pageRef} class={styles.page}>
      <SeriesToolbar
        numericCols={numericCols()}
        datetimeCols={datetimeCols()}
        xAxisColumn={xAxisColumn()}
        selectedColumns={selectedColumns()}
        hiddenColumns={uiStore.state.hiddenColumns}
        colors={uiStore.state.colors}
        mergedColors={mergedColors()}
        onXAxisChange={handleXAxisChange}
        onColorByChange={setColorColumn}
        onColumnChange={(cols) => { console.debug('[TimeseriesPage] onChange selected:', JSON.stringify(cols)); uiStore.setSelectedColumns(cols); }}
        onHiddenChange={(hidden) => { console.debug('[TimeseriesPage] onHiddenChange:', JSON.stringify(hidden)); uiStore.setHiddenColumns(hidden); }}
        onColorChange={(col, color) => { console.debug('[TimeseriesPage] onColorChange:', col, color); uiStore.setColumnColor(col, color); }}
        onOpenFilter={openFilterModal}
      />

      <ChartToolbar
        drawTool={drawTool()}
        drawColor={drawColor()}
        drawWidth={drawWidth()}
        showExportMore={showExportMore()}
        showAnalytics={showAnalytics()}
        showLabelsDrawer={showLabelsDrawer()}
        zoomBadgeText={zoomBadgeText()}
        canZoomOut={chartStore.canZoomOut()}
        canZoomForward={chartStore.canZoomForward()}
        zoomHistoryIndex={chartStore.state.zoomHistory.currentIndex}
        zoomHistoryLength={chartStore.state.zoomHistory.zoomStack.length}
        onDrawToolChange={handleDrawToolChange}
        onDrawColorChange={setDrawColor}
        onDrawWidthChange={setDrawWidth}
        onClearDrawings={() => { chartInstanceRef()?.clearDrawings?.(); chartStore.clearDrawings(); }}
        onOpenLabels={() => setShowLabelsDrawer(true)}
        onOpenExportMore={() => setShowExportMore(v => !v)}
        onExportPNG={handleExportPNG}
        onExportCSV={handleExportCSV}
        onExportSVG={() => { handleExportSVG(); setShowExportMore(false); }}
        onExportJSON={() => { handleExportJSON(); setShowExportMore(false); }}
        onExportHTML={() => { handleExportHTML(); setShowExportMore(false); }}
        onOpenAnalytics={() => setShowAnalytics(true)}
        onZoomOut={() => chartStore.zoomOut()}
        onZoomReset={() => chartStore.forceResetZoom()}
        onZoomForward={() => chartStore.zoomForward()}
      />

      <main class={styles.main} id="main">
        <ChartView
          containerId="main-chart"
          onReady={handleChartReady}
          onChartReady={handleChartInstance}
          onEngineReady={handleEngineReady}
          onZoom={handleZoom}
          onZoomOut={handleZoomOut}
          onCtrlClick={handleCtrlClick}
          rollingBands={timeseriesStore.state.rollingBands}
          anomalyRegions={timeseriesStore.state.anomalyRegions}
          drawMode={drawTool() === 'zoom' ? 'zoom' : drawTool() === 'none' ? 'pan' : drawTool() as any}
          drawColor={drawColor()}
          drawWidth={drawWidth()}
          chartTitle={chartTitle()}
          xAxisLabel={xAxisLabel()}
          yAxisLabel={yAxisLabel()}
          pendingAdaptivePoint={uiStore.state.pendingAdaptivePoint}
          adaptiveLineFilters={uiStore.state.adaptiveLineFilters}
        />

        <Show when={emptyStateInfo()}>
          {(info) => (
            <div class={styles.emptyState} data-empty-reason={info().reason}>
              <div class={styles.emptyIllustration} aria-hidden="true">
                <svg viewBox="0 0 80 48" width="120" height="72" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="1" width="78" height="46" rx="8" opacity="0.12" />
                  <path d="M12 34 L26 22 L36 28 L50 16 L68 32" />
                  <circle cx="12" cy="34" r="2" fill="currentColor" />
                  <circle cx="26" cy="22" r="2" fill="currentColor" />
                  <circle cx="36" cy="28" r="2" fill="currentColor" />
                  <circle cx="50" cy="16" r="2" fill="currentColor" />
                  <circle cx="68" cy="32" r="2" fill="currentColor" />
                </svg>
              </div>
              <strong class={styles.emptyTitle}>{info().title}</strong>
              <span class={styles.emptyMessage}>{info().message}</span>
              <div class={styles.emptyActions}>
                <Show when={info().reason === 'no-data'}>
                  <button class={styles.primaryBtn} id="timeseries-empty-upload-btn" type="button" aria-label="Open upload page" onClick={() => navigate('/upload')}>
                    Upload data
                  </button>
                </Show>
                <Show when={info().reason === 'range-outside-dataset'}>
                  <button class={styles.primaryBtn} id="timeseries-empty-reset-btn" type="button" aria-label="Reset to dataset range" onClick={() => { chartStore.forceResetZoom(); void fetchAndRender(); }}>
                    Reset to dataset range
                  </button>
                </Show>
                <Show when={info().reason === 'no-columns-selected'}>
                  <button class={styles.primaryBtn} id="timeseries-empty-select-btn" type="button" aria-label="Select all columns" onClick={() => { uiStore.setSelectedColumns(numericCols()); }}>
                    Select all columns
                  </button>
                </Show>
                <Show when={info().reason === 'data-filtered-out'}>
                  <button class={styles.primaryBtn} id="timeseries-empty-clear-filters-btn" type="button" aria-label="Clear all filters" onClick={() => { for (const col of Object.keys(uiStore.state.filters)) { uiStore.removeFilter(col); } void fetchAndRender(); }}>
                    Clear filters
                  </button>
                </Show>
              </div>
            </div>
          )}
        </Show>

        <Show when={isLoading()}>
          <div class={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Chart loading indicator">
            <div class={styles.loadingSpinner} />
            <span class={styles.loadingLabel}>Loading data…</span>
          </div>
        </Show>

        <Show when={showSkeleton() && !isLoading()}>
          <div class={styles.skeletonOverlay} aria-hidden="true">
            <div class={styles.skeletonChartArea}></div>
            <div class={styles.skeletonAxisLine} style="top: 50%; width: 80%;"></div>
            <div class={styles.skeletonAxisLine} style="top: 30%; width: 60%;"></div>
            <div class={styles.skeletonAxisLine} style="top: 70%; width: 70%;"></div>
          </div>
        </Show>

        <Show when={isDownsampled()}>
          <div class={styles.downsampledBadge} title="Data was downsampled for faster rendering">
            Downsampled
          </div>
        </Show>

        <Show when={showAdaptivePopup() && adaptiveFilterPoints()}>
          {(_) => {
            const pts = adaptiveFilterPoints()!;
            return (
              <AdaptiveFilterPopup
                x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
                screenX={pts.screenX}
                screenY={pts.screenY}
                columns={traceColumns()}
                colors={mergedColors()}
                seriesData={getCachedData()}
                onSelect={handleAdaptiveSelect}
                onCancel={() => {
                  uiStore.setPendingAdaptivePoint(null);
                  setShowAdaptivePopup(false);
                  setAdaptiveFilterPoints(null);
                  setPopupScreenPos(null);
                }}
              />
            );
          }}
        </Show>

        <div class={styles.overlayStack} id="timeseries-overlays">
          <div id="timeseries-colorbar-wrap" class={styles.colorbarWrap} hidden role="group" aria-label="Numeric color column scale">
            <span id="timeseries-colorbar-name" class={styles.colorbarName}>Color</span>
            <div class={styles.colorbarScale}>
              <span id="timeseries-colorbar-min" class={styles.colorbarBound}>0</span>
              <div id="timeseries-colorbar" class={styles.colorbar} />
              <span id="timeseries-colorbar-max" class={styles.colorbarBound}>1</span>
            </div>
          </div>
          <div id="timeseries-categorical-wrap" class={styles.colorbarWrap} hidden role="group" aria-label="Categorical color legend">
            <span id="timeseries-categorical-name" class={styles.colorbarName}>Category</span>
            <div id="timeseries-categorical-legend" class={styles.distributionLegend} style="margin-top: 8px" />
          </div>
        </div>
      </main>

      <AnalyticsDrawer
        open={showAnalytics()}
        onClose={() => setShowAnalytics(false)}
        onRollingChange={handleRollingChange}
        onAnomalyChange={handleAnomalyChange}
      />

      <LabelsDrawer
        open={showLabelsDrawer()}
        onClose={() => setShowLabelsDrawer(false)}
        title={chartTitle()}
        xAxisLabel={xAxisLabel()}
        yAxisLabel={yAxisLabel()}
        onChange={handleLabelsChange}
        engineName={chartEngine()}
      />

      <ColumnFilterModal
        open={filterModalOpen()}
        column={filterModalColumn()}
        columns={traceColumns()}
        bounds={columnBounds()}
        currentFilters={uiStore.state.filters}
        onApply={handleFilterApply}
        onClear={handleFilterClear}
        onClose={() => setFilterModalOpen(false)}
      />
    </div>
  );
};

export default TimeseriesPage;