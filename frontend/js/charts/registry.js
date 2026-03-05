/**
 * Chart type registry — enables plugging in new chart types (bar, scatter, etc.)
 * without modifying the core app logic.
 *
 * Usage:
 *   import { registerChartType, getChartType, listChartTypes } from './charts/registry.js';
 *   registerChartType('line', { create: (container, opts) => new LineChart(container, opts) });
 *
 * Each chart adapter must conform to the ChartAdapter interface:
 *   {
 *     create(containerId, callbacks): ChartInstance
 *   }
 *
 * ChartInstance (returned by create):
 *   - async init()
 *   - updateDataMulti(dataObj, columns)
 *   - setXRange(min, max)
 *   - setChartText(title, xLabel, yLabel)
 *   - onCrosshairMove(callback)
 *   - onClick(callback)
 *   - supportsZoomControls(): boolean
 *   - getXDomain(): { min, max } | null
 *   - getYRange(): { min, max } | null
 *   - fitYToData()
 *   - setDrawMode(mode, color, width)
 *   - clearDrawings()
 *   - exportPNG()
 *   - exportSVG()
 *   - exportHTML()
 *   - destroy()  (optional cleanup)
 */

const _registry = new Map();

/**
 * Register a chart type adapter.
 * @param {string} name  Unique name (e.g. 'line', 'bar', 'scatter').
 * @param {object} adapter  { label, create(containerId, callbacks) → ChartInstance }
 */
export function registerChartType(name, adapter) {
    if (!name || typeof adapter?.create !== 'function') {
        throw new Error(`Invalid chart adapter for "${name}"`);
    }
    _registry.set(name, adapter);
}

/**
 * Get a registered chart type adapter by name.
 * @returns {object|undefined}
 */
export function getChartType(name) {
    return _registry.get(name);
}

/**
 * List all registered chart type names.
 * @returns {string[]}
 */
export function listChartTypes() {
    return Array.from(_registry.keys());
}

/**
 * Get all registered adapters as { name, label } entries.
 * @returns {{ name: string, label: string }[]}
 */
export function listChartTypeEntries() {
    return Array.from(_registry.entries()).map(([name, adapter]) => ({
        name,
        label: adapter.label || name,
    }));
}
