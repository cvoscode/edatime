/**
 * TimeseriesPage — main timeseries visualization page.
 *
 * Layer 3: Orchestrates data hook → chart component → UI chrome.
 * Data fetching is handled by useTimeseriesChartData (Layer 1).
 * Chart rendering is handled by TimeseriesChart (Layer 2).
 */
import { Component, createSignal, Show, createMemo, onMount, onCleanup, untrack, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { chartStore } from '../stores/chartStore';
import { datasetStore } from '../stores/datasetStore';
import { uiStore } from '../stores/uiStore';
import { analyticsStore } from '../stores/analyticsStore';
import { timeseriesStore } from '../domain/timeseries/store';
import SeriesToolbar from './SeriesToolbar';
import ChartToolbar from './ChartToolbar';
import ColumnFilterModal from '../domain/timeseries/components/ColumnFilterModal';
import AnalyticsDrawer from '../domain/timeseries/components/AnalyticsDrawer';
import LabelsDrawer from '../domain/timeseries/components/LabelsDrawer';
import TimeseriesChart from '../components/TimeseriesChart';
import { getCachedData } from '../services/dataFetch';
import { fetchRollingBands, fetchAnomalies } from '../services/api';
import { exportChartAsPNG, exportChartAsCSV, exportChartAsSVG, exportChartAsJSON, exportChartAsHTML } from '../utils/exportUtils';
import { debugLog } from '../utils/debug';
import { useChartSeries } from '../features/timeseries/composables/useChartSeries';
import { useChartViewportSync } from '../features/timeseries/composables/useChartViewportSync';
import { useAdaptiveFilters } from '../features/timeseries/hooks/useAdaptiveFilters';
import { useTimeseriesChartData } from '../hooks/useTimeseriesChartData';
import styles from './TimeseriesPage.module.css';

const TimeseriesPage: Component = () => {
  let pageRef: HTMLDivElement | undefined;
  const navigate = useNavigate();

  // Chart instance ref (not a signal — direct mutation, read-only via getter)
  let chartInstanceRef: any = null;
  const getChartInstance = () => chartInstanceRef;

  const { allTraceColumns, traceColumns, selectedColumns, mergedColors, colorPalette, columnBounds, xAxisColumn } = useChartSeries();
  const { viewport: chartViewport, initialView, actions: viewportActions } = useChartViewportSync();
  const {
    adaptiveLineFilters,
    pendingAdaptivePoint,
    setPendingAdaptivePoint,
    adaptiveFilterPoints,
    setAdaptiveFilterPoints,
    showAdaptivePopup,
    setShowAdaptivePopup,
    popupScreenPos,
    setPopupScreenPos,
    addAdaptiveFilter,
  } = useAdaptiveFilters();

  // Wire useTimeseriesChartData — Layer 1
  const chartData = useTimeseriesChartData({
    viewport: chartViewport,
    columns: traceColumns,
    xAxisColumn,
    colors: mergedColors,
    filters: () => timeseriesStore.state.filters,
    colorColumn: () => timeseriesStore.state.colorColumn,
    adaptiveFilters: adaptiveLineFilters,
  });
  console.debug('[TimeseriesPage] chartData hook initialized', { hasData: chartData.data() !== null });

  // UI-only local signals
  const [drawTool, setDrawTool] = createSignal<'none' | 'zoom' | 'arrow' | 'box'>('none');
  const [drawColor, setDrawColor] = createSignal('#ff0055');
  const [drawWidth, setDrawWidth] = createSignal(2);
  const [showAnalytics, setShowAnalytics] = createSignal(false);
  const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
  const [showExportMore, setShowExportMore] = createSignal(false);
  const [chartTitle, setChartTitle] = createSignal('');
  const [xAxisLabel, setXAxisLabel] = createSignal('');
  const [yAxisLabel, setYAxisLabel] = createSignal('');
  const [chartEngineName, setChartEngineName] = createSignal<string>('');
  const [filterModalOpen, setFilterModalOpen] = createSignal(false);
  const [filterModalColumn, setFilterModalColumn] = createSignal<string | null>(null);
  const [showSkeleton, setShowSkeleton] = createSignal(false);

  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const datetimeCols = createMemo(() => datasetStore.state.datetimeCols);

  // Chart lifecycle — stored in ref, not signal
  const handleChartReady = (instance: any) => {
    chartInstanceRef = instance;
    initViewportFromMetadata();
  };

  const handleEngineReady = (name: string) => {
    setChartEngineName(name);
  };

  const initViewportFromMetadata = () => {
    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.time_range;
    if (timeRange && chartStore.state.viewport.xMax < timeRange?.max * 0.01) {
      const newViewport = {
        xMin: timeRange?.min,
        xMax: timeRange?.max,
        yMin: chartStore.state.viewport.yMin,
        yMax: chartStore.state.viewport.yMax,
      };
      if (!chartStore.state.initialView) {
        chartStore.setInitialView(newViewport);
      }
      chartStore.setViewport(newViewport);
    }
  };

  // Zoom
  const handleZoom = (start: number, end: number, yMin?: number, yMax?: number) => {
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

  // Filters
  const openFilterModal = (col: string | null) => {
    setFilterModalColumn(col);
    setFilterModalOpen(true);
  };

  const handleFilterApply = (column: string, range: { min: number; max: number }) => {
    timeseriesStore.setFilter(column, range);
    chartData.invalidateCache();
  };

  const handleFilterClear = (column: string) => {
    timeseriesStore.removeFilter(column);
    chartData.invalidateCache();
  };

  // X axis
  const handleXAxisChange = (col: string) => {
    datasetStore.setXAxisColumn(col);
  };

  // Draw tool
  const handleDrawToolChange = (tool: 'none' | 'zoom' | 'arrow' | 'box') => {
    setDrawTool(tool);
    chartStore.setDrawMode(tool === 'none' ? 'pan' : tool as 'pan' | 'zoom' | 'select' | 'arrow' | 'box');
  };

  // Labels
  const handleLabelsChange = (title: string, xLbl: string, yLbl: string) => {
    setChartTitle(title);
    setXAxisLabel(xLbl);
    setYAxisLabel(yLbl);
  };

  // Analytics
  const handleRollingChange = (enabled: boolean, window: number) => {
    analyticsStore.setRollingEnabled(enabled);
    analyticsStore.setRollingWindow(window);
    if (!enabled) {
      timeseriesStore.setRollingBands([]);
    } else {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.time_range;
      if (timeRange && chartInstanceRef) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange?.min).toISOString();
        const end = new Date(vp.xMax || timeRange?.max).toISOString();
        void fetchRollingBandsForCharts(start, end, traceColumns().join(','));
      }
    }
  };

  const handleAnomalyChange = (enabled: boolean, method: string, threshold: number) => {
    analyticsStore.setAnomalyEnabled(enabled);
    analyticsStore.setAnomalyMethod(method as 'zscore' | 'iqr');
    analyticsStore.setAnomalyThreshold(threshold);
    if (!enabled) {
      timeseriesStore.setAnomalyRegions([]);
    } else {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.time_range;
      if (timeRange && chartInstanceRef) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange?.min).toISOString();
        const end = new Date(vp.xMax || timeRange?.max).toISOString();
        void fetchAnomalyRegionsForCharts(start, end, traceColumns().join(','));
      }
    }
  };

  const fetchRollingBandsForCharts = async (start: string, end: string, columns: string) => {
    try {
      const response = await fetchRollingBands({ start, end, columns, window: analyticsStore.state.rollingWindow });
      timeseriesStore.setRollingBands(response.bands);
    } catch (e) {
      console.warn('Failed to fetch rolling bands:', e);
    }
  };

  const fetchAnomalyRegionsForCharts = async (start: string, end: string, columns: string) => {
    try {
      const response = await fetchAnomalies({ start, end, columns, method: analyticsStore.state.anomalyMethod, threshold: analyticsStore.state.anomalyThreshold });
      timeseriesStore.setAnomalyRegions(response.regions);
    } catch (e) {
      console.warn('Failed to fetch anomaly regions:', e);
    }
  };

  // Adaptive line filters — Ctrl+Click
  const handleCtrlClick = (dataX: number, dataY: number, clientX: number, clientY: number) => {
    const pending = pendingAdaptivePoint();
    if (!pending) {
      setPendingAdaptivePoint({ x1: dataX, y1: dataY, x2: null, y2: null });
      setPopupScreenPos({ x: clientX, y: clientY });
    } else if (pending.x2 === null) {
      setPendingAdaptivePoint({ x1: pending.x1, y1: pending.y1, x2: dataX, y2: dataY });
      setPopupScreenPos({ x: clientX, y: clientY });
    }
  };

  // Adaptive line filters are managed in useAdaptiveFilters hook

  // Export
  const handleExportPNG = () => {
    const inst = getChartInstance();
    if (inst) exportChartAsPNG(inst, 'edatime_chart.png');
  };

  const handleExportSVG = () => {
    const inst = getChartInstance();
    if (inst) exportChartAsSVG(inst, 'edatime_chart.svg');
  };

  const handleExportJSON = () => {
    const cached = getCachedData();
    if (cached) exportChartAsJSON(cached.xValues, cached.series, 'edatime_data.json');
  };

  const handleExportCSV = () => {
    const cached = getCachedData();
    if (cached) exportChartAsCSV(cached.xValues, cached.series, 'edatime_data.csv');
  };

  const handleExportHTML = () => {
    const inst = getChartInstance();
    if (inst) exportChartAsHTML(inst, 'edatime_chart.html');
  };

  // Column color change
  const handleColorChange = (col: string, color: string) => {
    timeseriesStore.setColumnColor(col, color);
  };

  // Derived state
  const zoomBadgeText = createMemo(() => {
    const vp = chartStore.state.viewport;
    if (!Number.isFinite(vp.xMin) || !Number.isFinite(vp.xMax)) return '—';
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    return `${fmt(vp.xMin)} – ${fmt(vp.xMax)}`;
  });

  const hasData = createMemo(() => datasetStore.state.metadata !== null);
  const canShowChart = createMemo(() => hasData() && numericCols().length > 0);

  const emptyStateInfo = createMemo(() => {
    const metadata = datasetStore.state.metadata;
    const timeRange = metadata?.time_range;
    const vp = chartStore.state.viewport;
    const selected = selectedColumns();

    if (!metadata || numericCols().length === 0) {
      return { reason: 'no-data' as const, title: 'No data loaded', message: 'Upload a dataset to visualize timeseries data.' };
    }
    if (selected.length === 0) {
      return { reason: 'no-columns-selected' as const, title: 'Select one or more series', message: 'Click a column chip above to add it to the chart.' };
    }
    if (timeRange && (vp.xMin < timeRange?.min || vp.xMax > timeRange?.max)) {
      return { reason: 'range-outside-dataset' as const, title: 'Current range is outside this dataset', message: 'Reset to dataset range to recover visible data.' };
    }
    const filters = timeseriesStore.state.filters;
    const hasActiveFilters = Object.keys(filters).length > 0;
    if (hasActiveFilters && !canShowChart()) {
      return { reason: 'data-filtered-out' as const, title: 'No points match current filters', message: 'Try widening the time range or clearing filters.' };
    }
    return null;
  });

  // Reset viewport when dataset changes
  let lastColCount = 0;
  createEffect(() => {
    const cols = numericCols();
    const metadata = datasetStore.state.metadata;
    const prevColCount = untrack(() => lastColCount);
    if (cols.length > 0 && cols.length !== prevColCount && prevColCount > 0) {
      timeseriesStore.setSelectedColumns(cols);
      timeseriesStore.setHiddenColumns([]);
    }
    if (cols.length > 0 && metadata?.time_range) {
      const [t0, t1] = [metadata.time_range.min, metadata.time_range.max];
      const vp = chartStore.state.viewport;
      if (vp.xMin !== t0 || vp.xMax !== t1) {
        chartStore.setViewport({ xMin: t0, xMax: t1, yMin: 0, yMax: 1 });
        chartStore.forceResetZoom();
      }
    }
    lastColCount = cols.length;
  });

  // Ctrl key tracking for adaptive filter
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setPendingAdaptivePoint(null);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        const pending = pendingAdaptivePoint();
        if (pending?.x2 !== null && pending?.x2 !== undefined) {
          addAdaptiveFilter({
            id: `f_${Date.now()}`,
            x1: pending.x1, y1: pending.y1,
            x2: pending.x2!, y2: pending.y2!,
            column: '',
            op: 'above',
            value: 0,
            keepAbove: true,
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

  // Double-right-click to open filter modal
  let lastContextMenuTime = 0;
  onMount(() => {
    pageRef?.addEventListener('contextmenu', (e: MouseEvent) => {
      const now = performance.now();
      const isDoubleContext = (now - lastContextMenuTime) <= 450;
      lastContextMenuTime = now;
      if (!isDoubleContext) return;
      e.preventDefault();
      const chip = (e.target as HTMLElement)?.closest?.('.series-chip');
      if (chip) {
        const col = chip.getAttribute('data-column');
        if (col) openFilterModal(col);
      } else {
        const inChart = (e.target as HTMLElement)?.closest?.('#main-chart');
        if (!inChart) openFilterModal(null);
      }
    });
  });

  // Time range badge
  const showSkeletonLoading = createMemo(() => chartData.isLoading() && !chartData.data());

  // Logging for timeseries render
  createEffect(() => {
    console.debug('[TimeseriesPage] render check', {
      canShowChart: canShowChart(),
      hasData: chartData.data() !== null,
      dataLen: chartData.data()?.length ?? 0,
      isLoading: chartData.isLoading(),
      hasMetadata: datasetStore.state.metadata !== null,
    });
  });

  return (
    <div ref={pageRef} class={styles.page}>
      <SeriesToolbar
        numericCols={numericCols()}
        datetimeCols={datetimeCols()}
        xAxisColumn={xAxisColumn()}
        selectedColumns={selectedColumns()}
        hiddenColumns={timeseriesStore.state.hiddenColumns}
        colors={timeseriesStore.state.colors}
        mergedColors={mergedColors()}
        onXAxisChange={handleXAxisChange}
        onColorByChange={(col) => timeseriesStore.setColorColumn(col)}
        onColumnChange={(cols) => timeseriesStore.setSelectedColumns(cols)}
        onHiddenChange={(hidden) => timeseriesStore.setHiddenColumns(hidden)}
        onColorChange={handleColorChange}
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
        onClearDrawings={() => { const inst = getChartInstance(); if (inst?.clearDrawings) inst.clearDrawings(); chartStore.clearDrawings(); }}
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
        <TimeseriesChart
          containerId="main-chart"
          data={chartData.data}
          viewport={chartViewport}
          options={{
            rollingBands: timeseriesStore.state.rollingBands,
            anomalyRegions: timeseriesStore.state.anomalyRegions,
            drawMode: drawTool() === 'zoom' ? 'zoom' : drawTool() === 'none' ? 'pan' : drawTool() as 'pan' | 'zoom' | 'arrow' | 'box',
            drawColor: drawColor(),
            drawWidth: drawWidth(),
            chartTitle: chartTitle(),
            xAxisLabel: xAxisLabel(),
            yAxisLabel: yAxisLabel(),
            pendingAdaptivePoint: pendingAdaptivePoint(),
            adaptiveLineFilters: adaptiveLineFilters(),
          }}
          onZoom={handleZoom}
          onZoomOut={handleZoomOut}
          onCtrlClick={handleCtrlClick}
          onChartReady={handleChartReady}
          onEngineReady={handleEngineReady}
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
                  <button class={styles.primaryBtn} id="timeseries-empty-reset-btn" type="button" aria-label="Reset to dataset range" onClick={() => { chartStore.forceResetZoom(); chartData.fetch(); }}>
                    Reset to dataset range
                  </button>
                </Show>
                <Show when={info().reason === 'no-columns-selected'}>
                  <button class={styles.primaryBtn} id="timeseries-empty-select-btn" type="button" aria-label="Select all columns" onClick={() => { timeseriesStore.setSelectedColumns(numericCols()); }}>
                    Select all columns
                  </button>
                </Show>
                <Show when={info().reason === 'data-filtered-out'}>
                  <button class={styles.primaryBtn} id="timeseries-empty-clear-filters-btn" type="button" aria-label="Clear all filters" onClick={() => { for (const col of Object.keys(timeseriesStore.state.filters)) { timeseriesStore.removeFilter(col); } chartData.invalidateCache(); }}>
                    Clear filters
                  </button>
                </Show>
              </div>
            </div>
          )}
        </Show>

        <Show when={showSkeletonLoading()}>
          <div class={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Chart loading indicator">
            <div class={styles.loadingSpinner} />
            <span class={styles.loadingLabel}>Loading data…</span>
          </div>
        </Show>

        <Show when={chartData.isDownsampled()}>
          <div class={styles.downsampledBadge} title="Data was downsampled for faster rendering">
            Downsampled
          </div>
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
        engineName={chartEngineName()}
      />

      <ColumnFilterModal
        open={filterModalOpen()}
        column={filterModalColumn()}
        columns={traceColumns()}
        bounds={columnBounds()}
        currentFilters={timeseriesStore.state.filters}
        onApply={handleFilterApply}
        onClear={handleFilterClear}
        onClose={() => setFilterModalOpen(false)}
      />
    </div>
  );
};

export default TimeseriesPage;