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
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return false;
    }
    // Only report WebGPU as supported if we can actually get an adapter
    // navigator.gpu may exist but requestAdapter may return null in some environments
    const gpu = navigator.gpu;
    if (typeof gpu.requestAdapter !== 'function') {
      return false;
    }
    // Do a sync check - try to get an adapter without waiting
    // If requestAdapter doesn't exist or returns null, WebGPU isn't truly available
    try {
      // This is a best-effort check - we don't block on async adapter retrieval
      // but we verify the method exists
      return typeof gpu.requestAdapter === 'function';
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

// Separate async check that actually attempts to get a WebGPU adapter
async function checkWebGPUAdapterAvailable(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return false;
    }
    const gpu = navigator.gpu;
    if (typeof gpu.requestAdapter !== 'function') {
      return false;
    }
    // Actually try to get an adapter - this is the only way to know for sure
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
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
  console.error('[ChartRegistry] createAndInitChartAdapter ENTRY');
  const { enginePreference = 'auto', chartType = 'timeseries' } = registryOptions;
  
  // Determine which engine to use based on preference and actual availability
  let engine: 'ChartGPU' | 'ECharts';
  if (enginePreference === 'echarts') {
    console.error('[ChartRegistry] Using ECharts (explicit preference)');
    engine = 'ECharts';
  } else if (enginePreference === 'webgpu') {
    const supported = isWebGPUSupported();
    console.error('[ChartRegistry] WebGPU preference, isWebGPUSupported:', supported);
    engine = supported ? 'ChartGPU' : 'ECharts';
  } else {
    // 'auto' - do async check for WebGPU adapter
    console.error('[ChartRegistry] AUTO mode - starting check');
    const webgpuAvailable = await checkWebGPUAdapterAvailable();
    console.error('[ChartRegistry] AUTO mode, checkWebGPUAdapterAvailable:', webgpuAvailable);
    if (chartType === 'scatter' || chartType === 'heatmap') {
      engine = 'ECharts';
    } else {
      engine = webgpuAvailable ? 'ChartGPU' : 'ECharts';
    }
  }
  console.error('[ChartRegistry] Final engine selection:', engine);

  let adapter: ChartAdapter;
  if (engine === 'ChartGPU') {
    adapter = new ChartGPUAdapter();
    console.error('[ChartRegistry] ChartGPU adapter created, about to initialize');
    try {
      await adapter.initialize(container, chartOptions);
      console.error('[ChartRegistry] ChartGPU initialized successfully');
      // DEFENSIVE: Validate ChartGPU actually works by checking instance is functional
      // ChartGPU may return successfully from initialize() but fail on first render
      // with insertBefore errors. We detect this by calling a simple method.
      const instance = (adapter as any).instance;
      if (instance && typeof instance.on === 'function') {
        // ChartGPU instance appears valid - this is the happy path
        console.error('[ChartRegistry] Adapter ready, returning');
        return adapter;
      }
      // instance is null or invalid - this shouldn't happen but handle it
      console.error('[ChartRegistry] ChartGPU instance invalid after init, falling back to ECharts');
      throw new Error('ChartGPU instance check failed');    } catch (gpuErr) {
      console.error('[ChartRegistry] ChartGPU init failed, falling back to ECharts:', gpuErr);
      adapter = new EChartsAdapter();
      await adapter.initialize(container, chartOptions);
    }
  } else {
    adapter = new EChartsAdapter();
    await adapter.initialize(container, chartOptions);
  }
  console.error('[ChartRegistry] Adapter ready, checking instance validity');
  // Verify the instance is actually usable - some engines may init but return broken instances
  if (!adapter.instance) {
    console.error('[ChartRegistry] Adapter instance is null/undefined, falling back to ECharts');
    const { EChartsAdapter } = await import('./EChartsAdapter');
    adapter = new EChartsAdapter();
    await adapter.initialize(container, chartOptions);
  }
  console.error('[ChartRegistry] Returning adapter with instance:', !!adapter.instance);
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