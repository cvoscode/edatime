import { Component, For, createSignal, createMemo } from 'solid-js';
import type { ColumnProfile } from '../../services/api';
import styles from './ColumnProfileGrid.module.css';

interface ColumnProfileGridProps {
  profiles: ColumnProfile[];
  selectedColumns: string[];
  onSelectionChange: (columns: string[]) => void;
}

const ROW_HEIGHT = 38;
const OVERSCAN = 8;

const ColumnProfileGrid: Component<ColumnProfileGridProps> = (props) => {
  let viewportRef: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [filterText, setFilterText] = createSignal('');
  const [sortKey, setSortKey] = createSignal<string>('name');
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc');

  const filteredProfiles = createMemo(() => {
    const filter = filterText().toLowerCase();
    let result = filter
      ? props.profiles.filter(p => p.name.toLowerCase().includes(filter))
      : props.profiles;

    const key = sortKey();
    const dir = sortDir();
    result = [...result].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (key === 'name') { aVal = a.name; bVal = b.name; }
      else if (key === 'dtype') { aVal = a.dtype; bVal = b.dtype; }
      else if (key === 'nonNullCount') { aVal = a.non_null_count; bVal = b.non_null_count; }
      else if (key === 'nullCount') { aVal = a.null_count; bVal = b.null_count; }
      else if (key === 'min') { aVal = a.min ?? 0; bVal = b.min ?? 0; }
      else if (key === 'max') { aVal = a.max ?? 0; bVal = b.max ?? 0; }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return dir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  });

  const totalHeight = () => filteredProfiles().length * ROW_HEIGHT;

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil((viewportRef?.clientHeight ?? 400) / ROW_HEIGHT);
    const end = Math.min(filteredProfiles().length, start + visibleCount + OVERSCAN * 2);
    return { start, end };
  });

  const visibleRows = createMemo(() => {
    const { start, end } = visibleRange();
    return filteredProfiles().slice(start, end).map((profile, i) => ({
      profile,
      index: start + i,
    }));
  });

  const handleScroll = (e: Event) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  };

  const handleSort = (key: string) => {
    if (sortKey() === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleColumn = (name: string) => {
    const current = props.selectedColumns;
    if (current.includes(name)) {
      props.onSelectionChange(current.filter(c => c !== name));
    } else {
      props.onSelectionChange([...current, name]);
    }
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      props.onSelectionChange(props.profiles.map(p => p.name));
    } else {
      props.onSelectionChange([]);
    }
  };

  const formatNumber = (n: number | null, decimals = 2) => {
    if (n === null || n === undefined) return '—';
    return n.toFixed(decimals);
  };

  const allSelected = () => props.profiles.length > 0 && props.selectedColumns.length === props.profiles.length;

  const getTypeLabel = (dtype: string) => {
    if (dtype.includes('int') || dtype.includes('float') || dtype.includes('double')) return 'numeric';
    if (dtype.includes('datetime') || dtype.includes('date')) return 'datetime';
    if (dtype.includes('bool')) return 'bool';
    return 'categorical';
  };

  return (
    <div class={styles.grid}>
      <div class={styles.header} role="row">
        <div class={`${styles.col} ${styles.colCheck}`} role="columnheader">
          <input
            type="checkbox"
            aria-label="Select all upload columns"
            checked={allSelected()}
            onChange={(e) => toggleAll(e.currentTarget.checked)}
          />
        </div>
        <div
          class={`${styles.col} ${styles.colName}`}
          role="columnheader"
          onClick={() => handleSort('name')}
        >
          Column {sortKey() === 'name' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
        </div>
        <div
          class={`${styles.col} ${styles.colType}`}
          role="columnheader"
          onClick={() => handleSort('dtype')}
        >
          Type {sortKey() === 'dtype' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
        </div>
        <div
          class={`${styles.col} ${styles.colCount}`}
          role="columnheader"
          onClick={() => handleSort('nonNullCount')}
        >
          Non-null {sortKey() === 'nonNullCount' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
        </div>
        <div
          class={`${styles.col} ${styles.colCount}`}
          role="columnheader"
          onClick={() => handleSort('nullCount')}
        >
          Nulls {sortKey() === 'nullCount' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
        </div>
        <div
          class={`${styles.col} ${styles.colNum}`}
          role="columnheader"
          onClick={() => handleSort('min')}
        >
          Min {sortKey() === 'min' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
        </div>
        <div
          class={`${styles.col} ${styles.colNum}`}
          role="columnheader"
          onClick={() => handleSort('max')}
        >
          Max {sortKey() === 'max' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
        </div>
        <div class={`${styles.col} ${styles.colHist}`} role="columnheader">
          Distribution
        </div>
      </div>

      <div
        ref={viewportRef}
        class={styles.viewport}
        role="rowgroup"
        onScroll={handleScroll}
      >
        <div class={styles.spacer} style={{ height: `${totalHeight()}px` }}>
          <div style={{ transform: `translateY(${visibleRange().start * ROW_HEIGHT}px)` }}>
            <For each={visibleRows()}>
              {({ profile, index }) => (
                <div
                  class={styles.row}
                  style={{ top: `${index * ROW_HEIGHT}px` }}
                  role="row"
                >
                  <div class={`${styles.col} ${styles.colCheck}`}>
                    <input
                      type="checkbox"
                      aria-label={`Select column ${profile.name}`}
                      checked={props.selectedColumns.includes(profile.name)}
                      onChange={() => toggleColumn(profile.name)}
                    />
                  </div>
                  <div class={`${styles.col} ${styles.colName}`}>{profile.name}</div>
                  <div class={`${styles.col} ${styles.colType}`}>{getTypeLabel(profile.dtype)}</div>
                  <div class={`${styles.col} ${styles.colCount}`}>
                    {profile.non_null_count.toLocaleString()}
                  </div>
                  <div class={`${styles.col} ${styles.colCount}`}>
                    {profile.null_count > 0 ? profile.null_count.toLocaleString() : '—'}
                  </div>
                  <div class={`${styles.col} ${styles.colNum}`}>{formatNumber(profile.min)}</div>
                  <div class={`${styles.col} ${styles.colNum}`}>{formatNumber(profile.max)}</div>
                  <div class={`${styles.col} ${styles.colHist}`}>
                    <div class={styles.histogram}>
                      {profile.histogram && profile.histogram.counts.slice(0, 16).map((count, i) => (
                        <div
                          class={styles.histBar}
                          style={{ height: `${Math.max(2, (count / Math.max(...profile.histogram!.counts)) * 36)}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnProfileGrid;