/**
 * domain/timeseries/components/SeriesSelector.tsx
 *
 * Column chip selector for timeseries series selection.
 * Replaces the inline column selection in TimeseriesPage.
 */
import { Component, createSignal, createMemo, For, Show } from 'solid-js';
import ColumnChips from './ColumnChips';
import styles from '../../../pages/TimeseriesPage.module.css';

interface SeriesSelectorProps {
  numericCols: string[];
  datetimeCols: string[];
  xAxisColumn: string | null;
  selectedColumns: string[];
  hiddenColumns: string[];
  mergedColors: () => Record<string, string>;
  onXAxisChange: (col: string) => void;
  onColorByChange: (col: string | null) => void;
  onColumnChange: (cols: string[]) => void;
  onHiddenChange: (hidden: string[]) => void;
  onColorChange: (col: string, color: string) => void;
  onOpenFilter: (col: string | null) => void;
}

const SeriesSelector: Component<SeriesSelectorProps> = (props) => {
  const [seriesFilter, setSeriesFilter] = createSignal('');
  const [collapsed, setCollapsed] = createSignal(false);

  const visibleTraceColumns = createMemo(() =>
    props.numericCols.filter(c => c !== props.xAxisColumn)
  );

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
          value={''}
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
            columns={visibleTraceColumns()}
            selected={props.selectedColumns}
            filter={seriesFilter()}
            colors={props.mergedColors()}
            onChange={props.onColumnChange}
            onHiddenChange={props.onHiddenChange}
            onColorChange={props.onColorChange}
            onOpenFilter={props.onOpenFilter}
          />
        </Show>
      </div>
    </div>
  );
};

export default SeriesSelector;