import { Component, For, createMemo, createSignal } from 'solid-js';
import styles from './ColumnChips.module.css';

interface ColumnChipsProps {
  columns: string[];
  selected: string[];
  filter: string;
  onChange: (selected: string[]) => void;
  colors?: Record<string, string>;
  
  onColorChange?: (column: string, color: string) => void;
  onOpenFilter?: (column: string) => void;
  onHiddenChange?: (hidden: string[]) => void;
}

const ColumnChips: Component<ColumnChipsProps> = (props) => {
  const [hiddenColumns, setHiddenColumns] = createSignal<Set<string>>(new Set());

  const filteredColumns = createMemo(() => {
    if (!props.filter) return props.columns;
    const lower = props.filter.toLowerCase();
    return props.columns.filter(col => col.toLowerCase().includes(lower));
  });

  const isSelected = (col: string) => props.selected.includes(col);
  const isHidden = (col: string) => hiddenColumns().has(col);

  const chipColor = (col: string) => {
    return props.colors?.[col] ?? '#888888';
  };

  const toggle = (col: string) => {
    if (isHidden(col)) {
      const next = new Set(hiddenColumns());
      next.delete(col);
      setHiddenColumns(next);
      props.onChange([...props.selected, col]);
      props.onHiddenChange?.([...next]);
    } else if (isSelected(col)) {
      const next = new Set(hiddenColumns());
      next.add(col);
      setHiddenColumns(next);
      props.onChange(props.selected.filter(c => c !== col));
      props.onHiddenChange?.([...next]);
    } else {
      props.onChange([...props.selected, col]);
    }
  };

  const handleColorChange = (col: string, e: Event) => {
    e.stopPropagation();
    const value = (e.target as HTMLInputElement).value;
    props.onColorChange?.(col, value);
  };

  const handleMenuClick = (col: string, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    props.onOpenFilter?.(col);
  };

  return (
    <div class={styles.chips}>
      <For each={filteredColumns()}>
        {(col) => (
          <div
            class={`${styles.chip} ${isSelected(col) && !isHidden(col) ? styles.selected : ''} ${isHidden(col) ? styles.hidden : ''}`}
            style={{ '--chip-color': chipColor(col) }}
            onClick={(e) => {
              e.preventDefault();
              toggle(col);
            }}
          >
            <input
              type="checkbox"
              class={styles.checkbox}
              checked={isSelected(col) && !isHidden(col)}
              onClick={(e) => e.stopPropagation()}
            />
            <span
              class={styles.colorSwatch}
              style={{ '--swatch-color': chipColor(col) }}
              title={`Color for ${col}`}
            >
              <span class={styles.colorSwatchDot} />
              <input
                type="color"
                class={styles.colorSwatchInput}
                value={chipColor(col)}
                aria-label={`Color for ${col}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => handleColorChange(col, e)}
              />
            </span>
            <span class={styles.label}>{col}</span>
            <button
              class={styles.menuBtn}
              type="button"
              title={`Filter range for ${col}`}
              aria-label={`Filter range for ${col}`}
              onClick={(e) => handleMenuClick(col, e)}
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="8" cy="13" r="1.5"/>
              </svg>
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default ColumnChips;