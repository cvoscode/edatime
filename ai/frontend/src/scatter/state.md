# ai/frontend/src/scatter/state.md
> Scatter control readers, query-context builders, cache-key helpers, and chart-state utilities shared across plot and matrix views.

## Interfaces
- `ScatterControls` — `{ x: string; y: string; binSize: number; colormap: string; normalization: string; renderMode: string; diagonalMode: string; colorColumn: string; selectedColorColumn: string; colorScale: string; matrixMode: string; matrixCellSize: number }`
- `ScatterQueryContext` — `{ start?: number; end?: number; filters: Array<{ column: string; from: number; to: number }>; lineFilters: ScatterLineFilterSpec[] }`

## Re-exports
- `appState` [deps: [store/index][1]]
- `state`
- `scatterState`
- `getEl`
- `fmt`
- `computeColorExtent`
- `computeDomains`
- `normalizeCategoryLabel`
- `normalizeColorValues`
- `buildCategoricalColorGroups`

## Functions
- `currentControls(): ScatterControls`
  - Reads all active scatter controls from the DOM.
- `isLinkedBrushEnabled(): boolean`
  - Returns whether either scatter linked-range checkbox is enabled.
- `buildScatterQueryContext(columns: { x?: string; y?: string; colorColumn?: string; scopeToColumns?: boolean } = {}): ScatterQueryContext`
  - Builds the shared scatter query context. When `scopeToColumns === false`, range filters are left unscoped so matrix batches can reuse the full active filter set.
- `getActiveScatterFilterColumns(columns?: { x?: string; y?: string; colorColumn?: string }): string[]`
  - Lists the currently active scoped range-filter columns.
- `buildRenderSignature(controls: ScatterControls): string`
  - Builds the plot render signature from active controls plus the current view bounds.
- `buildOverviewContextKey(context: Partial<ScatterQueryContext>): string`
  - Builds the matrix overview cache key from linked range, range filters, and line filters.
- `clampView(view: ScatterView): ScatterView`
- `applyScatterStateFromCache(resetView = true): void`
- `setStats(partial: Record<string, string | number | null | undefined>): void`
- `getPlotMetrics(container: HTMLElement | null)`
- `getProfileForColumn(column: string)`
- `getProfileHistogram(column: string)`
- `getCurrentScatterValues(column: string): number[]`
- `normalizeAnalyticsView(viewName: string): string`
- `disposeScatterChart(resetSignature = false): void`
- `resetScatterContainer(): HTMLElement | null`
- `ensureOptions(selectEl: HTMLElement | null, values: string[], preferredValue?: string): string | null`

---
[1]: ../../store/index.md
