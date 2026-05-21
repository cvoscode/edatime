import { Component, createSignal, createMemo, createEffect, Show, For, onMount, onCleanup } from 'solid-js';
import * as echarts from 'echarts';
import { fftStore, datasetStore, uiStore } from '../stores';
import { fetchFftData, fetchSpectrogram } from '../services/api';
import { getColorPalette } from '../utils/colorScale';
import { getActivePlotTemplate, toEChartsTheme } from '../utils/plotTemplate';
import type { FftTrace } from '../types';
import ColumnChips from '../domain/timeseries/components/ColumnChips';
import styles from './FftPage.module.css';

const WINDOW_SIZES = [64, 256, 512, 1024, 2048];

const FftPage: Component = () => {
  let chartContainerRef: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;
  let spectrogramInstance: echarts.ECharts | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let spectrogramResizeObserver: ResizeObserver | null = null;
  let selectionBox: HTMLDivElement | null = null;
  let dragStart: { x: number; y: number; pid: number } | null = null;

  const [activeTab, setActiveTab] = createSignal<'fft' | 'spectrogram'>('fft');
  const [fftMode, setFftMode] = createSignal<'magnitude' | 'psd'>('magnitude');
  const [logScale, setLogScale] = createSignal(true);
  const [status, setStatus] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  // Spectrogram state
  const [spectrogramColumn, setSpectrogramColumn] = createSignal('');
  const [spectrogramWindow, setSpectrogramWindow] = createSignal(256);
  const [spectrogramHop, setSpectrogramHop] = createSignal(128);
  const [spectrogramLogScale, setSpectrogramLogScale] = createSignal(true);

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
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(8, 12, 20, 0.94)',
        borderColor: 'rgba(126, 158, 212, 0.28)',
        textStyle: { color: '#eef4ff' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const first = params[0];
          const data = first?.data || [];
          const freq = Number(data[0]);
          const freqStr = freq >= 1000 ? `${(freq / 1000).toFixed(2)} kHz` :
            freq >= 1 ? `${freq.toFixed(2)} Hz` :
              `${(freq * 1000).toFixed(2)} mHz`;
          const rows = params.map((p: any) => {
            const col = p?.seriesName || '';
            const mag = Number(p?.data?.[1] ?? 0);
            return `${col}: ${mag.toFixed(4)}`;
          }).join('<br>');
          return `<strong>${freqStr}</strong><br>${rows}`;
        },
      },
      series,
      color: getColorPalette(uiStore.state.colorScale, series.length),
    });

    const bins = series[0]?.data.length ?? 0;
    const cols = fftTraces().map(t => t.column).join(', ');
    setStatus(`${bins} bins · ${cols || 'Select columns'}`);
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

  // ===== Spectrogram functions =====

  const formatSpectrogramTime = (timestampMs: number): string => {
    return new Date(timestampMs).toLocaleString([], {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const formatSpectrogramFrequency = (frequency: number): string => {
    if (!Number.isFinite(frequency)) return '—';
    if (frequency >= 1000) return `${(frequency / 1000).toFixed(2)} kHz`;
    if (frequency >= 1) return `${frequency.toFixed(2)} Hz`;
    return `${(frequency * 1000).toFixed(2)} mHz`;
  };

  let spectrogramChartEl: HTMLDivElement | undefined;

  const updateSpectrogramChart = () => {
    if (!spectrogramInstance) return;

    const result = spectrogramResult();
    if (!result) return;

    const logScale = spectrogramLogScale();
    const points: [number, number, number, number, number, number][] = [];
    const timeAxis = result.time_points;
    const freqAxis = result.freq_points;
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    for (let timeIndex = 0; timeIndex < timeAxis.length; timeIndex++) {
      const timeMs = timeAxis[timeIndex];
      const row = result.power_matrix[timeIndex] || [];
      for (let freqIndex = 0; freqIndex < freqAxis.length; freqIndex++) {
        const freq = freqAxis[freqIndex];
        const rawMagnitude = Number(row[freqIndex] ?? 0);
        const displayMagnitude = logScale ? Math.log10(Math.max(rawMagnitude, 1e-30)) : rawMagnitude;
        if (!Number.isFinite(displayMagnitude)) continue;
        minValue = Math.min(minValue, displayMagnitude);
        maxValue = Math.max(maxValue, displayMagnitude);
        points.push([timeIndex, freqIndex, displayMagnitude, timeMs, freq, rawMagnitude]);
      }
    }

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      minValue = 0;
      maxValue = 1;
    }

    const xTickInterval = Math.max(0, Math.floor(timeAxis.length / 10) - 1);
    const yTickInterval = Math.max(0, Math.floor(freqAxis.length / 10) - 1);

    spectrogramInstance.setOption({
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 72, right: 110, top: 24, bottom: 80 },
      toolbox: {
        right: 12,
        feature: {
          restore: { title: 'Reset zoom' },
          saveAsImage: { title: 'Save image' },
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(8, 12, 20, 0.94)',
        borderColor: 'rgba(126, 158, 212, 0.28)',
        textStyle: { color: '#eef4ff' },
        formatter: (params: any) => {
          const value = params?.value || [];
          const timeMs = Number(value[3]);
          const freq = Number(value[4]);
          const displayMagnitude = Number(value[2]);
          const rawMagnitude = Number(value[5]);
          return [
            `<strong>${result.column || 'Spectrogram'}</strong>`,
            `Time: ${formatSpectrogramTime(timeMs)}`,
            `Frequency: ${formatSpectrogramFrequency(freq)}`,
            `Intensity: ${displayMagnitude.toFixed(4)}${logScale ? ' log10' : ''}`,
            `Raw magnitude: ${rawMagnitude.toExponential(4)}`,
          ].join('<br>');
        },
      },
      xAxis: {
        type: 'category',
        data: timeAxis,
        name: 'Time',
        nameLocation: 'middle',
        nameGap: 48,
        axisLabel: {
          color: '#9fb1d1',
          rotate: 30,
          interval: xTickInterval,
          formatter: (value: string | number) => {
            const date = new Date(Number(value));
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}\n${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: freqAxis,
        name: 'Frequency (Hz)',
        nameLocation: 'middle',
        nameGap: 56,
        axisLabel: {
          color: '#9fb1d1',
          interval: yTickInterval,
          formatter: (value: string | number) => formatSpectrogramFrequency(Number(value)),
        },
        splitLine: { show: false },
      },
      visualMap: {
        min: minValue,
        max: maxValue,
        calculable: true,
        orient: 'vertical',
        right: 18,
        top: 'middle',
        text: [logScale ? 'High log10' : 'High', logScale ? 'Low log10' : 'Low'],
        textStyle: { color: '#9fb1d1' },
        inRange: {
          color: getColorPalette(uiStore.state.colorScale, 64),
        },
      },
      dataZoom: [
        {
          type: 'inside', xAxisIndex: 0, filterMode: 'none',
          zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
        },
        {
          type: 'inside', yAxisIndex: 0, filterMode: 'none',
          zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
        },
      ],
      series: [{
        name: result.column,
        type: 'heatmap',
        progressive: 0,
        emphasis: { itemStyle: { borderColor: '#ffffff', borderWidth: 1 } },
        data: points,
      }],
    });

    setStatus(`${result.time_points.length} windows × ${result.freq_points.length} bins`);
  };

  const handleFetchSpectrogram = async () => {
    const metadata = datasetStore.state.metadata;
    if (!metadata) return;

    const [startMs, endMs] = metadata.timeRange ?? [0, 0];
    if (!startMs || !endMs) return;

    const column = spectrogramColumn();
    if (!column) {
      setStatus('Select a column');
      return;
    }

    setLoading(true);
    setStatus('Computing spectrogram…');

    try {
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();
      const resp = await fetchSpectrogram(start, end, column, spectrogramWindow(), spectrogramHop());

      fftStore.setSpectrogramResult({
        time_points: resp.result.times_ms,
        freq_points: resp.result.frequencies,
        power_matrix: resp.result.magnitudes,
        column,
      });
      updateSpectrogramChart();
    } catch (e) {
      console.error('Spectrogram fetch failed:', e);
      setStatus(`Spectrogram failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const initSpectrogramChart = () => {
    if (!spectrogramChartEl || spectrogramInstance) return;

    spectrogramInstance = echarts.init(spectrogramChartEl, undefined, { renderer: 'canvas' });

    spectrogramResizeObserver = new ResizeObserver(() => spectrogramInstance?.resize());
    spectrogramResizeObserver.observe(spectrogramChartEl);

    if (spectrogramChartEl.style.position === '' || spectrogramChartEl.style.position === 'static') {
      spectrogramChartEl.style.position = 'relative';
    }

    selectionBox = document.createElement('div');
    selectionBox.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;'
      + 'border:1px solid rgba(0,212,255,0.9);background:rgba(0,212,255,0.15);'
      + 'pointer-events:none;display:none;z-index:5';
    spectrogramChartEl.appendChild(selectionBox);

    let dragEnd = { x: 0, y: 0 };
    const grid = { left: 72, right: 110, top: 24, bottom: 80 };

    spectrogramChartEl.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = spectrogramChartEl!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x > rect.width - grid.right || x < grid.left || y < grid.top || y > rect.height - grid.bottom) return;
      dragStart = { x, y, pid: event.pointerId };
      dragEnd = { x, y };
      try { spectrogramChartEl!.setPointerCapture(event.pointerId); } catch { }
    });

    spectrogramChartEl.addEventListener('pointermove', (event: PointerEvent) => {
      if (!dragStart || event.pointerId !== dragStart.pid) return;
      const rect = spectrogramChartEl!.getBoundingClientRect();
      dragEnd = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const left = Math.min(dragStart.x, dragEnd.x);
      const top = Math.min(dragStart.y, dragEnd.y);
      selectionBox!.style.left = `${left}px`;
      selectionBox!.style.top = `${top}px`;
      selectionBox!.style.width = `${Math.abs(dragEnd.x - dragStart.x)}px`;
      selectionBox!.style.height = `${Math.abs(dragEnd.y - dragStart.y)}px`;
      selectionBox!.style.display = 'block';
    });

    const finishDrag = (event: PointerEvent) => {
      if (!dragStart || event.pointerId !== dragStart.pid) return;
      const start = dragStart;
      dragStart = null;
      selectionBox!.style.display = 'none';
      try { spectrogramChartEl!.releasePointerCapture(event.pointerId); } catch { }

      const dx = Math.abs(dragEnd.x - start.x);
      const dy = Math.abs(dragEnd.y - start.y);
      if (dx < 8 || dy < 8) return;
      if (!spectrogramInstance || !spectrogramResult()) return;

      const p0 = spectrogramInstance.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [start.x, start.y]) as [number, number] | null;
      const p1 = spectrogramInstance.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 } as any, [dragEnd.x, dragEnd.y]) as [number, number] | null;
      if (!p0 || !p1) return;

      const result = spectrogramResult()!;
      const xLen = result.time_points.length;
      const yLen = result.freq_points.length;
      const xStartPct = Math.max(0, Math.min(100, (Math.min(p0[0], p1[0]) / (xLen - 1)) * 100));
      const xEndPct = Math.max(0, Math.min(100, (Math.max(p0[0], p1[0]) / (xLen - 1)) * 100));
      const yStartPct = Math.max(0, Math.min(100, (Math.min(p0[1], p1[1]) / (yLen - 1)) * 100));
      const yEndPct = Math.max(0, Math.min(100, (Math.max(p0[1], p1[1]) / (yLen - 1)) * 100));
      if (xEndPct <= xStartPct || yEndPct <= yStartPct) return;

      spectrogramInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: xStartPct, end: xEndPct });
      spectrogramInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: yStartPct, end: yEndPct });
    };

    spectrogramChartEl.addEventListener('pointerup', finishDrag);
    spectrogramChartEl.addEventListener('pointercancel', (event: PointerEvent) => {
      if (dragStart?.pid === event.pointerId) {
        dragStart = null;
        selectionBox!.style.display = 'none';
      }
    });
    spectrogramChartEl.addEventListener('dblclick', () => {
      if (!spectrogramInstance) return;
      spectrogramInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
      spectrogramInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    });
  };

  const resetSpectrogramZoom = () => {
    if (!spectrogramInstance) return;
    spectrogramInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
    spectrogramInstance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
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
    if (tab === 'spectrogram') {
      setTimeout(() => {
        if (spectrogramChartEl && !spectrogramInstance) {
          initSpectrogramChart();
        }
        spectrogramInstance?.resize();
      }, 0);
    }
  });

  createEffect(() => {
    if (activeTab() === 'spectrogram' && spectrogramResult()) {
      setTimeout(() => updateSpectrogramChart(), 0);
    } else if (activeTab() === 'fft' && fftTraces().length > 0) {
      updateFftChart();
    }
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    spectrogramResizeObserver?.disconnect();
    chartInstance?.dispose();
    spectrogramInstance?.dispose();
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
            filter=""
            colors={columnColors()}
            onChange={handleChipChange}
            onColorChange={handleColorChange}
            onOpenFilter={handleOpenFilter}
          />
        </div>
      </Show>

      <Show when={activeTab() === 'spectrogram'}>
        <div class={styles.spectrogramControls}>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Column</label>
            <select
              class={styles.select}
              value={spectrogramColumn()}
              onChange={(e) => setSpectrogramColumn(e.currentTarget.value)}
            >
              <option value="">Select column...</option>
              <For each={numericCols()}>
                {(col) => <option value={col}>{col}</option>}
              </For>
            </select>
          </div>
          <div class={styles.controlGroup}>
            <label class={styles.label}>Window</label>
            <select
              class={styles.select}
              value={spectrogramWindow()}
              onChange={(e) => setSpectrogramWindow(parseInt(e.currentTarget.value))}
            >
              <For each={WINDOW_SIZES}>
                {(size) => <option value={size}>{size}</option>}
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
              <For each={WINDOW_SIZES.filter(s => s <= spectrogramWindow())}>
                {(size) => <option value={Math.floor(size / 2)}>{Math.floor(size / 2)}</option>}
              </For>
            </select>
          </div>
          <div class={styles.controlGroup}>
            <label class={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={spectrogramLogScale()}
                onChange={(e) => setSpectrogramLogScale(e.currentTarget.checked)}
              />
              Log scale
            </label>
          </div>
          <button class={styles.computeBtn} onClick={handleFetchSpectrogram} disabled={loading()}>
            Compute
          </button>
          <button class={styles.resetZoomBtn} onClick={resetSpectrogramZoom}>
            Reset Zoom
          </button>
        </div>
      </Show>

      <div class={styles.chartContainer}>
        <Show when={activeTab() === 'fft'}>
          <div ref={chartContainerRef} class={styles.chart} />
        </Show>
        <Show when={activeTab() === 'spectrogram'}>
          <div ref={spectrogramChartEl} class={styles.chart} />
        </Show>
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
          <button class={styles.exportBtn} disabled={!chartInstance && !spectrogramInstance}>PNG</button>
          <button class={styles.exportBtn} disabled={!chartInstance && !spectrogramInstance}>SVG</button>
          <button class={styles.exportBtn} disabled={!chartInstance && !spectrogramInstance}>CSV</button>
        </div>
      </div>
    </div>
  );
};

export default FftPage;