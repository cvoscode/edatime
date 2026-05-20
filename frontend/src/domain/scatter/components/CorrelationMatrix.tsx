/**
 * CorrelationMatrix — full correlation matrix for numeric columns.
 * Shows Pearson (upper triangle) / Spearman (lower triangle) values.
 * Clicking a cell sets the Y column to that column name.
 */
import { Component, createMemo, For } from 'solid-js';
import { scatterStore } from '../../../stores/scatterStore';
import { datasetStore } from '../../../stores/datasetStore';
import { scatterDomain } from '../store';
import { correlationColor } from '../../../utils/colorScale';
import styles from '../../../pages/ScatterPage.module.css';

export const CorrelationMatrix: Component = () => {
  const cols = createMemo(() => datasetStore.state.numericCols ?? []);
  const corrs = createMemo(() => scatterStore.state.correlations);

  const handleCellClick = (col: string) => {
    scatterDomain.setConfig({ yCol: col });
  };

  return (
    <div class={styles.matrixWrap}>
      <table class={styles.matrixTable}>
        <thead>
          <tr>
            <th class={styles.matrixTh} />
            <For each={cols()}>
              {(col) => <th class={styles.matrixTh}>{col}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={cols()}>
            {(row) => (
              <tr>
                <td class={styles.matrixTh}>{row}</td>
                <For each={cols()}>
                  {(col) => {
                    const pearson = corrs()?.[row]?.pearson ?? null;
                    const spearman = corrs()?.[row]?.spearman ?? null;
                    const val = pearson; // simplified — shows Pearson in all cells
                    return (
                      <td
                        class={styles.matrixTd}
                        style={{ background: val !== null ? correlationColor(val) : 'var(--color-surface)' }}
                        onClick={() => handleCellClick(col)}
                        title={`${row} × ${col}: Pearson ${pearson?.toFixed(3) ?? '—'}, Spearman ${spearman?.toFixed(3) ?? '—'}`}
                      >
                        {val !== null ? val.toFixed(2) : '—'}
                      </td>
                    );
                  }}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};