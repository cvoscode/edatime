import { Component, createSignal, Show, createMemo, onMount, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { chartStore, datasetStore, uiStore } from '../stores';
import ChartView from '../components/chart/ChartView';
import ColumnChips from '../components/chart/ColumnChips';
import ColumnFilterModal from '../components/chart/ColumnFilterModal';
import AnalyticsDrawer from '../components/chart/AnalyticsDrawer';
import styles from './TimeseriesPage.module.css';

const TimeseriesPage: Component = () => {
  const navigate = useNavigate();
  const [drawTool, setDrawTool] = createSignal('none');
  const [drawColor, setDrawColor] = createSignal('#ff0055');
  const [drawWidth, setDrawWidth] = createSignal(2);
  const [showAnalytics, setShowAnalytics] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedColorCol, setSelectedColorCol] = createSignal<string | null>(null);
  const [seriesFilter, setSeriesFilter] = createSignal('');
  const [collapsed, setCollapsed] = createSignal(false);
  const [filterModalOpen, setFilterModalOpen] = createSignal(false);
  const [filterModalColumn, setFilterModalColumn] = createSignal<string | null>(null);

  const selectedCols = createMemo(() => datasetStore.state.numericCols);

  const selectedColumns = createMemo(() => {
    const s = uiStore.state.selectedColumns;
    if (s.length === 0 && datasetStore.state.numericCols.length > 0) {
      return [datasetStore.state.numericCols[0]];
    }
    return s;
  });

  const columnBounds = createMemo(() => {
    const bounds: Record<string, { min: number; max: number }> = {};
    for (const col of datasetStore.state.numericCols) {
      const profile = datasetStore.state.columns.find(c => c.name === col);
      if (profile?.min !== undefined && profile?.max !== undefined) {
        bounds[col] = { min: profile.min, max: profile.max };
      }
    }
    return bounds;
  });

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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.altKey && e.key === '2') {
      e.preventDefault();
    } else if (e.shiftKey && e.key === 'R') {
      e.preventDefault();
      chartStore.resetZoom();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div class={styles.page}>
      <div class={styles.toolbarSeries}>
        <div class={styles.toolbarGroup} role="group" aria-label="Series selection tools">
          <span class={styles.toolbarLabel}>Series</span>
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
              columns={selectedCols()}
              selected={selectedColumns()}
              filter={seriesFilter()}
              onChange={(cols) => uiStore.setSelectedColumns(cols)}
              colors={uiStore.state.colors}
              onColorChange={(col, color) => uiStore.setColumnColor(col, color)}
              onOpenFilter={openFilterModal}
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
            onChange={(e) => setDrawTool(e.currentTarget.value)}
            aria-label="Draw tool"
          >
            <option value="none">None (Pan)</option>
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
          <button class={styles.panelOpenBtn} type="button" title="Edit chart title and axis labels">
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
          <span class={styles.zoomRangeBadge} id="zoom-range-badge">—</span>
          <button class={styles.ghostBtn} id="zoom-reset-btn" type="button" title="Reset zoom to initial view" onClick={() => chartStore.resetZoom()}>↺</button>
        </div>
      </div>

      <main class={styles.main} id="main">
        <ChartView containerId="main-chart" />

        <Show when={selectedCols().length === 0}>
          <div class={styles.emptyState} data-empty-reason="no-columns-selected">
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
            <strong class={styles.emptyTitle}>Select one or more series</strong>
            <span class={styles.emptyMessage}>Click a column chip above or use Upload to add dataset series to the chart. Start with 2–3 related columns for a clearer first view.</span>
            <div class={styles.emptyActions}>
              <button class={styles.primaryBtn} id="timeseries-empty-upload-btn" type="button" aria-label="Open upload page" onClick={() => navigate('/upload')}>
                Upload data
              </button>
              <button class={styles.btnSm} id="timeseries-reset-range-btn" type="button" hidden>Reset to dataset range</button>
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

      <AnalyticsDrawer open={showAnalytics()} onClose={() => setShowAnalytics(false)} />

      <ColumnFilterModal
        open={filterModalOpen()}
        column={filterModalColumn()}
        columns={selectedColumns()}
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