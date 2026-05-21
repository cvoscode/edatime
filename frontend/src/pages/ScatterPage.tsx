import { Component, createSignal, createEffect, createMemo, Show, For, onMount, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { scatterStore, datasetStore, uiStore } from '../stores';
import type { CorrelationItem } from '../types';
import { fetchScatterCorrelations } from '../services/api';
import { fetchScatterData } from '../services/dataFetch';
import { getColorPalette, buildCategoricalColorGroups, getCategoryColor, sampleGradient } from '../utils/colorScale';
import LabelsDrawer from '../domain/timeseries/components/LabelsDrawer';
import ScatterChartView from '../domain/scatter/components/ScatterChart';
import styles from './ScatterPage.module.css';

const ScatterPage: Component = () => {
  const navigate = useNavigate();
  let updateChartFn: ((options: any) => void) | null = null;
  let chartEngineName = 'ChartGPU';

  const [isLoading, setIsLoading] = createSignal(false);
  const [activeView, setActiveView] = createSignal<'plot' | 'matrix'>('plot');
  const [renderMode, setRenderMode] = createSignal<'scatter' | 'density'>('scatter');
  const [showLabelsDrawer, setShowLabelsDrawer] = createSignal(false);
  const [chartTitle, setChartTitle] = createSignal('');
  const [xAxisLabel, setXAxisLabel] = createSignal('');
  const [yAxisLabel, setYAxisLabel] = createSignal('');
  const [binSize, setBinSize] = createSignal(2);
  const [densityNormalization, setDensityNormalization] = createSignal<'linear' | 'sqrt' | 'log'>('log');

  const numericCols = createMemo(() => datasetStore.state.numericCols);

  const xCol = createMemo(() => {
    const stored = sessionStorage.getItem('scatter-x-col');
    if (stored) {
      sessionStorage.removeItem('scatter-x-col');
      scatterStore.setConfig({ xCol: stored });
      return stored;
    }
    return scatterStore.state.config.xCol || numericCols()[0] || '';
  });

  const yCol = createMemo(() => {
    const stored = sessionStorage.getItem('scatter-y-col');
    if (stored) {
      sessionStorage.removeItem('scatter-y-col');
      scatterStore.setConfig({ yCol: stored });
      return stored;
    }
    return scatterStore.state.config.yCol || numericCols()[1] || '';
  });

  const colorCol = createMemo(() => scatterStore.state.config.colorCol || '');
  const sizeCol = createMemo(() => scatterStore.state.config.sizeCol || '');

  const correlationForY = createMemo(() => {
    const y = yCol();
    const corrs = scatterStore.state.correlations;
    return corrs[y] ?? null;
  });

  const suggestions = createMemo(() => scatterStore.state.suggestions);
  const totalPoints = createMemo(() => scatterStore.state.totalPoints);
  const scatterPoints = createMemo(() => scatterStore.state.scatterPoints);

  const handleXChange = async (val: string) => {
    scatterStore.setConfig({ xCol: val });
    await refreshCorrelations(val);
    await fetchPoints();
  };

  const handleYChange = async (val: string) => {
    scatterStore.setConfig({ yCol: val });
    await fetchPoints();
  };

  const handleColorChange = async (val: string) => {
    scatterStore.setConfig({ colorCol: val });
    await fetchPoints();
  };

  const handleSizeChange = async (val: string) => {
    scatterStore.setConfig({ sizeCol: val });
    await fetchPoints();
  };

  const handleSuggestionClick = async (col: string) => {
    scatterStore.setConfig({ yCol: col });
    await fetchPoints();
  };

  const refreshCorrelations = async (base: string) => {
    if (!base) return;
    try {
      const resp = await fetchScatterCorrelations(base, 0.7);
      const corrMap: Record<string, { pearson: number | null; spearman: number | null }> = {};
      for (const item of resp.correlations) {
        corrMap[item.column] = { pearson: item.pearson, spearman: item.spearman };
      }
      scatterStore.setCorrelations(corrMap);
      const suggestionItems: CorrelationItem[] = (resp.suggestions ?? []).map(s => ({
        column: `${s.x} × ${s.y}`,
        count: 0,
        pearson: s.correlation,
        spearman: null,
      }));
      scatterStore.setSuggestions(suggestionItems);
    } catch (e) {
      console.error('Failed to fetch correlations:', e);
    }
  };

  const handleLabelsChange = (title: string, xLabel: string, yLabel: string) => {
    setChartTitle(title);
    setXAxisLabel(xLabel);
    setYAxisLabel(yLabel);
    updateChart();
  };

  const fetchPoints = async () => {
    const x = xCol();
    const y = yCol();
    if (!x || !y) return;

    setIsLoading(true);
    try {
      const color = colorCol() || null;
      const size = sizeCol() || null;
      const resp = await fetchScatterData(x, y, 500000, color, size);
      scatterStore.setScatterPoints(resp.points, resp.totalPoints);
      scatterStore.setColorValues(resp.colorValues, resp.colorMin, resp.colorMax);
      scatterStore.setColorLabels(resp.colorLabels);
      scatterStore.setColorKind(resp.colorKind);
      scatterStore.setSizeValues(resp.sizeValues, resp.sizeMin, resp.sizeMax);
      updateChart();
    } catch (e) {
      console.error('Failed to fetch scatter points:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEngineReady = (engineName: string) => {
    chartEngineName = engineName;
  };

  const handleChartReady = (updateFn: (options: any) => void) => {
    updateChartFn = updateFn;
    updateChart();
  };

  const updateChart = () => {
    if (!updateChartFn) return;

    const points = scatterPoints();
    const colorVals = scatterStore.state.colorValues;
    const colorLabels = scatterStore.state.colorLabels;
    const colorColName = colorCol();
    const sizeColName = sizeCol();
    const sizeVals = scatterStore.state.sizeValues;
    const sizeMin = scatterStore.state.sizeMin;
    const sizeMax = scatterStore.state.sizeMax;
    const mode = renderMode();
    const isDensity = mode === 'density';
    const n = points.length;

    const symbolSize = sizeColName && sizeVals && sizeMin !== null && sizeMax !== null
      ? (pt: number[]) => {
        const sizeIdx = colorVals && colorVals.length > 0 ? 3 : 2;
        const sv = pt[sizeIdx];
        if (typeof sv !== 'number' || !Number.isFinite(sv)) return 4;
        const span = (sizeMax - sizeMin) || 1;
        const t = Math.max(0, Math.min(1, (sv - sizeMin) / span));
        return 2 + t * 18; // scale 2–20px
      }
      : 4;

    if (isDensity || (!colorColName && !sizeColName) || (!colorVals && !colorLabels && !sizeVals)) {
      const series: any[] = [
        {
          type: 'scatter',
          name: `${xCol()} vs ${yCol()}`,
          data: points,
          symbolSize,
        }
      ];
      updateChartFn({ series });
      return;
    }

    if (scatterStore.state.colorKind === 'categorical' && colorLabels) {
      const catGroups = buildCategoricalColorGroups(colorLabels);
      if (catGroups) {
        const series = catGroups.categories.map((label) => {
          const data: any[] = [];
          for (let i = 0; i < n; i++) {
            const lbl = colorLabels[i];
            const normalized = lbl == null ? 'Missing' : String(lbl).trim() || 'Missing';
            if (normalized !== label) continue;
            data.push(sizeVals ? [points[i][0], points[i][1], sizeVals[i]] : [points[i][0], points[i][1]]);
          }
          return {
            type: 'scatter',
            name: label,
            data,
            symbolSize,
            color: catGroups.colorByLabel.get(label) || '#4a9eff',
          };
        }).filter((s: any) => s.data.length > 0);

        updateChartFn({ series });
        return;
      }
      // High cardinality — show message in legend, skip color rendering
      updateChartFn({ series: [{ type: 'scatter', name: `${colorCol()} (${new Set(colorLabels).size} categories — too many to display)`, data: points.map(p => sizeVals ? [...p, sizeVals[points.indexOf(p)]] : p), symbolSize }] });
      return;
    }

    if (scatterStore.state.colorKind === 'continuous' && colorVals && colorVals.length > 0) {
      // Bucketed/binned approach for continuous color (avoids visualMap GPU compatibility issues)
      const colorMin = scatterStore.state.colorMin ?? 0;
      const colorMax = scatterStore.state.colorMax ?? 1;
      const span = colorMax - colorMin || 1;
      const bins = 64;
      const palette = getColorPalette(uiStore.state.colorScale, bins);
      const grouped: any[][] = Array.from({ length: bins }, () => []);

      for (let i = 0; i < n; i++) {
        const cv = colorVals[i];
        if (typeof cv !== 'number' || !Number.isFinite(cv)) continue;
        let b = Math.floor(((cv - colorMin) / span) * bins);
        b = Math.max(0, Math.min(bins - 1, b));
        grouped[b].push(sizeVals ? [points[i][0], points[i][1], sizeVals[i]] : [points[i][0], points[i][1]]);
      }

      const series = grouped.map((data, b) => {
        if (data.length === 0) return null;
        return {
          type: 'scatter' as const,
          name: `bin-${b}`,
          data,
          symbolSize,
          color: sampleGradient(palette, (b + 0.5) / bins),
        };
      }).filter((s): s is NonNullable<typeof s> => s !== null);

      updateChartFn({ series });
    }
  };

  onMount(async () => {
    const x = xCol();
    if (x) {
      await refreshCorrelations(x);
    }
    await fetchPoints();
  });

  createEffect(() => {
    void xCol();
    void yCol();
    void colorCol();
    void sizeCol();
    void renderMode();
    void uiStore.state.colorScale;
    if (updateChartFn) {
      void fetchPoints();
    }
  });

  const hasData = createMemo(() => datasetStore.state.metadata !== null);
  const canShowChart = createMemo(() => hasData() && numericCols().length >= 2);

  return (
    <div class={styles.page}>
      <div class={styles.toolbar}>
        <div class={styles.toolbarLeft}>
          <div class={styles.controlGroup}>
            <label class={styles.label}>X</label>
            <select
              class={styles.select}
              value={xCol()}
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
              value={yCol()}
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
              value={colorCol()}
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
              value={sizeCol()}
              onChange={(e) => handleSizeChange(e.currentTarget.value)}
            >
              <option value="">None</option>
              <For each={numericCols()}>
                {(col) => <option value={col}>{col}</option>}
              </For>
            </select>
          </div>
        </div>
        <div class={styles.toolbarRight}>
          <Show when={renderMode() === 'density'}>
            <div class={styles.controlGroup}>
              <label class={styles.label}>Bin</label>
              <select
                class={styles.select}
                value={binSize()}
                onChange={(e) => setBinSize(Number(e.currentTarget.value))}
              >
                <option value="2">2px</option>
                <option value="4">4px</option>
                <option value="8">8px</option>
                <option value="16">16px</option>
              </select>
            </div>
            <div class={styles.controlGroup}>
              <label class={styles.label}>Norm</label>
              <select
                class={styles.select}
                value={densityNormalization()}
                onChange={(e) => setDensityNormalization(e.currentTarget.value as 'linear' | 'sqrt' | 'log')}
              >
                <option value="linear">Linear</option>
                <option value="sqrt">Sqrt</option>
                <option value="log">Log</option>
              </select>
            </div>
          </Show>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Mode</label>
            <select
              class={styles.select}
              value={renderMode()}
              onChange={(e) => setRenderMode(e.currentTarget.value as 'scatter' | 'density')}
            >
              <option value="scatter">Scatter</option>
              <option value="density">Density</option>
            </select>
          </div>
          <div class={styles.viewToggle}>
            <button
              class={`${styles.viewBtn} ${activeView() === 'plot' ? styles.active : ''}`}
              onClick={() => setActiveView('plot')}
            >
              Plot
            </button>
            <button
              class={`${styles.viewBtn} ${activeView() === 'matrix' ? styles.active : ''}`}
              onClick={() => setActiveView('matrix')}
            >
              Matrix
            </button>
          </div>
          <button
            class={styles.panelOpenBtn}
            type="button"
            title="Edit chart title and axis labels"
            onClick={() => setShowLabelsDrawer(true)}
          >
            <span class={styles.toolbarLabel}>Labels</span>
          </button>
        </div>
      </div>

      <Show when={suggestions().length > 0}>
        <div class={styles.suggestions}>
          <span class={styles.suggestionsLabel}>Suggestions:</span>
          <For each={suggestions()}>
            {(item) => (
              <button
                class={styles.suggestionChip}
                onClick={() => handleSuggestionClick(item.column)}
              >
                <span class={styles.chipName}>{item.column}</span>
                <span class={styles.chipCorr}>
                  {item.pearson?.toFixed(2) ?? '—'}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={correlationForY()}>
        <div class={styles.corrStats}>
          <span>Pearson: {correlationForY()!.pearson?.toFixed(4) ?? '—'}</span>
          <span>Spearman: {correlationForY()!.spearman?.toFixed(4) ?? '—'}</span>
        </div>
      </Show>

      <main class={styles.main}>
        <Show when={canShowChart()}>
          <ScatterChartView
            xAxisLabel={xAxisLabel() || xCol()}
            yAxisLabel={yAxisLabel() || yCol()}
            renderMode={renderMode()}
            binSize={binSize()}
            densityNormalization={densityNormalization()}
            onReady={handleChartReady}
            onEngineReady={handleEngineReady}
          />
        </Show>

        <Show when={!canShowChart()}>
          <div class={styles.emptyState}>
            <strong>No data loaded</strong>
            <span>Upload a dataset to visualize scatter data.</span>
            <button class={styles.primaryBtn} onClick={() => navigate('/upload')}>
              Upload data
            </button>
          </div>
        </Show>

        <Show when={isLoading()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.spinner} />
            <span>Loading...</span>
          </div>
        </Show>

        <div class={styles.overlayStack} id="scatter-overlays">
          <Show when={scatterStore.state.colorKind === 'categorical' && scatterStore.state.colorLabels && colorCol()}>
            {(() => {
              const catGroups = buildCategoricalColorGroups(scatterStore.state.colorLabels!);
              return catGroups ? (
                <div id="scatter-categorical-wrap" class={styles.colorbarWrap}>
                  <span class={styles.colorbarName}>{colorCol()}</span>
                  <div class={styles.categoricalLegend}>
                    <For each={catGroups.categories}>
                      {(label, idx) => (
                        <div class={styles.categoricalItem}>
                          <div class={styles.categoricalSwatch} style={{ background: getCategoryColor(idx()) }} />
                          <span>{label}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              ) : (
                <div id="scatter-categorical-wrap" class={styles.colorbarWrap}>
                  <span class={styles.colorbarName}>{colorCol()}</span>
                  <span class={styles.colorbarName}>{(new Set(scatterStore.state.colorLabels)).size} categories — too many to display</span>
                </div>
              );
            })()}
          </Show>
          <Show when={colorCol() && scatterStore.state.colorKind === 'continuous' && scatterStore.state.colorValues && renderMode() === 'scatter'}>
            <div id="scatter-colorbar-wrap" class={styles.colorbarVertical}>
              <span class={styles.colorbarVTick}>{scatterStore.state.colorMax?.toFixed(2) ?? '1.00'}</span>
              <div id="scatter-colorbar" class={styles.colorbar} style={{ background: `linear-gradient(to top, ${getColorPalette(uiStore.state.colorScale, 6).join(', ')})` }} />
              <span class={styles.colorbarVTick}>{scatterStore.state.colorMin?.toFixed(2) ?? '0.00'}</span>
              <span class={styles.colorbarVName}>{colorCol()}</span>
            </div>
          </Show>
        </div>
      </main>

      <Show when={totalPoints() > 0}>
        <div class={styles.footer}>
          <span>{totalPoints().toLocaleString()} points</span>
        </div>
      </Show>

      <LabelsDrawer
        open={showLabelsDrawer()}
        onClose={() => setShowLabelsDrawer(false)}
        title={chartTitle()}
        xAxisLabel={xAxisLabel()}
        yAxisLabel={yAxisLabel()}
        onChange={handleLabelsChange}
        engineName={chartEngineName}
      />
    </div>
  );
};

export default ScatterPage;