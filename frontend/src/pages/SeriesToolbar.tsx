import { Component, createSignal, Show, For } from 'solid-js';
import ColumnChips from '../domain/timeseries/components/ColumnChips';
import styles from './TimeseriesPage.module.css';

interface SeriesToolbarProps {
  numericCols: string[];
  datetimeCols: string[];
  xAxisColumn: string | null;
  selectedColumns: string[];
  hiddenColumns: string[];
  colors: Record<string, string>;
  mergedColors: Record<string, string>;
  onXAxisChange: (col: string) => void;
  onColorByChange: (col: string | null) => void;
  onColumnChange: (cols: string[]) => void;
  onHiddenChange: (hidden: string[]) => void;
  onColorChange: (col: string, color: string) => void;
  onOpenFilter: (col: string | null) => void;
}

const SeriesToolbar: Component<SeriesToolbarProps> = (props) => {
  const [seriesFilter, setSeriesFilter] = createSignal('');
  const [collapsed, setCollapsed] = createSignal(false);

  return (
    <div class={styles.toolbarSeries}>
      <div class={styles.toolbarGroup} role="group" aria-label="Series selection tools">
        <span class={styles.toolbarLabel}>X-axis</span>
        <select
          id="x-axis-select"
          class={styles.xAxisSelect}
          value={props.xAxisColumn ?? ''}
          onChange={(e) => props.onXAxisChange(e.currentTarget.value)}
          aria-label="Select x-axis column"
        >
          <Show when={props.datetimeCols.length > 0}>
            <option value="" disabled>Time columns</option>
            <For each={props.datetimeCols}>
              {(col) => <option value={col}>{col}</option>}
            </For>
            <option value="" disabled>Numeric columns</option>
          </Show>
          <For each={props.numericCols}>
            {(col) => <option value={col}>{col}</option>}
          </For>
        </select>

        <span class={styles.toolbarLabel}>Color by</span>
        <select
          id="color-by-select"
          class={styles.xAxisSelect}
          value={props.colors.colorColumn ?? ''}
          onChange={(e) => props.onColorByChange(e.currentTarget.value || null)}
          aria-label="Color by column"
        >
          <option value="">None</option>
          <For each={props.numericCols}>
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
            <polyline points="4,6 8,10 12,6" />
          </svg>
        </button>
        <Show when={!collapsed()}>
          <ColumnChips
            columns={props.numericCols.filter(c => c !== props.xAxisColumn)}
            selected={props.selectedColumns}
            filter={seriesFilter()}
            colors={props.mergedColors}
            onChange={(cols) => { console.debug('[SeriesToolbar] onChange selected:', JSON.stringify(cols)); props.onColumnChange(cols); }}
            onHiddenChange={(hidden) => { console.debug('[SeriesToolbar] onHiddenChange:', JSON.stringify(hidden)); props.onHiddenChange(hidden); }}
            onColorChange={(col, color) => { console.debug('[SeriesToolbar] onColorChange:', col, color); props.onColorChange(col, color); }}
            onOpenFilter={props.onOpenFilter}
          />
        </Show>
      </div>
    </div>
  );
};

export default SeriesToolbar;