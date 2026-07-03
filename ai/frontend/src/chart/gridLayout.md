# ai/frontend/src/chart/gridLayout.md
> Grid layout constants and DPR-aware helpers for ChartGPU-backed charts.

## Constants
- `DEFAULT_CHART_GRID: GridLayout = { left: 72, right: 30, top: 16, bottom: 36 }`

## Interfaces
- `GridLayout = { left: number; right: number; top: number; bottom: number }`

## Functions
- `computeChartGrid(input: { yTickLabels: string[]; yAxisLabel: string; scale?: number }): GridLayout`
  - Computes chart grid margins from tick labels and Y-axis label width. Applies `scale` (DPR multiplier) to all sides.
- `scaleGridLayout(grid: GridLayout, scale: number): GridLayout`
  - Scales all grid properties by `scale`. Clamps to positive values.
