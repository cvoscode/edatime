import { Component, Show, createSignal, createEffect, For } from 'solid-js';
import Modal from '../../../components/ui/Modal';
import styles from './ColumnFilterModal.module.css';

interface ColumnFilterModalProps {
  open: boolean;
  column: string | null;
  columns: string[];
  bounds: Record<string, { min: number; max: number }>;
  currentFilters: Record<string, { min: number; max: number }>;
  onApply: (column: string, range: { min: number; max: number }) => void;
  onClear: (column: string) => void;
  onClose: () => void;
}

const ColumnFilterModal: Component<ColumnFilterModalProps> = (props) => {
  const [selectedCol, setSelectedCol] = createSignal<string>('');
  const [minVal, setMinVal] = createSignal<string>('');
  const [maxVal, setMaxVal] = createSignal<string>('');
  const [minRange, setMinRange] = createSignal<string>('0');
  const [maxRange, setMaxRange] = createSignal<string>('1');
  const [hint, setHint] = createSignal<string>('');

  createEffect(() => {
    if (props.open) {
      const col = props.column || props.columns[0] || '';
      setSelectedCol(col);
      refreshForColumn(col);
    }
  });

  const refreshForColumn = (col: string) => {
    if (!col) {
      setMinVal('');
      setMaxVal('');
      setHint('Select a column to filter.');
      return;
    }
    const bound = props.bounds[col];
    const current = props.currentFilters[col];
    if (!bound) {
      setHint('No numeric range is available for this column.');
      return;
    }
    const span = bound.max - bound.min;
    const step = Math.max(span / 500, 0.01);
    setMinRange(String(bound.min));
    setMaxRange(String(bound.max));
    if (current) {
      setMinVal(String(current.min));
      setMaxVal(String(current.max));
      setMinRange(String(current.min));
      setMaxRange(String(current.max));
      setHint(`Available range: ${bound.min.toFixed(2)} → ${bound.max.toFixed(2)}`);
    } else {
      setMinVal(String(bound.min));
      setMaxVal(String(bound.max));
      setHint(`Available range: ${bound.min.toFixed(2)} → ${bound.max.toFixed(2)}`);
    }
  };

  const handleColChange = (e: Event) => {
    const col = (e.target as HTMLSelectElement).value;
    setSelectedCol(col);
    refreshForColumn(col);
  };

  const handleMinInput = (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setMinVal(v);
    if (v && !isNaN(parseFloat(v))) {
      setMinRange(v);
    }
  };

  const handleMaxInput = (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setMaxVal(v);
    if (v && !isNaN(parseFloat(v))) {
      setMaxRange(v);
    }
  };

  const handleMinRange = (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setMinRange(v);
    setMinVal(v);
  };

  const handleMaxRange = (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setMaxRange(v);
    setMaxVal(v);
  };

  const getActiveBounds = () => {
    const col = selectedCol();
    return col ? props.bounds[col] : null;
  };

  const getRangeFillStyle = () => {
    const bounds = getActiveBounds();
    if (!bounds) return { left: '0%', width: '0%' };
    const span = bounds.max - bounds.min;
    if (span <= 0) return { left: '0%', width: '100%' };
    const from = parseFloat(minRange()) || bounds.min;
    const to = parseFloat(maxRange()) || bounds.max;
    const leftPct = ((from - bounds.min) / span) * 100;
    const rightPct = ((to - bounds.min) / span) * 100;
    return {
      left: `${Math.max(0, Math.min(100, leftPct))}%`,
      width: `${Math.max(0, Math.min(100, rightPct - leftPct))}%`,
    };
  };

  const handleApply = () => {
    const col = selectedCol();
    if (!col) return;
    let from = parseFloat(minVal());
    let to = parseFloat(maxVal());
    const bounds = getActiveBounds();
    if (bounds) {
      if (!isFinite(from)) from = bounds.min;
      if (!isFinite(to)) to = bounds.max;
    }
    if (!isFinite(from) || !isFinite(to)) {
      setHint('Enter a valid min and max.');
      return;
    }
    if (from > to) { const tmp = from; from = to; to = tmp; }
    props.onApply(col, { min: from, max: to });
    props.onClose();
  };

  const handleClear = () => {
    const col = selectedCol();
    if (!col) return;
    props.onClear(col);
    refreshForColumn(col);
  };

  const footer = (
    <div class={styles.footer}>
      <button class={styles.ghostBtn} type="button" onClick={handleClear}>Clear</button>
      <div class={styles.footerRight}>
        <button class={styles.ghostBtn} type="button" onClick={props.onClose}>Cancel</button>
        <button class={styles.primaryBtn} type="button" onClick={handleApply}>Apply</button>
      </div>
    </div>
  );

  const bounds = () => getActiveBounds();

  return (
    <Modal open={props.open} onClose={props.onClose} title="Filter column" footer={footer}>
      <div class={styles.body}>
        <label class={styles.field}>
          <span class={styles.label}>Column</span>
          <select class={styles.select} value={selectedCol()} onChange={handleColChange} aria-label="Select column">
            <For each={props.columns}>
              {(col) => <option value={col}>{col}</option>}
            </For>
          </select>
        </label>

        <div class={styles.grid}>
          <label class={styles.field}>
            <span class={styles.label}>Min</span>
            <input
              class={styles.input}
              type="number"
              step="0.01"
              value={minVal()}
              onInput={handleMinInput}
              aria-label="Minimum value"
            />
          </label>
          <label class={styles.field}>
            <span class={styles.label}>Max</span>
            <input
              class={styles.input}
              type="number"
              step="0.01"
              value={maxVal()}
              onInput={handleMaxInput}
              aria-label="Maximum value"
            />
          </label>
        </div>

        <div class={styles.rangeStack}>
          <span class={styles.label}>Range slider</span>
          <div class={styles.rangeValues} aria-hidden="true">
            <span>{minVal() || '—'}</span>
            <span>{maxVal() || '—'}</span>
          </div>
          <div class={styles.rangeTrack}>
            <div class={styles.rangeFill} style={getRangeFillStyle()} />
            <input
              class={`${styles.rangeInput} ${styles.rangeMin}`}
              type="range"
              min={bounds()?.min ?? 0}
              max={bounds()?.max ?? 1}
              step="0.01"
              value={minRange()}
              onInput={handleMinRange}
              aria-label="Minimum range slider"
            />
            <input
              class={`${styles.rangeInput} ${styles.rangeMax}`}
              type="range"
              min={bounds()?.min ?? 0}
              max={bounds()?.max ?? 1}
              step="0.01"
              value={maxRange()}
              onInput={handleMaxRange}
              aria-label="Maximum range slider"
            />
          </div>
          <div class={styles.rangeCaptions}>
            <span>Min</span>
            <span>Max</span>
          </div>
        </div>

        <Show when={hint()}>
          <div class={styles.hint}>{hint()}</div>
        </Show>
      </div>
    </Modal>
  );
};

export default ColumnFilterModal;