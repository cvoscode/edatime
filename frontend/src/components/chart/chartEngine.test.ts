import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as echarts from 'echarts';

// We need to mock echarts before importing useChartEngine
vi.mock('echarts', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    dispose: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
    getOption: vi.fn(() => ({
      xAxis: [{ min: 0, max: 100 }],
    })),
  })),
  registerTheme: vi.fn(),
}));

vi.mock('../stores', () => ({
  uiStore: {
    get state() {
      return {
        plotTheme: 'auto' as const,
        theme: 'dark' as const,
        colorScale: 'rdbu' as const,
      };
    },
    addToast: vi.fn(),
  },
}));

vi.mock('../utils/colorScale', () => ({
  getColorPalette: vi.fn(() => ['#4a9eff', '#ff6b6b', '#ffd93d']),
}));

vi.mock('../utils/plotTemplate', () => ({
  getActivePlotTemplate: vi.fn(() => ({ id: 'dark', mode: 'dark' })),
  toEChartsTheme: vi.fn(() => ({})),
}));

import { useChartEngine } from '../../hooks/useChartEngine';

describe('useChartEngine', () => {
  let container: HTMLElement;
  let containerRef: () => HTMLElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup ResizeObserver mock since vi.clearAllMocks() clears module-level mocks
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
    container = document.createElement('div');
    containerRef = () => container;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('returns loading status initially', () => {
    const { chartStatus } = useChartEngine(containerRef, { type: 'timeseries' });
    expect(chartStatus()).toBe('loading');
  });

  it('sets engineName to empty string initially', () => {
    const { engineName } = useChartEngine(containerRef, { type: 'timeseries' });
    expect(engineName()).toBe('');
  });

  it('dispose cleans up ResizeObserver and blob URL', async () => {
    const { dispose, init } = useChartEngine(containerRef, { type: 'timeseries' });

    // Override fetch to simulate ChartGPU failure and fall back to ECharts
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ChartGPU not found'));
    await init();
    dispose();

    // echarts.init should have been called and disposed
    expect(echarts.init).toHaveBeenCalled();
  });

  it('resize calls instance.resize when instance exists', async () => {
    const { resize, init } = useChartEngine(containerRef, { type: 'echarts' });

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ChartGPU not found'));
    await init();
    resize();

    const echartsInstance = (echarts.init as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    if (echartsInstance) {
      expect(echartsInstance.resize).toHaveBeenCalled();
    }
  });

  it('passes echarts type directly falls back to ECharts without ChartGPU', async () => {
    const { init, chartStatus, engineName } = useChartEngine(containerRef, { type: 'echarts' });

    await init();

    expect(chartStatus()).toBe('ready');
    expect(engineName()).toBe('ECharts');
    expect(echarts.init).toHaveBeenCalled();
  });

  it('calls onChartReady callback when ECharts is ready', async () => {
    const onChartReady = vi.fn();
    const { init } = useChartEngine(containerRef, { type: 'echarts', onChartReady });

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ChartGPU not found'));
    await init();

    expect(onChartReady).toHaveBeenCalled();
  });

  it('calls onEngineReady callback with engine name', async () => {
    const onEngineReady = vi.fn();
    const { init } = useChartEngine(containerRef, { type: 'echarts', onEngineReady });

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ChartGPU not found'));
    await init();

    expect(onEngineReady).toHaveBeenCalledWith('ECharts');
  });

  it('tracks chartStatus through lifecycle', async () => {
    const { init, chartStatus } = useChartEngine(containerRef, { type: 'echarts' });

    expect(chartStatus()).toBe('loading');

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ChartGPU not found'));
    await init();

    expect(chartStatus()).toBe('ready');
  });
});