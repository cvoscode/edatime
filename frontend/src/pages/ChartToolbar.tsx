import { Component, Show } from 'solid-js';
import styles from './TimeseriesPage.module.css';

export interface ChartToolbarProps {
  drawTool: 'none' | 'zoom' | 'arrow' | 'box';
  drawColor: string;
  drawWidth: number;
  showExportMore: boolean;
  showAnalytics: boolean;
  showLabelsDrawer: boolean;
  zoomBadgeText: string;
  canZoomOut: boolean;
  canZoomForward: boolean;
  zoomHistoryIndex: number;
  zoomHistoryLength: number;
  onDrawToolChange: (tool: 'none' | 'zoom' | 'arrow' | 'box') => void;
  onDrawColorChange: (color: string) => void;
  onDrawWidthChange: (width: number) => void;
  onClearDrawings: () => void;
  onOpenLabels: () => void;
  onOpenExportMore: () => void;
  onExportPNG: () => void;
  onExportCSV: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  onExportHTML: () => void;
  onOpenAnalytics: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomForward: () => void;
}

const ChartToolbar: Component<ChartToolbarProps> = (props) => {
  return (
    <div class={styles.toolbarTools}>
      <div class={styles.toolbarGroup} role="group" aria-label="Drawing tools">
        <span class={styles.toolbarLabel}>Draw</span>
        <select
          id="draw-tool"
          class={styles.drawSelect}
          value={props.drawTool}
          onChange={(e) => props.onDrawToolChange(e.currentTarget.value as 'none' | 'zoom' | 'arrow' | 'box')}
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
          value={props.drawColor}
          onChange={(e) => props.onDrawColorChange(e.currentTarget.value)}
          title="Color"
          aria-label="Draw color"
        />
        <input
          type="number"
          id="draw-width"
          value={props.drawWidth}
          min="1"
          max="10"
          onChange={(e) => props.onDrawWidthChange(parseInt(e.currentTarget.value) || 2)}
          title="Thickness"
          aria-label="Draw thickness"
        />
        <button class={styles.ghostBtn} id="draw-clear-btn" type="button" title="Clear drawings" onClick={props.onClearDrawings}>Clear Drawings</button>
      </div>

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

      <div class={`${styles.toolbarGroup} ${styles.toolbarGroupSep}`} role="group" aria-label="Note and annotation tools">
        <button class={styles.panelOpenBtn} type="button" title="Open annotation tools" onClick={props.onOpenLabels}>
          <span class={styles.toolbarLabel}>Notes</span>
          <span class={styles.disclosureValue}>Annotations</span>
        </button>
      </div>

      <div class={`${styles.toolbarGroup} ${styles.toolbarGroupPush}`} role="group" aria-label="Export chart and data options">
        <button class={styles.ghostBtn} id="export-png-btn" type="button" title="Export chart as PNG (P)" onClick={props.onExportPNG}>
          PNG <kbd class={styles.toolbarKbd}>P</kbd>
        </button>
        <button class={styles.ghostBtn} id="export-csv-btn" type="button" title="Export filtered data as CSV (E)" onClick={props.onExportCSV}>
          CSV <kbd class={styles.toolbarKbd}>E</kbd>
        </button>
        <button class={styles.panelOpenBtn} type="button" title="More export options" onClick={props.onOpenExportMore}>
          <span class={styles.toolbarLabel}>More</span>
          <span class={styles.disclosureValue}>SVG, JSON</span>
        </button>
        <Show when={props.showExportMore}>
          <div class={styles.dropdownMenu} role="menu">
            <button class={styles.dropdownItem} role="menuitem" onClick={() => { props.onExportSVG(); }}>Export SVG</button>
            <button class={styles.dropdownItem} role="menuitem" onClick={() => { props.onExportJSON(); }}>Export JSON</button>
            <button class={styles.dropdownItem} role="menuitem" onClick={() => { props.onExportHTML(); }}>Export HTML</button>
          </div>
        </Show>
      </div>

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

      <div class={styles.toolbarGroup} role="group" aria-label="Zoom controls">
        <button class={styles.ghostBtn} id="zoom-back-btn" type="button" title="Zoom back" onClick={props.onZoomOut} disabled={!props.canZoomOut}>←</button>
        <button class={styles.ghostBtn} id="zoom-out-btn" type="button" title="Zoom out (restore previous)" onClick={props.onZoomOut}>−</button>
        <span class={styles.zoomRangeBadge} id="zoom-range-badge" title="Current time range">{props.zoomBadgeText}</span>
        <button class={styles.ghostBtn} id="zoom-reset-btn" type="button" title="Reset to initial view" onClick={props.onZoomReset}>↺</button>
        <button class={styles.ghostBtn} id="zoom-redo-btn" type="button" title="Redo (go forward in zoom history)" onClick={props.onZoomForward} disabled={!props.canZoomForward}>→</button>
        <span class={styles.zoomHistoryBadge} title="Zoom history depth">{props.zoomHistoryIndex + 1}/{props.zoomHistoryLength}</span>
      </div>
    </div>
  );
};

export default ChartToolbar;