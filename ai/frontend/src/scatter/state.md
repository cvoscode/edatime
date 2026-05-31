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
- `currentControls(): ScatterControls` [deps: [getEl][3]]
  - Reads current values from all scatter control DOM elements.
- `isLinkedBrushEnabled(): boolean`
  - Returns whether the linked brush from the main chart is active.
- `buildScatterQueryContext(columns?: { x?: string; y?: string; colorColumn?: string }): ScatterQueryContext`
  - Builds query context filtering linked time range only when metadata time_column is present.
- `getActiveScatterFilterColumns(columns?: { x?: string; y?: string; colorColumn?: string }): string[]`
  - Returns list of columns that have active range filters.
- `buildRenderSignature(controls: ScatterControls): string`
  - Builds a cache key from the current view and controls state.
- `buildOverviewContextKey(context: Partial<ScatterQueryContext>): string`
  - Builds a cache key for the scatter matrix overview context.
- `clampView(view: ScatterView): ScatterView`
  - Clamps view bounds to safe numeric ranges.

---
[1]: ../../store/index.md#scatterState
[2]: ../../store/appStateCompat.md#appState
[3]: ./helpers.md#getEl
[4]: ../../services/timeseries/filtering.md#buildAdaptiveLineFiltersForQuery
function applyScatterStateFromCache(resetView?: boolean): void
function setStats(partial: Record<string, string | number | null | undefined>): void
function getPlotMetrics(container: HTMLElement | null): { width: number; height: number; grid: any; plotLeft: number; plotRight: number; plotTop: number; plotBottom: number; plotWidth: number; plotHeight: number } | null
function getProfileForColumn(column: string): any
function getProfileHistogram(column: string): { min: number; max: number; counts: number[]; edges: number[] } | null
function getCurrentScatterValues(column: string): number[]
function normalizeAnalyticsView(viewName: string): string
function disposeScatterChart(resetSignature?: boolean): void
function resetScatterContainer(): HTMLElement | null
function ensureOptions(selectEl: HTMLSelectElement | null, values: string[], preferredValue?: string): string | null
```

## Re-exports

```typescript
// From ../state.js:
appState

// From ../store/index.js:
state, scatterState

// From ./helpers.js:
getEl, fmt, computeColorExtent, computeDomains, normalizeCategoryLabel, normalizeColorValues, buildCategoricalColorGroups, CategoricalColorGroups
```
