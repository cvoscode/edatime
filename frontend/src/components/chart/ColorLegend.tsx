import { Component, createMemo, For, Show } from 'solid-js';
import { buildColorScale, categorizeColors } from '../../services/colorManager';
import { getColorPalette } from '../../utils/colorScale';
import type { ColorScaleName } from '../../utils/colorScale';
import styles from './ColorLegend.module.css';

export interface ColorLegendProps {
  /** 'continuous' for numeric color scale, 'categorical' for categorical */
  mode: 'continuous' | 'categorical';

  /** Numeric color values (for continuous mode) */
  colorValues?: number[] | null;

  /** Categorical color labels (for categorical mode) */
  colorLabels?: (string | null)[] | null;

  /** Min/max for continuous color scale */
  colorMin?: number | null;
  colorMax?: number | null;

  /** Color scale name */
  scale?: ColorScaleName;

  /** Position of the legend */
  position?: 'top' | 'right' | 'bottom' | 'left';

  /** Title for the legend */
  title?: string;

  /** Additional CSS class */
  class?: string;
}

const DISTRIBUTION_GROUP_COLORS = [
  '#4a9eff', '#ff6b6b', '#52c41a', '#ffc53d', '#a0d911',
  '#5ad8a6', '#ff9d4d', '#7ec8ff', '#f78fb3', '#9bde6d', '#ffd166',
];

const ColorLegend: Component<ColorLegendProps> = (props) => {
  const position = () => props.position ?? 'right';
  const scale = () => props.scale ?? 'viridis';

  const continuousInfo = createMemo(() => {
    if (props.mode !== 'continuous') return null;
    return buildColorScale(props.colorValues ?? null, props.colorMin ?? null, props.colorMax ?? null, scale());
  });

  const categoricalInfo = createMemo(() => {
    if (props.mode !== 'categorical') return null;
    const labels = props.colorLabels ?? null;
    if (!labels) return null;
    return categorizeColors(labels);
  });

  const gradientStops = createMemo(() => {
    if (props.mode !== 'continuous') return [];
    return getColorPalette(scale(), 6);
  });

  const isVertical = () => position() === 'right' || position() === 'left';

  return (
    <div
      class={`${styles.container} ${isVertical() ? styles.vertical : styles.horizontal} ${props.class ?? ''}`}
      data-mode={props.mode}
    >
      <Show when={props.title}>
        <span class={styles.title}>{props.title}</span>
      </Show>

      <Show when={props.mode === 'continuous' && props.colorMin !== null && props.colorMax !== null}>
        <div class={styles.continuousWrap}>
          <Show
            when={isVertical()}
            fallback={
              <div class={styles.horizontalBar}>
                <div
                  class={styles.gradientBar}
                  style={{
                    background: `linear-gradient(to right, ${gradientStops().join(', ')})`,
                  }}
                />
                <div class={styles.tickRow}>
                  <span class={styles.tick}>{props.colorMin?.toFixed(2) ?? '0.00'}</span>
                  <span class={styles.tick}>{props.colorMax?.toFixed(2) ?? '1.00'}</span>
                </div>
              </div>
            }
          >
            <div class={styles.verticalBar}>
              <span class={styles.tick}>{props.colorMax?.toFixed(2) ?? '1.00'}</span>
              <div
                class={styles.gradientBarVertical}
                style={{
                  background: `linear-gradient(to top, ${gradientStops().join(', ')})`,
                }}
              />
              <span class={styles.tick}>{props.colorMin?.toFixed(2) ?? '0.00'}</span>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={props.mode === 'categorical' && categoricalInfo() && categoricalInfo()!.categories.length > 0}>
        <div class={styles.categoricalLegend}>
          <For each={categoricalInfo()!.categories}>
            {(label, idx) => (
              <div class={styles.categoricalItem}>
                <div
                  class={styles.swatch}
                  style={{ background: DISTRIBUTION_GROUP_COLORS[idx() % DISTRIBUTION_GROUP_COLORS.length] }}
                />
                <span class={styles.categoricalLabel}>{label}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ColorLegend;