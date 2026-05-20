import { Component, For, createSignal, createEffect } from 'solid-js';
import styles from './AdaptiveFilterPopup.module.css';

interface AdaptiveFilterPopupProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  screenX: number;
  screenY: number;
  columns: string[];
  colors?: Record<string, string>;
  seriesData?: { xValues: Float64Array; series: Record<string, Float64Array> } | null;
  onSelect: (column: string, keepAbove: boolean) => void;
  onCancel: () => void;
}

const AdaptiveFilterPopup: Component<AdaptiveFilterPopupProps> = (props) => {
  const keepAboveForColumn = (column: string): boolean => {
    const data = props.seriesData;
    if (!data || !data.series[column]) return true;

    const colData = data.series[column];
    const xValues = data.xValues;

    let sumY = 0;
    let countY = 0;
    const xMin = Math.min(props.x1, props.x2);
    const xMax = Math.max(props.x1, props.x2);

    const step = Math.max(1, Math.floor(colData.length / 100));
    for (let i = 0; i < colData.length; i += step) {
      const x = xValues[i];
      if (x === undefined || !Number.isFinite(x)) continue;
      if (x < xMin || x > xMax) continue;
      const y = colData[i];
      if (y === undefined || !Number.isFinite(y)) continue;
      sumY += y;
      countY++;
    }

    if (countY === 0) return true;

    const meanDataY = sumY / countY;
    const lineY = (props.y1 + props.y2) / 2;
    return meanDataY > lineY;
  };

  const [keepAboveMap, setKeepAboveMap] = createSignal<Record<string, boolean>>({});

  createEffect(() => {
    const map: Record<string, boolean> = {};
    for (const col of props.columns) {
      map[col] = keepAboveForColumn(col);
    }
    setKeepAboveMap(map);
  });

  const toggleKeepAbove = (col: string) => {
    setKeepAboveMap(prev => ({ ...prev, [col]: !prev[col] }));
  };

  return (
    <div
      class={styles.popup}
      style={{
        left: `${props.screenX}px`,
        top: `${props.screenY}px`
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div class={styles.label}>Filter which trace?</div>
      <div class={styles.content}>
        <For each={props.columns}>
          {(col) => {
            const keepAbove = () => keepAboveMap()[col] ?? true;
            const accentColor = () => props.colors?.[col] ?? '#9fb1d1';
            return (
              <button
                class={styles.columnBtn}
                style={{ '--pick-accent': accentColor() }}
                onClick={() => props.onSelect(col, keepAbove())}
              >
                <span class={styles.colName}>{col}</span>
                <span
                  class={styles.toggleBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleKeepAbove(col);
                  }}
                  title={keepAbove() ? 'Keeping above the line' : 'Keeping below the line'}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleKeepAbove(col);
                    }
                  }}
                >
                  {keepAbove() ? '▲' : '▼'}
                </span>
                <span class={`${styles.badge} ${keepAbove() ? styles.badgeAbove : styles.badgeBelow}`}>
                  {keepAbove() ? 'above' : 'below'}
                </span>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default AdaptiveFilterPopup;