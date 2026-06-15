# ai/frontend/src/scatter/state.md
> Scatter-page controls readers, query-context builders, view utilities, and backward-compatible scatterState re-exports.

## Re-exports
- `state` — alias for `scatterState` from store/index.js [deps: [scatterState][1]]
- `appState` — re-exported from store/appStateCompat.js [deps: [appState][2]]

## Interfaces
```typescript
interface ScatterControls {
    x: string; y: string; binSize: number; colormap: string; normalization: string;
    renderMode: string; diagonalMode: string; colorColumn: string;
    selectedColorColumn: string; colorScale: string; matrixMode: string; matrixCellSize: number;
}

interface ScatterQueryContext {
    start?: number; end?: number;
    filters: Array<{ column: string; from: number; to: number }>;
    lineFilters: ReturnType<typeof buildAdaptiveLineFiltersForQuery>;
}
```

## Type Aliases
- `ScatterView = { xMin: number; xMax: number; yMin: number; yMax: number }`
- `ScatterDrag = { pointerId: number; startX: number; endX: number; startY: number; endY: number }`
- `DensityTooltipMeta = { colorCenter: number; colorLo: number; colorHi: number }`
- `DensityTooltipCache = { key: string; binSize: number; metrics: any; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, any> }`
- `MatrixCellData = { totalPoints: number; points: [number, number][]; colorValues: number[] | null; colorLabels: string[] | null }`

## Functions
- `currentControls(): ScatterControls` [deps: [getDropdownValue][3], [getScatterPlotMetrics][4]]
  - Reads current values from all scatter control dropdowns. Uses `getDropdownValue` for all select controls.
- `isLinkedBrushEnabled(): boolean`
  - Returns whether the linked brush from the main chart is active (either the `scatter-link-brush` checkbox or the matrix `scatter-matrix-link-range` checkbox).
- `buildScatterQueryContext(columns?: { x?: string; y?: string; colorColumn?: string }): ScatterQueryContext`
  - Builds query context filtering linked time range only when metadata time_column is present and the linked brush is on.
- `getActiveScatterFilterColumns(columns?: { x?: string; y?: string; colorColumn?: string }): string[]`
  - Returns list of columns that have active range filters, scoped to the supplied column names.
- `buildRenderSignature(controls: ScatterControls): string`
  - Builds a cache key from the current view and controls state. **Includes view bounds** so density-mode zoom changes the signature and forces a chart re-create.
- `buildOverviewContextKey(context: Partial<ScatterQueryContext>): string`
  - Builds a cache key for the scatter matrix overview context.
- `clampView(view: ScatterView): ScatterView`
  - Clamps view bounds to safe numeric ranges inside the full extent.
- `applyScatterStateFromCache(resetView?: boolean): void`
  - Populates `appState.scatter.points` / `colorValues` / `colorLabels` from the cached allPoints array and recomputes color extent and full domain. When `resetView` is true, resets the view to the full extent and clears zoom history; otherwise clamps the current view.
- `setStats(partial: Record<string, string | number | null | undefined>): void`
  - Updates `#scatter-pearson` / `#scatter-spearman` text spans and the `Stats: total points` readout.
- `getPlotMetrics(container: HTMLElement | null): { width, height, grid, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight } | null`
  - Delegates to `getScatterPlotMetrics` from [layout.js](./layout.md).
- `getProfileForColumn(column: string): any`
  - Returns the matching entry from `appState.scatter.metadata.column_profiles`, or null.
- `getProfileHistogram(column: string): { min, max, counts, edges } | null`
  - Returns the histogram for a column profile if available and well-formed.
- `getCurrentScatterValues(column: string): number[]`
  - Returns finite numeric values for the given column from the current scatter state (X/Y axis or colorValues).
- `normalizeAnalyticsView(viewName: string): string`
  - Maps any non-`'matrix'` value to `'plot'`.
- `disposeScatterChart(resetSignature?: boolean): void`
  - Disposes the chart, clears selection box / drag / density tooltip cache; optionally clears the last render signature.
- `resetScatterContainer(): HTMLElement | null`
  - Clones `#scatter-chart` to discard the disposed canvas and returns the new element.
- `ensureOptions(selectEl: HTMLElement | null, values: string[], preferredValue?: string): string | null`
  - Sets dropdown options by ID using `setDropdownOptions`. Falls back to preferred value.

---
[1]: ../../store/index.md#scatterState
[2]: ../../store/appStateCompat.md#appState
[3]: ./helpers.md#getEl
[4]: ../../services/timeseries/filtering.md#buildAdaptiveLineFiltersForQuery
