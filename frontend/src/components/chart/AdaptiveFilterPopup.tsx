import { Component, For, createMemo } from 'solid-js';
import styles from './AdaptiveFilterPopup.module.css';

interface AdaptiveFilterPopupProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  columns: string[];
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

  return (
    <div class={styles.overlay} onClick={props.onCancel}>
      <div class={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 class={styles.title}>Filter by Line</h3>
        <p class={styles.subtitle}>
          Select which column to filter. Points on one side of the line will be kept.
        </p>
        <div class={styles.columnList}>
          <For each={props.columns}>
            {(col) => {
              const keepAbove = createMemo(() => keepAboveForColumn(col));
              return (
                <button
                  class={styles.columnBtn}
                  onClick={() => props.onSelect(col, keepAbove())}
                >
                  <span class={styles.colName}>{col}</span>
                  <span class={`${styles.badge} ${keepAbove() ? styles.badgeAbove : styles.badgeBelow}`}>
                    {keepAbove() ? 'keep above' : 'keep below'}
                  </span>
                </button>
              );
            }}
          </For>
        </div>
        <button class={styles.cancelBtn} onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default AdaptiveFilterPopup;