/**
 * ChartRegistry — factory for creating chart adapters with engine selection logic.
 *
 * Decision order:
 *  1. WebGPU availability check
 *  2. User preference from uiStore (forceWebGPU / forceECharts)
 *  3. Chart type support (timeseries → ChartGPU/ECharts, scatter → ECharts)
 *
 * All adapters implement the ChartAdapter interface so consumers are
 * decoupled from engine-specific details.
 */
import type { ChartAdapter, ChartOptions } from './ChartAdapter';
import { ChartGPUAdapter } from './ChartGPUAdapter';
import { EChartsAdapter } from './EChartsAdapter';
import { uiStore } from '../../stores/uiStore';

export type ChartType = 'timeseries' | 'scatter' | 'heatmap' | 'other';
export type EnginePreference = 'auto' | 'webgpu' | 'echarts';

export interface ChartRegistryOptions {
  /** Which chart type to render — affects engine selection */
  chartType?: ChartType;
  /** Override automatic engine selection */
  enginePreference?: EnginePreference;
}

function isWebGPUSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  } catch {
    return false;
  }
}

/**
 * Determine which adapter to create based on availability and preferences.
 */
function selectEngine(options: ChartRegistryOptions): 'ChartGPU' | 'ECharts' {
  const { enginePreference = 'auto', chartType = 'timeseries' } = options;

  if (enginePreference === 'echarts') return 'ECharts';
  if (enginePreference === 'webgpu') {
    return isWebGPUSupported() ? 'ChartGPU' : 'ECharts';
  }

  // 'auto' — decide based on availability and chart type
  if (chartType === 'scatter' || chartType === 'heatmap') {
    // Scatter and heatmap use ECharts for now
    return 'ECharts';
  }

  if (isWebGPUSupported()) return 'ChartGPU';
  return 'ECharts';
}

/**
 * Create a chart adapter for the given container and options.
 *
 * @example
 * const adapter = createChartAdapter(container, { chartType: 'timeseries' });
 * await adapter.initialize(container, { xAxisType: 'time', yAxisLabel: 'Value' });
 * adapter.setData(series);
 * adapter.setViewport(0, 100, 0, 1);
 */
export function createChartAdapter(
  container: HTMLElement,
  options: ChartRegistryOptions = {}
): ChartAdapter {
  const engine = selectEngine(options);

  if (engine === 'ChartGPU') {
    return new ChartGPUAdapter();
  }
  return new EChartsAdapter();
}

/**
 * Create and initialize a chart adapter in one step.
 * Convenience wrapper around createChartAdapter + initialize.
 */
export async function createAndInitChartAdapter(
  container: HTMLElement,
  chartOptions: ChartOptions,
  registryOptions: ChartRegistryOptions = {}
): Promise<ChartAdapter> {
  const adapter = createChartAdapter(container, registryOptions);
  await adapter.initialize(container, chartOptions);
  return adapter;
}

/**
 * ChartAdapterRegistry — registry for named adapter factories.
 *
 * Allows registering custom adapters and selecting them by name.
 */
export interface ChartAdapterEntry {
  name: string;
  create: () => ChartAdapter;
  preferred?: boolean;
}

class ChartAdapterRegistryImpl {
  private entries = new Map<string, ChartAdapterEntry>();
  private preferredEngine: string | null = null;

  register(name: string, create: () => ChartAdapter, preferred = false): void {
    const isFirst = this.entries.size === 0;
    this.entries.set(name, { name, create, preferred: preferred || isFirst });
    if ((preferred || isFirst) && this.preferredEngine === null) {
      this.preferredEngine = name;
    }
  }

  get(name: string): ChartAdapter | null {
    const entry = this.entries.get(name);
    return entry ? entry.create() : null;
  }

  list(): string[] {
    return Array.from(this.entries.keys());
  }

  getPreferred(): string {
    return this.preferredEngine ?? 'ECharts';
  }

  setPreferred(name: string): void {
    if (!this.entries.has(name)) {
      console.warn(`[ChartRegistry] Cannot set preferred: "${name}" not registered`);
      return;
    }
    this.preferredEngine = name;
    for (const [key, entry] of this.entries) {
      entry.preferred = key === name;
    }
  }

  createAdapter(container: HTMLElement, options?: ChartRegistryOptions): ChartAdapter {
    const engine = options?.enginePreference === 'auto'
      ? this.getPreferred()
      : (options?.enginePreference ?? this.getPreferred());

    const adapter = this.get(engine) ?? new EChartsAdapter();
    return adapter;
  }
}

// Module-level singleton registry with default registrations
export const chartAdapterRegistry = new ChartAdapterRegistryImpl();

// Default registrations
chartAdapterRegistry.register('ChartGPU', () => new ChartGPUAdapter(), false);
chartAdapterRegistry.register('ECharts', () => new EChartsAdapter(), true);

export { chartAdapterRegistry as chartRegistry };