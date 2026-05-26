/**
 * Chart type registry — enables plugging in new chart types
 * without modifying the core app logic.
 */

import type { ChartAdapter, ChartInstance } from '../types.js';

const _registry = new Map<string, ChartAdapter>();

export function registerChartType(name: string, adapter: ChartAdapter): void {
    if (!name || typeof adapter?.create !== 'function') {
        throw new Error(`Invalid chart adapter for "${name}"`);
    }
    _registry.set(name, adapter);
}

export function getChartType(name: string): ChartAdapter | undefined {
    return _registry.get(name);
}


