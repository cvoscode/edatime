import { Component, createSignal, createMemo, createEffect, Show, For, onMount, onCleanup } from 'solid-js';
import * as echarts from 'echarts';
import { fftStore, datasetStore, uiStore } from '../stores';
import { fetchFft, fetchSpectrogram } from '../services/api';
import { getColorPalette } from '../utils/colorScale';
import { getActivePlotTemplate, toEChartsTheme } from '../utils/plotTemplate';
import { formatFrequency, formatPeriod, SPECTRAL_PRESETS } from '../utils/spectral';
import type { FftTrace } from '../types';
import ColumnChips from '../components/chart/ColumnChips';
import styles from './FftPage.module.css';

const FftPage: Component = () => {
  let chartContainerRef: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const [activeTab, setActiveTab] = createSignal<'fft' | 'spectrogram'>('fft');
  const [fftMode, setFftMode] = createSignal<'magnitude' | 'psd'>('magnitude');
  const [logScale, setLogScale] = createSignal(true);
  const [status, setStatus] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [spectrogramWindow, setSpectrogramWindow] = createSignal(256);
  const [spectrogramHop, setSpectrogramHop] = createSignal(128);

  const numericCols = createMemo(() => datasetStore.state.numericCols);
  const fftTraces = createMemo(() => fftStore.state.fftTraces);
  const spectrogramResult = createMemo(() => fftStore.state.spectrogramResult);

  const activeTemplate = createMemo(() =>
    getActivePlotTemplate(uiStore.state.plotTheme, uiStore.state.theme)
  );
  const echartsThemeName = createMemo(() => `edatime-fft-${activeTemplate().id}`);

  const getFftColor = (column: string, fallbackIdx: number): string => {
    const palette = getColorPalette(uiStore.state.colorScale, numericCols().length);
    const idx = numericCols().indexOf(column);
    return palette[idx >= 0 ? idx : fallbackIdx % palette.length];
  };

  const registerTheme = () => {
    const tmpl = activeTemplate();
    echarts.registerTheme(echartsThemeName(), toEChartsTheme(tmpl));
  };

  const buildFftSeries = () => {
    const traces = fftTraces();
    const mode = fftMode();
    const log = logScale();

    return traces.map(trace => {
      const data = mode === 'psd'
        ? trace.psd.map((v, i) => [trace.frequencies[i], log ? Math.log10(v) : v] as [number, number])
        : trace.magnitudes.map((v, i) => [trace.frequencies[i], log ? Math.log10(v) : v] as [number, number]);

      return {
        name: trace.column,
        type: 'line' as const,
        data,
        symbol: 'none',
        lineStyle: { color: trace.color, width: 1.5 },
      };
    });
  };

  const updateFftChart = () => {
    if (!chartInstance) return;

    const series = buildFftSeries();
    const log = logScale();

    chartInstance.setOption({
      grid: { left: 80, right: 40, top: 20, bottom: 50 },
      xAxis: {
        type: 'value',
        name: 'Frequency (Hz)',
        nameLocation: 'middle',
        nameGap: 30,
        scale: true,
      },
      yAxis: {
        type: 'value',
        name: log ? 'Magnitude (log₁₀)' : 'Magnitude',
        nameLocation: 'middle',
        nameGap: 50,
        scale: true,
      },
      series,
      color: getColorPalette(uiStore.state.colorScale, series.length),
    });

    const bins = series[0]?.data.length ?? 0;
    const cols = fftTraces().map(t => t.column).join(', ');
    setStatus(`${bins} bins · ${cols || 'Select columns'}`);
  };

  const updateSpectrogramChart = () => {
    if (!chartInstance) return;

    const result = spectrogramResult();
    if (!result) return;

    const data: [number, number, number][] = [];
    const timeCount = result.time_points.length;
    const freqCount = result.freq_points.length;

    for (let ti = 0; ti < timeCount; ti++) {
      const row = result.power_matrix[ti];
      if (!row) continue;
      for (let fi = 0; fi < freqCount; fi++) {
        const val = row[fi];
        if (Number.isFinite(val)) {
          data.push([ti, fi, val]);
        }
      }
    }

    chartInstance.setOption({
      grid: { left: 80, right: 40, top: 20, bottom: 50 },
      xAxis: { type: 'value', name: 'Time', nameLocation: 'middle', nameGap: 30 },
      yAxis: { type: 'value', name: 'Frequency (Hz)', nameLocation: 'middle', nameGap: 50 },
      visualMap: {
        show: true,
        min: 0,
        max: Math.max(...result.power_matrix.flat().filter(Number.isFinite), 1),
        inRange: { color: getColorPalette(uiStore.state.colorScale, 8) },
      },
      series: [{
        type: 'heatmap',
        data,
        emphasis: { itemStyle: { shadowBlur: 10 } },
      }],
    });
  };

  const handleFetchFft = async (column: string) => {
    const metadata = datasetStore.state.metadata;
    if (!metadata) return;

    const [startMs, endMs] = metadata.timeRange ?? [0, 0];
    if (!startMs || !endMs) return;

    setLoading(true);
    setStatus(`Computing FFT for ${column}...`);

    try {
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();
      const resp = await fetchFft(start, end, column);

      if (resp.results.length > 0) {
        const result = resp.results[0];
        const idx = numericCols().indexOf(column);
        const trace: FftTrace = {
          column: result.column,
          frequencies: result.frequencies,
          magnitudes: result.magnitudes,
          psd: result.psd,
          color: getFftColor(column, idx),
        };
        fftStore.addFftTrace(trace);
        updateFftChart();
      }
    } catch (e) {
      console.error('FFT fetch failed:', e);
      setStatus(`FFT failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchSpectrogram = async () => {
    const metadata = datasetStore.state.metadata;
    if (!metadata) return;

    const [startMs, endMs] = metadata.timeRange ?? [0, 0];
    if (!startMs || !endMs) return;

    setLoading(true);
    setStatus(`Computing spectrogram...`);

    try {
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();
      const column = numericCols()[0] || '';
      const resp = await fetchSpectrogram(start, end, column, spectrogramWindow(), spectrogramHop());

      fftStore.setSpectrogramResult({
        time_points: resp.result.times_ms,
        freq_points: resp.result.frequencies,
        power_matrix: resp.result.magnitudes,
      });
      updateSpectrogramChart();
    } catch (e) {
      console.error('Spectrogram fetch failed:', e);
      setStatus(`Spectrogram failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTrace = (column: string) => {
    fftStore.removeFftTrace(column);
    updateFftChart();
  };

  const selectedColumns = createMemo(() => fftStore.state.fftTraces.map(t => t.column));

  const columnColors = createMemo(() => {
    const m: Record<string, string> = {};
    for (const t of fftStore.state.fftTraces) m[t.column] = t.color;
    return m;
  });

  const handleChipChange = (selected: string[]) => {
    const current = new Set(fftStore.state.fftTraces.map(t => t.column));
    const next = new Set(selected);

    for (const col of current) {
      if (!next.has(col)) fftStore.removeFftTrace(col);
    }
    for (const col of next) {
      if (!current.has(col)) handleFetchFft(col);
    }
  };

  const handleColorChange = (col: string, color: string) => {
    fftStore.updateFftTraceColor(col, color);
    updateFftChart();
  };

  const handleOpenFilter = (col: string) => {
    console.log('Open filter for', col);
  };

  onMount(() => {
    if (!chartContainerRef) return;

    registerTheme();
    chartInstance = echarts.init(chartContainerRef, echartsThemeName(), { renderer: 'canvas' });

    resizeObserver = new ResizeObserver(() => chartInstance?.resize());
    resizeObserver.observe(chartContainerRef);

    updateFftChart();
  });

  createEffect(() => {
    const tab = activeTab();
    if (tab === 'spectrogram' && spectrogramResult()) {
      updateSpectrogramChart();
    } else if (tab === 'fft' && fftTraces().length > 0) {
      updateFftChart();
    }
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    chartInstance?.dispose();
  });

  return (
    <div class={styles.page}>
      <div class={styles.toolbar}>
        <div class={styles.tabs}>
          <button
            class={`${styles.tab} ${activeTab() === 'fft' ? styles.active : ''}`}
            onClick={() => setActiveTab('fft')}
          >
            FFT
          </button>
          <button
            class={`${styles.tab} ${activeTab() === 'spectrogram' ? styles.active : ''}`}
            onClick={() => setActiveTab('spectrogram')}
          >
            Spectrogram
          </button>
        </div>

        <div class={styles.toolbarRight}>
          <Show when={activeTab() === 'fft'}>
            <div class={styles.controlGroup}>
              <label class={styles.label}>Mode</label>
              <select
                class={styles.select}
                value={fftMode()}
                onChange={(e) => {
                  setFftMode(e.currentTarget.value as 'magnitude' | 'psd');
                  updateFftChart();
                }}
              >
                <option value="magnitude">Magnitude</option>
                <option value="psd">PSD</option>
              </select>
            </div>
            <div class={styles.controlGroup}>
              <label class={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={logScale()}
                  onChange={(e) => {
                    setLogScale(e.currentTarget.checked);
                    updateFftChart();
                  }}
                />
                Log scale
              </label>
            </div>
          </Show>
        </div>
      </div>

      <Show when={activeTab() === 'fft'}>
        <div class={styles.chipsBar}>
          <ColumnChips
            columns={numericCols()}
            selected={selectedColumns()}
            colors={columnColors()}
            colorScalePalette={getColorPalette(uiStore.state.colorScale, numericCols().length)}
            onChange={handleChipChange}
            onColorChange={handleColorChange}
            onOpenFilter={handleOpenFilter}
          />
        </div>
      </Show>

      <Show when={activeTab() === 'spectrogram'}>
        <div class={styles.spectrogramControls}>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Window</label>
            <select
              class={styles.select}
              value={spectrogramWindow()}
              onChange={(e) => setSpectrogramWindow(parseInt(e.currentTarget.value))}
            >
              <For each={SPECTRAL_PRESETS}>
                {(preset) => <option value={preset.windowSize}>{preset.label}</option>}
              </For>
            </select>
          </div>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Hop</label>
            <select
              class={styles.select}
              value={spectrogramHop()}
              onChange={(e) => setSpectrogramHop(parseInt(e.currentTarget.value))}
            >
              <For each={SPECTRAL_PRESETS.filter(p => p.windowSize <= spectrogramWindow())}>
                {(preset) => <option value={Math.floor(preset.windowSize / 2)}>{Math.floor(preset.windowSize / 2)}</option>}
              </For>
            </select>
          </div>
          <button class={styles.computeBtn} onClick={handleFetchSpectrogram}>
            Compute
          </button>
        </div>
      </Show>

      <div class={styles.chartContainer}>
        <div ref={chartContainerRef} class={styles.chart} />
        <Show when={loading()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.spinner} />
            <span>{status()}</span>
          </div>
        </Show>
      </div>

      <div class={styles.footer}>
        <div class={styles.status}>{status()}</div>
        <div class={styles.exportButtons}>
          <button class={styles.exportBtn} disabled={!chartInstance}>PNG</button>
          <button class={styles.exportBtn} disabled={!chartInstance}>SVG</button>
          <button class={styles.exportBtn} disabled={!chartInstance}>CSV</button>
        </div>
      </div>
    </div>
  );
};

export default FftPage;