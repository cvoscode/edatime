import { Component, createSignal, Show, For, createMemo, onMount, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { chartStore, datasetStore, uiStore, analyticsStore } from '../stores';
import ChartView from '../components/chart/ChartView';
import ColumnChips from '../components/chart/ColumnChips';
import ColumnFilterModal from '../components/chart/ColumnFilterModal';
import AnalyticsDrawer from '../components/chart/AnalyticsDrawer';
import LabelsDrawer from '../components/chart/LabelsDrawer';
import { fetchTimeseriesData, buildSeriesConfig } from '../services/dataFetch';
import { fetchMetadata, fetchRollingBands, fetchAnomalies } from '../services/api';
import { debugLog, debugLogOnce } from '../utils/debug';
import { getColorPalette } from '../utils/colorScale';
import styles from './TimeseriesPage.module.css';

const TimeseriesPage: Component = () => {
  const navigate = useNavigate();
  const [drawTool, setDrawTool] = createSignal<'none' | 'zoom' | 'arrow' | 'box'>('none');
  const [drawColor, setDrawColor] = createSignal('#ff0055');
  const [drawWidth, setDrawWidth] = createSignal(2);
  const [showAnalytics, setShowAnalytics] = createSignal(false);
  const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
  const [chartTitle, setChartTitle] = createSignal('');
  const [xAxisLabel, setXAxisLabel] = createSignal('');
  const [yAxisLabel, setYAxisLabel] = createSignal('');
  const [chartEngine, setChartEngine] = createSignal<string>('');
  const [seriesFilter, setSeriesFilter] = createSignal('');
  const [collapsed, setCollapsed] = createSignal(false);
  const [filterModalOpen, setFilterModalOpen] = createSignal(false);
  const [filterModalColumn, setFilterModalColumn] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [colorColumn, setColorColumn] = createSignal<string | null>(null);

  let updateChartFn: ((series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void) | null = null;
  let chartReady = false;
  let currentRequestController: AbortController | null = null;

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
      chartStore.setViewport({
        xMin: timeRange[0],
        xMax: timeRange[1],
        yMin: chartStore.state.viewport.yMin,
        yMax: chartStore.state.viewport.yMax,
      });
    }
  };

  const traceColumns = createMemo(() =>
    selectedColumns().filter(c => c !== xAxisColumn())
  );

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

  const handleChartReady = (updateFn: (series: any[], xMin?: number, xMax?: number, yMin?: number, yMax?: number) => void) => {
    updateChartFn = updateFn;
    chartReady = true;
    initViewportFromMetadata();
    void fetchAndRender();
  };

  const handleEngineReady = (engineName: string) => {
    setChartEngine(engineName);
  };

  const handleLabelsChange = (title: string, xLabel: string, yLabel: string) => {
    setChartTitle(title);
    setXAxisLabel(xLabel);
    setYAxisLabel(yLabel);
  };

  const fetchAndRender = async () => {
    const xCol = xAxisColumn();
    const traces = traceColumns();
    if (!updateChartFn || !xCol || traces.length === 0) {
      debugLog('fetchAndRender skipped', { hasUpdateFn: !!updateChartFn, xCol, tracesLen: traces.length });
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
    if (currentRequestController) {
      currentRequestController.abort();
    }
    currentRequestController = new AbortController();
    try {
      const result = await fetchTimeseriesData(start, end, 1200, xCol, traces, currentRequestController.signal);
      debugLogOnce('fetchAndRender-result', 'fetchAndRender result', { returnedRows: result.returnedRows, downsampled: result.downsampled });

      const colorScale = getColorPalette(uiStore.state.colorScale, 8);
      const enhancedColors: Record<string, string> = {};
      traces.forEach((col, idx) => {
        enhancedColors[col] = uiStore.state.colors[col] ?? colorScale[idx % colorScale.length];
      });

      const seriesConfig = buildSeriesConfig(result.xValues, result.series, enhancedColors);
      updateChartFn(seriesConfig, viewport.xMin || timeRange[0], viewport.xMax || timeRange[1]);

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
      console.error('Failed to fetch/render timeseries:', e);
    } finally {
      setIsLoading(false);
      currentRequestController = null;
    }
  };

  const fetchAndCacheRollingBands = async (start: string, end: string, columns: string) => {
    try {
      const response = await fetchRollingBands(start, end, columns, analyticsStore.state.rollingWindow);
      analyticsStore.setRollingBands(response.bands);
    } catch (e) {
      console.warn('Failed to fetch rolling bands:', e);
    }
  };

  const fetchAndCacheAnomalyRegions = async (start: string, end: string, columns: string) => {
    try {
      const response = await fetchAnomalies(start, end, columns, analyticsStore.state.anomalyMethod, analyticsStore.state.anomalyThreshold);
      analyticsStore.setAnomalyRegions(response.regions);
    } catch (e) {
      console.warn('Failed to fetch anomaly regions:', e);
    }
  };

  const handleRollingChange = (enabled: boolean, window: number) => {
    analyticsStore.setRollingEnabled(enabled);
    analyticsStore.setRollingWindow(window);
    if (enabled && chartReady) {
      const metadata = datasetStore.state.metadata;
      const timeRange = metadata?.timeRange;
      if (timeRange) {
        const vp = chartStore.state.viewport;
        const start = new Date(vp.xMin || timeRange[0]).toISOString();
        const end = new Date(vp.xMax || timeRange[1]).toISOString();
        void fetchAndCacheRollingBands(start, end, traceColumns().join(','));
      }
    }
  };

  const handleAnomalyChange = (enabled: boolean, method: string, threshold: number) => {
    analyticsStore.setAnomalyEnabled(enabled);
    analyticsStore.setAnomalyMethod(method as 'zscore' | 'iqr');
    analyticsStore.setAnomalyThreshold(threshold);
    if (enabled && chartReady) {
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

  const handleZoom = (start: number, end: number) => {
    chartStore.setViewport({ xMin: start, xMax: end, yMin: chartStore.state.viewport.yMin, yMax: chartStore.state.viewport.yMax });
  };

  const handleZoomOut = () => {
    chartStore.resetZoom();
  };

  const openFilterModal = (col: string) => {
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
    if (chartReady && xCol && traces.length > 0 && metadata) {
      void fetchAndRender();
    }
  });

  createEffect(() => {
    const viewport = chartStore.state.viewport;
    const metadata = datasetStore.state.metadata;
    if (chartReady && metadata && viewport) {
      if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer);
      viewportDebounceTimer = setTimeout(() => {
        void fetchAndRender();
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
    if (numericCols().length > 0 && uiStore.state.selectedColumns.length === 0) {
      uiStore.setSelectedColumns(numericCols());
    }
  });

  const hasData = createMemo(() => datasetStore.state.metadata !== null);
  const canShowChart = createMemo(() => hasData() && numericCols().length > 0);

  return (
    <div class={styles.page}>
      <div class={styles.toolbarSeries}>
        <div class={styles.toolbarGroup} role="group" aria-label="Series selection tools">
          <span class={styles.toolbarLabel}>X-axis</span>
          <select
            id="x-axis-select"
            class={styles.xAxisSelect}
            value={xAxisColumn() ?? ''}
            onChange={(e) => handleXAxisChange(e.currentTarget.value)}
            aria-label="Select x-axis column"
          >
            <Show when={datetimeCols().length > 0}>
              <option value="" disabled>Time columns</option>
              <For each={datetimeCols()}>
                {(col) => <option value={col}>{col}</option>}
              </For>
              <option value="" disabled>Numeric columns</option>
            </Show>
            <For each={numericCols()}>
              {(col) => <option value={col}>{col}</option>}
            </For>
          </select>

          <span class={styles.toolbarLabel}>Traces</span>
          <input
            type="text"
            id="column-filter-input"
            class={styles.columnFilterInput}
            placeholder="Filter columns…"
            value={seriesFilter()}
            onInput={(e) => setSeriesFilter(e.currentTarget.value)}
            aria-label="Filter columns"
          />
          <button
            class={styles.collapseBtn}
            id="collapse-series-btn"
            type="button"
            title="Collapse series list"
            onClick={() => setCollapsed(!collapsed())}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4,6 8,10 12,6"/>
            </svg>
          </button>
          <Show when={!collapsed()}>
            <ColumnChips
              columns={traceColumns()}
              selected={selectedColumns()}
              filter={seriesFilter()}
              colors={uiStore.state.colors}
              colorScalePalette={getColorPalette(uiStore.state.colorScale, traceColumns().length)}
              onChange={(cols) => uiStore.setSelectedColumns(cols)}
              onColorChange={(col, color) => uiStore.setColumnColor(col, color)}
            />
          </Show>
        </div>
      </div>

      <div class={styles.toolbarTools}>
        <div class={styles.toolbarGroup} role="group" aria-label="Drawing tools">
          <span class={styles.toolbarLabel}>Draw</span>
          <select
            id="draw-tool"
            class={styles.drawSelect}
            value={drawTool()}
            onChange={(e) => handleDrawToolChange(e.currentTarget.value as 'none' | 'zoom' | 'arrow' | 'box')}
            aria-label="Draw tool"
          >
            <option value="none">None (Pan)</option>
            <option value="zoom">Zoom (drag)</option>
            <option value="arrow">Arrow</option>
            <option value="box">Box</option>
          </select>
          <input
            type="color"
            id="draw-color"
            value={drawColor()}
            onChange={(e) => setDrawColor(e.currentTarget.value)}
            title="Color"
            aria-label="Draw color"
          />
          <input
            type="number"
            id="draw-width"
            value={drawWidth()}
            min="1"
            max="10"
            onChange={(e) => setDrawWidth(parseInt(e.currentTarget.value) || 2)}
            title="Thickness"
            aria-label="Draw thickness"
          />
          <button class={styles.ghostBtn} id="draw-clear-btn" type="button" title="Clear drawings">Clear Drawings</button>
        </div>

        <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep}`} role="group" aria-label="Chart label controls">
          <button
            class={styles.panelOpenBtn}
            type="button"
            title="Edit chart title and axis labels"
            onClick={() => setShowLabelsDrawer(true)}
          >
            <span class={styles.toolbarLabel}>Labels</span>
            <span class={styles.disclosureValue}>Title + axes</span>
          </button>
        </div>

        <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep}`} role="group" aria-label="Note and annotation tools">
          <button class={styles.panelOpenBtn} type="button" title="Open annotation tools">
            <span class={styles.toolbarLabel}>Notes</span>
            <span class={styles.disclosureValue}>Annotations</span>
          </button>
        </div>

        <div class={`${styles.toolbarGroup} ${styles.toolbarGroupPush}`} role="group" aria-label="Export chart and data options">
          <button class={styles.ghostBtn} id="export-png-btn" type="button" title="Export chart as PNG (P)" onClick={() => {}}>
            PNG <kbd class={styles.toolbarKbd}>P</kbd>
          </button>
          <button class={styles.ghostBtn} id="export-csv-btn" type="button" title="Export filtered data as CSV (E)" onClick={() => {}}>
            CSV <kbd class={styles.toolbarKbd}>E</kbd>
          </button>
          <button class={styles.panelOpenBtn} type="button" title="More export options">
            <span class={styles.toolbarLabel}>More</span>
            <span class={styles.disclosureValue}>SVG, JSON, Parquet</span>
          </button>
        </div>

        <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep} ${styles.toolbarGroupPush}`} role="group" aria-label="Analytics controls">
          <button
            class={styles.panelOpenBtn}
            type="button"
            title="Open analytics controls"
            onClick={() => setShowAnalytics(true)}
          >
            <span class={styles.toolbarLabel}>Analytics</span>
            <span class={styles.disclosureValue}>Bands, anomalies, cleanup</span>
          </button>
        </div>

        <div class={styles.toolbarGroup} role="group" aria-label="Zoom controls">
          <button class={styles.ghostBtn} id="zoom-out-btn" type="button" title="Zoom out" onClick={() => chartStore.zoomOut()}>−</button>
          <span class={styles.zoomRangeBadge} id="zoom-range-badge">{zoomBadgeText()}</span>
          <button class={styles.ghostBtn} id="zoom-reset-btn" type="button" title="Reset zoom to initial view" onClick={() => chartStore.resetZoom()}>↺</button>
        </div>
      </div>

      <main class={styles.main} id="main">
        <ChartView
          containerId="main-chart"
          onReady={handleChartReady}
          onEngineReady={handleEngineReady}
          onZoom={handleZoom}
          onZoomOut={handleZoomOut}
          rollingBands={analyticsStore.state.rollingBands}
          anomalyRegions={analyticsStore.state.anomalyRegions}
          drawMode={drawTool() === 'zoom' ? 'zoom' : drawTool() === 'none' ? 'pan' : drawTool() as any}
          chartTitle={chartTitle()}
          xAxisLabel={xAxisLabel()}
          yAxisLabel={yAxisLabel()}
        />

        <Show when={!canShowChart()}>
          <div class={styles.emptyState} data-empty-reason="no-data">
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
            <strong class={styles.emptyTitle}>No data loaded</strong>
            <span class={styles.emptyMessage}>Upload a dataset to visualize timeseries data.</span>
            <div class={styles.emptyActions}>
              <button class={styles.primaryBtn} id="timeseries-empty-upload-btn" type="button" aria-label="Open upload page" onClick={() => navigate('/upload')}>
                Upload data
              </button>
            </div>
          </div>
        </Show>

        <Show when={isLoading()}>
          <div class={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Chart loading indicator">
            <div class={styles.loadingSpinner} />
            <span class={styles.loadingLabel}>Loading data…</span>
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