import { Component, For, createMemo } from 'solid-js';
import styles from './ColumnChips.module.css';

interface ColumnChipsProps {
  columns: string[];
  selected: string[];
  filter: string;
  onChange: (selected: string[]) => void;
  colors?: Record<string, string>;
  onColorChange?: (column: string, color: string) => void;
  onOpenFilter?: (column: string) => void;
}

const SERIES_COLORS = [
  '#00a8ff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8',
  '#ff922b', '#22b8cf', '#f06595', '#94d82d', '#748ffc',
];

const ColumnChips: Component<ColumnChipsProps> = (props) => {
  const filteredColumns = createMemo(() => {
    if (!props.filter) return props.columns;
    const lower = props.filter.toLowerCase();
    return props.columns.filter(col => col.toLowerCase().includes(lower));
  });

  const getColor = (col: string, idx: number) => {
    if (props.colors?.[col]) return props.colors[col];
    const numericIdx = props.columns.indexOf(col);
    return SERIES_COLORS[numericIdx >= 0 ? numericIdx : idx % SERIES_COLORS.length];
  };

  const isSelected = (col: string) => props.selected.includes(col);

  const toggle = (col: string) => {
    if (isSelected(col)) {
      props.onChange(props.selected.filter(c => c !== col));
    } else {
      props.onChange([...props.selected, col]);
    }
  };

  const handleColorChange = (col: string, e: Event) => {
    e.stopPropagation();
    const value = (e.target as HTMLInputElement).value;
    props.onColorChange?.(col, value);
  };

  const handleColorPointerDown = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const handleMenuClick = (col: string, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    props.onOpenFilter?.(col);
  };

  return (
    <div class={styles.chips}>
      <For each={filteredColumns()}>
        {(col, idx) => (
          <label
            class={`${styles.chip} ${isSelected(col) ? styles.selected : ''}`}
            style={{ '--chip-color': getColor(col, idx()) }}
          >
            <input
              type="checkbox"
              class={styles.checkbox}
              checked={isSelected(col)}
              onChange={() => toggle(col)}
            />
            <input
              type="color"
              class={styles.colorPicker}
              value={getColor(col, idx())}
              title={`Color for ${col}`}
              aria-label={`Color for ${col}`}
              onPointerDown={handleColorPointerDown}
              onMouseDown={handleColorPointerDown}
              onClick={handleColorPointerDown}
              onInput={(e) => handleColorChange(col, e)}
            />
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
          </label>
        )}
      </For>
    </div>
  );
};

export default ColumnChips;