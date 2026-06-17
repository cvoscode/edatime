# ai/frontend/src/chart/EchartsScatterChart.md
> ECharts fallback for the scatter page when WebGPU is unavailable. Implements the same minimal surface as ChartGPU so scatterPage.ts can swap it in transparently.

## Class: EchartsScatterChart
- `constructor(containerId: string)`
  - Stores the container ID; does not initialize the chart yet.
- `async init(): Promise<void>`
  - Initializes the ECharts canvas renderer on `#<containerId>` and attaches a ResizeObserver that deduplicates calls to `resize()` when the contentRect has not changed (round to integer pixels; skip when width and height match the last observed size).
- `setOption(option: any): void`
  - Translates the ChartGPU-shaped option into an ECharts option: scatter series with `itemStyle.color` and `itemStyle.opacity` (0.38 for density, 0.72 otherwise), grid from `option.grid` (defaults to [SCATTER_PLOT_GRID][1]), value axes carrying `min` / `max` / `name` / `tickFormatter`, tooltip passthrough, and `legend.show = false`.
- `resize(): void`
  - Calls `echartsInstance.resize()`.
- `dispose(): void`
  - Disposes the ECharts instance, disconnects the resize observer, and clears `_lastObservedSize` so the next `init()` builds a fresh dedupe baseline.
- `onPerformanceUpdate(_callback: () => void): void`
  - No-op (ECharts does not expose the same lifecycle hook).
- `on(eventName: string, handler: (...args: any[]) => void): void` / `off(eventName: string, handler?: (...args: any[]) => void): void`
  - Forwarded to the underlying ECharts instance for event parity with ChartGPU.
- `static _translateSeries(series: any): any`
  - Internal helper that maps ChartGPU series config into the ECharts shape used by `setOption`.

---
[1]: ../scatter/layout.md#SCATTER_PLOT_GRID
