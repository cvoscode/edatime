import { Component, onMount, onCleanup, createSignal } from 'solid-js';

interface ChartViewProps {
  containerId?: string;
  onZoomChange?: (start: number, end: number, source: string) => void;
  onYRangeChange?: (min: number, max: number, source: string) => void;
  onZoomOut?: () => void;
}

const ChartView: Component<ChartViewProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  let chartInstance: any = null;

  onMount(async () => {
    if (!containerRef) return;

    try {
      const isDev = import.meta.env.DEV;
      const chartgpuUrl = isDev
        ? '/frontend/libs/chartgpu/index.js'
        : '/frontend/libs/chartgpu/index.js';

      const resp = await fetch(chartgpuUrl);
      if (!resp.ok) throw new Error(`ChartGPU fetch failed: ${resp.status}`);
      const code = await resp.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const objectUrl = URL.createObjectURL(blob);
      const mod = await import(/* @vite-ignore */ objectUrl);
      const createChart = mod.createChart ?? mod.default?.createChart;
      if (!createChart) throw new Error('createChart not found');

      const chartOptions = {
        grid: { left: 120, right: 30, top: 16, bottom: 36 },
        xAxis: { type: 'time' },
        yAxis: { type: 'value' },
        legend: { show: true, position: 'right' },
        series: [],
      };

      chartInstance = await createChart(containerRef, chartOptions);
      setStatus('ready');
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.warn('ChartGPU not available:', e);
      setStatus('error');
    }
  });

  onCleanup(() => {
    if (chartInstance) {
      try {
        chartInstance.dispose?.();
      } catch (_) { /* ignore */ }
      chartInstance = null;
    }
  });

  return (
    <div
      ref={containerRef}
      id={props.containerId ?? 'main-chart'}
      class="chart-container"
      data-status={status()}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {status() === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'var(--color-text-muted, #888)' }}>
          Loading chart engine...
        </div>
      )}
      {status() === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'var(--color-text-muted, #888)', 'font-size': '14px' }}>
          Chart engine unavailable
        </div>
      )}
    </div>
  );
};

export default ChartView;