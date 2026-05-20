/**
 * ColumnSelectors — X / Y / Color / Size column dropdowns.
 * Reads config from scatterStore and updates via scatterDomain.
 */
import { Component, createMemo, For } from 'solid-js';
import { scatterStore } from '../../../stores/scatterStore';
import { datasetStore } from '../../../stores/datasetStore';
import { scatterDomain } from '../store';
import styles from '../../../pages/ScatterPage.module.css';

export const ColumnSelectors: Component = () => {
  const numericCols = createMemo(() => datasetStore.state.numericCols ?? []);
  const config = createMemo(() => scatterStore.state.config);

  const handleXChange = (val: string) => {
    scatterDomain.setConfig({ xCol: val });
  };

  const handleYChange = (val: string) => {
    scatterDomain.setConfig({ yCol: val });
  };

  const handleColorChange = (val: string) => {
    scatterDomain.setConfig({ colorCol: val });
  };

  const handleSizeChange = (val: string) => {
    scatterDomain.setConfig({ sizeCol: val });
  };

  return (
    <div class={styles.toolbarLeft}>
      <div class={styles.controlGroup}>
        <label class={styles.label}>X</label>
        <select
          class={styles.select}
          value={config().xCol}
          onChange={(e) => handleXChange(e.currentTarget.value)}
        >
          <For each={numericCols()}>
            {(col) => <option value={col}>{col}</option>}
          </For>
        </select>
      </div>

      <div class={styles.controlGroup}>
        <label class={styles.label}>Y</label>
        <select
          class={styles.select}
          value={config().yCol}
          onChange={(e) => handleYChange(e.currentTarget.value)}
        >
          <For each={numericCols()}>
            {(col) => <option value={col}>{col}</option>}
          </For>
        </select>
      </div>

      <div class={styles.controlGroup}>
        <label class={styles.label}>Color</label>
        <select
          class={styles.select}
          value={config().colorCol}
          onChange={(e) => handleColorChange(e.currentTarget.value)}
        >
          <option value="">None</option>
          <For each={numericCols()}>
            {(col) => <option value={col}>{col}</option>}
          </For>
        </select>
      </div>

      <div class={styles.controlGroup}>
        <label class={styles.label}>Size</label>
        <select
          class={styles.select}
          value={config().sizeCol}
          onChange={(e) => handleSizeChange(e.currentTarget.value)}
        >
          <option value="">None</option>
          <For each={numericCols()}>
            {(col) => <option value={col}>{col}</option>}
          </For>
        </select>
      </div>
    </div>
  );
};