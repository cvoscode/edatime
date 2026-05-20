/**
 * Chart registry — factory registration and lookup for chart engines.
 * Provides a central registry for chart engine factories with preference support.
 */
import { initChartEngine, isWebGPUSupported, DEFAULT_GRID, type ChartEngineResult } from '../components/chart/chartEngine';
import type { GridConfig } from '../components/chart/chartEngine';

export interface ChartEngineInstance {
    instance: any;
    engineName: 'ChartGPU' | 'ECharts';
    dispose: () => void;
    resize: () => void;
}

export type ChartEngineFactory = (
    container: HTMLDivElement,
    config: {
        grid?: GridConfig;
        xAxisType?: 'time' | 'value';
        xAxisLabel?: string;
        yAxisLabel?: string;
        chartTitle?: string;
        onZoom?: (start: number, end: number) => void;
        onClick?: (x: number, y: number) => void;
    }
) => Promise<ChartEngineInstance>;

interface ChartRegistryEntry {
    factory: ChartEngineFactory;
    preferred: boolean;
}

// Module-level registry
const registry = new Map<string, ChartRegistryEntry>();

// Track preferred engine
let preferredEngine: string | null = null;

/**
 * Register a chart engine factory under a given name.
 */
function register(name: string, factory: ChartEngineFactory): void {
    const isPreferred = preferredEngine === null || preferredEngine === name;
    registry.set(name, { factory, preferred: isPreferred });
    if (isPreferred && preferredEngine === null) {
        preferredEngine = name;
    }
}

/**
 * Get a registered chart engine factory by name.
 * Returns null if not found.
 */
function get(name: string): ChartEngineFactory | null {
    const entry = registry.get(name);
    return entry ? entry.factory : null;
}

/**
 * List all registered engine names.
 */
function list(): string[] {
    return Array.from(registry.keys());
}

/**
 * Get the preferred engine name.
 * Returns first registered engine or 'fallback' if none registered.
 */
function getPreferred(): string {
    if (registry.size === 0) return 'fallback';
    if (preferredEngine) return preferredEngine;
    // Fallback to first registered
    return Array.from(registry.keys())[0] ?? 'fallback';
}

/**
 * Set the preferred engine by name.
 */
function setPreferred(name: string): void {
    if (!registry.has(name)) {
        console.warn(`[chartRegistry] Cannot set preferred: "${name}" not registered`);
        return;
    }
    preferredEngine = name;
    // Update preferred flag on all entries
    for (const [key, entry] of registry) {
        entry.preferred = key === name;
    }
}

// Default engine registrations
// ChartGPU: WebGPU-based engine, loaded via chartEngine's initChartEngine
register('ChartGPU', async (container, config) => {
    const result = await initChartEngine({
        container,
        grid: config.grid ?? DEFAULT_GRID,
        xAxisType: config.xAxisType ?? 'time',
        xAxisLabel: config.xAxisLabel,
        yAxisLabel: config.yAxisLabel,
        chartTitle: config.chartTitle,
        onZoom: config.onZoom,
        onClick: config.onClick,
    });
    return result;
});

// Fallback: ECharts canvas-based engine
// The 'fallback' name is registered via the default path - actual ECharts
// initialization goes through initChartEngine which handles the fallback internally.
// We register a passthrough here for explicit fallback selection.
register('fallback', async (container, config) => {
    const result = await initChartEngine({
        container,
        grid: config.grid ?? DEFAULT_GRID,
        xAxisType: config.xAxisType ?? 'time',
        xAxisLabel: config.xAxisLabel,
        yAxisLabel: config.yAxisLabel,
        chartTitle: config.chartTitle,
        onZoom: config.onZoom,
        onClick: config.onClick,
    });
    return result;
});

export interface ChartRegistry {
    register(name: string, factory: ChartEngineFactory): void;
    get(name: string): ChartEngineFactory | null;
    list(): string[];
    getPreferred(): string;
    setPreferred(name: string): void;
}

const chartRegistry: ChartRegistry = {
    register,
    get,
    list,
    getPreferred,
    setPreferred,
};

// ChartRegistry and ChartEngineFactory are already exported via their declarations above
export { chartRegistry };