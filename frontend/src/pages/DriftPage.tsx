import { Component, createSignal, createMemo, createEffect, Show, For, onMount, onCleanup } from 'solid-js';
import * as echarts from 'echarts';
import { datasetStore, uiStore } from '../stores';
import { getColorPalette } from '../utils/colorScale';
import { getActivePlotTemplate, toEChartsTheme } from '../utils/plotTemplate';
import { exportChartAsPNG } from '../utils/exportUtils';
import styles from './DriftPage.module.css';

interface WindowStats {
  start_ms: number;
  end_ms: number;
  label: string;
  count: number;
  completeness: number;
  mean: number;
  std: number;
  quantiles: [number, number, number, number, number]; // q5, q25, q50, q75, q95
  psi: number;
  ks_stat: number;
  wasserstein: number;
  drift_level: 'green' | 'yellow' | 'red';
}

interface ReferenceStats {
  start_ms: number;
  end_ms: number;
  label: string;
  count: number;
  mean: number;
  std: number;
  quantiles: [number, number, number, number, number];
}

interface DriftResponse {
  column: string;
  reference: ReferenceStats;
  windows: WindowStats[];
}

const COLOR_GREEN = '#00C896';
const COLOR_YELLOW = '#FFC041';
const COLOR_RED = '#FF6B6B';
const COLOR_DIM = 'rgba(120,139,174,0.35)';

function driftColor(level: string): string {
  if (level === 'red') return COLOR_RED;
  if (level === 'yellow') return COLOR_YELLOW;
  return COLOR_GREEN;
}

function formatValue(v: number): string {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(4);
  return v.toExponential(2);
}

const DriftPage: Component = () => {
  let timelineRef: HTMLDivElement | undefined;
  let detailRef: HTMLDivElement | undefined;
  let timelineChart: echarts.ECharts | null = null;
  let detailChart: echarts.ECharts | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const [selectedColumns, setSelectedColumns] = createSignal<string[]>([]);
  const [windowSize, setWindowSize] = createSignal<'hourly' | 'daily' | 'weekly'>('daily');
  const [refStart, setRefStart] = createSignal('');
  const [refEnd, setRefEnd] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [activeColumn, setActiveColumn] = createSignal<string | null>(null);
  const [activeWindowIdx, setActiveWindowIdx] = createSignal<number | null>(null);
  const [driftData, setDriftData] = createSignal<Map<string, DriftResponse>>(new Map());
  const [sortBy, setSortBy] = createSignal<'time-asc' | 'psi-desc' | 'severity-desc'>('time-asc');

  const activeTemplate = createMemo(() => getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme));
  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const timeRange = createMemo(() => datasetStore.state.metadata?.timeRange ?? null);

  const sortedWindowIdxs = createMemo(() => {
    const resp = driftData().get(activeColumn() ?? '');
    if (!resp) return [];
    const idxs = resp.windows.map((_, i) => i);
    idxs.sort((a, b) => {
      const wa = resp.windows[a];
      const wb = resp.windows[b];
      switch (sortBy()) {
        case 'psi-desc': return wb.psi - wa.psi || wb.start_ms - wa.start_ms;
        case 'severity-desc': {
          const sev = (l: string) => l === 'red' ? 3 : l === 'yellow' ? 2 : 1;
          return sev(wb.drift_level) - sev(wa.drift_level) || (wb.psi - wa.psi) || (wb.start_ms - wa.start_ms);
        }
        default: return wa.start_ms - wb.start_ms;
      }
    });
    return idxs;
  });

  const initCharts = () => {
    if (timelineRef && !timelineChart) {
      timelineChart = echarts.init(timelineRef, undefined, { renderer: 'canvas' });
    }
    if (detailRef && !detailChart) {
      detailChart = echarts.init(detailRef, undefined, { renderer: 'canvas' });
    }
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        timelineChart?.resize();
        detailChart?.resize();
      });
      if (timelineRef) resizeObserver.observe(timelineRef);
      if (detailRef) resizeObserver.observe(detailRef);
    }
  };

  const buildTimelineOption = () => {
    const data = driftData();
    if (data.size === 0) return {};

    const first = data.values().next().value;
    if (!first) return {};

    const categories = ['Reference', ...first.windows.map(w => w.label)];
    const series: any[] = [];

    data.forEach((resp, col) => {
      const ref = resp.reference;
      const refSelected = activeColumn() === col && activeWindowIdx() === null;
      series.push({
        name: col,
        type: 'boxplot',
        data: [
          {
            value: [ref.quantiles[0], ref.quantiles[1], ref.quantiles[2], ref.quantiles[3], ref.quantiles[4]],
            itemStyle: { color: 'rgba(0,168,255,0.18)', borderColor: 'rgba(0,168,255,0.85)', borderWidth: refSelected ? 2.5 : 1.3 },
          },
          ...resp.windows.map((w, wIdx) => {
            const isSelected = activeColumn() === col && activeWindowIdx() === wIdx;
            return {
              value: [w.quantiles[0], w.quantiles[1], w.quantiles[2], w.quantiles[3], w.quantiles[4]],
              itemStyle: {
                color: `${driftColor(w.drift_level)}33`,
                borderColor: driftColor(w.drift_level),
                borderWidth: isSelected ? 2.4 : 1.2,
              },
            };
          }),
        ],
      });
    });

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: { trigger: 'item' },
      legend: { top: 2, right: 6, type: 'scroll' },
      grid: { left: 52, right: 20, top: 34, bottom: 72 },
      xAxis: { type: 'category', data: categories },
      yAxis: { type: 'value', scale: true },
      series,
    };
  };

  const buildDetailOption = () => {
    const col = activeColumn();
    const idx = activeWindowIdx();
    if (!col) return {};
    const resp = driftData().get(col);
    if (!resp) return {};
    const win = idx !== null ? resp.windows[idx] : null;
    const ref = resp.reference;
    const winColor = win ? driftColor(win.drift_level) : COLOR_DIM;
    const refQ = ref.quantiles;
    const winQ = win?.quantiles ?? [NaN, NaN, NaN, NaN, NaN];

    return {
      backgroundColor: 'transparent',
      grid: { left: 46, right: 14, top: 30, bottom: 38 },
      xAxis: { type: 'category', data: ['Reference', win?.label || 'Selected'] },
      yAxis: { type: 'value', scale: true },
      series: [
        {
          name: 'Distribution',
          type: 'boxplot',
          data: [
            { value: [refQ[0], refQ[1], refQ[2], refQ[3], refQ[4]], itemStyle: { color: 'rgba(0,168,255,0.18)', borderColor: 'rgba(0,168,255,0.85)', borderWidth: 1.5 } },
            { value: [winQ[0], winQ[1], winQ[2], winQ[3], winQ[4]], itemStyle: { color: `${winColor}30`, borderColor: winColor, borderWidth: 1.5 } },
          ],
        },
      ],
    };
  };

  const renderCharts = () => {
    timelineChart?.setOption(buildTimelineOption());
    detailChart?.setOption(buildDetailOption());
  };

  const handleCompute = async () => {
    const cols = selectedColumns();
    if (cols.length === 0) { uiStore.addToast({ message: 'Select at least one column', type: 'warning', duration: 4000 }); return; }
    if (!refStart() || !refEnd()) { uiStore.addToast({ message: 'Set reference start and end dates', type: 'warning', duration: 4000 }); return; }
    const metadata = datasetStore.state.metadata;
    if (!metadata) return;

    setLoading(true);
    uiStore.addToast({ message: 'Computing drift...', type: 'info', duration: 2000 });

    try {
      initCharts();
      const newData = new Map<string, DriftResponse>();
      const failures: string[] = [];

      await Promise.all(cols.map(async (col) => {
        try {
          const res = await fetch('/api/drift/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              column: col,
              window: windowSize(),
              reference_start: refStart(),
              reference_end: refEnd(),
            }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
          const data = await res.json() as DriftResponse;
          newData.set(col, data);
        } catch (e: any) {
          failures.push(`${col}: ${e?.message ?? e}`);
        }
      }));

      if (newData.size === 0) throw new Error(failures.join(' | ') || 'No drift responses received');

      setDriftData(newData);
      const firstCol = cols.find(c => newData.has(c)) ?? null;
      setActiveColumn(firstCol);
      setActiveWindowIdx(newData.size > 0 && newData.get(firstCol!)!.windows.length > 0 ? 0 : null);

      const windowsTotal = [...newData.values()].reduce((sum, r) => sum + r.windows.length, 0);
      const flaggedTotal = [...newData.values()].reduce((sum, r) => sum + r.windows.filter(w => w.drift_level !== 'green').length, 0);
      uiStore.addToast({ message: `${newData.size} column(s) | ~${Math.round(windowsTotal / newData.size)} windows/column | ${flaggedTotal} flagged`, type: 'info', duration: 5000 });
      renderCharts();
    } catch (e: any) {
      uiStore.addToast({ message: `Error: ${e?.message ?? 'unknown'}`, type: 'error', duration: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleExportPNG = () => {
    exportChartAsPNG(timelineChart!, 'drift_timeline.png');
  };

  onMount(() => {
    const cols = numericCols();
    if (cols.length > 0) setSelectedColumns([cols[0]]);

    if (timeRange()) {
      const [t0, t1] = timeRange()!;
      setRefStart(new Date(t0).toISOString().slice(0, 16));
      setRefEnd(new Date(t1).toISOString().slice(0, 16));
    }
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    timelineChart?.dispose();
    detailChart?.dispose();
  });

  return (
    <div class={styles.page}>
      <div class={styles.toolbar}>
        <div class={styles.controlGroup}>
          <label class={styles.label}>Columns</label>
          <div class={styles.columnChips}>
            <For each={numericCols()}>
              {(col) => (
                <button
                  class={`${styles.chip} ${selectedColumns().includes(col) ? styles.active : ''}`}
                  onClick={() => {
                    const cur = selectedColumns();
                    if (cur.includes(col)) {
                      if (cur.length > 1) setSelectedColumns(cur.filter(c => c !== col));
                    } else {
                      setSelectedColumns([...cur, col]);
                    }
                  }}
                >
                  {col}
                </button>
              )}
            </For>
          </div>
        </div>

        <div class={styles.controlGroup}>
          <label class={styles.label}>Window</label>
          <select class={styles.select} value={windowSize()} onChange={e => setWindowSize(e.currentTarget.value as any)}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        <div class={styles.controlGroup}>
          <label class={styles.label}>Reference Start</label>
          <input type="datetime-local" class={styles.input} value={refStart()} onInput={e => setRefStart(e.currentTarget.value)} />
        </div>

        <div class={styles.controlGroup}>
          <label class={styles.label}>Reference End</label>
          <input type="datetime-local" class={styles.input} value={refEnd()} onInput={e => setRefEnd(e.currentTarget.value)} />
        </div>

        <button class={styles.computeBtn} onClick={handleCompute} disabled={loading()}>Compute</button>
      </div>

      <div class={styles.layout}>
        <div class={styles.leftPanel}>
          <div class={styles.chartHeader}>
            <span class={styles.chartTitle}>Timeline</span>
            <button class={styles.exportBtn} onClick={handleExportPNG} disabled={!timelineChart}>PNG</button>
          </div>
          <div ref={timelineRef} class={styles.timelineChart} />
        </div>

        <div class={styles.rightPanel}>
          <div class={styles.chartHeader}>
            <span class={styles.chartTitle}>Window Detail</span>
            <select class={styles.select} value={sortBy()} onChange={e => setSortBy(e.currentTarget.value as any)}>
              <option value="time-asc">Sort: Time</option>
              <option value="psi-desc">Sort: PSI</option>
              <option value="severity-desc">Sort: Severity</option>
            </select>
          </div>
          <div ref={detailRef} class={styles.detailChart} />
          <Show when={activeColumn() && driftData().get(activeColumn()!)?.windows.length}>
            <div class={styles.windowList}>
              <For each={sortedWindowIdxs()}>
                {(wIdx) => {
                  const resp = driftData().get(activeColumn()!)!;
                  const w = resp.windows[wIdx];
                  return (
                    <button
                      class={`${styles.windowItem} ${activeWindowIdx() === wIdx ? styles.selected : ''}`}
                      onClick={() => { setActiveWindowIdx(wIdx); renderCharts(); }}
                    >
                      <span class={styles.driftBadge} style={{ background: driftColor(w.drift_level) }} />
                      <span class={styles.windowLabel}>{w.label}</span>
                      <span class={styles.windowPsi}>PSI {w.psi.toFixed(3)}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <Show when={loading()}>
        <div class={styles.loadingOverlay}>
          <div class={styles.spinner} />
          <span>Computing drift...</span>
        </div>
      </Show>

      <div class={styles.footer} />
    </div>
  );
};

export default DriftPage;