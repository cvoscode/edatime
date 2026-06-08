# ai/frontend/src/scatter/layout.md
> Centralized scatter plot grid constants and metrics computation. Shared across rendering, export, and chart modules.

## Interfaces
- `ScatterPlotGrid = { left: number; right: number; top: number; bottom: number }`

## Constants
- `SCATTER_PLOT_GRID: ScatterPlotGrid` — frozen object with `left: 72, right: 72, top: 24, bottom: 50`
- `SCATTER_MARGINAL_X_HEIGHT = 64`

## Functions
- `scaleScatterPlotGrid(scale: number): ScatterPlotGrid`
  - Returns a scaled copy of `SCATTER_PLOT_GRID` by the given scale factor.
- `getScatterPlotMetrics(width: number, height: number, grid?: ScatterPlotGrid): { width, height, grid, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight }`
  - Computes plot area metrics from overall dimensions and optional custom grid.
- `getScatterMarginalXMetrics(width: number): { plotLeft, plotRight, plotWidth }`
  - Returns X marginal plot metrics from width alone.
- `getScatterMarginalYMetrics(height: number): { plotTop, plotBottom, plotHeight }`
  - Returns Y marginal plot metrics from height alone.