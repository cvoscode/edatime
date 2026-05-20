/**
 * domain/timeseries/components/TimeseriesToolbar.tsx
 *
 * Drawing tools, chart labels, and export controls for timeseries.
 * Replaces ChartToolbar inline in TimeseriesPage.
 */
import { Component, Show, createSignal } from 'solid-js';
import styles from '../../../pages/TimeseriesPage.module.css';
import { timeseriesStore } from '../store';
import { chartStore } from '../../../stores/chartStore';

interface TimeseriesToolbarProps {
  zoomBadgeText: string;
  onOpenAnalytics: () => void;
  onOpenLabels: () => void;
  onExportPNG: () => void;
  onExportCSV: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  onExportHTML: () => void;
}

const TimeseriesToolbar: Component<TimeseriesToolbarProps> = (props) => {
  const drawTool = timeseriesStore.getDrawTool();
  const drawColor = timeseriesStore.getDrawColor();
  const drawWidth = timeseriesStore.getDrawWidth();
  const showExportMore = timeseriesStore.getShowExportMore();

  const handleDrawToolChange = (tool: 'none' | 'zoom' | 'arrow' | 'box') => {
    timeseriesStore.setDrawToolSignal(tool);
    chartStore.setDrawMode(tool === 'none' ? 'pan' : tool as 'pan' | 'zoom' | 'select' | 'arrow' | 'box');
  };

  const handleDrawColorChange = (color: string) => {
    timeseriesStore.setDrawColorSignal(color);
  };

  const handleDrawWidthChange = (width: number) => {
    timeseriesStore.setDrawWidthSignal(width);
  };

  const handleClearDrawings = () => {
    timeseriesStore.clearDrawings();
  };

  return (
    <div class={styles.toolbarTools}>
      {/* Drawing tools */}
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
          onChange={(e) => handleDrawColorChange(e.currentTarget.value)}
          title="Color"
          aria-label="Draw color"
        />
        <input
          type="number"
          id="draw-width"
          value={drawWidth()}
          min="1"
          max="10"
          onChange={(e) => handleDrawWidthChange(parseInt(e.currentTarget.value) || 2)}
          title="Thickness"
          aria-label="Draw thickness"
        />
        <button class={styles.ghostBtn} id="draw-clear-btn" type="button" title="Clear drawings" onClick={handleClearDrawings}>Clear Drawings</button>
      </div>

      {/* Labels */}
      <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep}`} role="group" aria-label="Chart label controls">
        <button
          class={styles.panelOpenBtn}
          type="button"
          title="Edit chart title and axis labels"
          onClick={props.onOpenLabels}
        >
          <span class={styles.toolbarLabel}>Labels</span>
          <span class={styles.disclosureValue}>Title + axes</span>
        </button>
      </div>

      {/* Notes */}
      <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep}`} role="group" aria-label="Note and annotation tools">
        <button class={styles.panelOpenBtn} type="button" title="Open annotation tools" onClick={props.onOpenLabels}>
          <span class={styles.toolbarLabel}>Notes</span>
          <span class={styles.disclosureValue}>Annotations</span>
        </button>
      </div>

      {/* Export */}
      <div class={`${styles.toolbarGroup} ${styles.toolbarGroupPush}`} role="group" aria-label="Export chart and data options">
        <button class={styles.ghostBtn} id="export-png-btn" type="button" title="Export chart as PNG (P)" onClick={props.onExportPNG}>
          PNG <kbd class={styles.toolbarKbd}>P</kbd>
        </button>
        <button class={styles.ghostBtn} id="export-csv-btn" type="button" title="Export filtered data as CSV (E)" onClick={props.onExportCSV}>
          CSV <kbd class={styles.toolbarKbd}>E</kbd>
        </button>
        <button class={styles.panelOpenBtn} type="button" title="More export options" onClick={() => timeseriesStore.setShowExportMoreSignal(!showExportMore())}>
          <span class={styles.toolbarLabel}>More</span>
          <span class={styles.disclosureValue}>SVG, JSON</span>
        </button>
        <Show when={showExportMore()}>
          <div class={styles.dropdownMenu} role="menu">
            <button class={styles.dropdownItem} role="menuitem" onClick={() => { props.onExportSVG(); timeseriesStore.setShowExportMoreSignal(false); }}>Export SVG</button>
            <button class={styles.dropdownItem} role="menuitem" onClick={() => { props.onExportJSON(); timeseriesStore.setShowExportMoreSignal(false); }}>Export JSON</button>
            <button class={styles.dropdownItem} role="menuitem" onClick={() => { props.onExportHTML(); timeseriesStore.setShowExportMoreSignal(false); }}>Export HTML</button>
          </div>
        </Show>
      </div>

      {/* Analytics */}
      <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep} ${styles.toolbarGroupPush}`} role="group" aria-label="Analytics controls">
        <button
          class={styles.panelOpenBtn}
          type="button"
          title="Open analytics controls"
          onClick={props.onOpenAnalytics}
        >
          <span class={styles.toolbarLabel}>Analytics</span>
          <span class={styles.disclosureValue}>Bands, anomalies, cleanup</span>
        </button>
      </div>

      {/* Zoom controls */}
      <div class={styles.toolbarGroup} role="group" aria-label="Zoom controls">
        <button class={styles.ghostBtn} id="zoom-back-btn" type="button" title="Zoom back" onClick={() => chartStore.zoomOut()} disabled={!chartStore.canZoomOut()}>←</button>
        <button class={styles.ghostBtn} id="zoom-out-btn" type="button" title="Zoom out (restore previous)" onClick={() => chartStore.zoomOut()}>−</button>
        <span class={styles.zoomRangeBadge} id="zoom-range-badge" title="Current time range">{props.zoomBadgeText}</span>
        <button class={styles.ghostBtn} id="zoom-reset-btn" type="button" title="Reset to initial view" onClick={() => chartStore.forceResetZoom()}>↺</button>
        <button class={styles.ghostBtn} id="zoom-redo-btn" type="button" title="Redo (go forward in zoom history)" onClick={() => chartStore.zoomForward()} disabled={!chartStore.canZoomForward()}>→</button>
        <span class={styles.zoomHistoryBadge} title="Zoom history depth">{chartStore.state.zoomHistory.currentIndex + 1}/{chartStore.state.zoomHistory.zoomStack.length}</span>
      </div>
    </div>
  );
};

export default TimeseriesToolbar;