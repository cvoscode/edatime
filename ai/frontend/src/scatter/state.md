# ai/frontend/src/scatter/state.md
> Shared scatter control readers, request-context builders, cache keys, and chart-state helpers for plot and matrix views.

## Interfaces
- `ScatterControls`
  - `{ x: string; y: string; binSize: number; colormap: string; normalization: string; renderMode: string; diagonalMode: string; colorColumn: string; selectedColorColumn: string; colorScale: string; matrixMode: string; matrixCellSize: number }`
- `ScatterQueryContext`
  - `{ start?: number; end?: number; filters: Array<{ column: string; from: number; to: number }>; lineFilters: ScatterLineFilterSpec[] }`

## Functions
- `currentControls(): ScatterControls`
- `isLinkedBrushEnabled(): boolean`
- `buildScatterQueryContext(columns: { x?: string; y?: string; colorColumn?: string; scopeToColumns?: boolean } = {}): ScatterQueryContext`
  - Includes `start`/`end` only when linked-brush range syncing is enabled and valid.
- `getActiveScatterFilterColumns(columns: { x?: string; y?: string; colorColumn?: string } = {}): string[]`
- `buildRenderSignature(controls: ScatterControls): string`
  - Includes current view bounds so density-mode zoom invalidates the render signature.
- `buildOverviewContextKey(context: Partial<ScatterQueryContext> & { x?: string; y?: string; colorColumn?: string }): string`
  - Serializes `x`, `y`, `colorColumn`, linked time range, numeric filters, and line filters for the page-change fast path.
- `clampView(view: ScatterView): ScatterView`
- `applyScatterStateFromCache(resetView = true): void`
- `setStats(partial: Record<string, string | number | null | undefined>): void`
  - Writes `primaryLabel`/`primaryValue`, `secondaryLabel`/`secondaryValue`, and `correlationContext` onto the scatter stats UI.
- `getPlotMetrics(container: HTMLElement | null): ReturnType<typeof getScatterPlotMetrics> | null`
- `getProfileForColumn(column: string): any`
- `getProfileHistogram(column: string): { min: number; max: number; counts: number[]; edges: number[] } | null`
- `getCurrentScatterValues(column: string): number[]`
- `normalizeAnalyticsView(viewName: string): string`
- `disposeScatterChart(resetSignature = false): void`
- `resetScatterContainer(): HTMLElement | null`
- `ensureOptions(selectEl: HTMLElement | null, values: string[], preferredValue?: string, options?: { searchable?: boolean }): string | null`

---
[1]: ../types.md#ScatterLineFilterSpec
